"""
config.py
---------
Central configuration dataclass for QuantumRL.
All hyperparameters, paths, and environment settings live here.
Change NUM_QUBITS to scale from 1 → 4 qubits.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config:
    """Single source of truth for every hyperparameter in QuantumRL."""

    # ──────────────────────────────────────────────
    # Environment
    # ──────────────────────────────────────────────
    NUM_QUBITS: int = 1           # Number of qubits (scalable 1 → 4)
    MAX_STEPS: int = 15           # Maximum gates applied per episode
    FIDELITY_THRESHOLD: float = 0.99   # Target fidelity to declare success
    GATE_PENALTY: float = 0.005  # Per-step penalty (small, not scaled by total)

    # ──────────────────────────────────────────────
    # Gate set available to the agent
    # ──────────────────────────────────────────────
    GATES: List[str] = field(
        default_factory=lambda: ['H', 'X', 'Y', 'Z', 'RX', 'RY', 'RZ', 'CNOT']
    )

    # 24-angle grid: 16 positive (π/8 … 2π) + 8 negative (-π/8 … -π)
    # Finer resolution improves approximation of arbitrary single-qubit states.
    ROTATION_ANGLES: List[float] = field(
        default_factory=lambda: (
            [k * np.pi / 8 for k in range(1, 17)]   # π/8 … 2π  (16 angles)
            + [-k * np.pi / 8 for k in range(1, 9)]  # -π/8 … -π  (8 angles)
        )
    )

    # ──────────────────────────────────────────────
    # DQN hyperparameters
    # ──────────────────────────────────────────────
    DQN_LR: float = 0.0003
    DQN_GAMMA: float = 0.995
    DQN_EPSILON_START: float = 1.0
    DQN_EPSILON_END: float = 0.02
    DQN_EPSILON_DECAY: float = 0.9997
    DQN_BATCH_SIZE: int = 256
    DQN_BUFFER_SIZE: int = 100000
    DQN_TARGET_UPDATE_FREQ: int = 5
    DQN_HIDDEN_SIZE: int = 512
    DQN_EPISODES: int = 25000

    # ──────────────────────────────────────────────
    # PPO hyperparameters — V2 Ultra High Fidelity (Target >0.90 Mean Fidelity)
    # ──────────────────────────────────────────────
    PPO_EPISODES: int = 25000
    PPO_ROLLOUT_STEPS: int = 4096      # Larger rollout window to reduce GAE advantage variance
    PPO_EPOCHS: int = 10               # Gradient epochs per rollout update
    PPO_MINI_BATCH_SIZE: int = 512     # Minibatch size for smooth CUDA updates
    PPO_LR: float = 4e-4               # Initial actor-critic learning rate
    PPO_GAMMA: float = 0.995
    PPO_GAE_LAMBDA: float = 0.95
    PPO_CLIP_EPSILON: float = 0.2
    PPO_ENTROPY_COEF: float = 0.005     # Low entropy coefficient allows policy to collapse to optimal high-fidelity gate sequences
    PPO_VALUE_COEF: float = 1.0        # Stronger value function fitting
    PPO_MAX_GRAD_NORM: float = 0.5
    PPO_HIDDEN_SIZE: int = 512
    PPO_MODEL_PATH: str = 'saved_models/ppo_model.pth'
    PPO_LOG_PATH: str = 'logs/ppo_logs.json'
    PPO_PLOT_PATH: str = 'plots/ppo_training.png'

    # LR scheduler for PPO
    PPO_LR_DECAY: bool = True           # Linearly decay LR to 1e-5 over training
    PPO_LR_MIN: float = 1e-5

    # ──────────────────────────────────────────────
    # Evaluation
    # ──────────────────────────────────────────────
    NUM_TEST_STATES: int = 500
    SEED: int = 42

    # When True, training scripts print an action-usage histogram at the end
    LOG_ACTION_HISTOGRAM: bool = True

    # ──────────────────────────────────────────────
    # Curriculum learning (target sampling)
    # ──────────────────────────────────────────────
    # Disabled — fully random Haar states every episode for better generalization.
    CURRICULUM_ENABLED: bool = False
    CURRICULUM_POOL_SIZE: int = 30

    # ──────────────────────────────────────────────
    # File paths (all I/O goes through config, not hardcoded strings)
    # ──────────────────────────────────────────────
    DQN_MODEL_PATH: str = 'saved_models/dqn_model.pth'
    LOG_DIR: str = 'logs/'
    PLOT_DIR: str = 'plots/'
