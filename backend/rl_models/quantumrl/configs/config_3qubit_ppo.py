"""
config_3qubit_ppo.py
--------------------
Central configuration dataclass for QuantumRL — 3-Qubit PPO (Pretraining + 500,000 Episode RL).
"""

import os
import numpy as np
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config3QubitPPO:
    """Single source of truth for 3-Qubit PPO QuantumRL Training & Expert Pretraining."""

    # ──────────────────────────────────────────────
    # Environment (3-Qubit Configuration)
    # ──────────────────────────────────────────────
    NUM_QUBITS: int = 3           # 3 Qubits
    MAX_STEPS: int = 35           # Maximum gates applied per episode
    FIDELITY_THRESHOLD: float = 0.999999   # Target fidelity to declare success
    GATE_PENALTY: float = 0.001   # Per-step penalty

    # ──────────────────────────────────────────────
    # Phase A — Expert Pretraining Configuration
    # ──────────────────────────────────────────────
    USE_PRETRAIN: bool = True
    PRETRAIN_EPOCHS: int = 5
    PRETRAIN_BATCH_SIZE: int = 2048
    PRETRAIN_LR: float = 0.001
    PRETRAIN_LR_MIN: float = 1e-5
    PRETRAIN_WEIGHT_DECAY: float = 1e-5
    PRETRAIN_GRAD_CLIP: float = 1.0
    PRETRAIN_VAL_SPLIT: float = 0.02
    PRETRAIN_MODEL_PATH: str = 'saved_models/ppo_3q_pretrained.pth'
    DATASET_3Q_DIR: str = 'tatva_dataset_fast/3qubit'

    # ──────────────────────────────────────────────
    # Phase B — PPO RL Hyperparameters (500,000 Episodes)
    # ──────────────────────────────────────────────
    PPO_EPISODES: int = 500000
    NUM_PARALLEL_ENVS: int = 256  # 256 Vectorized CUDA environments stepped in VRAM
    PPO_ROLLOUT_STEPS: int = 2048
    PPO_EPOCHS: int = 10
    PPO_MINI_BATCH_SIZE: int = 256
    PPO_LR: float = 0.0003
    PPO_LR_MIN: float = 0.00001
    PPO_GAMMA: float = 0.995
    PPO_GAE_LAMBDA: float = 0.95
    PPO_CLIP_EPSILON: float = 0.2
    PPO_ENTROPY_COEF: float = 0.02
    PPO_VALUE_COEF: float = 0.5
    PPO_MAX_GRAD_NORM: float = 0.5
    BEST_CHECKPOINT_EVAL_INTERVAL: int = 10000

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

    # Evaluation
    EVAL_STATES: int = 300
    EVAL_SEED: int = 399
    SEED: int = 43

    # Paths
    PPO_MODEL_PATH: str = 'saved_models/ppo_3q_final.pth'
    BEST_PPO_MODEL_PATH: str = 'saved_models/ppo_3q_best.pth'
    LOG_PATH: str = 'logs/ppo_3q_training.json'
    PRETRAIN_LOG_PATH: str = 'logs/ppo_3q_pretrain.json'
    EVAL_LOG_PATH: str = 'logs/ppo_3q_eval.json'
    SANITY_LOG_PATH: str = 'logs/ppo_3q_sanity.txt'
    ROLLOUT_LOG_PATH: str = 'logs/ppo_3q_rollouts.json'


ConfigPPO3Q = Config3QubitPPO
