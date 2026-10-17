"""
config_5qubit_ppo.py
--------------------
Central configuration dataclass for QuantumRL — 5-Qubit PPO.
Adheres strictly to TATVA 5-Qubit PPO Training Specification (440 Action Vocabulary).
"""

import os
import numpy as np
from dataclasses import dataclass, field
from typing import List


@dataclass
class Config5QubitPPO:
    """Single source of truth for 5-Qubit PPO QuantumRL Training & Expert Pretraining."""

    # ──────────────────────────────────────────────
    # Environment (5-Qubit Configuration)
    # ──────────────────────────────────────────────
    NUM_QUBITS: int = 5                    # 5 Qubits (2^5 = 32 complex amplitudes)
    OBS_SIZE: int = 130                    # 32 Re(curr) + 32 Im(curr) + 32 Re(targ) + 32 Im(targ) + 1 fid + 1 step_ratio = 130
    ACTION_SIZE: int = 440                 # 40 fixed + 360 rotations + 20 CNOT + 10 CZ + 10 SWAP = 440
    MAX_STEPS: int = 60                    # Maximum gates applied per episode
    FIDELITY_THRESHOLD: float = 0.999999   # Target fidelity to declare high-precision success
    GATE_PENALTY: float = 0.0006           # Per-step gate cost penalty

    # ──────────────────────────────────────────────
    # Phase A — Expert Pretraining Configuration
    # ──────────────────────────────────────────────
    USE_PRETRAIN: bool = True
    PRETRAIN_EPOCHS: int = 6
    PRETRAIN_BATCH_SIZE: int = 2048
    PRETRAIN_LR: float = 8e-4
    PRETRAIN_LR_MIN: float = 1e-5
    PRETRAIN_WEIGHT_DECAY: float = 1e-5
    PRETRAIN_GRAD_CLIP: float = 1.0
    PRETRAIN_VAL_SPLIT: float = 0.02       # 20,000 held-out records
    PRETRAIN_LOG_EVERY: int = 10000        # Batches
    PRETRAIN_MODEL_PATH: str = 'saved_models/ppo_5q_pretrained.pth'
    DATASET_5Q_DIR: str = 'tatva_dataset_fast/5qubit'

    # ──────────────────────────────────────────────
    # Phase B — PPO RL Hyperparameters
    # ──────────────────────────────────────────────
    PPO_EPISODES: int = 800000
    NUM_PARALLEL_ENVS: int = 256           # Vectorized CUDA environments
    PPO_ROLLOUT_STEPS: int = 2048
    PPO_EPOCHS: int = 10
    PPO_MINI_BATCH_SIZE: int = 256
    PPO_LR: float = 1.5e-4
    PPO_LR_MIN: float = 1e-5
    PPO_GAMMA: float = 0.995
    PPO_GAE_LAMBDA: float = 0.95
    PPO_CLIP_EPSILON: float = 0.2
    PPO_ENTROPY_COEF: float = 0.03
    PPO_VALUE_COEF: float = 0.5
    PPO_MAX_GRAD_NORM: float = 0.5
    BEST_CHECKPOINT_EVAL_INTERVAL: int = 10000

    # Evaluation & Seeds
    EVAL_STATES: int = 300
    EVAL_SEED: int = 599                   # Same evaluation seed as DQN for fair comparison
    SEED: int = 43                         # PPO seed (different from DQN seed=42)

    # Paths
    PPO_MODEL_PATH: str = 'saved_models/ppo_5q_final.pth'
    BEST_PPO_MODEL_PATH: str = 'saved_models/ppo_5q_best.pth'
    LOG_PATH: str = 'logs/ppo_5q_training.json'
    PRETRAIN_LOG_PATH: str = 'logs/ppo_5q_pretrain.json'
    EVAL_LOG_PATH: str = 'logs/ppo_5q_eval.json'
    SANITY_LOG_PATH: str = 'logs/ppo_5q_sanity.txt'
    ROLLOUT_LOG_PATH: str = 'logs/ppo_5q_rollouts.json'


ConfigPPO5Q = Config5QubitPPO
