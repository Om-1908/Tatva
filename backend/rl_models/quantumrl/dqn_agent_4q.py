"""
dqn_agent_4q.py
---------------
4-Qubit Dueling DQN Agent with Prioritized Experience Replay (PER).

Architecture (Specification 13):
Input: OBS_SIZE = 66

Shared Trunk:
  Linear(66, 768)  -> LayerNorm(768) -> LeakyReLU(0.01)
  Linear(768, 768) -> LayerNorm(768) -> LeakyReLU(0.01)
  Linear(768, 512) -> LayerNorm(512) -> LeakyReLU(0.01)
  Linear(512, 512) -> LayerNorm(512) -> LeakyReLU(0.01)

Value Stream:
  Linear(512, 256) -> LeakyReLU(0.01) -> Linear(256, 1)

Advantage Stream:
  Linear(512, 256) -> LeakyReLU(0.01) -> Linear(256, 344)

Dueling Output:
  Q(s, a) = V(s) + A(s, a) - mean(A(s, :))
"""

import os
import random
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from typing import Dict, List, Optional, Tuple


class DuelingDQN4Q(nn.Module):
    """Deep Dueling Q-Network for 4-Qubit Quantum Circuit Synthesis."""

    def __init__(self, obs_size: int = 66, num_actions: int = 344, hidden_size: int = 768):
        super().__init__()

        # Shared Trunk
        self.trunk = nn.Sequential(
            nn.Linear(obs_size, 768),
            nn.LayerNorm(768),
            nn.LeakyReLU(0.01),

            nn.Linear(768, 768),
            nn.LayerNorm(768),
            nn.LeakyReLU(0.01),

            nn.Linear(768, 512),
            nn.LayerNorm(512),
            nn.LeakyReLU(0.01),

            nn.Linear(512, 512),
            nn.LayerNorm(512),
            nn.LeakyReLU(0.01),
        )

        # Value Stream
        self.value_stream = nn.Sequential(
            nn.Linear(512, 256),
            nn.LeakyReLU(0.01),
            nn.Linear(256, 1)
        )

        # Advantage Stream
        self.advantage_stream = nn.Sequential(
            nn.Linear(512, 256),
            nn.LeakyReLU(0.01),
            nn.Linear(256, num_actions)
        )

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        features = self.trunk(obs)
        value = self.value_stream(features)           # (N, 1)
        advantage = self.advantage_stream(features)   # (N, 344)

        # Dueling combination: Q = V + A - mean(A)
        q_values = value + advantage - advantage.mean(dim=-1, keepdim=True)
        return q_values


