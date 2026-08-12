"""
dqn_agent.py
------------
Deep Q-Network implementation for QuantumRL.

Classes:
  QNetwork     – three-layer MLP that outputs Q-values for all actions
  ReplayBuffer – fixed-size circular experience replay buffer
  DQNAgent     – ε-greedy agent with target network and replay-based updates
"""

import collections
import copy
import os
import random
from typing import Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ─────────────────────────────────────────────────────────
# Q-Network
# ─────────────────────────────────────────────────────────

class QNetwork(nn.Module):
    """
    Deep Q-network mapping observations to per-action Q-values.

    Architecture:
        obs_size → hidden_size → hidden_size → hidden_size//2 → action_size
    Normalisation: LayerNorm after each hidden linear layer.
    Activation   : LeakyReLU(0.01) — avoids dying-neuron problem under the
                   dense fidelity-gain reward which can produce negative values.
    """

    def __init__(self, obs_size: int, action_size: int, hidden_size: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_size, hidden_size),
            nn.LayerNorm(hidden_size),
            nn.LeakyReLU(0.01),
            nn.Linear(hidden_size, hidden_size),
            nn.LayerNorm(hidden_size),
            nn.LeakyReLU(0.01),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.LayerNorm(hidden_size // 2),
            nn.LeakyReLU(0.01),
            nn.Linear(hidden_size // 2, action_size),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Parameters
        ----------
        x : float32 tensor of shape (batch, obs_size)

        Returns
        -------
        Q-value tensor of shape (batch, action_size)
        """
        return self.net(x)


# ─────────────────────────────────────────────────────────
# Replay Buffer
# ─────────────────────────────────────────────────────────

class ReplayBuffer:
    """
    Fixed-capacity circular replay buffer for DQN experience replay.

    Stores (state, action, reward, next_state, done) tuples.
    Old experiences are automatically evicted when capacity is exceeded.
    """

    def __init__(self, capacity: int):
        self.buffer: collections.deque = collections.deque(maxlen=capacity)

    def push(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        done: bool,
    ) -> None:
        """Store a single transition."""
        self.buffer.append((state, action, reward, next_state, done))

    def sample(
        self, batch_size: int
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Randomly sample a batch of transitions.

        Returns
        -------
        states      : float32 (batch, obs_size)
        actions     : int64   (batch,)
        rewards     : float32 (batch,)
        next_states : float32 (batch, obs_size)
        dones       : float32 (batch,)  [0.0 or 1.0]
        """
        batch = random.sample(self.buffer, batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)

        return (
            np.array(states,      dtype=np.float32),
            np.array(actions,     dtype=np.int64),
            np.array(rewards,     dtype=np.float32),
            np.array(next_states, dtype=np.float32),
            np.array(dones,       dtype=np.float32),
        )

    def __len__(self) -> int:
        return len(self.buffer)


# ─────────────────────────────────────────────────────────
# DQN Agent
# ─────────────────────────────────────────────────────────

class DQNAgent:
    """
    DQN agent with:
      - ε-greedy action selection
      - Replay buffer for decorrelated updates
      - Separate target network (updated periodically)
      - ε decay schedule

    Parameters
    ----------
    obs_size    : observation vector length
    action_size : number of discrete actions
    config      : Config dataclass
    """

    def __init__(self, obs_size: int, action_size: int, config):
        self.config = config
        self.action_size = action_size
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        # Online and target Q-networks
        self.q_net = QNetwork(obs_size, action_size, config.DQN_HIDDEN_SIZE).to(self.device)
        self.target_net = copy.deepcopy(self.q_net).to(self.device)
        self.target_net.eval()   # Target network is never trained directly

        self.optimizer = torch.optim.Adam(self.q_net.parameters(), lr=config.DQN_LR)
        self.buffer = ReplayBuffer(config.DQN_BUFFER_SIZE)

        self.epsilon: float = config.DQN_EPSILON_START
        self.steps_done: int = 0

    def select_action(self, state: np.ndarray) -> int:
        """
        ε-greedy action selection.

        Parameters
        ----------
        state : float32 numpy array, current observation

        Returns
        -------
        int action index
        """
        if random.random() < self.epsilon:
            return random.randrange(self.action_size)

        state_t = torch.tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0)
        with torch.no_grad():
            q_values = self.q_net(state_t)
        return int(q_values.argmax(dim=1).item())

    def update(self) -> Optional[float]:
        """
        Sample a mini-batch and perform one gradient step.

        Returns
        -------
        float loss value, or None if buffer is too small
        """
        if len(self.buffer) < self.config.DQN_BATCH_SIZE:
            return None

        states, actions, rewards, next_states, dones = self.buffer.sample(
            self.config.DQN_BATCH_SIZE
        )

        # Convert to tensors
        states_t      = torch.tensor(states,      dtype=torch.float32, device=self.device)
        actions_t     = torch.tensor(actions,     dtype=torch.long,    device=self.device).unsqueeze(1)
        rewards_t     = torch.tensor(rewards,     dtype=torch.float32, device=self.device).unsqueeze(1)
        next_states_t = torch.tensor(next_states, dtype=torch.float32, device=self.device)
        dones_t       = torch.tensor(dones,       dtype=torch.float32, device=self.device).unsqueeze(1)

        # Current Q-values: Q(s, a)
        current_q = self.q_net(states_t).gather(1, actions_t)

        # Double DQN target: online net selects a', target net evaluates Q(s', a').
        # Decoupling selection from evaluation reduces overestimation bias —
        # especially important with 31 actions where vanilla max() latches onto noise.
        with torch.no_grad():
            best_actions = self.q_net(next_states_t).argmax(dim=1, keepdim=True)
            max_next_q = self.target_net(next_states_t).gather(1, best_actions)
            target_q = rewards_t + self.config.DQN_GAMMA * max_next_q * (1.0 - dones_t)

        loss = F.mse_loss(current_q, target_q)

        self.optimizer.zero_grad()
        loss.backward()
        # Gradient clipping for training stability
        torch.nn.utils.clip_grad_norm_(self.q_net.parameters(), max_norm=10.0)
        self.optimizer.step()

        self.steps_done += 1
        return loss.item()

    def update_target(self) -> None:
        """Hard-copy online network weights into target network."""
        self.target_net.load_state_dict(self.q_net.state_dict())

    def decay_epsilon(self) -> None:
        """Apply multiplicative epsilon decay, clipped to epsilon_end."""
        self.epsilon = max(
            self.config.DQN_EPSILON_END,
            self.epsilon * self.config.DQN_EPSILON_DECAY,
        )

    def save(self, path: str) -> None:
        """Persist Q-network weights to disk."""
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
        torch.save(self.q_net.state_dict(), path)
        print(f"[DQNAgent] Model saved -> {path}")

    def load(self, path: str) -> None:
        """Load Q-network weights from disk."""
        state_dict = torch.load(path, map_location=self.device)
        self.q_net.load_state_dict(state_dict)
        self.q_net.eval()
        print(f"[DQNAgent] Model loaded <- {path}")
