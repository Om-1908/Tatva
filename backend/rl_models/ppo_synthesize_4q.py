"""
ppo_synthesize_4q.py
--------------------
4-Qubit PPO Synthesis Pipeline for TATVA.

Features:
  - Multiple stochastic candidate rollouts guided by trained ActorCritic4Q policy.
  - Continuous Multi-Start L-BFGS-B parameter refinement for rotation angles.
  - Circuit simplification (adjacent rotation merging, self-inverse gate cancellation, zero-rotation removal).
  - Universal Quantum State Decomposition fallback guaranteeing F >= 0.999999 on 100% of states.
  - Fresh Qiskit statevector verification.
  - Dual output display (Universal U3 Representation + Fully Decomposed Hardware Representation).

Strictly adheres to TATVA 4-Qubit PPO Training Final Clean Specification.
"""

import os
import sys
import time
import json
import math
import numpy as np
import scipy.optimize
import torch
from typing import Dict, List, Optional, Tuple

from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import Statevector

# Resolve quantumrl path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
QUANTUMRL_DIR = os.path.join(SCRIPT_DIR, 'quantumrl')
if QUANTUMRL_DIR not in sys.path:
    sys.path.insert(0, QUANTUMRL_DIR)

from configs.config_4qubit_ppo import Config4QubitPPO
from ppo_agent_4q import ActorCritic4Q
from action_map_4q import ACTION_MAP_4Q, build_4qubit_action_list, build_4qubit_gate_matrices
from quantum_env_4q import compute_fidelity_4q


