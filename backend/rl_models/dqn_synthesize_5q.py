"""
dqn_synthesize_5q.py
--------------------
5-Qubit Dueling DQN Quantum Circuit Synthesizer.
Synthesizes 5-qubit quantum circuits using trained Dueling DQN policy +
Q-Guided Search + Algebraic Gate Reduction + Instant Zero-Cost Pruning +
L-BFGS-B Parameter Refinement + Universal State Preparation Hybrid Synthesis +
Qiskit Verification.
"""

import os
import sys
import time
import json
import math
from typing import Dict, List, Optional, Tuple
import numpy as np
import scipy.optimize
import torch

from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import Statevector

# Resolve quantumrl path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
QUANTUMRL_DIR = os.path.join(SCRIPT_DIR, 'quantumrl')
if QUANTUMRL_DIR not in sys.path:
    sys.path.insert(0, QUANTUMRL_DIR)

from quantumrl.action_map_5q import build_5qubit_action_list, build_5qubit_gate_matrices
from quantumrl.configs.config_5qubit import Config5Qubit
from quantumrl.dqn_agent_5q import DQNAgent5Q
from quantumrl.quantum_env_5q import compute_fidelity_5q, compute_von_neumann_entropy_5q


def build_1q_rotation_2x2(gtype: str, angle: float) -> np.ndarray:
    """Build a 2x2 complex128 matrix for 1-qubit rotation gate."""
    cos_a = math.cos(angle / 2.0)
    sin_a = math.sin(angle / 2.0)
    if gtype == 'RX':
        return np.array([[cos_a, -1j * sin_a], [-1j * sin_a, cos_a]], dtype=np.complex128)
    elif gtype == 'RY':
        return np.array([[cos_a, -sin_a], [sin_a, cos_a]], dtype=np.complex128)
    elif gtype == 'RZ':
        e_minus = np.exp(-1j * angle / 2.0)
        e_plus = np.exp(1j * angle / 2.0)
        return np.array([[e_minus, 0.0], [0.0, e_plus]], dtype=np.complex128)
    else:
        raise ValueError(f"Unknown rotation gate: {gtype}")


def apply_1q_gate_5q(u2: np.ndarray, psi: np.ndarray, q: int) -> np.ndarray:
    """Microsecond application of 2x2 unitary u2 on qubit q of 5-qubit statevector psi."""
    axis = 4 - q
    psi_5d = psi.reshape((2, 2, 2, 2, 2))
    res = np.tensordot(u2, psi_5d, axes=([1], [axis]))
    perm = list(range(1, 5))
    perm.insert(axis, 0)
    return np.transpose(res, perm).reshape(32)


def simplify_gate_sequence_algebraic(gate_sequence: list) -> list:
    """Algebraically combine adjacent identical gates and rotations."""
    if not gate_sequence:
        return []
    stack = []
    for g in gate_sequence:
        gtype = g['type']
        if not stack:
            stack.append(dict(g))
            continue
        prev = stack[-1]
        prev_type = prev['type']

        q_curr = g.get('qubits') or g.get('qubit')
        q_prev = prev.get('qubits') or prev.get('qubit')

        if q_curr == q_prev:
            if gtype == prev_type and gtype in ('H', 'X', 'Y', 'Z', 'SWAP', 'CNOT', 'CX', 'CZ'):
                stack.pop()
                continue
            elif gtype == prev_type and gtype in ('RX', 'RY', 'RZ'):
                ang = (prev.get('angle', 0.0) or 0.0) + (g.get('angle', 0.0) or 0.0)
                ang = float((ang + math.pi) % (2 * math.pi) - math.pi)
                if abs(ang) < 1e-6:
                    stack.pop()
                else:
                    prev['angle'] = ang
                continue
        stack.append(dict(g))
    return stack


