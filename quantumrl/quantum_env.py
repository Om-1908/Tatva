"""
quantum_env.py
--------------
Custom Gymnasium environment: QuantumCircuitEnv — Scaled to 2 Qubits.

The agent progressively applies 1-qubit and 2-qubit quantum gates to a circuit,
and receives reward proportional to the fidelity improvement between the
resulting statevector and a target statevector. A large bonus reward is given
upon exceeding the fidelity threshold.

Qiskit 1.x API is used exclusively:
  - QuantumCircuit for circuit construction
  - Statevector for noiseless simulation (no Aer required)

Observation (size = 4*2^n + 2 = 18 floats for 2 qubits):
  [Re(ψ)×4, Im(ψ)×4, Re(φ)×4, Im(φ)×4, fidelity, step/MAX_STEPS]

Action space (154 discrete actions for 2 qubits):
  - Single-qubit fixed gates (H, X, Y, Z) on 2 qubits = 8 actions
  - Single-qubit rotation gates (RX, RY, RZ) over 24 angles on 2 qubits = 144 actions
  - CNOT gates (control=0 target=1, control=1 target=0) = 2 actions
  Total = 8 + 144 + 2 = 154 actions.

Reward (dense, per-step):
  reward = 10.0 * (current_fidelity - prev_fidelity) - GATE_PENALTY
  + 25.0 bonus when fidelity >= FIDELITY_THRESHOLD
  - 2.0 penalty when fidelity < 0.05 and step > 5
"""

from typing import List, Optional, Tuple
import numpy as np
import gymnasium
from gymnasium import spaces

from qiskit import QuantumCircuit
from qiskit.quantum_info import Statevector

from utils import compute_fidelity


