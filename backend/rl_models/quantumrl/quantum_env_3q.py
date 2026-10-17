"""
quantum_env_3q.py
-----------------
Custom Gymnasium environment: QuantumCircuitEnv3Q — Scoped to 3 Qubits.

Observation vector (34 floats):
  [Re(ψ_current[0..7]), Im(ψ_current[0..7]), Re(ψ_target[0..7]), Im(ψ_target[0..7]), fidelity, step/MAX_STEPS]

Action space (252 discrete actions):
  - Fixed 1Q gates: H, X, Y, Z, S, Sdg, T, Tdg on q0, q1, q2 (24 actions)
  - Rotation 1Q gates: RX, RY, RZ x 24 angles x 3 qubits (216 actions)
  - Entangling 2Q gates: CNOT(0->1), CNOT(1->0), CNOT(0->2), CNOT(2->0),
                        CNOT(1->2), CNOT(2->1), CZ(0,1), CZ(0,2), CZ(1,2),
                        SWAP(0,1), SWAP(0,2), SWAP(1,2) (12 actions)
  Total: 252 actions.

Fidelity:
  F = abs(np.vdot(target_sv, simulated_sv)) ** 2
"""

import math
from typing import Any, Dict, List, Optional, Tuple


import numpy as np
import gymnasium
from gymnasium import spaces

from qiskit import QuantumCircuit
from qiskit.quantum_info import Operator, Statevector


def compute_fidelity(psi: np.ndarray, phi: np.ndarray) -> float:
    """Exact fidelity F = |<psi|phi>|^2 using np.vdot (conjugates first argument)."""
    return float(abs(np.vdot(psi, phi)) ** 2)


def compute_von_neumann_entropy(psi: np.ndarray) -> float:
    """
    Compute von Neumann entropy S = -sum(lambda * log2(lambda)) of reduced density
    matrix rho_q0 obtained by tracing out qubits q1, q2 from 3-qubit state psi.
    """
    # psi shape (8,) in basis |b2 b1 b0>
    c = psi.reshape(2, 2, 2)  # shape (b2, b1, b0)
    # rho_q0 is 2x2 matrix over b0 index, summing over b2 and b1
    # rho[i, j] = sum_{b2, b1} c[b2, b1, i] * conj(c[b2, b1, j])
    rho = np.einsum('abi,abj->ij', c, c.conj())
    evals = np.linalg.eigvalsh(rho)
    evals = np.clip(evals, 0.0, 1.0)
    evals = evals[evals > 1e-10]
    if len(evals) == 0:
        return 0.0
    return float(-np.sum(evals * np.log2(evals)))


def build_3qubit_action_list(config) -> List[Tuple]:
    """
    Build deterministic, fixed 252 action tuple list:
      (gate_name, qubit_or_pair, angle)
    """
    action_list = []

    # 1. Fixed single-qubit gates (24 actions)
    fixed_gates = ['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg']
    for q in range(3):
        for g in fixed_gates:
            action_list.append((g, q, None))

    # 2. Rotation single-qubit gates (216 actions)
    rotation_gates = ['RX', 'RY', 'RZ']
    angles = config.ROTATION_ANGLES  # 24 angles
    for g in rotation_gates:
        for q in range(3):
            for ang in angles:
                action_list.append((g, q, float(ang)))

    # 3. Two-qubit entangling gates (12 actions)
    # CNOT (6 directed pairs)
    cnot_pairs = [(0, 1), (1, 0), (0, 2), (2, 0), (1, 2), (2, 1)]
    for ctrl, tgt in cnot_pairs:
        action_list.append(('CNOT', (ctrl, tgt), None))

    # CZ (3 undirected pairs)
    cz_pairs = [(0, 1), (0, 2), (1, 2)]
    for q1, q2 in cz_pairs:
        action_list.append(('CZ', (q1, q2), None))

    # SWAP (3 undirected pairs)
    swap_pairs = [(0, 1), (0, 2), (1, 2)]
    for q1, q2 in swap_pairs:
        action_list.append(('SWAP', (q1, q2), None))

    assert len(action_list) == 252, f"Expected 252 actions, got {len(action_list)}"
    return action_list


def build_3qubit_gate_matrices(action_list: List[Tuple]) -> np.ndarray:
    """
    Pre-compute all 252 8x8 unitary matrices using Qiskit Operator
    to guarantee 100% basis agreement with Qiskit canonical ordering.
    Returns array of shape (252, 8, 8) complex128.
    """
    n_actions = len(action_list)
    mats = np.zeros((n_actions, 8, 8), dtype=np.complex128)

    for i, (gate_name, qubit_or_pair, angle) in enumerate(action_list):
        qc = QuantumCircuit(3)
        if gate_name == 'H': qc.h(qubit_or_pair)
        elif gate_name == 'X': qc.x(qubit_or_pair)
        elif gate_name == 'Y': qc.y(qubit_or_pair)
        elif gate_name == 'Z': qc.z(qubit_or_pair)
        elif gate_name == 'S': qc.s(qubit_or_pair)
        elif gate_name == 'Sdg': qc.sdg(qubit_or_pair)
        elif gate_name == 'T': qc.t(qubit_or_pair)
        elif gate_name == 'Tdg': qc.tdg(qubit_or_pair)
        elif gate_name == 'RX': qc.rx(angle, qubit_or_pair)
        elif gate_name == 'RY': qc.ry(angle, qubit_or_pair)
        elif gate_name == 'RZ': qc.rz(angle, qubit_or_pair)
        elif gate_name == 'CNOT':
            ctrl, tgt = qubit_or_pair
            qc.cx(ctrl, tgt)
        elif gate_name == 'CZ':
            q1, q2 = qubit_or_pair
            qc.cz(q1, q2)
        elif gate_name == 'SWAP':
            q1, q2 = qubit_or_pair
            qc.swap(q1, q2)

        mats[i] = Operator(qc).data

    return mats


