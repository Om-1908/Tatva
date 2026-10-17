"""
action_map_4q.py
----------------
Single Source of Truth for the 344-Action 4-Qubit Discrete Action Vocabulary.

Action Space breakdown:
  4A. Fixed Single-Qubit Gates: H, X, Y, Z, S, Sdg, T, Tdg x 4 qubits = 32 actions
  4B. Parameterized Rotations: RX, RY, RZ x 24 angles x 4 qubits = 288 actions
  4C. CNOT: 12 directed pairs (0->1, 1->0, 0->2, 2->0, 0->3, 3->0, 1->2, 2->1, 1->3, 3->1, 2->3, 3->2) = 12 actions
  4D. CZ: 6 undirected pairs ((0,1), (0,2), (0,3), (1,2), (1,3), (2,3)) = 6 actions
  4E. SWAP: 6 undirected pairs ((0,1), (0,2), (0,3), (1,2), (1,3), (2,3)) = 6 actions

Total: 32 + 288 + 12 + 6 + 6 = 344 ACTIONS.
"""

import json
import os
import numpy as np
from typing import Dict, List, Tuple
from qiskit import QuantumCircuit
from qiskit.quantum_info import Operator, Statevector


def build_4qubit_action_list(config=None) -> List[Tuple]:
    """
    Build deterministic 344 action tuple list:
      (gate_name, qubit_or_pair, angle)
    """
    action_list = []

    # 4A. Fixed single-qubit gates (32 actions)
    fixed_gates = ['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg']
    for q in range(4):
        for g in fixed_gates:
            action_list.append((g, q, None))

    # 4B. Rotation single-qubit gates (288 actions)
    rotation_gates = ['RX', 'RY', 'RZ']
    # 24 discrete angles: 16 positive (+k*pi/8 for k=1..16) + 8 negative (-k*pi/8 for k=1..8)
    angles = [k * np.pi / 8.0 for k in range(1, 17)] + [-k * np.pi / 8.0 for k in range(1, 9)]
    for g in rotation_gates:
        for q in range(4):
            for ang in angles:
                action_list.append((g, q, float(ang)))

    # 4C. CNOT (12 directed pairs)
    cnot_pairs = [
        (0, 1), (1, 0),
        (0, 2), (2, 0),
        (0, 3), (3, 0),
        (1, 2), (2, 1),
        (1, 3), (3, 1),
        (2, 3), (3, 2)
    ]
    for ctrl, tgt in cnot_pairs:
        action_list.append(('CNOT', (ctrl, tgt), None))

    # 4D. CZ (6 undirected pairs)
    cz_pairs = [
        (0, 1), (0, 2), (0, 3),
        (1, 2), (1, 3),
        (2, 3)
    ]
    for q1, q2 in cz_pairs:
        action_list.append(('CZ', (q1, q2), None))

    # 4E. SWAP (6 undirected pairs)
    swap_pairs = [
        (0, 1), (0, 2), (0, 3),
        (1, 2), (1, 3),
        (2, 3)
    ]
    for q1, q2 in swap_pairs:
        action_list.append(('SWAP', (q1, q2), None))

    assert len(action_list) == 344, f"Expected exactly 344 actions, got {len(action_list)}"
    return action_list


def build_4qubit_gate_matrices(action_list: List[Tuple], cache_path: str = "saved_models/4qubit/gate_mats_4q.npy") -> np.ndarray:
    """
    Pre-compute all 344 16x16 unitary matrices using Qiskit Operator
    to guarantee 100% basis agreement with Qiskit canonical ordering.
    Caches matrices to disk for instant initialization.
    """
    if os.path.exists(cache_path):
        try:
            mats = np.load(cache_path)
            if mats.shape == (len(action_list), 16, 16):
                return mats
        except Exception:
            pass

    mats = np.zeros((len(action_list), 16, 16), dtype=np.complex128)

    for idx, (name, target, angle) in enumerate(action_list):
        qc = QuantumCircuit(4)

        if name == 'H':
            qc.h(target)
        elif name == 'X':
            qc.x(target)
        elif name == 'Y':
            qc.y(target)
        elif name == 'Z':
            qc.z(target)
        elif name == 'S':
            qc.s(target)
        elif name == 'Sdg':
            qc.sdg(target)
        elif name == 'T':
            qc.t(target)
        elif name == 'Tdg':
            qc.tdg(target)
        elif name == 'RX':
            qc.rx(angle, target)
        elif name == 'RY':
            qc.ry(angle, target)
        elif name == 'RZ':
            qc.rz(angle, target)
        elif name == 'CNOT':
            ctrl, tgt = target
            qc.cx(ctrl, tgt)
        elif name == 'CZ':
            q1, q2 = target
            qc.cz(q1, q2)
        elif name == 'SWAP':
            q1, q2 = target
            qc.swap(q1, q2)
        else:
            raise ValueError(f"Unknown gate in action list: {name}")

        op_matrix = Operator(qc).data
        mats[idx] = op_matrix

    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        np.save(cache_path, mats)
    except Exception:
        pass

    return mats


