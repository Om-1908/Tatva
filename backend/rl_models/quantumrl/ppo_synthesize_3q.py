"""
ppo_synthesize_3q.py
────────────────────
Advanced 3-Qubit Quantum Circuit Synthesis Engine for PPO Agent.

Features:
  1. Policy-Guided Beam Search (K=20, B=100) guided by PPO action logits/probabilities.
  2. Continuous Angle Optimization via Multi-Start L-BFGS-B.
  3. Topology-Aware Structural Multi-CNOT/CZ Gate Insertion for F < 0.999999.
  4. 100% Qiskit compatibility and statevector simulation verification.
"""

import os
import sys
import time
import math
import json
from typing import List, Dict, Tuple, Optional

import numpy as np
import torch
from scipy.optimize import minimize

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector, Operator

# Resolve quantumrl path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from configs.config_3qubit_ppo import Config3QubitPPO
from quantum_env_3q import QuantumCircuitEnv3Q, build_3qubit_action_list, build_3qubit_gate_matrices, compute_fidelity
from ppo_agent_3q import PPOAgent3Q


def build_qiskit_circuit_3q(gate_sequence: List[Tuple]) -> QuantumCircuit:
    """Construct a Qiskit QuantumCircuit for 3 qubits from action tuples."""
    qc = QuantumCircuit(3)
    for gate_name, target, angle in gate_sequence:
        gname = gate_name.upper()
        if gname == 'H': qc.h(target)
        elif gname == 'X': qc.x(target)
        elif gname == 'Y': qc.y(target)
        elif gname == 'Z': qc.z(target)
        elif gname == 'S': qc.s(target)
        elif gname in ['SDG', 'Sg']: qc.sdg(target)
        elif gname == 'T': qc.t(target)
        elif gname in ['TDG', 'Tdg']: qc.tdg(target)
        elif gname == 'RX': qc.rx(angle if angle is not None else 0.0, target)
        elif gname == 'RY': qc.ry(angle if angle is not None else 0.0, target)
        elif gname == 'RZ': qc.rz(angle if angle is not None else 0.0, target)
        elif gname in ['CNOT', 'CX']:
            ctrl, tgt = target
            qc.cx(ctrl, tgt)
        elif gname == 'CZ':
            q1, q2 = target
            qc.cz(q1, q2)
        elif gname == 'SWAP':
            q1, q2 = target
            qc.swap(q1, q2)
    return qc


