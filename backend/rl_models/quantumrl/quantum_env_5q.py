"""
quantum_env_5q.py
-----------------
Custom Gymnasium environment: QuantumCircuitEnv5Q — Scoped to 5 Qubits.

Observation vector (130 floats):
  [Re(ψ_current[0..31]), Im(ψ_current[0..31]), Re(ψ_target[0..31]), Im(ψ_target[0..31]), fidelity, step/MAX_STEPS]

Action space (440 discrete actions):
  - Fixed 1Q gates: H, X, Y, Z, S, Sdg, T, Tdg on q0..q4 (40 actions)
  - Rotation 1Q gates: RX, RY, RZ x 24 angles x 5 qubits (360 actions)
  - Entangling 2Q gates: CNOT (20 directed pairs), CZ (10 pairs), SWAP (10 pairs) (40 actions)
  Total: 440 actions.

Fidelity:
  F = abs(np.vdot(target_sv, simulated_sv)) ** 2
"""

import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import gymnasium
from gymnasium import spaces

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

try:
    from quantumrl.action_map_5q import build_5qubit_action_list, build_5qubit_gate_matrices
except ImportError:
    from action_map_5q import build_5qubit_action_list, build_5qubit_gate_matrices


def compute_fidelity_5q(psi: np.ndarray, phi: np.ndarray) -> float:
    """Exact fidelity F = |<psi|phi>|^2 using np.vdot (conjugates first argument)."""
    return float(abs(np.vdot(psi, phi)) ** 2)


def compute_von_neumann_entropy_5q(psi: np.ndarray) -> float:
    """
    Compute von Neumann entropy S of reduced density matrix rho_A (qubit q0)
    obtained by tracing out qubits q1, q2, q3, q4 from 5-qubit state psi.
    Reshape psi as (2, 16) matrix M: M[q0, rest]. rho_A = M @ M_dagger.
    """
    M = psi.reshape(2, 16)
    rho_A = M @ M.conj().T
    evals = np.linalg.eigvalsh(rho_A)
    evals = np.clip(evals, 0.0, 1.0)
    evals = evals[evals > 1e-10]
    if len(evals) == 0:
        return 0.0
    return float(-np.sum(evals * np.log2(evals)))


def sample_curriculum_target_5q(phase: int = 1, seed: Optional[int] = None) -> np.ndarray:
    """Sample target statevector according to curriculum entropy constraints."""
    rng = np.random.default_rng(seed)

    while True:
        z = (rng.normal(size=32) + 1j * rng.normal(size=32)) / np.sqrt(2.0)
        target_sv = z / np.linalg.norm(z)

        if phase == 1:
            if compute_von_neumann_entropy_5q(target_sv) < 0.4:
                return target_sv
        elif phase == 2:
            if rng.random() < 0.5:
                if compute_von_neumann_entropy_5q(target_sv) < 0.7:
                    return target_sv
            else:
                return target_sv
        elif phase == 3:
            if rng.random() < 0.25:
                if compute_von_neumann_entropy_5q(target_sv) < 1.0:
                    return target_sv
            else:
                return target_sv
        else:
            return target_sv