class QuantumCircuitEnv(gymnasium.Env):
    """
    Gymnasium environment for 2-qubit quantum circuit synthesis via RL.

    Observation : flat float32 vector of length 18
                  = [Re(ψ)×4, Im(ψ)×4, Re(φ)×4, Im(φ)×4, fidelity, step/MAX_STEPS]

    Action      : Discrete index into self.action_list (154 actions)

    Reward      : Dense per-step fidelity-improvement signal:
                  10.0 * (fidelity_gain) - GATE_PENALTY
                  + 25.0 bonus on success, - 2.0 stuck penalty.

    Episode ends: fidelity >= threshold (terminated)
                  OR steps >= max_steps (truncated)
    """

    metadata = {'render_modes': ['text']}

    def __init__(self, config, target_sv: Optional[np.ndarray] = None):
        """
        Parameters
        ----------
        config    : Config dataclass instance
        target_sv : optional fixed target; overridden in reset() if None
        """
        super().__init__()

        self.n_qubits = config.NUM_QUBITS
        self.max_steps = config.MAX_STEPS
        self.fidelity_threshold = config.FIDELITY_THRESHOLD
        self.gate_penalty = config.GATE_PENALTY
        self.gates: List[str] = config.GATES
        self.rotation_angles: List[float] = config.ROTATION_ANGLES

        # Build discrete action list (154 actions for 2 qubits)
        self.action_list = self._build_action_list()

        # Gymnasium spaces
        self.action_space = spaces.Discrete(len(self.action_list))

        # obs_size = 4 * (2 ^ n_qubits) + 2 = 18
        sv_floats = 4 * (2 ** self.n_qubits)
        obs_size = sv_floats + 2
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(obs_size,), dtype=np.float32
        )

        self._fixed_target_sv: Optional[np.ndarray] = target_sv
        self.target_sv: Optional[np.ndarray] = None
        self.current_circuit: Optional[QuantumCircuit] = None
        self.current_sv: Optional[np.ndarray] = None
        self.steps: int = 0
        self.prev_fidelity: float = 0.0

    def _build_action_list(self) -> List[Tuple]:
        """
        Construct enumerated action list for 2-qubit system (154 actions).

        1. Single-qubit non-rotation gates (H, X, Y, Z):
           one action per (gate, qubit_index, None) -> 4 * 2 = 8 actions
        2. Single-qubit rotation gates (RX, RY, RZ):
           one action per (gate, qubit_index, angle) -> 3 * 2 * 24 = 144 actions
        3. CNOT:
           one action per (gate, (control, target), None) -> 2 actions

        Total = 8 + 144 + 2 = 154 actions.
        """
        rotation_gates = {'RX', 'RY', 'RZ'}
        single_qubit_gates = [g for g in self.gates if g != 'CNOT']
        actions = []

        for gate in single_qubit_gates:
            for q in range(self.n_qubits):
                if gate in rotation_gates:
                    for angle in self.rotation_angles:
                        actions.append((gate, q, angle))
                else:
                    actions.append((gate, q, None))

        if 'CNOT' in self.gates and self.n_qubits >= 2:
            for ctrl in range(self.n_qubits):
                for tgt in range(self.n_qubits):
                    if ctrl != tgt:
                        actions.append(('CNOT', (ctrl, tgt), None))

        return actions

    def _apply_gate(self, gate_name: str, qubit_or_pair, angle: Optional[float]) -> None:
        """Apply a named gate to self.current_circuit."""
        circ = self.current_circuit

        if gate_name == 'H':
            circ.h(qubit_or_pair)
        elif gate_name == 'X':
            circ.x(qubit_or_pair)
        elif gate_name == 'Y':
            circ.y(qubit_or_pair)
        elif gate_name == 'Z':
            circ.z(qubit_or_pair)
        elif gate_name == 'RX':
            circ.rx(angle, qubit_or_pair)
        elif gate_name == 'RY':
            circ.ry(angle, qubit_or_pair)
        elif gate_name == 'RZ':
            circ.rz(angle, qubit_or_pair)
        elif gate_name == 'CNOT':
            ctrl, tgt = qubit_or_pair
            circ.cx(ctrl, tgt)
        else:
            raise ValueError(f"Unknown gate: {gate_name}")

    def _encode_obs(
        self, current_sv: np.ndarray, target_sv: np.ndarray, fidelity: float, step: int
    ) -> np.ndarray:
        """Build flat 18-float observation vector."""
        obs = np.concatenate([
            current_sv.real.astype(np.float32),
            current_sv.imag.astype(np.float32),
            target_sv.real.astype(np.float32),
            target_sv.imag.astype(np.float32),
            np.array([fidelity, step / self.max_steps], dtype=np.float32),
        ])
        return obs

    def _random_target(self) -> np.ndarray:
        """Generate a Haar-random 2-qubit statevector (normalized complex128, dim=4)."""
        dim = 2 ** self.n_qubits
        sv = np.random.randn(dim) + 1j * np.random.randn(dim)
        return (sv / np.linalg.norm(sv)).astype(np.complex128)

    def reset(
        self,
        seed: Optional[int] = None,
        target_sv: Optional[np.ndarray] = None,
        options: Optional[dict] = None,
    ) -> Tuple[np.ndarray, dict]:
        """Reset environment to ground state |00⟩."""
        super().reset(seed=seed)

        if target_sv is not None:
            self.target_sv = target_sv.astype(np.complex128)
        elif self._fixed_target_sv is not None:
            self.target_sv = self._fixed_target_sv.astype(np.complex128)
        else:
            self.target_sv = self._random_target()

        self.current_circuit = QuantumCircuit(self.n_qubits)
        self.current_sv = (
            Statevector.from_label('0' * self.n_qubits).data.astype(np.complex128)
        )

        self.steps = 0
        self.prev_fidelity = 0.0
        init_fidelity = compute_fidelity(self.target_sv, self.current_sv)
        obs = self._encode_obs(self.current_sv, self.target_sv, init_fidelity, 0)
        return obs, {}

    def step(
        self, action: int
    ) -> Tuple[np.ndarray, float, bool, bool, dict]:
        """Apply gate action and return (obs, reward, terminated, truncated, info)."""
        gate_name, qubit_or_pair, angle = self.action_list[action]

        self._apply_gate(gate_name, qubit_or_pair, angle)

        sv_obj = Statevector(self.current_circuit)
        self.current_sv = sv_obj.data.astype(np.complex128)

        fidelity = compute_fidelity(self.target_sv, self.current_sv)
        self.steps += 1

        fidelity_gain = fidelity - self.prev_fidelity
        reward = 10.0 * fidelity_gain - self.gate_penalty

        if fidelity < 0.05 and self.steps > 5:
            reward -= 2.0

        terminated = False
        if fidelity >= self.fidelity_threshold:
            reward += 25.0   # Enhanced 2-qubit success bonus
            terminated = True

        self.prev_fidelity = fidelity
        truncated = self.steps >= self.max_steps

        obs = self._encode_obs(self.current_sv, self.target_sv, fidelity, self.steps)
        info = {'fidelity': fidelity, 'steps': self.steps}

        return obs, reward, terminated, truncated, info

    def render(self) -> None:
        """Print text representation of the quantum circuit."""
        if self.current_circuit is not None:
            print(self.current_circuit.draw('text'))
        else:
            print("[QuantumCircuitEnv] Circuit not initialized.")

    def close(self) -> None:
        pass
