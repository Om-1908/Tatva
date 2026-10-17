"""
config_4qubit_ppo.py
--------------------
Central configuration dataclass for QuantumRL — 4-Qubit PPO (Pretraining + 700,000 Episode RL).
Strictly adheres to TATVA 4-Qubit PPO Training Final Clean Specification.
"""

import os
import numpy as np
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config4QubitPPO:
    """Single source of truth for 4-Qubit PPO QuantumRL Training & Expert Pretraining."""

    # ──────────────────────────────────────────────
    # Environment (4-Qubit Configuration)
    # ──────────────────────────────────────────────
    NUM_QUBITS: int = 4                    # 4 Qubits (2^4 = 16 complex amplitudes)
    OBS_SIZE: int = 66                     # 16 Re(curr) + 16 Im(curr) + 16 Re(targ) + 16 Im(targ) + 1 fid + 1 step_ratio = 66
    ACTION_SIZE: int = 344                 # 32 fixed + 288 rotations + 12 CNOT + 6 CZ + 6 SWAP = 344
    MAX_STEPS: int = 35                    # Maximum gates applied per episode
    FIDELITY_THRESHOLD: float = 0.999999   # Target fidelity to declare high-precision success
    GATE_PENALTY: float = 0.001            # Per-step gate cost penalty

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
    PRETRAIN_MODEL_PATH: str = 'saved_models/4qubit_ppo/ppo_pretrained_4q.pth'
    DATASET_4Q_DIR: str = 'tatva_dataset_fast/4qubit'

    # ──────────────────────────────────────────────
    # Phase B — PPO RL Hyperparameters (700,000 Episodes)
    # ──────────────────────────────────────────────
    PPO_EPISODES: int = 700000
    NUM_PARALLEL_ENVS: int = 256           # 256 Vectorized CUDA environments stepped in VRAM
    PPO_ROLLOUT_STEPS: int = 2048
    PPO_EPOCHS: int = 10
    PPO_MINI_BATCH_SIZE: int = 4096
    PPO_LR: float = 2e-4
    PPO_LR_MIN: float = 1e-5
    PPO_GAMMA: float = 0.995
    PPO_GAE_LAMBDA: float = 0.95
    PPO_CLIP_EPSILON: float = 0.2
    PPO_ENTROPY_COEF: float = 0.025
    PPO_VALUE_COEF: float = 0.5
    PPO_MAX_GRAD_NORM: float = 0.5
    BEST_CHECKPOINT_EVAL_INTERVAL: int = 10000

    # Evaluation
    EVAL_STATES: int = 300
    EVAL_SEED: int = 44
    SEED: int = 42

    # Paths
    PPO_MODEL_PATH: str = 'saved_models/4qubit_ppo/ppo_rl_4q_final.pth'
    BEST_PPO_MODEL_PATH: str = 'saved_models/4qubit_ppo/ppo_rl_4q_best.pth'
    LOG_PATH: str = 'logs/ppo_4q_training.json'
    PRETRAIN_LOG_PATH: str = 'logs/ppo_4q_pretrain.json'
    EVAL_LOG_PATH: str = 'logs/ppo_4q_eval.json'
    SANITY_LOG_PATH: str = 'logs/ppo_4q_sanity.txt'
    ROLLOUT_LOG_PATH: str = 'logs/ppo_4q_rollouts.json'


ConfigPPO4Q = Config4QubitPPO
