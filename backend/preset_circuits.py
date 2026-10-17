"""
preset_circuits.py
------------------
Canonical, hand-verified, minimal textbook quantum circuits for named preset states
offered across 1, 2, 3, and 4 qubits in TATVA.

Bypasses the RL exploration and Scipy continuous-refinement pipeline for named presets,
returning exact 1.0 fidelity instantly while leaving Custom Statevector and Random
requests on the full RL pipeline.
"""

import time
import numpy as np
from typing import Dict, List, Any, Optional, Tuple

# Precomputed common angles
INV_SQRT2 = 1.0 / np.sqrt(2.0)
INV_SQRT3 = 1.0 / np.sqrt(3.0)

# Exact angles for W state preparations:
# 3-qubit W: theta = 2 * arccos(1/sqrt(3)) ≈ 1.9106332362490186
THETA_W3 = float(2.0 * np.arccos(INV_SQRT3))
# 4-qubit W: theta1 = 2*arccos(1/2) = 2*pi/3 ≈ 2.0943951023931953
THETA_W4_1 = float(2.0 * np.arccos(0.5))
# theta2 = arccos(1/sqrt(3)) ≈ 0.9553166181245093
THETA_W4_2 = float(np.arccos(INV_SQRT3))

# Canonical gate sequences for all presets keyed by (qubits, normalized_label)
CANONICAL_CIRCUITS: Dict[Tuple[int, str], List[Dict[str, Any]]] = {
    # ── 1-Qubit Presets ──
    (1, '|0⟩'): [],
    (1, '|1⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
    ],
    (1, '|+⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
    ],
    (1, '|-⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 0, 'step': 1},
    ],
    (1, '|i⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'S', 'target': 0, 'step': 1},
    ],
    (1, '|-i⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 0, 'step': 1},
        {'type': 'S', 'target': 0, 'step': 2},
    ],

    # ── 2-Qubit Presets ──
    (2, '|00⟩'): [],
    (2, '|01⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
    ],
    (2, '|10⟩'): [
        {'type': 'X', 'target': 1, 'step': 0},
    ],
    (2, '|11⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'X', 'target': 1, 'step': 0},
    ],
    (2, '|Φ+⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 1},
    ],
    (2, '|Φ-⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 0, 'step': 1},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 2},
    ],
    (2, '|Ψ+⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 1},
        {'type': 'X', 'target': 0, 'step': 2},
    ],
    (2, '|Ψ-⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 0, 'step': 1},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 2},
        {'type': 'X', 'target': 0, 'step': 3},
    ],
    (2, '|++⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 1, 'step': 0},
    ],

    # ── 3-Qubit Presets ──
    (3, '|000⟩'): [],
    (3, '|001⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
    ],
    (3, '|010⟩'): [
        {'type': 'X', 'target': 1, 'step': 0},
    ],
    (3, '|011⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'X', 'target': 1, 'step': 0},
    ],
    (3, '|100⟩'): [
        {'type': 'X', 'target': 2, 'step': 0},
    ],
    (3, '|101⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'X', 'target': 2, 'step': 0},
    ],
    (3, '|110⟩'): [
        {'type': 'X', 'target': 1, 'step': 0},
        {'type': 'X', 'target': 2, 'step': 0},
    ],
    (3, '|111⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'X', 'target': 1, 'step': 0},
        {'type': 'X', 'target': 2, 'step': 0},
    ],
    (3, '|GHZ⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 1},
        {'type': 'CNOT', 'control': 0, 'target': 2, 'step': 2},
    ],
    (3, '|W⟩'): [
        {'type': 'RY', 'target': 2, 'theta': THETA_W3, 'step': 0},
        {'type': 'RY', 'target': 1, 'theta': float(np.pi / 4), 'step': 1},
        {'type': 'CNOT', 'control': 2, 'target': 1, 'step': 2},
        {'type': 'RY', 'target': 1, 'theta': float(-np.pi / 4), 'step': 3},
        {'type': 'CNOT', 'control': 1, 'target': 0, 'step': 4},
        {'type': 'CNOT', 'control': 2, 'target': 1, 'step': 5},
        {'type': 'X', 'target': 2, 'step': 6},
    ],
    (3, '|+++⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 1, 'step': 0},
        {'type': 'H', 'target': 2, 'step': 0},
    ],

    # ── 4-Qubit Presets ──
    (4, '|0000⟩'): [],
    (4, '|0001⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
    ],
    (4, '|0010⟩'): [
        {'type': 'X', 'target': 1, 'step': 0},
    ],
    (4, '|0011⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'X', 'target': 1, 'step': 0},
    ],
    (4, '|0100⟩'): [
        {'type': 'X', 'target': 2, 'step': 0},
    ],
    (4, '|1111⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'X', 'target': 1, 'step': 0},
        {'type': 'X', 'target': 2, 'step': 0},
        {'type': 'X', 'target': 3, 'step': 0},
    ],
    (4, '|GHZ4⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 1},
        {'type': 'CNOT', 'control': 0, 'target': 2, 'step': 2},
        {'type': 'CNOT', 'control': 0, 'target': 3, 'step': 3},
    ],
    (4, '|W4⟩'): [
        {'type': 'RY', 'target': 3, 'theta': THETA_W4_1, 'step': 0},
        {'type': 'RY', 'target': 2, 'theta': THETA_W4_2, 'step': 1},
        {'type': 'CNOT', 'control': 3, 'target': 2, 'step': 2},
        {'type': 'RY', 'target': 2, 'theta': -THETA_W4_2, 'step': 3},
        {'type': 'CNOT', 'control': 3, 'target': 2, 'step': 4},
        {'type': 'RY', 'target': 1, 'theta': float(np.pi / 4), 'step': 5},
        {'type': 'CNOT', 'control': 2, 'target': 1, 'step': 6},
        {'type': 'RY', 'target': 1, 'theta': float(-np.pi / 4), 'step': 7},
        {'type': 'CNOT', 'control': 2, 'target': 1, 'step': 8},
        {'type': 'CNOT', 'control': 1, 'target': 0, 'step': 9},
        {'type': 'CNOT', 'control': 2, 'target': 1, 'step': 10},
        {'type': 'CNOT', 'control': 3, 'target': 2, 'step': 11},
        {'type': 'X', 'target': 3, 'step': 12},
    ],
    (4, '|++++⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 1, 'step': 0},
        {'type': 'H', 'target': 2, 'step': 0},
        {'type': 'H', 'target': 3, 'step': 0},
    ],
    (4, '|Φ+⊗Φ+⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 1},
        {'type': 'H', 'target': 2, 'step': 0},
        {'type': 'CNOT', 'control': 2, 'target': 3, 'step': 1},
    ],
    # ── 5-Qubit Presets ──
    (5, '|00000⟩'): [],
    (5, '|00001⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
    ],
    (5, '|00010⟩'): [
        {'type': 'X', 'target': 1, 'step': 0},
    ],
    (5, '|00100⟩'): [
        {'type': 'X', 'target': 2, 'step': 0},
    ],
    (5, '|11111⟩'): [
        {'type': 'X', 'target': 0, 'step': 0},
        {'type': 'X', 'target': 1, 'step': 0},
        {'type': 'X', 'target': 2, 'step': 0},
        {'type': 'X', 'target': 3, 'step': 0},
        {'type': 'X', 'target': 4, 'step': 0},
    ],
    (5, '|GHZ5⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'CNOT', 'control': 0, 'target': 1, 'step': 1},
        {'type': 'CNOT', 'control': 0, 'target': 2, 'step': 2},
        {'type': 'CNOT', 'control': 0, 'target': 3, 'step': 3},
        {'type': 'CNOT', 'control': 0, 'target': 4, 'step': 4},
    ],
    (5, '|+++++⟩'): [
        {'type': 'H', 'target': 0, 'step': 0},
        {'type': 'H', 'target': 1, 'step': 0},
        {'type': 'H', 'target': 2, 'step': 0},
        {'type': 'H', 'target': 3, 'step': 0},
        {'type': 'H', 'target': 4, 'step': 0},
    ],
}


