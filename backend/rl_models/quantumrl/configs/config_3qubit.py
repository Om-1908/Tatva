"""
config_3qubit.py
----------------
Central configuration dataclass for QuantumRL — Scoped to 3 Qubits.
All hyperparameters, paths, and environment settings for 3-qubit Dueling DQN live here.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config:
    """Single source of truth for 3-Qubit Dueling DQN QuantumRL Training."""

    # ──────────────────────────────────────────────
    # Environment (3-Qubit Configuration)
    # ──────────────────────────────────────────────
    NUM_QUBITS: int = 3           # 3 Qubits
    MAX_STEPS: int = 45           # Maximum gates applied per episode (Expanded to 45 for 3Q)
    FIDELITY_THRESHOLD: float = 0.999999   # Target fidelity to declare success
    GATE_PENALTY: float = 0.001   # Per-step penalty

    # ──────────────────────────────────────────────
    # Expert Pretraining Configuration
    # ──────────────────────────────────────────────
    USE_PRETRAIN: bool = True
    PRETRAIN_EPOCHS: int = 10
    PRETRAIN_BATCH_SIZE: int = 512
    PRETRAIN_LR: float = 0.001
    PRETRAIN_MODEL_PATH: str = 'saved_models/3qubit/dqn_pretrained_best.pth'
    DATASET_3Q_DIR: str = 'tatva_dataset_fast/3qubit'

    # ──────────────────────────────────────────────
    # Gate set available to the agent (3-qubit)
    # Total actions: 252 (24 fixed 1Q + 216 rotation + 12 entangling 2Q)
    # ──────────────────────────────────────────────
    GATES: List[str] = field(
        default_factory=lambda: [
            'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg',     # Fixed 1Q (8 gates x 3 qubits = 24)
            'RX', 'RY', 'RZ',                                # Rotation 1Q (3 axes x 24 angles x 3 qubits = 216)
            'CNOT', 'CZ', 'SWAP',                            # Entangling 2Q (6 CNOT + 3 CZ + 3 SWAP = 12)
        ]
    )

    # 24-angle grid: 16 positive (π/8 ... 2π) + 8 negative (-π/8 ... -π)
    ROTATION_ANGLES: List[float] = field(
        default_factory=lambda: (
            [k * np.pi / 8.0 for k in range(1, 17)]        # π/8 ... 2π  (16 angles)
            + [-k * np.pi / 8.0 for k in range(1, 9)]       # -π/8 ... -π  (8 angles)
        )
    )

    # ──────────────────────────────────────────────
    # DQN Hyperparameters (3-Qubit Dueling DQN + PER)
    # ──────────────────────────────────────────────
    DQN_EPISODES: int = 500000
    NUM_PARALLEL_ENVS: int = 256  # 256 Vectorized CUDA environments stepped in VRAM
    DQN_BATCH_SIZE: int = 256
    DQN_BUFFER_SIZE: int = 300000
    DQN_WARMUP_STEPS: int = 8000
    WARMUP_STEPS: int = 8000

    DQN_LR: float = 0.0002
    DQN_LR_MIN: float = 0.00003
    DQN_GAMMA: float = 0.995
    DQN_TARGET_UPDATE_FREQ: int = 15
    DQN_HIDDEN_SIZE: int = 512
    GRAD_CLIP_NORM: float = 5.0
    BEST_CHECKPOINT_EVAL_INTERVAL: int = 10000

    # Exploration (Epsilon-greedy)
    DQN_EPSILON_START: float = 1.0
    DQN_EPSILON_END: float = 0.03
    DQN_EPSILON_DECAY: float = 0.99975

    # Prioritized Experience Replay (PER)
    PER_ALPHA: float = 0.6
    PER_BETA_START: float = 0.4
    PER_BETA_END: float = 1.0
    PER_BETA_FRAMES: int = 450000
    PER_EPSILON: float = 1e-5

    # Evaluation
    EVAL_STATES: int = 300
    EVAL_SEED: int = 399
    SEED: int = 42

    # Paths
    DQN_MODEL_PATH: str = 'saved_models/dqn_3q_final.pth'
    LOG_PATH: str = 'logs/dqn_3q_training.json'
    EVAL_LOG_PATH: str = 'logs/dqn_3q_eval.json'
    ADAPTATION_LOG_PATH: str = 'logs/dqn_3q_adaptations.json'
    SANITY_LOG_PATH: str = 'logs/dqn_3q_sanity.txt'


Config3Qubit = Config

