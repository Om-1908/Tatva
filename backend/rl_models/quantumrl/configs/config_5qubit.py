"""
config_5qubit.py
----------------
Central configuration dataclass for QuantumRL — 5-Qubit DQN.
Adheres strictly to TATVA 5-Qubit Specification (440 Action Vocabulary).
"""

import os
from dataclasses import dataclass


@dataclass
class Config5Qubit:
    """Single source of truth for 5-Qubit DQN QuantumRL."""

    NUM_QUBITS: int = 5
    OBS_SIZE: int = 130
    ACTION_SIZE: int = 440
    MAX_STEPS: int = 45
    FIDELITY_THRESHOLD: float = 0.999999
    GATE_PENALTY: float = 0.001

    DATASET_5Q_DIR: str = 'tatva_dataset_fast/5qubit'
    MODEL_PATH: str = 'saved_models/5qubit/dqn_rl_5q_final.pth'
    BEST_MODEL_PATH: str = 'saved_models/5qubit/dqn_rl_5q_best.pth'
    PRETRAIN_MODEL_PATH: str = 'saved_models/5qubit/dqn_pretrained_5q.pth'