def normalize_preset_label(label: str) -> str:
    """Normalize unicode characters, dashes, and whitespace in preset labels."""
    cleaned = str(label or '').strip()
    # Replace unicode minus '\u2212' with standard ASCII '-'
    cleaned = cleaned.replace('\u2212', '-')
    # Normalize spaces
    cleaned = cleaned.replace(' ', '')
    return cleaned


def is_preset_target(label: str) -> bool:
    """
    Check if a target label represents a named preset.
    Custom statevector and Random targets return False and go to the RL pipeline.
    """
    cleaned = normalize_preset_label(label).lower()
    if 'custom' in cleaned:
        return False
    if 'random' in cleaned:
        return False
    return True


def _compute_circuit_depth(gates: List[Dict[str, Any]], n_qubits: int) -> int:
    """Calculate the operational circuit depth across all qubit wires."""
    wire_steps = [0] * n_qubits
    for g in gates:
        gt = g.get('type')
        if gt == 'CNOT' or 'control' in g:
            c = g.get('control', 0)
            t = g.get('target', 1)
            next_step = max(wire_steps[c], wire_steps[t]) + 1
            wire_steps[c] = next_step
            wire_steps[t] = next_step
        else:
            t = g.get('target', 0)
            wire_steps[t] += 1
    return max(wire_steps) if wire_steps else 0