class PrioritizedReplayBuffer4Q:
    """Prioritized Experience Replay (PER) buffer using sum tree for O(log N) sampling."""

    def __init__(self, capacity: int = 500000, alpha: float = 0.6, eps: float = 1e-5):
        self.capacity = capacity
        self.alpha = alpha
        self.eps = eps
        self.tree_capacity = 1
        while self.tree_capacity < capacity:
            self.tree_capacity *= 2

        self.sum_tree = np.zeros(2 * self.tree_capacity, dtype=np.float32)
        self.min_tree = np.full(2 * self.tree_capacity, float('inf'), dtype=np.float32)

        self.obs_buf = np.zeros((capacity, 66), dtype=np.float32)
        self.action_buf = np.zeros(capacity, dtype=np.int64)
        self.reward_buf = np.zeros(capacity, dtype=np.float32)
        self.next_obs_buf = np.zeros((capacity, 66), dtype=np.float32)
        self.done_buf = np.zeros(capacity, dtype=np.float32)

        self.pos = 0
        self.size = 0
        self.max_priority = 1.0

    def add(self, obs: np.ndarray, action: int, reward: float, next_obs: np.ndarray, done: bool):
        idx = self.pos
        self.obs_buf[idx] = obs
        self.action_buf[idx] = action
        self.reward_buf[idx] = reward
        self.next_obs_buf[idx] = next_obs
        self.done_buf[idx] = float(done)

        priority = self.max_priority ** self.alpha
        tree_idx = idx + self.tree_capacity
        self._update_tree(tree_idx, priority)

        self.pos = (self.pos + 1) % self.capacity
        self.size = min(self.size + 1, self.capacity)

    def add_batch(self, obs: np.ndarray, actions: np.ndarray, rewards: np.ndarray, next_obs: np.ndarray, dones: np.ndarray):
        batch_n = len(actions)
        for i in range(batch_n):
            self.add(obs[i], int(actions[i]), float(rewards[i]), next_obs[i], bool(dones[i]))

    def _update_tree(self, tree_idx: int, priority: float):
        self.sum_tree[tree_idx] = priority
        self.min_tree[tree_idx] = priority

        tree_idx //= 2
        while tree_idx >= 1:
            left = 2 * tree_idx
            right = left + 1
            self.sum_tree[tree_idx] = self.sum_tree[left] + self.sum_tree[right]
            self.min_tree[tree_idx] = min(self.min_tree[left], self.min_tree[right])
            tree_idx //= 2

    def sample(self, batch_size: int, beta: float = 0.4):
        total_p = self.sum_tree[1]
        segment = total_p / batch_size

        indices = np.zeros(batch_size, dtype=np.int64)
        tree_indices = np.zeros(batch_size, dtype=np.int64)
        priorities = np.zeros(batch_size, dtype=np.float32)

        for i in range(batch_size):
            a = segment * i
            b = segment * (i + 1)
            v = random.uniform(a, b)

            # Sample from sum tree
            idx = 1
            while idx < self.tree_capacity:
                left = 2 * idx
                if self.sum_tree[left] >= v:
                    idx = left
                else:
                    v -= self.sum_tree[left]
                    idx = left + 1

            data_idx = idx - self.tree_capacity
            data_idx = min(max(0, data_idx), self.size - 1)
            tree_indices[i] = idx
            indices[i] = data_idx
            priorities[i] = max(self.sum_tree[idx], 1e-8)

        # Compute Importance Sampling weights
        total_p = max(total_p, 1e-8)
        min_p = max(self.min_tree[1], 1e-8) / total_p
        max_weight = (self.size * min_p) ** (-beta) if min_p > 0 else 1.0

        probs = np.clip(priorities / total_p, 1e-8, 1.0)
        weights = (self.size * probs) ** (-beta)
        weights /= (max_weight + 1e-8)


        batch = (
            torch.tensor(self.obs_buf[indices], dtype=torch.float32),
            torch.tensor(self.action_buf[indices], dtype=torch.long),
            torch.tensor(self.reward_buf[indices], dtype=torch.float32),
            torch.tensor(self.next_obs_buf[indices], dtype=torch.float32),
            torch.tensor(self.done_buf[indices], dtype=torch.float32),
            torch.tensor(weights, dtype=torch.float32),
            tree_indices
        )
        return batch

    def update_priorities(self, tree_indices: np.ndarray, td_errors: np.ndarray):
        for tree_idx, td_err in zip(tree_indices, td_errors):
            priority = (abs(td_err) + self.eps) ** self.alpha
            self.max_priority = max(self.max_priority, priority)
            self._update_tree(int(tree_idx), float(priority))


