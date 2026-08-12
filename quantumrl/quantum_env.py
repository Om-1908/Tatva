"""
quantum_env.py
--------------
Custom Gymnasium environment: QuantumCircuitEnv

The agent progressively applies quantum gates to a circuit, and receives
reward proportional to the fidelity improvement between the resulting
statevector and a target statevector.  A large bonus reward is given upon
exceeding the fidelity threshold.

Qiskit 1.x API is used exclusively:
  - QuantumCircuit for circuit construction
  - Statevector for noiseless simulation (no Aer required)

Observation (size = 4*2^n + 2):
  [Re(ψ), Im(ψ), Re(φ), Im(φ), fidelity, step/MAX_STEPS]
  For 1 qubit: 2+2+2+2 + 1 + 1 = 10 floats.
  Including current fidelity and normalised step count gives the agent
  an explicit view of how close it is and how much budget remains.

Reward (dense, per-step):
  reward = 10 * (current_fidelity - prev_fidelity)   # reward improvement
         - GATE_PENALTY                               # tiny step cost
  + 20.0 bonus when fidelity >= FIDELITY_THRESHOLD   # success
  - 2.0  penalty when fidelity < 0.05 and step > 5  # stuck penalty

Target generation:
  Each episode draws a fresh Haar-random 1-qubit state independently —
  no fixed curriculum pool — for maximum generalization.
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
    Gymnasium environment for quantum circuit synthesis via RL.

    Observation : flat float32 vector of length 4*2^n_qubits + 2
                  = [Re(ψ), Im(ψ), Re(φ), Im(φ), fidelity, step/MAX_STEPS]
                  where ψ = current statevector, φ = target statevector.

    Action      : Discrete index into self.action_list,
                  each entry is (gate_name, qubit_or_pair, angle).

    Reward      : Dense per-step fidelity-improvement signal:
                  10*(fidelity_gain) - GATE_PENALTY
                  + 20.0 bonus on success, - 2.0 stuck penalty.

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

        # Build the discrete action list: (gate_name, qubit_or_pair, angle)
        self.action_list = self._build_action_list()

        # Gymnasium spaces
        self.action_space = spaces.Discrete(len(self.action_list))

        # obs = [Re(ψ), Im(ψ), Re(φ), Im(φ), fidelity, step/MAX_STEPS]
        sv_floats = 4 * (2 ** self.n_qubits)   # Re+Im for current+target
        obs_size = sv_floats + 2                 # + fidelity + normalised step
        self.observation_space = spaces.Box(
            low=-1.0, high=1.0, shape=(obs_size,), dtype=np.float32
        )

        self._fixed_target_sv: Optional[np.ndarray] = target_sv
        self.target_sv: Optional[np.ndarray] = None
        self.current_circuit: Optional[QuantumCircuit] = None
        self.current_sv: Optional[np.ndarray] = None
        self.steps: int = 0
        self.prev_fidelity: float = 0.0

    # ─────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────

    def _build_action_list(self) -> List[Tuple]:
        """
        Construct the enumerated action list.

        Non-rotation single-qubit gates (H, X, Y, Z):
            one action per (gate_name, qubit_index, None)
        Rotation gates (RX, RY, RZ):
            one action per (gate_name, qubit_index, angle) for each angle
            in self.rotation_angles — giving the agent fine angular control.
        CNOT:
            one action per (gate_name, (control, target), None)
            excluded when n_qubits == 1.

        Returns
        -------
        List of (gate_name, qubit_or_pair, angle) tuples where angle is
        a float (radians) for rotation gates and None for all others.
        """
        rotation_gates = {'RX', 'RY', 'RZ'}
        single_qubit_gates = [g for g in self.gates if g != 'CNOT']
        actions = []

        for gate in single_qubit_gates:
            for q in range(self.n_qubits):
                if gate in rotation_gates:
                    # One action per discrete angle
                    for angle in self.rotation_angles:
                        actions.append((gate, q, angle))
                else:
                    # Non-rotation gate: single action, no angle
                    actions.append((gate, q, None))

        # CNOT: only when n_qubits >= 2
        if 'CNOT' in self.gates and self.n_qubits >= 2:
            for ctrl in range(self.n_qubits):
                for tgt in range(self.n_qubits):
                    if ctrl != tgt:
                        actions.append(('CNOT', (ctrl, tgt), None))

        return actions

    def _apply_gate(self, gate_name: str, qubit_or_pair, angle: Optional[float]) -> None:
        """
        Apply a named gate to self.current_circuit.

        Parameters
        ----------
        gate_name     : string identifier from GATES list
        qubit_or_pair : int (single qubit) or (int, int) tuple (CNOT)
        angle         : rotation angle in radians for RX/RY/RZ gates;
                        None for all other gates (ignored in those branches)
        """
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

    def _encode_obs(self, current_sv: np.ndarray, target_sv: np.ndarray,
                    fidelity: float, step: int) -> np.ndarray:
        """
        Build the flat observation vector.

        Returns float32 array of length 4*2^n_qubits + 2:
          [Re(ψ), Im(ψ), Re(φ), Im(φ), fidelity, step/MAX_STEPS]
        """
        obs = np.concatenate([
            current_sv.real.astype(np.float32),
            current_sv.imag.astype(np.float32),
            target_sv.real.astype(np.float32),
            target_sv.imag.astype(np.float32),
            np.array([fidelity, step / self.max_steps], dtype=np.float32),
        ])
        return obs

    def _random_target(self) -> np.ndarray:
        """Generate a Haar-random single-qubit statevector (normalized)."""
        sv = np.random.randn(2 ** self.n_qubits) + 1j * np.random.randn(2 ** self.n_qubits)
        return (sv / np.linalg.norm(sv)).astype(np.complex128)

    # ─────────────────────────────────────────────────────────
    # Gymnasium API
    # ─────────────────────────────────────────────────────────

    def reset(
        self,
        seed: Optional[int] = None,
        target_sv: Optional[np.ndarray] = None,
        options: Optional[dict] = None,
    ) -> Tuple[np.ndarray, dict]:
        """
        Reset the environment to the |0…0⟩ ground state.

        A fresh Haar-random target is generated every episode unless a
        fixed target_sv is provided (used during evaluation).

        Parameters
        ----------
        seed      : optional RNG seed (passed to super for Gymnasium compat)
        target_sv : if provided, use this as the target for this episode
        options   : unused, kept for Gymnasium API compatibility

        Returns
        -------
        (observation, info_dict)
        """
        super().reset(seed=seed)

        # Target: use provided > use constructor fixed > generate fresh random
        if target_sv is not None:
            self.target_sv = target_sv.astype(np.complex128)
        elif self._fixed_target_sv is not None:
            self.target_sv = self._fixed_target_sv.astype(np.complex128)
        else:
            self.target_sv = self._random_target()

        # Fresh |0…0⟩ circuit
        self.current_circuit = QuantumCircuit(self.n_qubits)

        # Ground state via Statevector (Qiskit 1.x)
        self.current_sv = (
            Statevector.from_label('0' * self.n_qubits).data.astype(np.complex128)
        )

        self.steps = 0
        self.prev_fidelity = 0.0   # dense reward baseline
        init_fidelity = compute_fidelity(self.target_sv, self.current_sv)
        obs = self._encode_obs(self.current_sv, self.target_sv, init_fidelity, 0)
        return obs, {}

    def step(
        self, action: int
    ) -> Tuple[np.ndarray, float, bool, bool, dict]:
        """
        Apply one gate action to the circuit and advance the environment.

        Parameters
        ----------
        action : int index into self.action_list

        Returns
        -------
        (obs, reward, terminated, truncated, info)
        """
        gate_name, qubit_or_pair, angle = self.action_list[action]

        # Apply gate to circuit
        self._apply_gate(gate_name, qubit_or_pair, angle)

        # Simulate current circuit → statevector (Qiskit 1.x, no Aer needed)
        sv_obj = Statevector(self.current_circuit)
        self.current_sv = sv_obj.data.astype(np.complex128)

        # Compute fidelity
        fidelity = compute_fidelity(self.target_sv, self.current_sv)

        self.steps += 1

        # ── Dense reward: reward the agent for IMPROVING fidelity ──────────
        fidelity_gain = fidelity - self.prev_fidelity
        reward = 10.0 * fidelity_gain   # dense improvement signal
        reward -= self.gate_penalty     # tiny constant step cost

        # Penalty for being stuck near zero fidelity after several steps
        if fidelity < 0.05 and self.steps > 5:
            reward -= 2.0

        # Success bonus
        terminated = False
        if fidelity >= self.fidelity_threshold:
            reward += 20.0
            terminated = True

        # Update previous fidelity AFTER computing reward
        self.prev_fidelity = fidelity

        truncated = self.steps >= self.max_steps

        obs = self._encode_obs(self.current_sv, self.target_sv, fidelity, self.steps)
        info = {'fidelity': fidelity, 'steps': self.steps}

        return obs, reward, terminated, truncated, info

    def render(self) -> None:
        """Print a text representation of the current circuit to stdout."""
        if self.current_circuit is not None:
            print(self.current_circuit.draw('text'))
        else:
            print("[QuantumCircuitEnv] Circuit not initialized. Call reset() first.")

    def close(self) -> None:
        """Clean up resources (no-op for this environment)."""
        pass
