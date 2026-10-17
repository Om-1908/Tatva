"""
config_4qubit.py
----------------
Central configuration dataclass for TATVA 4-Qubit Dueling DQN.
All hyperparameters, paths, and environment settings for 4-qubit Dueling DQN live here.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config4Qubit:
    """Single source of truth for 4-Qubit Dueling DQN QuantumRL Training & Synthesis."""

    # ──────────────────────────────────────────────
    # Environment (4-Qubit Configuration)
    # ──────────────────────────────────────────────
    NUM_QUBITS: int = 4                         # 4 Qubits
    OBS_SIZE: int = 66                          # 16 Re(curr) + 16 Im(curr) + 16 Re(targ) + 16 Im(targ) + fid + norm_step
    NUM_ACTIONS: int = 344                      # Exactly 344 actions
    MAX_STEPS: int = 50                         # Maximum gate steps per episode
    FIDELITY_THRESHOLD: float = 0.999999        # High-precision success threshold (F >= 0.999999)
    GATE_PENALTY: float = 0.001                 # Per-step penalty

    # ──────────────────────────────────────────────
    # Phase A — Expert Pretraining Configuration
    # ──────────────────────────────────────────────
    USE_PRETRAIN: bool = True
    PRETRAIN_EPOCHS: int = 15
    PRETRAIN_BATCH_SIZE: int = 512
    PRETRAIN_LR: float = 0.0003
    PRETRAIN_LR_MIN: float = 0.00003
    PRETRAIN_MODEL_PATH: str = 'saved_models/4qubit/dqn_pretrained_4q.pth'
    DATASET_4Q_DIR: str = 'tatva_dataset_fast/4qubit'

    # ──────────────────────────────────────────────
    # Gate set primitive vocabulary (4-qubit)
    # Total actions: 344 (32 fixed 1Q + 288 rotation 1Q + 24 entangling 2Q)
    # ──────────────────────────────────────────────
    GATES: List[str] = field(
        default_factory=lambda: [
            'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg',     # Fixed 1Q (8 gates x 4 qubits = 32)
            'RX', 'RY', 'RZ',                                # Rotation 1Q (3 axes x 24 angles x 4 qubits = 288)
            'CNOT', 'CZ', 'SWAP',                            # Entangling 2Q (12 CNOT + 6 CZ + 6 SWAP = 24)
        ]
    )

    # 24-angle grid: 16 positive (+k*pi/8 for k=1..16) + 8 negative (-k*pi/8 for k=1..8)
    ROTATION_ANGLES: List[float] = field(
        default_factory=lambda: (
            [k * np.pi / 8.0 for k in range(1, 17)]          # +pi/8 ... 2pi  (16 angles)
            + [-k * np.pi / 8.0 for k in range(1, 9)]        # -pi/8 ... -pi  (8 angles)
        )
    )

    # ──────────────────────────────────────────────
    # Phase B — DQN Training Settings
    # ──────────────────────────────────────────────
    DQN_EPISODES: int = 700000                  # 700,000 RL episodes
    NUM_PARALLEL_ENVS: int = 256                # 256 Vectorized CUDA environments stepped in VRAM
    DQN_BATCH_SIZE: int = 512                   # Batch size 512
    DQN_BUFFER_SIZE: int = 500000               # 500,000 replay buffer size
    DQN_WARMUP_STEPS: int = 10000               # 10,000 warmup steps
    WARMUP_STEPS: int = 10000

    DQN_LR: float = 0.00015                     # Learning rate 0.00015
    DQN_LR_MIN: float = 0.00002                 # Min learning rate 0.00002
    DQN_GAMMA: float = 0.995                    # Gamma 0.995
    DQN_TARGET_UPDATE_FREQ: int = 20            # Target update every 20 episodes
    DQN_HIDDEN_SIZE: int = 768                  # Architecture width
    GRAD_CLIP_NORM: float = 5.0                 # Gradient clipping 5.0
    CHECKPOINT_INTERVAL: int = 25000
    BEST_CHECKPOINT_EVAL_INTERVAL: int = 10000

    # Exploration (Epsilon-greedy)
    DQN_EPSILON_START: float = 0.80             # Pretrained epsilon start = 0.80
    DQN_EPSILON_END: float = 0.03               # Epsilon end = 0.03
    DQN_EPSILON_DECAY: float = 0.999985

    # Prioritized Experience Replay (PER)
    PER_ALPHA: float = 0.6                      # alpha = 0.6
    PER_BETA_START: float = 0.4                 # beta_start = 0.4
    PER_BETA_END: float = 1.0                   # beta_end = 1.0
    PER_BETA_FRAMES: int = 600000
    PER_EPSILON: float = 1e-5

    # Evaluation
    EVAL_STATES: int = 300
    EVAL_SEED: int = 4096
    SEED: int = 42

    # Paths
    DQN_MODEL_PATH: str = 'saved_models/4qubit/dqn_4q_final.pth'
    CHECKPOINT_DIR: str = 'checkpoints/4qubit'
    LOG_PATH: str = 'logs/dqn_4q_training.json'
    EVAL_LOG_PATH: str = 'logs/dqn_4q_eval.json'
    ADAPTATION_LOG_PATH: str = 'logs/dqn_4q_adaptations.json'
    SANITY_LOG_PATH: str = 'logs/dqn_4q_sanity.txt'
    ACTION_MAP_PATH: str = 'action_map_4q.json'


Config4QubitSpec = Config4Qubit