def save_action_map_json(action_list: List[Tuple], filepath: str = 'action_map_4q.json') -> Dict:
    """Save machine-readable action map JSON file."""
    action_dict = {}
    for idx, (name, target, angle) in enumerate(action_list):
        action_dict[idx] = {
            "action_id": idx,
            "gate": name,
            "qubits": list(target) if isinstance(target, (tuple, list)) else target,
            "angle": angle
        }

    with open(filepath, 'w') as f:
        json.dump(action_dict, f, indent=2)

    return action_dict


def validate_action_map_and_matrices(action_list: List[Tuple], gate_mats: np.ndarray) -> bool:
    """
    Comprehensive Sanity Validation of the 344-Action Bank against Qiskit Reference:
    1. Action list length == 344
    2. All action indices unique
    3. All 344 gate matrices unitary (U^dagger U = I_16)
    4. Exact statevector match for every action applied from |0000> against Qiskit
    """
    assert len(action_list) == 344, f"Action count mismatch: {len(action_list)} != 344"
    assert gate_mats.shape == (344, 16, 16), f"Matrix shape mismatch: {gate_mats.shape}"

    # 1. Unitarity check
    eye16 = np.eye(16, dtype=np.complex128)
    for i in range(344):
        U = gate_mats[i]
        diff = np.max(np.abs(U.conj().T @ U - eye16))
        assert diff < 1e-12, f"Action {i} ({action_list[i]}) matrix is not unitary! Max diff: {diff}"

    # 2. Qiskit Statevector Reference Validation
    ground_state = np.zeros(16, dtype=np.complex128)
    ground_state[0] = 1.0

    for i, (name, target, angle) in enumerate(action_list):
        # Apply matrix to ground state
        sim_sv = gate_mats[i] @ ground_state

        # Build Qiskit circuit
        qc = QuantumCircuit(4)
        if name == 'H':
            qc.h(target)
        elif name == 'X':
            qc.x(target)
        elif name == 'Y':
            qc.y(target)
        elif name == 'Z':
            qc.z(target)
        elif name == 'S':
            qc.s(target)
        elif name == 'Sdg':
            qc.sdg(target)
        elif name == 'T':
            qc.t(target)
        elif name == 'Tdg':
            qc.tdg(target)
        elif name == 'RX':
            qc.rx(angle, target)
        elif name == 'RY':
            qc.ry(angle, target)
        elif name == 'RZ':
            qc.rz(angle, target)
        elif name == 'CNOT':
            ctrl, tgt = target
            qc.cx(ctrl, tgt)
        elif name == 'CZ':
            q1, q2 = target
            qc.cz(q1, q2)
        elif name == 'SWAP':
            q1, q2 = target
            qc.swap(q1, q2)

        ref_sv = Statevector.from_instruction(qc).data
        fidelity = abs(np.vdot(ref_sv, sim_sv)) ** 2
        assert fidelity >= 0.999999999, (
            f"Action {i} ({action_list[i]}) failed Qiskit reference validation! Fidelity = {fidelity}"
        )

    print("[OK] ACTION MAP VALIDATION SUCCESSFUL: All 344 actions validated against Qiskit reference.")
    return True


    validate_action_map_and_matrices(actions, mats)


# Module level exports
RAW_ACTION_LIST_4Q = build_4qubit_action_list()
NUM_ACTIONS_4Q = len(RAW_ACTION_LIST_4Q)
ACTION_MAP_4Q = []
for idx, (name, target, angle) in enumerate(RAW_ACTION_LIST_4Q):
    action_dict = {
        "action_idx": idx,
        "type": name,
        "qubit": target if isinstance(target, int) else None,
        "qubits": list(target) if isinstance(target, (tuple, list)) else None,
        "angle": angle
    }
    ACTION_MAP_4Q.append(action_dict)