class QuantumCircuitEnv3Q(gymnasium.Env):
    """
    Gymnasium environment for 3-qubit quantum state preparation via RL.
    """

    metadata = {'render_modes': ['text']}

    def __init__(self, config, target_sv: Optional[np.ndarray] = None):
        super().__init__()

        self.n_qubits           = 3
        self.max_steps          = config.MAX_STEPS
        self.fidelity_threshold = config.FIDELITY_THRESHOLD
        self.gate_penalty       = config.GATE_PENALTY

        self.action_list = build_3qubit_action_list(config)
        self.gate_mats = build_3qubit_gate_matrices(self.action_list)

        self.action_space = spaces.Discrete(len(self.action_list))
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(34,), dtype=np.float32)

        self._fixed_target_sv = target_sv
        self.target_sv: Optional[np.ndarray] = None
        self.current_sv: Optional[np.ndarray] = None
        self.applied_actions: List[Tuple] = []
        self.steps: int = 0
        self.prev_fidelity: float = 0.0

        # Episode milestone flags
        self.m_50: bool = False
        self.m_75: bool = False
        self.m_90: bool = False
        self.m_999: bool = False

    @property
    def gate_unitaries(self) -> np.ndarray:
        return self.gate_mats

    @property
    def statevector(self) -> np.ndarray:
        return self.current_sv

    @property
    def current_fidelity(self) -> float:
        return float(self.prev_fidelity)



    def reset(self, seed: Optional[int] = None, options: Optional[Dict] = None, target_sv: Optional[np.ndarray] = None) -> Tuple[np.ndarray, Dict]:
        super().reset(seed=seed)

        if target_sv is not None:
            self.target_sv = target_sv.copy()
        elif self._fixed_target_sv is not None:
            self.target_sv = self._fixed_target_sv.copy()
        else:
            # Haar-random 3-qubit statevector
            z = (np.random.normal(size=8) + 1j * np.random.normal(size=8)) / np.sqrt(2.0)
            self.target_sv = z / np.linalg.norm(z)

        # Ground state |000>
        self.current_sv = np.zeros(8, dtype=np.complex128)
        self.current_sv[0] = 1.0 + 0j

        self.applied_actions = []
        self.steps = 0
        self.prev_fidelity = compute_fidelity(self.target_sv, self.current_sv)

        self.m_50 = False
        self.m_75 = False
        self.m_90 = False
        self.m_999 = False

        return self._get_obs(), {'fidelity': self.prev_fidelity}

    def _get_obs(self) -> np.ndarray:
        obs = np.empty(34, dtype=np.float32)
        obs[0:8]   = self.current_sv.real
        obs[8:16]  = self.current_sv.imag
        obs[16:24] = self.target_sv.real
        obs[24:32] = self.target_sv.imag
        obs[32]    = np.float32(self.prev_fidelity)
        obs[33]    = np.float32(self.steps / self.max_steps)
        return obs

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        self.steps += 1
        action_tuple = self.action_list[action]
        self.applied_actions.append(action_tuple)

        # Apply 8x8 gate matrix to current statevector
        U = self.gate_mats[action]
        self.current_sv = U @ self.current_sv

        curr_fidelity = compute_fidelity(self.target_sv, self.current_sv)
        delta_f = curr_fidelity - self.prev_fidelity

        # Dense reward computation
        reward = 12.0 * delta_f - self.gate_penalty

        # Milestone bonuses
        if curr_fidelity >= 0.50 and not self.m_50:
            reward += 1.5
            self.m_50 = True
        if curr_fidelity >= 0.75 and not self.m_75:
            reward += 3.0
            self.m_75 = True
        if curr_fidelity >= 0.90 and not self.m_90:
            reward += 8.0
            self.m_90 = True
        if curr_fidelity >= 0.999 and not self.m_999:
            reward += 15.0
            self.m_999 = True

        # Stagnation penalty
        if self.steps > 12 and curr_fidelity < 0.30:
            reward -= 0.5

        # Terminal success
        terminated = curr_fidelity >= self.fidelity_threshold
        if terminated:
            reward += 30.0

        truncated = self.steps >= self.max_steps
        done = terminated or truncated

        self.prev_fidelity = curr_fidelity
        return self._get_obs(), float(reward), terminated, truncated, {'fidelity': curr_fidelity}

    def get_circuit_info(self) -> Dict[str, Any]:
        """Returns statistics for the applied actions in the current episode."""
        entangling_gates = sum(1 for a in self.applied_actions if a[0] in ['CNOT', 'CZ', 'SWAP'])
        return {
            'total_gates': len(self.applied_actions),
            'depth': len(self.applied_actions),
            'entangling_gates': entangling_gates,
            'actions': self.applied_actions,
        }