class PPOSynthesizer4Q:
    """Synthesizes 4-qubit quantum circuits using trained PPO policy network."""

    def __init__(self, model_path: str = "saved_models/4qubit_ppo/ppo_rl_4q_best.pth", device: str = "cuda"):
        self.config = Config4QubitPPO()
        self.device = torch.device(device if (device == "cuda" and torch.cuda.is_available()) else "cpu")
        self.action_list = build_4qubit_action_list(self.config)
        self.action_map = ACTION_MAP_4Q
        self.gate_mats = build_4qubit_gate_matrices(self.action_list)

        self._gate_action_map = {}
        for idx, (name, target, angle) in enumerate(self.action_list):
            if name in ['CNOT', 'CX', 'CZ', 'SWAP']:
                q_tuple = tuple(target) if isinstance(target, (tuple, list)) else target
                self._gate_action_map[(name, q_tuple)] = idx
                if name in ['CNOT', 'CX']:
                    self._gate_action_map[('CX', q_tuple)] = idx
                    self._gate_action_map[('CNOT', q_tuple)] = idx

        if not os.path.exists(model_path):
            pretrained_path = "saved_models/4qubit_ppo/ppo_pretrained_4q.pth"
            if os.path.exists(pretrained_path):
                model_path = pretrained_path

        self.ac = ActorCritic4Q(obs_size=self.config.OBS_SIZE, action_size=self.config.ACTION_SIZE).to(self.device)
        if os.path.exists(model_path):
            ckpt = torch.load(model_path, map_location=self.device, weights_only=False)
            if isinstance(ckpt, dict) and 'actor_critic' in ckpt:
                self.ac.load_state_dict(ckpt['actor_critic'])
            elif isinstance(ckpt, dict) and 'state_dict' in ckpt:
                self.ac.load_state_dict(ckpt['state_dict'])
            else:
                self.ac.load_state_dict(ckpt)
            print(f"[PPOSynthesizer4Q] Loaded trained PPO model from {model_path}")
        else:
            print(f"[WARNING] Model file {model_path} not found. PPOSynthesizer using initial policy.")

        self.ac.eval()

    def _build_qiskit_circuit(self, gate_sequence: list) -> QuantumCircuit:
        """Construct a fresh Qiskit QuantumCircuit for 4-qubits applying gate_sequence."""
        qc = QuantumCircuit(4)
        for g in gate_sequence:
            gtype = g['type']
            if gtype == 'H':
                qc.h(g['qubit'])
            elif gtype == 'X':
                qc.x(g['qubit'])
            elif gtype == 'Y':
                qc.y(g['qubit'])
            elif gtype == 'Z':
                qc.z(g['qubit'])
            elif gtype == 'S':
                qc.s(g['qubit'])
            elif gtype in ['Sdg', 'SDG']:
                qc.sdg(g['qubit'])
            elif gtype == 'T':
                qc.t(g['qubit'])
            elif gtype in ['Tdg', 'TDG']:
                qc.tdg(g['qubit'])
            elif gtype == 'RX':
                qc.rx(g['angle'], g['qubit'])
            elif gtype == 'RY':
                qc.ry(g['angle'], g['qubit'])
            elif gtype == 'RZ':
                qc.rz(g['angle'], g['qubit'])
            elif gtype in ['CNOT', 'CX']:
                q0, q1 = g['qubits']
                qc.cx(q0, q1)
            elif gtype == 'CZ':
                q0, q1 = g['qubits']
                qc.cz(q0, q1)
            elif gtype == 'SWAP':
                q0, q1 = g['qubits']
                qc.swap(q0, q1)
            else:
                raise ValueError(f"Unknown gate type: {gtype}")
        return qc

    def fresh_qiskit_verify(self, target_sv: np.ndarray, gate_sequence: list) -> float:
        """Computes F = |<target | generated>|^2 using fresh Qiskit Statevector."""
        if not gate_sequence:
            init_sv = np.zeros(16, dtype=np.complex128)
            init_sv[0] = 1.0 + 0j
            return float(np.abs(np.vdot(target_sv, init_sv)) ** 2)

        qc = self._build_qiskit_circuit(gate_sequence)
        gen_sv = Statevector.from_instruction(qc).data
        dot = np.vdot(target_sv, gen_sv)
        return float(np.abs(dot) ** 2)

    def fast_simulate_gate_sequence(self, target_sv: np.ndarray, gate_sequence: list) -> float:
        """Microsecond matrix-vector simulation of gate sequence for ultra-fast L-BFGS-B optimization."""
        psi = np.zeros(16, dtype=np.complex128)
        psi[0] = 1.0 + 0j
        for g in gate_sequence:
            gtype = g['type']
            q = g.get('qubit')
            ang = g.get('angle', 0.0) or 0.0

            if gtype == 'RX':
                cos_a = math.cos(ang / 2.0)
                sin_a = math.sin(ang / 2.0)
                U = np.array([[cos_a, -1j * sin_a], [-1j * sin_a, cos_a]], dtype=np.complex128)
                axis = 3 - q
                psi_4d = psi.reshape((2, 2, 2, 2))
                res = np.tensordot(U, psi_4d, axes=([1], [axis]))
                perm = list(range(1, 4))
                perm.insert(axis, 0)
                psi = np.transpose(res, perm).reshape(16)
            elif gtype == 'RY':
                cos_a = math.cos(ang / 2.0)
                sin_a = math.sin(ang / 2.0)
                U = np.array([[cos_a, -sin_a], [sin_a, cos_a]], dtype=np.complex128)
                axis = 3 - q
                psi_4d = psi.reshape((2, 2, 2, 2))
                res = np.tensordot(U, psi_4d, axes=([1], [axis]))
                perm = list(range(1, 4))
                perm.insert(axis, 0)
                psi = np.transpose(res, perm).reshape(16)
            elif gtype == 'RZ':
                e_minus = np.exp(-1j * ang / 2.0)
                e_plus = np.exp(1j * ang / 2.0)
                U = np.array([[e_minus, 0.0], [0.0, e_plus]], dtype=np.complex128)
                axis = 3 - q
                psi_4d = psi.reshape((2, 2, 2, 2))
                res = np.tensordot(U, psi_4d, axes=([1], [axis]))
                perm = list(range(1, 4))
                perm.insert(axis, 0)
                psi = np.transpose(res, perm).reshape(16)
            elif gtype in ['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg', 'SDG', 'TDG']:
                if gtype == 'H':
                    inv = 1.0 / math.sqrt(2.0)
                    U = np.array([[inv, inv], [inv, -inv]], dtype=np.complex128)
                elif gtype == 'X':
                    U = np.array([[0, 1], [1, 0]], dtype=np.complex128)
                elif gtype == 'Y':
                    U = np.array([[0, -1j], [1j, 0]], dtype=np.complex128)
                elif gtype == 'Z':
                    U = np.array([[1, 0], [0, -1]], dtype=np.complex128)
                elif gtype == 'S':
                    U = np.array([[1, 0], [0, 1j]], dtype=np.complex128)
                elif gtype in ['Sdg', 'SDG']:
                    U = np.array([[1, 0], [0, -1j]], dtype=np.complex128)
                elif gtype == 'T':
                    e_t = np.exp(1j * math.pi / 4.0)
                    U = np.array([[1, 0], [0, e_t]], dtype=np.complex128)
                elif gtype in ['Tdg', 'TDG']:
                    e_tdg = np.exp(-1j * math.pi / 4.0)
                    U = np.array([[1, 0], [0, e_tdg]], dtype=np.complex128)
                axis = 3 - q
                psi_4d = psi.reshape((2, 2, 2, 2))
                res = np.tensordot(U, psi_4d, axes=([1], [axis]))
                perm = list(range(1, 4))
                perm.insert(axis, 0)
                psi = np.transpose(res, perm).reshape(16)
            elif gtype in ['CNOT', 'CX', 'CZ', 'SWAP']:
                q_tuple = tuple(g['qubits'])
                act_idx = self._gate_action_map.get((gtype, q_tuple))
                if act_idx is not None:
                    psi = self.gate_mats[act_idx] @ psi
        dot = np.vdot(target_sv, psi)
        return float(np.abs(dot) ** 2)

    def optimize_circuit_angles(self, gate_sequence: list, target_sv: np.ndarray, num_restarts: int = 3) -> tuple:
        """Multi-Start L-BFGS-B continuous parameter optimization for rotation angles."""
        if not gate_sequence:
            return gate_sequence, self.fresh_qiskit_verify(target_sv, gate_sequence)

        param_indices = [i for i, g in enumerate(gate_sequence) if g['type'] in ['RX', 'RY', 'RZ']]
        if not param_indices:
            return gate_sequence, self.fresh_qiskit_verify(target_sv, gate_sequence)

        base_angles = np.array([gate_sequence[i]['angle'] for i in param_indices], dtype=np.float64)

        def loss_fn(angles):
            temp_seq = [dict(g) for g in gate_sequence]
            for idx, ang in zip(param_indices, angles):
                temp_seq[idx]['angle'] = float(ang)
            fid = self.fast_simulate_gate_sequence(target_sv, temp_seq)
            return 1.0 - fid

        best_loss = float('inf')
        best_angles = base_angles
        rng = np.random.default_rng(42)

        for trial in range(num_restarts):
            init_x = base_angles if trial == 0 else base_angles + rng.uniform(-np.pi, np.pi, size=len(base_angles))
            res = scipy.optimize.minimize(loss_fn, init_x, method='L-BFGS-B', options={'maxiter': 80, 'ftol': 1e-12})
            if res.fun < best_loss:
                best_loss = res.fun
                best_angles = res.x
                if best_loss < 1e-6:
                    break

        best_seq = [dict(g) for g in gate_sequence]
        for idx, ang in zip(param_indices, best_angles):
            best_seq[idx]['angle'] = float(np.mod(ang, 2.0 * np.pi))

        final_fid = self.fresh_qiskit_verify(target_sv, best_seq)
        return best_seq, final_fid

    def simplify_circuit(self, target_sv: np.ndarray, gate_sequence: list) -> tuple:
        """Circuit simplification: merge adjacent same-axis rotations, cancel self-inverses, remove zero rotations."""
        curr_seq = [dict(g) for g in gate_sequence]
        orig_fid = self.fast_simulate_gate_sequence(target_sv, curr_seq)

        changed = True
        while changed:
            changed = False
            new_seq = []
            i = 0
            while i < len(curr_seq):
                g1 = curr_seq[i]
                if i + 1 < len(curr_seq):
                    g2 = curr_seq[i + 1]

                    if (g1['type'] in ['RX', 'RY', 'RZ'] and g2['type'] == g1['type']
                            and g1['qubit'] == g2['qubit']):
                        merged_g = dict(g1)
                        merged_g['angle'] = float(g1['angle'] + g2['angle'])
                        candidate_seq = new_seq + [merged_g] + curr_seq[i + 2:]
                        cand_fid = self.fast_simulate_gate_sequence(target_sv, candidate_seq)
                        if cand_fid >= 0.999999 or cand_fid >= orig_fid - 1e-6:
                            new_seq.append(merged_g)
                            i += 2
                            changed = True
                            continue

                    if (g1['type'] in ['X', 'Y', 'Z', 'H'] and g2['type'] == g1['type']
                            and g1['qubit'] == g2['qubit']):
                        candidate_seq = new_seq + curr_seq[i + 2:]
                        cand_fid = self.fast_simulate_gate_sequence(target_sv, candidate_seq)
                        if cand_fid >= 0.999999 or cand_fid >= orig_fid - 1e-6:
                            i += 2
                            changed = True
                            continue

                    if (g1['type'] in ['CNOT', 'CZ', 'SWAP'] and g2['type'] == g1['type']
                            and g1.get('qubits') == g2.get('qubits')):
                        candidate_seq = new_seq + curr_seq[i + 2:]
                        cand_fid = self.fast_simulate_gate_sequence(target_sv, candidate_seq)
                        if cand_fid >= 0.999999 or cand_fid >= orig_fid - 1e-6:
                            i += 2
                            changed = True
                            continue

                if g1['type'] in ['RX', 'RY', 'RZ'] and abs(g1.get('angle', 0.0) % (2 * math.pi)) < 1e-6:
                    candidate_seq = new_seq + curr_seq[i + 1:]
                    cand_fid = self.fast_simulate_gate_sequence(target_sv, candidate_seq)
                    if cand_fid >= 0.999999 or cand_fid >= orig_fid - 1e-6:
                        i += 1
                        changed = True
                        continue

                new_seq.append(g1)
                i += 1

            curr_seq = new_seq

        final_fid = self.fresh_qiskit_verify(target_sv, curr_seq)
        return curr_seq, final_fid

    def universal_exact_state_decomposition(self, target_sv: np.ndarray) -> tuple:
        """Universal Quantum State Decomposition fallback guaranteeing F = 1.000000000000 (F >= 0.999999)."""
        qc_init = QuantumCircuit(4)
        qc_init.initialize(target_sv, [0, 1, 2, 3])
        qc_decomp = transpile(qc_init, basis_gates=['rx', 'ry', 'rz', 'cx'], optimization_level=3)

        gate_seq = []
        for inst in qc_decomp.data:
            gname = inst.operation.name.upper()
            q_indices = [qc_decomp.find_bit(q).index for q in inst.qubits]
            if gname in ('CX', 'CNOT'):
                gate_seq.append({'type': 'CNOT', 'qubit': None, 'qubits': q_indices, 'angle': None})
            elif gname == 'RX':
                gate_seq.append({'type': 'RX', 'qubit': q_indices[0], 'qubits': None, 'angle': float(inst.operation.params[0])})
            elif gname == 'RY':
                gate_seq.append({'type': 'RY', 'qubit': q_indices[0], 'qubits': None, 'angle': float(inst.operation.params[0])})
            elif gname == 'RZ':
                gate_seq.append({'type': 'RZ', 'qubit': q_indices[0], 'qubits': None, 'angle': float(inst.operation.params[0])})

        fid = self.fresh_qiskit_verify(target_sv, gate_seq)
        return gate_seq, fid

    def generate_candidates(self, target_sv: np.ndarray, candidate_budget: int = 30) -> list:
        """Generate multiple stochastic candidate trajectories using PPO policy."""
        candidates = []
        target_sv = np.asarray(target_sv, dtype=np.complex128)
        target_sv = target_sv / np.linalg.norm(target_sv)

        for attempt in range(candidate_budget):
            psi_curr = np.zeros(16, dtype=np.complex128)
            psi_curr[0] = 1.0 + 0j
            gate_seq = []

            deterministic = (attempt == 0)
            temperature = 0.0 if deterministic else (0.1 + 0.4 * (attempt / float(candidate_budget)))

            for step in range(self.config.MAX_STEPS):
                curr_re = psi_curr.real.astype(np.float32)
                curr_im = psi_curr.imag.astype(np.float32)
                targ_re = target_sv.real.astype(np.float32)
                targ_im = target_sv.imag.astype(np.float32)
                curr_fid = float(abs(np.vdot(target_sv, psi_curr)) ** 2)
                norm_step = np.float32(step / float(self.config.MAX_STEPS))

                obs_vec = np.concatenate([curr_re, curr_im, targ_re, targ_im, [curr_fid], [norm_step]])
                obs_t = torch.tensor(obs_vec, dtype=torch.float32, device=self.device).unsqueeze(0)

                with torch.no_grad():
                    logits, _ = self.ac(obs_t)
                    logits = logits.squeeze(0)

                if deterministic:
                    action_idx = int(torch.argmax(logits).item())
                else:
                    if temperature > 0:
                        scaled_logits = logits / temperature
                        dist = torch.distributions.Categorical(logits=scaled_logits)
                    else:
                        dist = torch.distributions.Categorical(logits=logits)
                    action_idx = int(dist.sample().item())

                act_tuple = self.action_list[action_idx]
                name, target, angle = act_tuple

                g_dict = {
                    'type': name,
                    'qubit': target if isinstance(target, int) else None,
                    'qubits': list(target) if isinstance(target, (tuple, list)) else None,
                    'angle': angle
                }
                gate_seq.append(g_dict)

                psi_curr = self.gate_mats[action_idx] @ psi_curr
                curr_fid = float(abs(np.vdot(target_sv, psi_curr)) ** 2)

                if curr_fid >= 0.999999:
                    break

            raw_fid = self.fresh_qiskit_verify(target_sv, gate_seq)
            candidates.append({
                'sequence': gate_seq,
                'raw_fidelity': raw_fid,
                'gate_count': len(gate_seq)
            })

        return candidates

    def synthesize(
        self,
        target_sv: np.ndarray,
        candidate_budget: int = 30,
        max_attempts: Optional[int] = None,
        target_fidelity: float = 0.999999,
        max_wall_time: float = 30.0,
        **kwargs
    ) -> dict:
        """Complete 4-qubit PPO synthesis workflow."""
        start_time = time.time()
        if max_attempts is not None:
            candidate_budget = max_attempts
        target_sv = np.asarray(target_sv, dtype=np.complex128)
        norm = np.linalg.norm(target_sv)
        if norm > 1e-12:
            target_sv = target_sv / norm

        raw_candidates = self.generate_candidates(target_sv, candidate_budget=candidate_budget)

        best_simplified = None
        valid_pool = []

        for cand in raw_candidates:
            raw_seq = cand['sequence']
            raw_fid = cand['raw_fidelity']

            opt_seq, opt_fid = self.optimize_circuit_angles(raw_seq, target_sv, num_restarts=3)
            simp_seq, simp_fid = self.simplify_circuit(target_sv, opt_seq)

            candidate_info = {
                'raw_sequence': raw_seq,
                'raw_fidelity': raw_fid,
                'post_refinement_sequence': opt_seq,
                'post_refinement_fidelity': opt_fid,
                'simplified_sequence': simp_seq,
                'final_verified_fidelity': simp_fid,
                'gate_count': len(simp_seq),
                'depth': len(simp_seq),
                'entangling_gate_count': sum(1 for g in simp_seq if g['type'] in ['CNOT', 'CZ', 'SWAP']),
                'is_valid': (simp_fid >= 0.999999)
            }

            if candidate_info['is_valid']:
                valid_pool.append(candidate_info)

            if best_simplified is None or simp_fid > best_simplified['final_verified_fidelity']:
                best_simplified = candidate_info

            if time.time() - start_time > max_wall_time:
                break

        # Fallback to Universal QSD if valid pool empty
        if not valid_pool or best_simplified['final_verified_fidelity'] < 0.999999:
            exact_seq, exact_fid = self.universal_exact_state_decomposition(target_sv)
            opt_seq, opt_fid = self.optimize_circuit_angles(exact_seq, target_sv, num_restarts=3)
            simp_seq, simp_fid = self.simplify_circuit(target_sv, opt_seq)

            exact_candidate = {
                'raw_sequence': exact_seq,
                'raw_fidelity': exact_fid,
                'post_refinement_sequence': opt_seq,
                'post_refinement_fidelity': opt_fid,
                'simplified_sequence': simp_seq,
                'final_verified_fidelity': simp_fid,
                'gate_count': len(simp_seq),
                'depth': len(simp_seq),
                'entangling_gate_count': sum(1 for g in simp_seq if g['type'] in ['CNOT', 'CZ', 'SWAP']),
                'is_valid': (simp_fid >= 0.999999)
            }
            if exact_candidate['is_valid']:
                valid_pool.append(exact_candidate)
            if best_simplified is None or simp_fid > best_simplified['final_verified_fidelity']:
                best_simplified = exact_candidate

        search_time = time.time() - start_time

        if valid_pool:
            valid_pool.sort(key=lambda c: (c['gate_count'], c['depth'], c['entangling_gate_count']))
            winning_circuit = valid_pool[0]
            status_text = "Best verified circuit found within search budget."
        else:
            winning_circuit = best_simplified
            status_text = "HIGH_PRECISION_SYNTHESIS_NOT_FOUND"

        report = {
            'target_state': target_sv.tolist(),
            'search_attempts': len(raw_candidates),
            'search_time_seconds': search_time,
            'status': status_text,
            'best_pre_refinement_fidelity': winning_circuit['raw_fidelity'],
            'best_post_refinement_fidelity': winning_circuit['post_refinement_fidelity'],
            'winning_circuit': winning_circuit
        }

        return report


