"""
action_map_5q.py
----------------
Single Source of Truth for the 440-Action 5-Qubit Discrete Action Vocabulary.

Action Space breakdown:
  5A. Fixed Single-Qubit Gates: H, X, Y, Z, S, Sdg, T, Tdg x 5 qubits = 40 actions
  5B. Parameterized Rotations: RX, RY, RZ x 24 angles x 5 qubits = 360 actions
  5C. CNOT: 20 directed pairs (5 * 4) = 20 actions
  5D. CZ: 10 undirected pairs (5 * 4 / 2) = 10 actions
  5E. SWAP: 10 undirected pairs (5 * 4 / 2) = 10 actions

Total: 40 + 360 + 20 + 10 + 10 = 440 ACTIONS.
"""

import json
import os
import numpy as np
from typing import Dict, List, Tuple
from qiskit import QuantumCircuit
from qiskit.quantum_info import Operator, Statevector


def build_5qubit_action_list(config=None) -> List[Tuple]:
    """
    Build deterministic 440 action tuple list:
      (gate_name, qubit_or_pair, angle)
    """
    action_list = []

    # 5A. Fixed single-qubit gates (40 actions)
    fixed_gates = ['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg']
    for q in range(5):
        for g in fixed_gates:
            action_list.append((g, q, None))

    # 5B. Rotation single-qubit gates (360 actions)
    rotation_gates = ['RX', 'RY', 'RZ']
    # 24 discrete angles: 16 positive (+k*pi/8 for k=1..16) + 8 negative (-k*pi/8 for k=1..8)
    angles = [k * np.pi / 8.0 for k in range(1, 17)] + [-k * np.pi / 8.0 for k in range(1, 9)]
    for g in rotation_gates:
        for q in range(5):
            for ang in angles:
                action_list.append((g, q, float(ang)))

    # 5C. CNOT (20 directed pairs)
    cnot_pairs = []
    for ctrl in range(5):
        for tgt in range(5):
            if ctrl != tgt:
                cnot_pairs.append((ctrl, tgt))
    for ctrl, tgt in cnot_pairs:
        action_list.append(('CNOT', (ctrl, tgt), None))

    # 5D. CZ (10 undirected pairs)
    cz_pairs = []
    for q1 in range(5):
        for q2 in range(q1 + 1, 5):
            cz_pairs.append((q1, q2))
    for q1, q2 in cz_pairs:
        action_list.append(('CZ', (q1, q2), None))

    # 5E. SWAP (10 undirected pairs)
    swap_pairs = []
    for q1 in range(5):
        for q2 in range(q1 + 1, 5):
            swap_pairs.append((q1, q2))
    for q1, q2 in swap_pairs:
        action_list.append(('SWAP', (q1, q2), None))

    assert len(action_list) == 440, f"Expected exactly 440 actions, got {len(action_list)}"
    return action_list


def build_5qubit_gate_matrices(action_list: List[Tuple], cache_path: str = "saved_models/5qubit/gate_mats_5q.npy") -> np.ndarray:
    """
    Pre-compute all 440 32x32 unitary matrices using Qiskit Operator
    to guarantee 100% basis agreement with Qiskit canonical ordering.
    Caches matrices to disk for instant initialization.
    """
    if os.path.exists(cache_path):
        try:
            mats = np.load(cache_path)
            if mats.shape == (len(action_list), 32, 32):
                return mats
        except Exception:
            pass

    mats = np.zeros((len(action_list), 32, 32), dtype=np.complex128)

    for idx, (name, target, angle) in enumerate(action_list):
        qc = QuantumCircuit(5)

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
        elif name in ['Sdg', 'SDG']:
            qc.sdg(target)
        elif name == 'T':
            qc.t(target)
        elif name in ['Tdg', 'TDG']:
            qc.tdg(target)
        elif name == 'RX':
            qc.rx(angle, target)
        elif name == 'RY':
            qc.ry(angle, target)
        elif name == 'RZ':
            qc.rz(angle, target)
        elif name in ['CNOT', 'CX']:
            ctrl, tgt = target
            qc.cx(ctrl, tgt)
        elif name == 'CZ':
            q1, q2 = target
            qc.cz(q1, q2)
        elif name == 'SWAP':
            q1, q2 = target
            qc.swap(q1, q2)
        else:
            raise ValueError(f"Unknown action name: {name}")

        mats[idx] = Operator(qc).data

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    try:
        np.save(cache_path, mats)
    except Exception:
        pass

    return mats


def export_action_map_json(output_path: str = "action_map_5q.json") -> Dict:
    """Export canonical JSON map for 5-qubit 440 action space."""
    action_list = build_5qubit_action_list()
    action_json = {}

    for idx, (name, target, angle) in enumerate(action_list):
        if isinstance(target, tuple):
            qubits = list(target)
        else:
            qubits = int(target)

        action_json[str(idx)] = {
            "action_id": idx,
            "gate": name,
            "qubits": qubits,
            "angle": angle if angle is None else float(angle)
        }

    with open(output_path, "w") as f:
        json.dump(action_json, f, indent=2)

    return action_json


ACTION_LIST_5Q = build_5qubit_action_list()
NUM_ACTIONS_5Q = len(ACTION_LIST_5Q)

if __name__ == '__main__':
    print(f"Generated 5-Qubit Action Space with {NUM_ACTIONS_5Q} actions.")
    export_action_map_json()
    print("Exported action_map_5q.json successfully.")