def _build_preset_logs(gates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate structured gate logs formatted identically to RL pipeline responses."""
    logs = []
    for i, g in enumerate(gates):
        gt = g.get('type', 'X')
        t = g.get('target', 0)
        c = g.get('control')
        theta = g.get('theta')
        if c is not None:
            qubit_str = f"q{c}→q{t}"
        else:
            qubit_str = f"q{t}"

        entry = {
            'step': i + 1,
            'gate': gt,
            'qubit': qubit_str,
            'fidelity': 1.0,
        }
        if theta is not None:
            entry['theta'] = theta
        logs.append(entry)
    return logs


def get_canonical_circuit(label: str, n_qubits: int) -> Optional[List[Dict[str, Any]]]:
    """
    Look up the hand-verified, canonical gate list for a preset.
    Supports exact matching, unicode variants, and binary computational basis parsing.
    """
    norm = normalize_preset_label(label)

    # 1. Direct lookup
    if (n_qubits, norm) in CANONICAL_CIRCUITS:
        return [dict(g) for g in CANONICAL_CIRCUITS[(n_qubits, norm)]]

    # 2. Standard aliases mapping
    aliases = {
        'zero': f"|{'0' * n_qubits}⟩",
        'one': '|1⟩',
        'plus': f"|{'+' * n_qubits}⟩" if n_qubits > 1 else '|+⟩',
        'minus': '|-⟩',
        'i_state': '|i⟩',
        'bell': '|Φ+⟩',
        'phi_plus': '|Φ+⟩',
        'phi_minus': '|Φ-⟩',
        'psi_plus': '|Ψ+⟩',
        'psi_minus': '|Ψ-⟩',
        'ghz': '|GHZ⟩' if n_qubits == 3 else ('|GHZ4⟩' if n_qubits == 4 else ('|GHZ5⟩' if n_qubits == 5 else '|Φ+⟩')),
        'w': '|W⟩' if n_qubits == 3 else ('|W4⟩' if n_qubits == 4 else ('|W5⟩' if n_qubits == 5 else '|Ψ+⟩')),
    }
    clean_lower = norm.lower().replace('|', '').replace('⟩', '').replace('>', '')
    if clean_lower in aliases:
        canonical_key = aliases[clean_lower]
        if (n_qubits, canonical_key) in CANONICAL_CIRCUITS:
            return [dict(g) for g in CANONICAL_CIRCUITS[(n_qubits, canonical_key)]]

    # 3. Arbitrary computational basis bitstring (e.g. |0101⟩)
    clean_bin = ''.join(c for c in norm if c in ('0', '1'))
    if len(clean_bin) == n_qubits:
        gates = []
        step = 0
        # Rightmost character is qubit 0 (Qiskit little-endian convention)
        for i, char in enumerate(reversed(clean_bin)):
            if char == '1':
                gates.append({'type': 'X', 'target': i, 'step': step})
                step += 1
        return gates

    return None


def resolve_preset_synthesis(label: str, n_qubits: int) -> Optional[Dict[str, Any]]:
    """
    Build the complete synthesis response for a named preset, returning exact 1.0 fidelity,
    canonical gates, and identical PPO/DQN slots to keep comparison components functioning
    cleanly without misleading claims.
    """
    if not is_preset_target(label):
        return None

    t0 = time.perf_counter()
    canonical_gates = get_canonical_circuit(label, n_qubits)
    if canonical_gates is None:
        return None

    lookup_elapsed = round(max(0.001, time.perf_counter() - t0), 4)
    gate_count = len(canonical_gates)
    depth = _compute_circuit_depth(canonical_gates, n_qubits)
    logs = _build_preset_logs(canonical_gates)

    # Identical representation for both slots
    slot_data = {
        'fidelity': 1.0,
        'gate_count': gate_count,
        'circuit_depth': depth,
        'synthesis_time': lookup_elapsed,
        'episodes': 0,
        'gates': canonical_gates,
        'textbook': True,
    }

    return {
        'success': True,
        'n_qubits': n_qubits,
        'is_preset': True,
        'target_state': label,
        'winner': 'Textbook',
        'winner_fidelity': 1.0,
        'winner_gates': canonical_gates,
        'winner_gate_count': gate_count,
        'winner_depth': depth,
        'winner_time': lookup_elapsed,
        'logs': logs,
        'status_message': 'Recognized preset state — using exact textbook decomposition (no RL synthesis required)',
        'ppo': dict(slot_data),
        'dqn': dict(slot_data),
    }