class QuantumCircuitEnv5Q(gymnasium.Env):
    """
    Gymnasium environment for 5-qubit quantum state preparation.
    State representation: 32 complex amplitudes ordered |00000> .. |11111>.
    Observation shape: (130,)
    Action space: Discrete(440)
    """
    metadata = {'render_modes': []}

    def __init__(self, config=None):
        super().__init__()
        if config is None:
            try:
                from quantumrl.configs.config_5qubit import Config5Qubit
                config = Config5Qubit()
            except ImportError:
                from configs.config_5qubit import Config5Qubit
                config = Config5Qubit()

        self.config = config
        self.num_qubits = 5
        self.max_steps = getattr(config, 'MAX_STEPS', 60)
        self.fidelity_threshold = getattr(config, 'FIDELITY_THRESHOLD', 0.999999)
        self.gate_penalty = getattr(config, 'GATE_PENALTY', 0.0006)

        # Precompute 440 actions & 32x32 unitary matrices
        self.action_list = build_5qubit_action_list(config)
        self.gate_mats = build_5qubit_gate_matrices(self.action_list)

        self.num_actions = len(self.action_list)
        assert self.num_actions == 440, f"Expected 440 actions, got {self.num_actions}"

        # Spaces
        self.action_space = spaces.Discrete(440)
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(130,), dtype=np.float32
        )

        # Environment state
        self.current_sv = np.zeros(32, dtype=np.complex128)
        self.target_sv = np.zeros(32, dtype=np.complex128)
        self.current_step = 0
        self.history: List[Tuple] = []

        # Milestones: 0: F>=0.40, 1: F>=0.60, 2: F>=0.75, 3: F>=0.90, 4: F>=0.999, 5: F>=0.999999
        self.milestones = [False] * 6
        self.prev_fidelity = 0.0

    def _sample_curriculum_target(self, phase: int = 1) -> np.ndarray:
        return sample_curriculum_target_5q(phase=phase)

    def reset(
        self,
        *,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
        target_sv: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)

        self.current_sv.fill(0.0)
        self.current_sv[0] = 1.0 + 0.0j  # |00000>
        self.current_step = 0
        self.history.clear()
        self.milestones = [False] * 6

        if target_sv is not None:
            self.target_sv = np.ascontiguousarray(target_sv, dtype=np.complex128)
            norm = np.linalg.norm(self.target_sv)
            if abs(norm - 1.0) > 1e-5:
                self.target_sv /= norm
        else:
            # Random Haar state
            rng = np.random.default_rng(seed)
            z = (rng.normal(size=32) + 1j * rng.normal(size=32)) / np.sqrt(2.0)
            self.target_sv = z / np.linalg.norm(z)

        self.prev_fidelity = compute_fidelity_5q(self.current_sv, self.target_sv)
        obs = self._get_obs()
        info = {
            'fidelity': self.prev_fidelity,
            'steps': 0
        }
        return obs, info

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        action = int(action)
        assert 0 <= action < 440, f"Action {action} out of bounds"

        # Apply gate matrix (32x32)
        U = self.gate_mats[action]
        self.current_sv = U @ self.current_sv
        norm = np.linalg.norm(self.current_sv)
        if norm > 0:
            self.current_sv /= norm

        self.current_step += 1
        self.history.append(self.action_list[action])

        curr_fidelity = compute_fidelity_5q(self.current_sv, self.target_sv)
        delta_F = curr_fidelity - self.prev_fidelity

        # Base reward
        reward = 12.0 * delta_F - self.gate_penalty

        # Milestones (+2.0 at 0.4, +1.5 at 0.6, +3.0 at 0.75, +8.0 at 0.90, +15.0 at 0.999, +30.0 at 0.999999)
        if not self.milestones[0] and curr_fidelity >= 0.40:
            self.milestones[0] = True
            reward += 2.0
        if not self.milestones[1] and curr_fidelity >= 0.60:
            self.milestones[1] = True
            reward += 1.5
        if not self.milestones[2] and curr_fidelity >= 0.75:
            self.milestones[2] = True
            reward += 3.0
        if not self.milestones[3] and curr_fidelity >= 0.90:
            self.milestones[3] = True
            reward += 8.0
        if not self.milestones[4] and curr_fidelity >= 0.999:
            self.milestones[4] = True
            reward += 15.0
        if not self.milestones[5] and curr_fidelity >= self.fidelity_threshold:
            self.milestones[5] = True
            reward += 30.0

        # Stagnation penalty (-0.5 if t > 20 and F < 0.15)
        if self.current_step > 20 and curr_fidelity < 0.15:
            reward -= 0.5

        terminated = bool(curr_fidelity >= self.fidelity_threshold)
        truncated = bool(self.current_step >= self.max_steps)

        self.prev_fidelity = curr_fidelity
        obs = self._get_obs()

        info = {
            'fidelity': curr_fidelity,
            'steps': self.current_step,
            'success': terminated,
            'history': list(self.history)
        }
        return obs, reward, terminated, truncated, info

    def _get_obs(self) -> np.ndarray:
        curr_r = self.current_sv.real.astype(np.float32)
        curr_i = self.current_sv.imag.astype(np.float32)
        targ_r = self.target_sv.real.astype(np.float32)
        targ_i = self.target_sv.imag.astype(np.float32)

        fid = np.float32(self.prev_fidelity)
        step_ratio = np.float32(self.current_step / self.max_steps)

        return np.concatenate([curr_r, curr_i, targ_r, targ_i, [fid], [step_ratio]])
