"""
quantum_env_4q.py
-----------------
Custom Gymnasium environment: QuantumCircuitEnv4Q — Scoped to 4 Qubits.

Observation vector (66 floats):
  [Re(ψ_current[0..15]), Im(ψ_current[0..15]), Re(ψ_target[0..15]), Im(ψ_target[0..15]), fidelity, step/MAX_STEPS]

Action space (344 discrete actions):
  - Fixed 1Q gates: H, X, Y, Z, S, Sdg, T, Tdg on q0, q1, q2, q3 (32 actions)
  - Rotation 1Q gates: RX, RY, RZ x 24 angles x 4 qubits (288 actions)
  - Entangling 2Q gates: CNOT (12 directed pairs), CZ (6 pairs), SWAP (6 pairs) (24 actions)
  Total: 344 actions.

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
    from quantumrl.action_map_4q import build_4qubit_action_list, build_4qubit_gate_matrices
except ImportError:
    from action_map_4q import build_4qubit_action_list, build_4qubit_gate_matrices


def compute_fidelity_4q(psi: np.ndarray, phi: np.ndarray) -> float:
    """Exact fidelity F = |<psi|phi>|^2 using np.vdot (conjugates first argument)."""
    return float(abs(np.vdot(psi, phi)) ** 2)


def compute_von_neumann_entropy_4q(psi: np.ndarray) -> float:
    """
    Compute von Neumann entropy S of reduced density matrix rho_{q0,q1}
    obtained by tracing out qubits q2, q3 from 4-qubit state psi.
    """
    # psi shape (16,) in basis |q3 q2 q1 q0>
    c = psi.reshape(2, 2, 2, 2)  # shape (q3, q2, q1, q0)
    # Trace out q3 and q2 (indices 0 and 1) -> reduced state on (q1, q0) (indices 2 and 3)
    rho = np.einsum('abij,abkl->ijkl', c, c.conj()).reshape(4, 4)
    evals = np.linalg.eigvalsh(rho)
    evals = np.clip(evals, 0.0, 1.0)
    evals = evals[evals > 1e-10]
    if len(evals) == 0:
        return 0.0
    return float(-np.sum(evals * np.log2(evals)))


class QuantumCircuitEnv4Q(gymnasium.Env):
    """
    Gymnasium environment for 4-qubit quantum state preparation.
    State representation: 16 complex amplitudes ordered |0000> .. |1111>.
    Observation shape: (66,)
    Action space: Discrete(344)
    """
    metadata = {'render_modes': []}

    def __init__(self, config=None):
        super().__init__()
        if config is None:
            try:
                from quantumrl.configs.config_4qubit import Config4Qubit
                config = Config4Qubit()
            except ImportError:
                from configs.config_4qubit import Config4Qubit
                config = Config4Qubit()

        self.config = config
        self.num_qubits = 4
        self.max_steps = getattr(config, 'MAX_STEPS', 50)
        self.fidelity_threshold = getattr(config, 'FIDELITY_THRESHOLD', 0.999999)
        self.gate_penalty = getattr(config, 'GATE_PENALTY', 0.001)

        # Precompute 344 actions & 16x16 unitary matrices
        self.action_list = build_4qubit_action_list(config)
        self.gate_mats = build_4qubit_gate_matrices(self.action_list)

        self.num_actions = len(self.action_list)
        assert self.num_actions == 344, f"Expected 344 actions, got {self.num_actions}"

        # Spaces
        self.action_space = spaces.Discrete(344)
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(66,), dtype=np.float32
        )

        # Environment state
        self.current_sv = np.zeros(16, dtype=np.complex128)
        self.target_sv = np.zeros(16, dtype=np.complex128)
        self.current_step = 0
        self.history: List[Tuple] = []

        self.milestones_achieved = {0.90: False, 0.99: False, 0.999: False, 0.999999: False}

    def _get_obs(self) -> np.ndarray:
        curr_re = self.current_sv.real.astype(np.float32)
        curr_im = self.current_sv.imag.astype(np.float32)
        targ_re = self.target_sv.real.astype(np.float32)
        targ_im = self.target_sv.imag.astype(np.float32)

        fidelity = compute_fidelity_4q(self.target_sv, self.current_sv)
        norm_step = np.float32(self.current_step / float(self.max_steps))

        obs = np.concatenate([curr_re, curr_im, targ_re, targ_im, [fidelity], [norm_step]])
        return obs.astype(np.float32)

    def reset(
        self,
        *,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        super().reset(seed=seed)
        if seed is not None:
            np.random.seed(seed)

        # Initial state |0000>
        self.current_sv = np.zeros(16, dtype=np.complex128)
        self.current_sv[0] = 1.0 + 0.0j

        # Target state: Haar-random 4-qubit statevector or explicit provided target
        if options and 'target_sv' in options:
            self.target_sv = np.array(options['target_sv'], dtype=np.complex128)
            norm = np.linalg.norm(self.target_sv)
            if norm > 0:
                self.target_sv /= norm
        else:
            z = (np.random.normal(size=16) + 1j * np.random.normal(size=16)) / np.sqrt(2.0)
            self.target_sv = z / np.linalg.norm(z)

        self.current_step = 0
        self.history = []
        self.milestones_achieved = {0.90: False, 0.99: False, 0.999: False, 0.999999: False}

        obs = self._get_obs()
        return obs, {"fidelity": float(obs[64])}

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        prev_fidelity = compute_fidelity_4q(self.target_sv, self.current_sv)

        # Apply gate matrix
        gate_mat = self.gate_mats[action]
        self.current_sv = gate_mat @ self.current_sv
        self.history.append(self.action_list[action])

        self.current_step += 1
        new_fidelity = compute_fidelity_4q(self.target_sv, self.current_sv)

        # Reward formulation
        fidelity_diff = new_fidelity - prev_fidelity
        reward = fidelity_diff * 10.0 - self.gate_penalty

        # Milestone bonuses
        for m in [0.90, 0.99, 0.999, 0.999999]:
            if new_fidelity >= m and not self.milestones_achieved[m]:
                self.milestones_achieved[m] = True
                if m == 0.90:
                    reward += 1.0
                elif m == 0.99:
                    reward += 5.0
                elif m == 0.999:
                    reward += 10.0
                elif m == 0.999999:
                    reward += 100.0

        success = (new_fidelity >= self.fidelity_threshold)
        terminated = success
        truncated = (self.current_step >= self.max_steps) and not terminated

        obs = self._get_obs()
        info = {
            "fidelity": new_fidelity,
            "success": success,
            "step": self.current_step,
            "action_tuple": self.action_list[action]
        }

        return obs, float(reward), terminated, truncated, info


if __name__ == '__main__':
    env = QuantumCircuitEnv4Q()
    obs, info = env.reset(seed=42)
    assert obs.shape == (66,), f"Obs shape error: {obs.shape}"
    obs2, reward, term, trunc, info2 = env.step(0)
    assert obs2.shape == (66,)
    print("[OK] QuantumCircuitEnv4Q initialized and stepped successfully!")