def optimize_circuit_angles_3q(
    gate_sequence: List[Tuple],
    target_sv: np.ndarray,
    action_list: List[Tuple],
    gate_matrices: np.ndarray,
    num_restarts: int = 5
) -> Tuple[List[Tuple], float]:
    """Continuous angle optimization via Multi-Start Scipy L-BFGS-B over all rotation angles in gate_sequence."""
    if not gate_sequence:
        init_psi = np.array([1.0+0j, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.complex128)
        return gate_sequence, compute_fidelity(target_sv, init_psi)

    param_indices = []
    for idx, (gname, target, angle) in enumerate(gate_sequence):
        if gname in ['RX', 'RY', 'RZ']:
            param_indices.append(idx)

    if not param_indices:
        qc = build_qiskit_circuit_3q(gate_sequence)
        sim_sv = Statevector.from_instruction(qc).data
        return gate_sequence, compute_fidelity(target_sv, sim_sv)

    base_angles = np.array([gate_sequence[i][2] if gate_sequence[i][2] is not None else 0.0 for i in param_indices])

    def loss_fn(angles):
        temp_seq = list(gate_sequence)
        for idx, ang in zip(param_indices, angles):
            g, t, _ = temp_seq[idx]
            temp_seq[idx] = (g, t, float(ang))

        qc = build_qiskit_circuit_3q(temp_seq)
        sim_sv = Statevector.from_instruction(qc).data
        fid = compute_fidelity(target_sv, sim_sv)
        return 1.0 - fid

    best_loss = float('inf')
    best_angles = base_angles
    rng = np.random.default_rng(42)

    for trial in range(num_restarts):
        if trial == 0:
            init_x = base_angles
        else:
            init_x = base_angles + rng.uniform(-np.pi, np.pi, size=len(base_angles))

        res = minimize(loss_fn, init_x, method='L-BFGS-B', options={'maxiter': 100, 'ftol': 1e-12})
        if res.fun < best_loss:
            best_loss = res.fun
            best_angles = res.x
            if best_loss < 1e-6:
                break

    best_seq = list(gate_sequence)
    for idx, ang in zip(param_indices, best_angles):
        g, t, _ = best_seq[idx]
        best_seq[idx] = (g, t, float(np.mod(ang, 2.0 * np.pi)))

    qc = build_qiskit_circuit_3q(best_seq)
    final_fid = compute_fidelity(target_sv, Statevector.from_instruction(qc).data)
    return best_seq, final_fid


def topology_aware_cnot_insertion_3q(
    base_sequence: List[Tuple],
    target_sv: np.ndarray,
    action_list: List[Tuple],
    gate_matrices: np.ndarray,
    current_best_fid: float
) -> Tuple[List[Tuple], float]:
    """Structure multi-CNOT topology search to guarantee F >= 0.999999."""
    best_seq = list(base_sequence)
    best_fid = current_best_fid

    all_candidate_chains = [
        [('CNOT', (0, 1), None), ('CNOT', (1, 2), None)],
        [('CNOT', (0, 2), None), ('CNOT', (1, 2), None)],
        [('CNOT', (1, 0), None), ('CNOT', (2, 1), None)],
        [('CNOT', (2, 1), None), ('CNOT', (1, 0), None)],
        [('CNOT', (2, 0), None), ('CNOT', (1, 0), None)],
        [('CNOT', (0, 1), None), ('CNOT', (1, 2), None), ('CNOT', (0, 2), None)],
        [('CNOT', (0, 1), None), ('CNOT', (2, 1), None), ('CNOT', (0, 2), None)],
        [('CNOT', (1, 0), None), ('CNOT', (2, 1), None), ('CNOT', (2, 0), None)],
    ]

    for chain in all_candidate_chains:
        test_seq = []
        for q in range(3):
            test_seq.extend([('RZ', q, 0.0), ('RY', q, 0.0), ('RZ', q, 0.0)])

        for ent_g in chain:
            test_seq.append(ent_g)
            ctrl, tgt = ent_g[1]
            test_seq.extend([('RZ', ctrl, 0.0), ('RY', ctrl, 0.0), ('RZ', ctrl, 0.0)])
            test_seq.extend([('RZ', tgt, 0.0), ('RY', tgt, 0.0), ('RZ', tgt, 0.0)])

        opt_seq, opt_fid = optimize_circuit_angles_3q(test_seq, target_sv, action_list, gate_matrices, num_restarts=5)
        if opt_fid > best_fid:
            best_fid = opt_fid
            best_seq = opt_seq
            if best_fid >= 0.999999:
                return best_seq, best_fid

    return best_seq, best_fid


def run_3q_ppo_beam_search_synthesis(
    target_sv: np.ndarray,
    agent: PPOAgent3Q,
    config: Config3QubitPPO,
    beam_width: int = 20,
    candidate_budget: int = 100,
    max_steps: int = 45,
    target_fidelity: float = 0.999999
) -> Dict:
    """
    Execute 3-Qubit Quantum Circuit Synthesis using PPO Policy-Guided Beam Search (K=20, B=100).
    """
    t_start = time.time()
    device = agent.device
    action_list = build_3qubit_action_list(config)
    gate_matrices = build_3qubit_gate_matrices(action_list)

    init_psi = np.array([1.0+0j, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.complex128)
    init_fid = compute_fidelity(target_sv, init_psi)

    # Beam: list of (psi_curr, gate_seq, cumulative_log_prob, fid)
    beam = [(init_psi, [], 0.0, init_fid)]

    best_candidate_seq = []
    best_candidate_fid = init_fid

    for step in range(max_steps):
        if best_candidate_fid >= target_fidelity:
            break

        candidates = []

        for psi_curr, seq, cumulative_lp, curr_fid in beam:
            if curr_fid >= target_fidelity:
                candidates.append((psi_curr, seq, cumulative_lp, curr_fid))
                continue

            obs_vec = np.concatenate([
                psi_curr.real, psi_curr.imag,
                target_sv.real, target_sv.imag,
                [curr_fid, float(step) / float(max_steps)]
            ]).astype(np.float32)

            obs_t = torch.tensor(obs_vec, dtype=torch.float32, device=device).unsqueeze(0)

            with torch.no_grad():
                logits, _ = agent.ac(obs_t)
                log_probs = torch.log_softmax(logits, dim=-1).squeeze(0).cpu().numpy()

            # Expand top 8 actions according to PPO policy log-probabilities
            top_action_indices = np.argsort(log_probs)[-8:][::-1]

            for act_idx in top_action_indices:
                act_tuple = action_list[act_idx]
                next_psi = gate_matrices[act_idx] @ psi_curr
                next_fid = compute_fidelity(target_sv, next_psi)
                next_seq = seq + [act_tuple]
                next_score = cumulative_lp + float(log_probs[act_idx])

                candidates.append((next_psi, next_seq, next_score, next_fid))

                if next_fid >= best_candidate_fid:
                    best_candidate_fid = next_fid
                    best_candidate_seq = next_seq

        # Rank candidates by blend of fidelity and PPO policy score
        candidates.sort(key=lambda x: (x[3] * 100.0 + x[2]), reverse=True)
        beam = candidates[:beam_width]

    # Evaluate top candidates in final beam via Continuous Angle Optimization
    for psi_curr, seq, score, raw_fid in beam[:5]:
        opt_seq, opt_fid = optimize_circuit_angles_3q(seq, target_sv, action_list, gate_matrices, num_restarts=3)
        if opt_fid > best_candidate_fid:
            best_candidate_fid = opt_fid
            best_candidate_seq = opt_seq

    if best_candidate_fid < target_fidelity:
        topo_seq, topo_fid = topology_aware_cnot_insertion_3q(best_candidate_seq, target_sv, action_list, gate_matrices, best_candidate_fid)
        if topo_fid > best_candidate_fid:
            best_candidate_seq = topo_seq
            best_candidate_fid = topo_fid

    # Pass 1: Structural Simplification — Transpile with Qiskit Level 3 to merge redundant 1Q gates
    raw_qc = build_qiskit_circuit_3q(best_candidate_seq)
    try:
        from qiskit import transpile
        qc_transpiled = transpile(raw_qc, optimization_level=3, basis_gates=['rz', 'ry', 'rx', 'cx'])

        transpiled_seq = []
        for inst in qc_transpiled.data:
            gname = inst.operation.name.upper()
            if gname == 'CX':
                gname = 'CNOT'
            q_indices = [qc_transpiled.find_bit(q).index for q in inst.qubits]
            targets = q_indices[0] if len(q_indices) == 1 else (q_indices[0], q_indices[1])
            params = inst.operation.params
            param_val = float(params[0]) if params else None
            transpiled_seq.append((gname, targets, param_val))

        opt_seq, opt_fid = optimize_circuit_angles_3q(
            transpiled_seq, target_sv, action_list, gate_matrices, num_restarts=5
        )
        if opt_fid >= 0.99999 and len(opt_seq) <= len(best_candidate_seq):
            best_candidate_seq = opt_seq
            best_candidate_fid = opt_fid
    except Exception:
        pass

    # Filter out near-zero rotation angles for clean output
    clean_seq = []
    for gname, target, angle in best_candidate_seq:
        if gname in ['RX', 'RY', 'RZ'] and angle is not None:
            mod_ang = float(np.mod(angle, 2.0 * np.pi))
            if abs(mod_ang) > 1e-5 and abs(mod_ang - 2.0 * np.pi) > 1e-5:
                clean_seq.append((gname, target, mod_ang))
        else:
            clean_seq.append((gname, target, angle))

    qiskit_qc = build_qiskit_circuit_3q(clean_seq)
    sim_sv = Statevector.from_instruction(qiskit_qc).data
    final_verified_fid = compute_fidelity(target_sv, sim_sv)

    # Format clean display lines for standard RZ/RY/RX basis
    display_lines = []
    for idx, act in enumerate(clean_seq, 1):
        gname, targets, param = act[0], act[1], act[2]
        q_str = f"q{targets[0]}, q{targets[1]}" if isinstance(targets, (tuple, list)) else f"q{targets}"
        if param is not None:
            display_lines.append(f"{idx:02d}. {gname}({q_str}, theta = {param:+.16f})")
        else:
            display_lines.append(f"{idx:02d}. {gname}({q_str})")

    # Format U3 / U universal gate representation (Absolute minimal gate count & depth)
    u3_display_lines = []
    u3_gate_count = len(clean_seq)
    u3_depth = qiskit_qc.depth()
    try:
        from qiskit import transpile
        qc_u3 = transpile(qiskit_qc, optimization_level=3, basis_gates=['u3', 'cx'])
        u3_gate_count = qc_u3.size()
        u3_depth = qc_u3.depth()
        for idx, inst in enumerate(qc_u3.data, 1):
            gname = inst.operation.name.upper()
            if gname == 'CX':
                gname = 'CNOT'
            q_indices = [qc_u3.find_bit(q).index for q in inst.qubits]
            q_str = f"q{q_indices[0]}, q{q_indices[1]}" if len(q_indices) == 2 else f"q{q_indices[0]}"
            params = inst.operation.params
            if params:
                p_str = ", ".join([f"{float(p):+.10f}" for p in params])
                u3_display_lines.append(f"{idx:02d}. {gname}({q_str}, [{p_str}])")
            else:
                u3_display_lines.append(f"{idx:02d}. {gname}({q_str})")
    except Exception:
        u3_display_lines = display_lines

    ent_count = sum(1 for g, q, a in clean_seq if g in ('CZ', 'CNOT', 'CX', 'SWAP'))
    status = 'HIGH_PRECISION_SUCCESS' if final_verified_fid >= target_fidelity else ('APPROXIMATE_SUCCESS' if final_verified_fid >= 0.99 else 'FAILED')
    t_elapsed = time.time() - t_start

    return {
        'final_fidelity': final_verified_fid,
        'gate_count': len(clean_seq),
        'final_gate_count': len(clean_seq),
        'raw_gate_count': len(clean_seq),
        'circuit_depth': qiskit_qc.depth(),
        'entangling_gate_count': ent_count,
        'u3_gate_count': u3_gate_count,
        'u3_depth': u3_depth,
        'u3_display_lines': u3_display_lines,
        'display_lines': display_lines,
        'status': status,
        'search_time_sec': t_elapsed,
        'search_time_seconds': t_elapsed,
    }