class DQNAgent4Q:
    """4-Qubit Dueling DQN Agent managing Online/Target networks & PER optimizer."""

    def __init__(self, config=None, device: str = 'cuda'):
        if config is None:
            try:
                from quantumrl.configs.config_4qubit import Config4Qubit
                config = Config4Qubit()
            except ImportError:
                from configs.config_4qubit import Config4Qubit
                config = Config4Qubit()

        self.config = config
        self.device = torch.device(device if torch.cuda.is_available() else 'cpu')

        self.obs_size = getattr(config, 'OBS_SIZE', 66)
        self.num_actions = getattr(config, 'NUM_ACTIONS', 344)
        self.gamma = getattr(config, 'DQN_GAMMA', 0.995)

        # Networks
        self.online_net = DuelingDQN4Q(self.obs_size, self.num_actions).to(self.device)
        self.target_net = DuelingDQN4Q(self.obs_size, self.num_actions).to(self.device)
        self.target_net.load_state_dict(self.online_net.state_dict())
        self.target_net.eval()

        # Optimizer & LR scheduler
        self.lr = getattr(config, 'DQN_LR', 0.00015)
        self.lr_min = getattr(config, 'DQN_LR_MIN', 0.00002)
        self.optimizer = optim.Adam(self.online_net.parameters(), lr=self.lr)

        # Replay Buffer
        buffer_size = getattr(config, 'DQN_BUFFER_SIZE', 500000)
        self.memory = PrioritizedReplayBuffer4Q(capacity=buffer_size, alpha=config.PER_ALPHA)

        # Epsilon schedule
        self.epsilon = getattr(config, 'DQN_EPSILON_START', 0.80)
        self.epsilon_min = getattr(config, 'DQN_EPSILON_END', 0.03)
        self.epsilon_decay = getattr(config, 'DQN_EPSILON_DECAY', 0.999985)

        # PER Beta schedule
        self.beta = getattr(config, 'PER_BETA_START', 0.4)
        self.beta_end = getattr(config, 'PER_BETA_END', 1.0)
        self.beta_step = (self.beta_end - self.beta) / float(getattr(config, 'PER_BETA_FRAMES', 600000))

    def select_action(self, obs: torch.Tensor, deterministic: bool = False) -> torch.Tensor:
        """Epsilon-greedy action selection for batched observations."""
        if not deterministic and random.random() < self.epsilon:
            if obs.ndim == 1:
                return torch.tensor(random.randint(0, self.num_actions - 1), device=self.device)
            else:
                return torch.randint(0, self.num_actions, (obs.shape[0],), device=self.device)

        with torch.no_grad():
            if obs.ndim == 1:
                obs_t = obs.unsqueeze(0).to(self.device)
                q_vals = self.online_net(obs_t)
                return q_vals.argmax(dim=-1).squeeze(0)
            else:
                obs_t = obs.to(self.device)
                q_vals = self.online_net(obs_t)
                return q_vals.argmax(dim=-1)

    def train_step(self, batch_size: int = 512) -> Optional[float]:
        """Perform a single Double-DQN optimization step with PER."""
        if self.memory.size < batch_size:
            return None

        batch = self.memory.sample(batch_size, beta=self.beta)
        obs, actions, rewards, next_obs, dones, weights, tree_indices = batch

        obs = obs.to(self.device)
        actions = actions.to(self.device)
        rewards = rewards.to(self.device)
        next_obs = next_obs.to(self.device)
        dones = dones.to(self.device)
        weights = weights.to(self.device)

        # Current Q-values
        q_values = self.online_net(obs)
        state_action_values = q_values.gather(1, actions.unsqueeze(1)).squeeze(1)

        # Double DQN target computation
        with torch.no_grad():
            next_q_online = self.online_net(next_obs)
            next_actions = next_q_online.argmax(dim=1, keepdim=True)
            next_q_target = self.target_net(next_obs)
            next_state_values = next_q_target.gather(1, next_actions).squeeze(1)
            expected_state_action_values = rewards + (self.gamma * next_state_values * (1.0 - dones))

        # TD Errors & Weighted Smooth L1 Loss
        td_errors = (state_action_values - expected_state_action_values).detach().cpu().numpy()
        loss = (weights * nn.functional.smooth_l1_loss(state_action_values, expected_state_action_values, reduction='none')).mean()

        self.optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(self.online_net.parameters(), self.config.GRAD_CLIP_NORM)
        self.optimizer.step()

        # Update PER priorities & Beta
        self.memory.update_priorities(tree_indices, td_errors)
        self.beta = min(self.beta_end, self.beta + self.beta_step)

        # Epsilon decay
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

        return float(loss.item())

    def update_target_network(self):
        self.target_net.load_state_dict(self.online_net.state_dict())

    def save(self, filepath: str, extra_meta: Optional[Dict] = None):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        checkpoint = {
            'online_net': self.online_net.state_dict(),
            'target_net': self.target_net.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'epsilon': self.epsilon,
            'beta': self.beta,
            'obs_size': self.obs_size,
            'num_actions': self.num_actions,
            'extra_meta': extra_meta or {}
        }
        torch.save(checkpoint, filepath)
        print(f"[OK] Saved 4-Qubit DQN checkpoint to {filepath}")

    def load(self, filepath: str):
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Checkpoint file not found: {filepath}")
        checkpoint = torch.load(filepath, map_location=self.device, weights_only=False)
        self.online_net.load_state_dict(checkpoint['online_net'])

        self.target_net.load_state_dict(checkpoint['target_net'])
        if 'optimizer' in checkpoint:
            self.optimizer.load_state_dict(checkpoint['optimizer'])
        if 'epsilon' in checkpoint:
            self.epsilon = checkpoint['epsilon']
        if 'beta' in checkpoint:
            self.beta = checkpoint['beta']
        print(f"[OK] Successfully loaded 4-Qubit DQN checkpoint from {filepath}")


if __name__ == '__main__':
    agent = DQNAgent4Q()
    dummy_obs = torch.randn(256, 66, device=agent.device)
    actions = agent.select_action(dummy_obs)
    assert actions.shape == (256,)
    print(f"[OK] DQNAgent4Q instantiated on {agent.device} with {agent.num_actions} actions!")
