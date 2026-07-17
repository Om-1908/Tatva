"""
config.py
---------
Central configuration dataclass for QuantumRL.
All hyperparameters, paths, and environment settings live here.
Change NUM_QUBITS to scale from 1 → 4 qubits.
"""

from dataclasses import dataclass, field
from typing import List


@dataclass
class Config:
    """Single source of truth for every hyperparameter in QuantumRL."""

    # ──────────────────────────────────────────────
    # Environment
    # ──────────────────────────────────────────────
    NUM_QUBITS: int = 1           # Number of qubits (scalable 1 → 4)
    MAX_STEPS: int = 20           # Maximum gates applied per episode
    FIDELITY_THRESHOLD: float = 0.99   # Target fidelity to declare success
    GATE_PENALTY: float = 0.01    # Penalty subtracted per gate applied

    # ──────────────────────────────────────────────
    # Gate set available to the agent
    # ──────────────────────────────────────────────
    GATES: List[str] = field(
        default_factory=lambda: ['H', 'X', 'Y', 'Z', 'RX', 'RY', 'RZ', 'CNOT']
    )

    # ──────────────────────────────────────────────
    # DQN hyperparameters
    # ──────────────────────────────────────────────
    DQN_LR: float = 1e-3
    DQN_GAMMA: float = 0.99
    DQN_EPSILON_START: float = 1.0
    DQN_EPSILON_END: float = 0.05
    DQN_EPSILON_DECAY: float = 0.995
    DQN_BATCH_SIZE: int = 64
    DQN_BUFFER_SIZE: int = 10000
    DQN_TARGET_UPDATE_FREQ: int = 100
    DQN_HIDDEN_SIZE: int = 128
    DQN_EPISODES: int = 2000

    # ──────────────────────────────────────────────
    # PPO hyperparameters
    # ──────────────────────────────────────────────
    PPO_LR: float = 3e-4
    PPO_GAMMA: float = 0.99
    PPO_GAE_LAMBDA: float = 0.95
    PPO_CLIP_EPSILON: float = 0.2
    PPO_ENTROPY_COEF: float = 0.01
    PPO_VALUE_COEF: float = 0.5
    PPO_EPOCHS: int = 4
    PPO_ROLLOUT_STEPS: int = 512
    PPO_HIDDEN_SIZE: int = 128
    PPO_EPISODES: int = 2000

    # ──────────────────────────────────────────────
    # Evaluation
    # ──────────────────────────────────────────────
    NUM_TEST_STATES: int = 50
    SEED: int = 42

    # ──────────────────────────────────────────────
    # File paths (all I/O goes through config, not hardcoded strings)
    # ──────────────────────────────────────────────
    DQN_MODEL_PATH: str = 'saved_models/dqn_model.pth'
    PPO_MODEL_PATH: str = 'saved_models/ppo_model.pth'
    LOG_DIR: str = 'logs/'
    PLOT_DIR: str = 'plots/'