def run_ppo_synthesis_4q(
    target_sv: np.ndarray,
    budget: int = 30,
    target_fidelity: float = 0.999999
) -> dict:
    """Wrapper function for 4-qubit PPO synthesis."""
    synth = PPOSynthesizer4Q()
    report = synth.synthesize(target_sv, candidate_budget=budget)
    win = report['winning_circuit']
    decomp_seq = win['simplified_sequence'] if win else []
    decomp_lines = []
    for idx, g in enumerate(decomp_seq, 1):
        gtype = g['type']
        q_str = f"q{g['qubits'][0]}, q{g['qubits'][1]}" if g.get('qubits') else f"q{g['qubit']}"
        if g.get('angle') is not None:
            decomp_lines.append(f"{idx:02d}. {gtype}({q_str}, angle={g['angle']:+.6f})")
        else:
            decomp_lines.append(f"{idx:02d}. {gtype}({q_str})")

    try:
        qc_temp = synth._build_qiskit_circuit(decomp_seq)
        qc_u3 = transpile(qc_temp, optimization_level=3, basis_gates=['u3', 'cx'])
        u3_lines = []
        for idx, inst in enumerate(qc_u3.data, 1):
            gname = inst.operation.name.upper()
            if gname == 'CX': gname = 'CNOT'
            q_indices = [qc_u3.find_bit(q).index for q in inst.qubits]
            q_str = f"q{q_indices[0]}, q{q_indices[1]}" if len(q_indices) == 2 else f"q{q_indices[0]}"
            params = inst.operation.params
            if params:
                p_str = ", ".join([f"{float(p):+.6f}" for p in params])
                u3_lines.append(f"{idx:02d}. {gname}({q_str}, [{p_str}])")
            else:
                u3_lines.append(f"{idx:02d}. {gname}({q_str})")
    except Exception:
        u3_lines = []

    res_4q = {
        'status': report['status'],
        'final_fidelity': win['final_verified_fidelity'] if win else 0.0,
        'raw_gate_count': len(win['raw_sequence']) if win else 0,
        'final_gate_count': win['gate_count'] if win else 0,
        'circuit_depth': win['depth'] if win else 0,
        'entangling_gate_count': win['entangling_gate_count'] if win else 0,
        'search_time_seconds': report['search_time_seconds'],
        'display_lines': decomp_lines,
        'u3_display_lines': u3_lines,
    }
    return res_4q
