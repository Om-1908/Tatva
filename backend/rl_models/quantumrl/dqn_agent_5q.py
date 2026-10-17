"""
dqn_agent_5q.py
---------------
5-Qubit Dueling DQN Agent with Prioritized Experience Replay (PER).

Architecture (Specification 5-Qubit):
Input: OBS_SIZE = 130

Shared Trunk:
  Linear(130, 1024) -> LayerNorm(1024) -> LeakyReLU(0.01)
  Linear(1024, 1024) -> LayerNorm(1024) -> LeakyReLU(0.01)
  Linear(1024, 768)  -> LayerNorm(768)  -> LeakyReLU(0.01)
  Linear(768, 512)   -> LayerNorm(512)  -> LeakyReLU(0.01)

Value Stream:
  Linear(512, 256) -> LeakyReLU(0.01) -> Linear(256, 1)

Advantage Stream:
  Linear(512, 256) -> LeakyReLU(0.01) -> Linear(256, 440)

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


class DuelingDQN5Q(nn.Module):
    """Deep Dueling Q-Network for 5-Qubit Quantum Circuit Synthesis."""

    def __init__(self, obs_size: int = 130, num_actions: int = 440, hidden_size: int = 1024):
        super().__init__()

        # Shared Trunk (4 layers starting at 1024)
        self.trunk = nn.Sequential(
            nn.Linear(obs_size, 1024),
            nn.LayerNorm(1024),
            nn.LeakyReLU(0.01),

            nn.Linear(1024, 1024),
            nn.LayerNorm(1024),
            nn.LeakyReLU(0.01),

            nn.Linear(1024, 768),
            nn.LayerNorm(768),
            nn.LeakyReLU(0.01),

            nn.Linear(768, 512),
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

        self._init_weights()

    def _init_weights(self):
        """Orthogonal weight initialization as per spec."""
        for m in self.trunk.modules():
            if isinstance(m, nn.Linear):
                nn.init.orthogonal_(m.weight, gain=np.sqrt(2))
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0.0)

        for m in self.value_stream.modules():
            if isinstance(m, nn.Linear):
                nn.init.orthogonal_(m.weight, gain=np.sqrt(2))
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0.0)
        # Value head final layer gain = 1.0
        nn.init.orthogonal_(self.value_stream[-1].weight, gain=1.0)

        for m in self.advantage_stream.modules():
            if isinstance(m, nn.Linear):
                nn.init.orthogonal_(m.weight, gain=np.sqrt(2))
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0.0)
        # Advantage head final layer gain = 0.01
        nn.init.orthogonal_(self.advantage_stream[-1].weight, gain=0.01)

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        features = self.trunk(obs)
        value = self.value_stream(features)           # (N, 1)
        advantage = self.advantage_stream(features)   # (N, 440)

        # Dueling combination: Q = V + A - mean(A)
        q_values = value + advantage - advantage.mean(dim=-1, keepdim=True)
        return q_values


class PrioritizedReplayBuffer5Q:
    """Prioritized Experience Replay (PER) buffer using sum tree for O(log N) sampling."""

    def __init__(self, capacity: int = 600000, alpha: float = 0.6, eps: float = 1e-5):
        self.capacity = capacity
        self.alpha = alpha
        self.eps = eps
        self.tree_capacity = 1
        while self.tree_capacity < capacity:
            self.tree_capacity *= 2

        self.sum_tree = np.zeros(2 * self.tree_capacity, dtype=np.float32)
        self.min_tree = np.full(2 * self.tree_capacity, float('inf'), dtype=np.float32)

        self.obs_buf = np.zeros((capacity, 130), dtype=np.float32)
        self.action_buf = np.zeros(capacity, dtype=np.int64)
        self.reward_buf = np.zeros(capacity, dtype=np.float32)
        self.next_obs_buf = np.zeros((capacity, 130), dtype=np.float32)
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

    def _update_tree(self, tree_idx: int, priority: float):
        self.sum_tree[tree_idx] = priority
        self.min_tree[tree_idx] = priority
        parent = tree_idx // 2
        while parent >= 1:
            left = 2 * parent
            right = left + 1
            self.sum_tree[parent] = self.sum_tree[left] + self.sum_tree[right]
            self.min_tree[parent] = min(self.min_tree[left], self.min_tree[right])
            parent //= 2

    def sample(self, batch_size: int, beta: float = 0.4) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        assert self.size > 0, "Cannot sample from empty buffer"

        segment = self.sum_tree[1] / batch_size
        indices = np.zeros(batch_size, dtype=np.int64)
        tree_indices = np.zeros(batch_size, dtype=np.int64)

        for i in range(batch_size):
            a = segment * i
            b = segment * (i + 1)
            v = random.uniform(a, b)

            # Retrieve leaf node
            idx = 1
            while idx < self.tree_capacity:
                left = 2 * idx
                if self.sum_tree[left] >= v:
                    idx = left
                else:
                    v -= self.sum_tree[left]
                    idx = left + 1

            data_idx = idx - self.tree_capacity
            if data_idx >= self.size:
                data_idx = random.randint(0, self.size - 1)
                idx = data_idx + self.tree_capacity

            indices[i] = data_idx
            tree_indices[i] = idx

        priorities = self.sum_tree[tree_indices]
        p_min = self.min_tree[1] / self.sum_tree[1]
        max_weight = (p_min * self.size) ** (-beta) if p_min > 0 else 1.0

        p_sample = priorities / self.sum_tree[1]
        weights = (p_sample * self.size) ** (-beta)
        weights /= (max_weight + 1e-8)
        weights = weights.astype(np.float32)

        return (
            self.obs_buf[indices],
            self.action_buf[indices],
            self.reward_buf[indices],
            self.next_obs_buf[indices],
            self.done_buf[indices],
            indices,
            weights
        )

    def update_priorities(self, indices: np.ndarray, td_errors: np.ndarray):
        for idx, error in zip(indices, td_errors):
            priority = (abs(error) + self.eps) ** self.alpha
            self.max_priority = max(self.max_priority, priority)
            tree_idx = idx + self.tree_capacity
            self._update_tree(tree_idx, priority)


class DQNAgent5Q:
    """Double Dueling DQN Agent for 5-Qubit Synthesis."""

    def __init__(self, config=None, device: str = 'cuda'):
        if config is None:
            try:
                from quantumrl.configs.config_5qubit import Config5Qubit
                config = Config5Qubit()
            except ImportError:
                from configs.config_5qubit import Config5Qubit
                config = Config5Qubit()

        self.config = config
        self.device = torch.device(device if (device == 'cuda' and torch.cuda.is_available()) else 'cpu')

        self.obs_size = getattr(config, 'OBS_SIZE', 130)
        self.num_actions = getattr(config, 'ACTION_SIZE', 440)
        self.lr = getattr(config, 'DQN_LR', 0.0001)
        self.gamma = getattr(config, 'DQN_GAMMA', 0.995)
        self.grad_clip = getattr(config, 'GRAD_CLIP_NORM', 5.0)

        # Epsilon params
        self.epsilon = 0.75
        self.epsilon_min = 0.03
        self.epsilon_decay = 0.99985

        # Networks
        self.online_net = DuelingDQN5Q(obs_size=self.obs_size, num_actions=self.num_actions).to(self.device)
        self.target_net = DuelingDQN5Q(obs_size=self.obs_size, num_actions=self.num_actions).to(self.device)
        self.target_net.load_state_dict(self.online_net.state_dict())
        self.target_net.eval()

        # Optimizer
        self.optimizer = optim.AdamW(self.online_net.parameters(), lr=self.lr, weight_decay=1e-5)

        # Buffer
        buffer_size = getattr(config, 'DQN_BUFFER_SIZE', 600000)
        self.buffer = PrioritizedReplayBuffer5Q(capacity=buffer_size)

    def select_action(self, obs: np.ndarray, deterministic: bool = False) -> int:
        if not deterministic and random.random() < self.epsilon:
            return random.randint(0, self.num_actions - 1)

        obs_tensor = torch.as_tensor(obs, dtype=torch.float32, device=self.device).unsqueeze(0)
        with torch.no_grad():
            q_values = self.online_net(obs_tensor)
            action = int(torch.argmax(q_values, dim=1).item())
        return action

    def select_action_batch(self, obs_batch: torch.Tensor, epsilon: float) -> torch.Tensor:
        """Vectorized action selection for parallel environments."""
        batch_size = obs_batch.shape[0]
        with torch.no_grad():
            q_values = self.online_net(obs_batch)
            best_actions = torch.argmax(q_values, dim=1)

        random_mask = torch.rand(batch_size, device=self.device) < epsilon
        random_actions = torch.randint(0, self.num_actions, (batch_size,), device=self.device)

        actions = torch.where(random_mask, random_actions, best_actions)
        return actions

    def update(self, batch_size: int = 512, beta: float = 0.4) -> float:
        if self.buffer.size < batch_size:
            return 0.0

        obs, actions, rewards, next_obs, dones, indices, weights = self.buffer.sample(batch_size, beta=beta)

        obs_t = torch.tensor(obs, dtype=torch.float32, device=self.device)
        actions_t = torch.tensor(actions, dtype=torch.long, device=self.device).unsqueeze(1)
        rewards_t = torch.tensor(rewards, dtype=torch.float32, device=self.device).unsqueeze(1)
        next_obs_t = torch.tensor(next_obs, dtype=torch.float32, device=self.device)
        dones_t = torch.tensor(dones, dtype=torch.float32, device=self.device).unsqueeze(1)
        weights_t = torch.tensor(weights, dtype=torch.float32, device=self.device).unsqueeze(1)

        # Current Q
        curr_q = self.online_net(obs_t).gather(1, actions_t)

        # Double DQN target computation
        with torch.no_grad():
            next_online_actions = self.online_net(next_obs_t).argmax(dim=1, keepdim=True)
            target_q_values = self.target_net(next_obs_t).gather(1, next_online_actions)
            expected_q = rewards_t + (1.0 - dones_t) * self.gamma * target_q_values

        # TD errors & Weighted MSE loss
        td_errors = (curr_q - expected_q).detach().cpu().numpy().flatten()
        loss = (weights_t * nn.functional.mse_loss(curr_q, expected_q, reduction='none')).mean()

        self.optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(self.online_net.parameters(), self.grad_clip)
        self.optimizer.step()

        # Update PER priorities
        self.buffer.update_priorities(indices, td_errors)
        return float(loss.item())

    def update_target(self):
        self.target_net.load_state_dict(self.online_net.state_dict())

    def decay_epsilon(self):
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

    def save(self, path: str, extra_data: Optional[Dict] = None):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        ckpt = {
            'online_net': self.online_net.state_dict(),
            'target_net': self.target_net.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'epsilon': self.epsilon,
            'config': self.config
        }
        if extra_data:
            ckpt.update(extra_data)
        torch.save(ckpt, path)

    def load(self, path: str):
        if not os.path.exists(path):
            raise FileNotFoundError(f"Checkpoint {path} not found")
        ckpt = torch.load(path, map_location=self.device, weights_only=False)
        if isinstance(ckpt, dict) and 'online_net' in ckpt:
            self.online_net.load_state_dict(ckpt['online_net'])
            if 'target_net' in ckpt:
                self.target_net.load_state_dict(ckpt['target_net'])
            if 'optimizer' in ckpt:
                self.optimizer.load_state_dict(ckpt['optimizer'])
            if 'epsilon' in ckpt:
                self.epsilon = ckpt['epsilon']
        else:
            self.online_net.load_state_dict(ckpt)
            self.target_net.load_state_dict(ckpt)