class DQNSynthesizer5Q:
    """
    5-Qubit Dueling DQN Quantum Circuit Synthesizer.
    """

    def __init__(self, model_path: Optional[str] = None, device: str = "cuda"):
        self.config = Config5Qubit()
        self.device = torch.device(device if (device == "cuda" and torch.cuda.is_available()) else "cpu")

        self.action_list = build_5qubit_action_list(self.config)
        self.gate_mats = build_5qubit_gate_matrices(self.action_list)
        assert len(self.action_list) == 440, f"Expected 440 actions, got {len(self.action_list)}"

        self._gate_mat_lookup = {}
        for idx, (name, target, angle) in enumerate(self.action_list):
            if name in ('CNOT', 'CX', 'CZ', 'SWAP'):
                q_tuple = tuple(target) if isinstance(target, (tuple, list)) else target
                self._gate_mat_lookup[(name, q_tuple)] = self.gate_mats[idx]
                if name in ('CNOT', 'CX'):
                    self._gate_mat_lookup[('CX', q_tuple)] = self.gate_mats[idx]
                    self._gate_mat_lookup[('CNOT', q_tuple)] = self.gate_mats[idx]

        if model_path is None:
            candidates = [
                os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_5q_best.pth'),
                os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_5q_final.pth'),
                os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_5q_pretrained.pth'),
            ]
            for c in candidates:
                if os.path.exists(c):
                    model_path = c
                    break

        self.agent = DQNAgent5Q(config=self.config, device=str(self.device))
        if model_path and os.path.exists(model_path):
            self.agent.load(model_path)
            print(f"[DQNSynthesizer5Q] Loaded trained DQN model from {model_path}")
        else:
            print("[WARNING] No 5Q DQN model found. Synthesizer using initial policy weights.")

        self.agent.online_net.eval()

    def _build_qiskit_circuit(self, gate_sequence: list) -> QuantumCircuit:
        """Construct a fresh Qiskit QuantumCircuit for 5 qubits applying gate_sequence."""
        qc = QuantumCircuit(5)
        for g in gate_sequence:
            gtype = g['type']
            if gtype == 'H': qc.h(g['qubit'])
            elif gtype == 'X': qc.x(g['qubit'])
            elif gtype == 'Y': qc.y(g['qubit'])
            elif gtype == 'Z': qc.z(g['qubit'])
            elif gtype == 'S': qc.s(g['qubit'])
            elif gtype in ['Sdg', 'SDG']: qc.sdg(g['qubit'])
            elif gtype == 'T': qc.t(g['qubit'])
            elif gtype in ['Tdg', 'TDG']: qc.tdg(g['qubit'])
            elif gtype == 'RX': qc.rx(g['angle'], g['qubit'])
            elif gtype == 'RY': qc.ry(g['angle'], g['qubit'])
            elif gtype == 'RZ': qc.rz(g['angle'], g['qubit'])
            elif gtype in ['CNOT', 'CX']:
                q0, q1 = g['qubits']
                qc.cx(q0, q1)
            elif gtype == 'CZ':
                q0, q1 = g['qubits']
                qc.cz(q0, q1)
            elif gtype == 'SWAP':
                q0, q1 = g['qubits']
                qc.swap(q0, q1)
        return qc

    def fresh_qiskit_verify(self, target_sv: np.ndarray, gate_sequence: list) -> float:
        """Fresh Qiskit verification using Statevector.from_instruction(qc).data."""
        if not gate_sequence:
            init_sv = np.zeros(32, dtype=np.complex128)
            init_sv[0] = 1.0 + 0j
            return float(abs(np.vdot(target_sv, init_sv)) ** 2)

        qc = self._build_qiskit_circuit(gate_sequence)
        gen_sv = Statevector.from_instruction(qc).data
        return float(abs(np.vdot(target_sv, gen_sv)) ** 2)

    def fast_simulate_fidelity(self, target_sv: np.ndarray, gate_sequence: list) -> float:
        """Microsecond simulation of gate sequence on 5-qubit statevector."""
        psi = np.zeros(32, dtype=np.complex128)
        psi[0] = 1.0 + 0j
        for g in gate_sequence:
            gtype = g['type']
            if gtype in ('RX', 'RY', 'RZ'):
                u2 = build_1q_rotation_2x2(gtype, g.get('angle', 0.0) or 0.0)
                psi = apply_1q_gate_5q(u2, psi, g.get('qubit', 0))
            elif gtype in ('CNOT', 'CX', 'CZ', 'SWAP'):
                q_tuple = tuple(g['qubits']) if isinstance(g.get('qubits'), (tuple, list)) else g.get('qubits')
                mat = self._gate_mat_lookup.get((gtype, q_tuple))
                if mat is not None:
                    psi = mat @ psi
                else:
                    alt = 'CX' if gtype == 'CNOT' else ('CNOT' if gtype == 'CX' else gtype)
                    mat = self._gate_mat_lookup.get((alt, q_tuple))
                    if mat is not None:
                        psi = mat @ psi
            else:
                a_idx = g.get('action_idx')
                if a_idx is not None:
                    psi = self.gate_mats[a_idx] @ psi
                elif g.get('qubit') is not None:
                    u2 = build_1q_rotation_2x2(gtype, g.get('angle', 0.0) or 0.0)
                    psi = apply_1q_gate_5q(u2, psi, g['qubit'])

        norm = np.linalg.norm(psi)
        if norm > 0: psi /= norm
        return float(abs(np.vdot(target_sv, psi)) ** 2)

    def optimize_continuous_parameters(self, target_sv: np.ndarray, gate_sequence: list, maxiter: int = 100) -> Tuple[list, float]:
        """Refine rotation angles using L-BFGS-B to maximize fidelity."""
        gate_sequence = simplify_gate_sequence_algebraic(gate_sequence)
        param_indices = [i for i, g in enumerate(gate_sequence) if g['type'] in ('RX', 'RY', 'RZ')]
        if not param_indices:
            fid = self.fast_simulate_fidelity(target_sv, gate_sequence)
            return gate_sequence, fid

        init_angles = [gate_sequence[i]['angle'] for i in param_indices]

        def objective(angles):
            psi = np.zeros(32, dtype=np.complex128)
            psi[0] = 1.0 + 0j
            k = 0
            for idx, g in enumerate(gate_sequence):
                gtype = g['type']
                if idx in param_indices:
                    ang = angles[k]
                    k += 1
                    u2 = build_1q_rotation_2x2(gtype, ang)
                    psi = apply_1q_gate_5q(u2, psi, g['qubit'])
                elif gtype in ('RX', 'RY', 'RZ'):
                    u2 = build_1q_rotation_2x2(gtype, g.get('angle', 0.0) or 0.0)
                    psi = apply_1q_gate_5q(u2, psi, g.get('qubit', 0))
                elif gtype in ('CNOT', 'CX', 'CZ', 'SWAP'):
                    q_tuple = tuple(g['qubits']) if isinstance(g.get('qubits'), (tuple, list)) else g.get('qubits')
                    mat = self._gate_mat_lookup.get((gtype, q_tuple))
                    if mat is not None:
                        psi = mat @ psi
                    else:
                        alt = 'CX' if gtype == 'CNOT' else ('CNOT' if gtype == 'CX' else gtype)
                        mat = self._gate_mat_lookup.get((alt, q_tuple))
                        if mat is not None:
                            psi = mat @ psi
                else:
                    a_idx = g.get('action_idx')
                    if a_idx is not None:
                        psi = self.gate_mats[a_idx] @ psi

            norm = np.linalg.norm(psi)
            if norm > 0: psi /= norm
            fid = float(abs(np.vdot(target_sv, psi)) ** 2)
            return 1.0 - fid

        res = scipy.optimize.minimize(objective, init_angles, method='L-BFGS-B', options={'ftol': 1e-12, 'gtol': 1e-8, 'maxiter': maxiter})

        opt_seq = [dict(g) for g in gate_sequence]
        for k, idx in enumerate(param_indices):
            opt_seq[idx]['angle'] = float(res.x[k])

        final_fid = 1.0 - float(res.fun)
        return opt_seq, final_fid

    def prune_and_simplify(self, target_sv: np.ndarray, gate_sequence: list, target_fidelity: float = 0.999999) -> Tuple[list, float]:
        """Instant zero-cost pruning with algebraic reduction and parameter optimization."""
        if not gate_sequence:
            return [], self.fast_simulate_fidelity(target_sv, [])

        current_seq = simplify_gate_sequence_algebraic(gate_sequence)
        current_seq, current_fid = self.optimize_continuous_parameters(target_sv, current_seq, maxiter=60)

        # Instant zero-cost pruning
        improved = True
        while improved and len(current_seq) > 1:
            improved = False
            for i in range(len(current_seq) - 1, -1, -1):
                cand_seq = current_seq[:i] + current_seq[i+1:]
                cand_seq = simplify_gate_sequence_algebraic(cand_seq)
                cand_fid = self.fast_simulate_fidelity(target_sv, cand_seq)
                if (current_fid >= target_fidelity and cand_fid >= target_fidelity) or \
                   (current_fid < target_fidelity and cand_fid >= current_fid - 1e-7):
                    current_seq = cand_seq
                    current_fid = cand_fid
                    improved = True
                    break

        current_seq = simplify_gate_sequence_algebraic(current_seq)
        current_seq, current_fid = self.optimize_continuous_parameters(target_sv, current_seq, maxiter=120)
        return current_seq, current_fid

    def synthesize(self, target_sv: np.ndarray, max_attempts: int = 30, target_fidelity: float = 0.999999) -> Dict:
        """Run multi-candidate rollout synthesis with structural search optimization."""
        t0 = time.time()
        orig_norm = float(np.linalg.norm(target_sv))
        if orig_norm > 1e-12:
            target_sv = target_sv / orig_norm

        candidate_pool = []

        for attempt in range(max_attempts):
            deterministic = (attempt == 0)
            curr_psi = np.zeros(32, dtype=np.complex128)
            curr_psi[0] = 1.0 + 0j
            applied_actions = []

            for step in range(self.config.MAX_STEPS):
                fid_t = float(abs(np.vdot(target_sv, curr_psi)) ** 2)
                step_ratio = step / float(self.config.MAX_STEPS)
                obs = np.concatenate([
                    curr_psi.real.astype(np.float32),
                    curr_psi.imag.astype(np.float32),
                    target_sv.real.astype(np.float32),
                    target_sv.imag.astype(np.float32),
                    np.array([fid_t, step_ratio], dtype=np.float32)
                ])

                obs_t = torch.tensor(obs, dtype=torch.float32, device=self.device).unsqueeze(0)
                with torch.no_grad():
                    q_values = self.agent.online_net(obs_t).squeeze(0).cpu().numpy()

                if deterministic:
                    action = int(np.argmax(q_values))
                elif attempt % 2 == 1:
                    eps = 0.05 + (attempt / max_attempts) * 0.25
                    if np.random.rand() < eps:
                        action = int(np.random.randint(len(q_values)))
                    else:
                        action = int(np.argmax(q_values))
                else:
                    temp = 0.3 + (attempt / max_attempts) * 1.5
                    q_scaled = q_values / max(temp, 1e-3)
                    exp_q = np.exp(q_scaled - np.max(q_scaled))
                    probs = exp_q / np.sum(exp_q)
                    action = int(np.random.choice(len(probs), p=probs))

                applied_actions.append(action)
                curr_psi = self.gate_mats[action] @ curr_psi
                curr_psi /= np.linalg.norm(curr_psi)

                if float(abs(np.vdot(target_sv, curr_psi)) ** 2) >= target_fidelity:
                    break

            raw_seq = []
            for a_idx in applied_actions:
                name, target, ang = self.action_list[a_idx]
                q_val = target[0] if isinstance(target, (tuple, list)) else target
                if name in ('CNOT', 'CX', 'CZ', 'SWAP'):
                    q_list = list(target) if isinstance(target, (tuple, list)) else [target]
                    raw_seq.append({'type': name, 'qubits': q_list, 'action_idx': a_idx})
                elif name in ('RX', 'RY', 'RZ'):
                    raw_seq.append({'type': name, 'qubit': q_val, 'angle': float(ang) if ang is not None else 0.0, 'action_idx': a_idx})
                else:
                    raw_seq.append({'type': name, 'qubit': q_val, 'action_idx': a_idx})

            opt_seq, opt_fid = self.prune_and_simplify(target_sv, raw_seq, target_fidelity=target_fidelity)
            verified_fid = self.fresh_qiskit_verify(target_sv, opt_seq)

            qc = self._build_qiskit_circuit(opt_seq)
            cand_rec = {
                'attempt': attempt + 1,
                'raw_sequence': raw_seq,
                'raw_gate_count': len(raw_seq),
                'simplified_sequence': opt_seq,
                'final_verified_fidelity': verified_fid,
                'gate_count': len(opt_seq),
                'depth': qc.depth(),
                'entangling_gate_count': sum(1 for g in opt_seq if g['type'] in ('CNOT', 'CX', 'CZ', 'SWAP')),
                'qiskit_circuit': qc,
            }
            candidate_pool.append(cand_rec)

            if verified_fid >= target_fidelity and len(opt_seq) <= 15:
                break

        # Check if best RL candidate reached target_fidelity (0.999999)
        best_fid = max((c['final_verified_fidelity'] for c in candidate_pool), default=0.0)
        if best_fid < target_fidelity:
            try:
                qc_prep = QuantumCircuit(5)
                qc_prep.prepare_state(target_sv, list(range(5)))
                qc_trans = transpile(qc_prep, basis_gates=['rx', 'ry', 'rz', 'cx'], optimization_level=3)

                exact_seq = []
                for inst in qc_trans.data:
                    name = inst.operation.name.upper()
                    if name == 'CX': name = 'CNOT'
                    q_indices = [qc_trans.find_bit(q).index for q in inst.qubits]
                    params = inst.operation.params
                    if name in ('CNOT', 'CX', 'CZ', 'SWAP'):
                        exact_seq.append({'type': name, 'qubits': q_indices})
                    elif name in ('RX', 'RY', 'RZ'):
                        exact_seq.append({'type': name, 'qubit': q_indices[0], 'angle': float(params[0]) if params else 0.0})

                opt_exact_seq, opt_exact_fid = self.prune_and_simplify(target_sv, exact_seq, target_fidelity=target_fidelity)
                verified_exact_fid = self.fresh_qiskit_verify(target_sv, opt_exact_seq)

                qc_exact = self._build_qiskit_circuit(opt_exact_seq)
                exact_rec = {
                    'attempt': max_attempts + 1,
                    'raw_sequence': exact_seq,
                    'raw_gate_count': len(exact_seq),
                    'simplified_sequence': opt_exact_seq,
                    'final_verified_fidelity': verified_exact_fid,
                    'gate_count': len(opt_exact_seq),
                    'depth': qc_exact.depth(),
                    'entangling_gate_count': sum(1 for g in opt_exact_seq if g['type'] in ('CNOT', 'CX', 'CZ', 'SWAP')),
                    'qiskit_circuit': qc_exact,
                }
                candidate_pool.append(exact_rec)
            except Exception:
                pass

        candidate_pool.sort(key=lambda c: (-round(c['final_verified_fidelity'], 6), c['gate_count'], c['depth']))
        best = candidate_pool[0]

        return {
            'winning_circuit': best,
            'status': 'SUCCESS' if best['final_verified_fidelity'] >= 0.9999 else 'FAILED',
            'search_time_seconds': time.time() - t0,
            'candidates_evaluated': len(candidate_pool),
        }
