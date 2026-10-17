"""
dqn_agent_3q.py
───────────────
TATVA 3-Qubit Dueling DQN Agent with Prioritized Experience Replay (PER).

Classes:
  DuelingQNetwork3Q       – Dual-stream Q-network with LayerNorm, LeakyReLU(0.01),
                            and orthogonal initialization.
  PrioritizedReplayBuffer – Proportional PER buffer with importance sampling weights.
  DQNAgent3Q              – Double-DQN Agent for 34-float obs to 252-action space.
"""

import copy
import math
import os
import random
from typing import Dict, Any, Optional, Tuple, List

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ─────────────────────────────────────────────────────────
# 3-Qubit Dueling Q-Network
# ─────────────────────────────────────────────────────────

class DuelingQNetwork3Q(nn.Module):
    """
    Dueling Q-Network for 3-qubit quantum circuit synthesis.
    
    Architecture:
      Trunk:
        Linear(34 -> 512) -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512 -> 512) -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512 -> 512) -> LayerNorm(512) -> LeakyReLU(0.01)
      Value stream:
        Linear(512 -> 256) -> LeakyReLU(0.01) -> Linear(256 -> 1)
      Advantage stream:
        Linear(512 -> 256) -> LeakyReLU(0.01) -> Linear(256 -> 252)

    Combination: Q(s,a) = V(s) + (A(s,a) - mean_a'(A(s,a')))
    """

    def __init__(self, obs_size: int = 34, action_size: int = 252, hidden_size: int = 512):
        super().__init__()
        self.obs_size = obs_size
        self.action_size = action_size
        self.hidden_size = hidden_size

        # Shared Trunk
        self.trunk_layer1 = nn.Linear(obs_size, hidden_size)
        self.norm1 = nn.LayerNorm(hidden_size)
        self.trunk_layer2 = nn.Linear(hidden_size, hidden_size)
        self.norm2 = nn.LayerNorm(hidden_size)
        self.trunk_layer3 = nn.Linear(hidden_size, hidden_size)
        self.norm3 = nn.LayerNorm(hidden_size)

        # Value Stream
        self.val_layer1 = nn.Linear(hidden_size, 256)
        self.val_out = nn.Linear(256, 1)

        # Advantage Stream
        self.adv_layer1 = nn.Linear(hidden_size, 256)
        self.adv_out = nn.Linear(256, action_size)

        # Apply Orthogonal Initialization as required
        self._init_weights()

    def _init_weights(self) -> None:
        """
        Weight initialization:
          Shared layers: orthogonal init, gain = sqrt(2)
          Value head final: orthogonal init, gain = 1.0
          Advantage head final: orthogonal init, gain = 0.01
        """
        sqrt2_gain = math.sqrt(2.0)

        # Shared layers
        for layer in [self.trunk_layer1, self.trunk_layer2, self.trunk_layer3, self.val_layer1, self.adv_layer1]:
            nn.init.orthogonal_(layer.weight, gain=sqrt2_gain)
            if layer.bias is not None:
                nn.init.constant_(layer.bias, 0.0)

        # Final heads
        nn.init.orthogonal_(self.val_out.weight, gain=1.0)
        if self.val_out.bias is not None:
            nn.init.constant_(self.val_out.bias, 0.0)

        nn.init.orthogonal_(self.adv_out.weight, gain=0.01)
        if self.adv_out.bias is not None:
            nn.init.constant_(self.adv_out.bias, 0.0)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Trunk
        h = F.leaky_relu(self.norm1(self.trunk_layer1(x)), negative_slope=0.01)
        h = F.leaky_relu(self.norm2(self.trunk_layer2(h)), negative_slope=0.01)
        h = F.leaky_relu(self.norm3(self.trunk_layer3(h)), negative_slope=0.01)

        # Value stream
        v = F.leaky_relu(self.val_layer1(h), negative_slope=0.01)
        value = self.val_out(v)

        # Advantage stream
        a = F.leaky_relu(self.adv_layer1(h), negative_slope=0.01)
        advantage = self.adv_out(a)

        # Dueling aggregation
        q_values = value + (advantage - advantage.mean(dim=1, keepdim=True))
        return q_values


# ─────────────────────────────────────────────────────────
# Prioritized Experience Replay (PER) Buffer
# ─────────────────────────────────────────────────────────

class PrioritizedReplayBuffer:
    """
    Proportional Prioritized Experience Replay Buffer with Sum-Tree support.
    """

    def __init__(
        self,
        capacity: int = 300000,
        alpha: float = 0.6,
        beta_start: float = 0.4,
        beta_end: float = 1.0,
        beta_frames: int = 450000,
        per_epsilon: float = 1e-5,
    ):
        self.capacity = capacity
        self.alpha = alpha
        self.beta_start = beta_start
        self.beta_end = beta_end
        self.beta_frames = beta_frames
        self.per_epsilon = per_epsilon
        self.frame_count = 0

        self.buffer: List[Tuple[np.ndarray, int, float, np.ndarray, bool]] = []
        self.priorities = np.zeros((capacity,), dtype=np.float32)
        self.pos = 0

    def push(
        self,
        state: np.ndarray,
        action: int,
        reward: float,
        next_state: np.ndarray,
        done: bool,
    ) -> None:
        max_prio = self.priorities.max() if self.buffer else 1.0

        if len(self.buffer) < self.capacity:
            self.buffer.append((state, action, reward, next_state, done))
        else:
            self.buffer[self.pos] = (state, action, reward, next_state, done)

        self.priorities[self.pos] = max_prio
        self.pos = (self.pos + 1) % self.capacity

    def push_batch(
        self,
        states: np.ndarray,
        actions: np.ndarray,
        rewards: np.ndarray,
        next_states: np.ndarray,
        dones: np.ndarray,
    ) -> None:
        """Push a batch of transitions from parallel environments."""
        n = len(states)
        for i in range(n):
            self.push(states[i], int(actions[i]), float(rewards[i]), next_states[i], bool(dones[i]))

    def sample(
        self, batch_size: int
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Sample a prioritized mini-batch.

        Returns:
            states, actions, rewards, next_states, dones, weights, indices
        """
        self.frame_count += 1
        fraction = min(1.0, self.frame_count / float(self.beta_frames))
        beta = self.beta_start + fraction * (self.beta_end - self.beta_start)

        N = len(self.buffer)
        prios = self.priorities[:N]
        probs = prios ** self.alpha
        probs_sum = probs.sum()
        if probs_sum == 0 or np.isnan(probs_sum):
            probs = np.ones(N, dtype=np.float32) / N
        else:
            probs = probs / probs_sum

        indices = np.random.choice(N, batch_size, p=probs)
        samples = [self.buffer[idx] for idx in indices]

        weights = (N * probs[indices]) ** (-beta)
        weights_max = weights.max()
        if weights_max > 0:
            weights /= weights_max
        weights = np.array(weights, dtype=np.float32)

        states, actions, rewards, next_states, dones = zip(*samples)

        return (
            np.array(states, dtype=np.float32),
            np.array(actions, dtype=np.int64),
            np.array(rewards, dtype=np.float32),
            np.array(next_states, dtype=np.float32),
            np.array(dones, dtype=np.float32),
            weights,
            indices,
        )

    def update_priorities(self, indices: np.ndarray, td_errors: np.ndarray) -> None:
        """Update sample priorities with absolute TD-errors."""
        for idx, td_error in zip(indices, td_errors):
            self.priorities[idx] = float(abs(td_error) + self.per_epsilon)

    def get_state(self) -> Dict[str, Any]:
        """Serialize buffer state for checkpointing."""
        return {
            'buffer': self.buffer,
            'priorities': self.priorities[:len(self.buffer)].copy(),
            'pos': self.pos,
            'frame_count': self.frame_count,
        }

    def load_state(self, state: Dict[str, Any]) -> None:
        """Restore buffer state from checkpoint."""
        self.buffer = state['buffer']
        N = len(self.buffer)
        self.priorities[:N] = state['priorities']
        self.pos = state['pos']
        self.frame_count = state['frame_count']

    def __len__(self) -> int:
        return len(self.buffer)


# ─────────────────────────────────────────────────────────
# 3-Qubit DQNAgent
# ─────────────────────────────────────────────────────────

class DQNAgent3Q:
    """
    Dueling Double-DQN Agent for 3-Qubit Quantum Circuit Synthesis.
    """

    def __init__(self, obs_size: int = 34, action_size: int = 252, config=None):
        self.obs_size = obs_size
        self.action_size = action_size
        self.config = config

        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        hidden_size = getattr(config, 'DQN_HIDDEN_SIZE', 512)

        # Networks
        self.q_net = DuelingQNetwork3Q(obs_size, action_size, hidden_size).to(self.device)
        self.target_net = copy.deepcopy(self.q_net).to(self.device)
        self.target_net.eval()

        # Optimizer
        self.lr = getattr(config, 'DQN_LR', 0.0002)
        self.optimizer = torch.optim.Adam(self.q_net.parameters(), lr=self.lr)

        # AMP Scaler
        if hasattr(torch, 'amp') and hasattr(torch.amp, 'GradScaler'):
            self.scaler = torch.amp.GradScaler('cuda', enabled=self.device.type == 'cuda')
        else:
            self.scaler = torch.cuda.amp.GradScaler(enabled=self.device.type == 'cuda')

        # PER Buffer
        capacity = getattr(config, 'DQN_BUFFER_SIZE', 300000)
        alpha = getattr(config, 'PER_ALPHA', 0.6)
        beta_start = getattr(config, 'PER_BETA_START', 0.4)
        beta_end = getattr(config, 'PER_BETA_END', 1.0)
        beta_frames = getattr(config, 'PER_BETA_FRAMES', 450000)
        per_eps = getattr(config, 'PER_EPSILON', 1e-5)

        self.buffer = PrioritizedReplayBuffer(
            capacity=capacity,
            alpha=alpha,
            beta_start=beta_start,
            beta_end=beta_end,
            beta_frames=beta_frames,
            per_epsilon=per_eps,
        )

        self.epsilon: float = getattr(config, 'DQN_EPSILON_START', 1.0)
        self.epsilon_end: float = getattr(config, 'DQN_EPSILON_END', 0.03)
        self.epsilon_decay: float = getattr(config, 'DQN_EPSILON_DECAY', 0.99975)
        self.grad_clip_norm: float = getattr(config, 'GRAD_CLIP_NORM', 5.0)

        self.steps_done: int = 0

    def select_action(self, state: np.ndarray, evaluate: bool = False) -> int:
        """Select action for single env step (epsilon-greedy)."""
        eps = 0.0 if evaluate else self.epsilon
        if random.random() < eps:
            return random.randrange(self.action_size)

        state_t = torch.as_tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0)
        with torch.no_grad():
            q_values = self.q_net(state_t)
        return int(q_values.argmax(dim=1).item())

    def select_actions_batch(self, state_tensor: torch.Tensor, evaluate: bool = False) -> torch.Tensor:
        """Batch epsilon-greedy action selection for parallel GPU environments."""
        num_envs = state_tensor.shape[0]
        eps = 0.0 if evaluate else self.epsilon

        rand_mask = torch.rand(num_envs, device=self.device) < eps
        random_actions = torch.randint(0, self.action_size, (num_envs,), device=self.device)

        with torch.no_grad():
            q_values = self.q_net(state_tensor)
            greedy_actions = q_values.argmax(dim=1)

        actions = torch.where(rand_mask, random_actions, greedy_actions)
        return actions

    def update(self) -> Optional[float]:
        """Sample a prioritized batch and perform Double-DQN optimization step."""
        batch_size = getattr(self.config, 'DQN_BATCH_SIZE', 256)
        if len(self.buffer) < batch_size:
            return None

        states, actions, rewards, next_states, dones, weights, indices = self.buffer.sample(batch_size)

        states_t = torch.as_tensor(states, dtype=torch.float32, device=self.device)
        actions_t = torch.as_tensor(actions, dtype=torch.long, device=self.device).unsqueeze(1)
        rewards_t = torch.as_tensor(rewards, dtype=torch.float32, device=self.device).unsqueeze(1)
        next_states_t = torch.as_tensor(next_states, dtype=torch.float32, device=self.device)
        dones_t = torch.as_tensor(dones, dtype=torch.float32, device=self.device).unsqueeze(1)
        weights_t = torch.as_tensor(weights, dtype=torch.float32, device=self.device).unsqueeze(1)

        gamma = getattr(self.config, 'DQN_GAMMA', 0.995)

        # Autocast AMP
        with torch.cuda.amp.autocast(enabled=self.device.type == 'cuda'):
            # Current Q(s, a)
            current_q = self.q_net(states_t).gather(1, actions_t)

            # Double-DQN target evaluation: Q_target(s', argmax_a Q_online(s', a))
            with torch.no_grad():
                best_actions = self.q_net(next_states_t).argmax(dim=1, keepdim=True)
                max_next_q = self.target_net(next_states_t).gather(1, best_actions)
                target_q = rewards_t + gamma * max_next_q * (1.0 - dones_t)

            # Weighted MSE loss
            loss = (weights_t * F.mse_loss(current_q, target_q, reduction='none')).mean()

        # TD-errors for PER priority updates
        td_errors = (current_q - target_q).detach().cpu().numpy().squeeze()
        self.buffer.update_priorities(indices, td_errors)

        # Optimization step
        self.optimizer.zero_grad()
        self.scaler.scale(loss).backward()
        self.scaler.unscale_(self.optimizer)
        torch.nn.utils.clip_grad_norm_(self.q_net.parameters(), max_norm=self.grad_clip_norm)
        self.scaler.step(self.optimizer)
        self.scaler.update()

        self.steps_done += 1
        return loss.item()

    def update_target(self) -> None:
        """Hard update of target network weights."""
        self.target_net.load_state_dict(self.q_net.state_dict())

    def decay_epsilon(self) -> float:
        """Multiplicative decay of epsilon towards minimum floor."""
        self.epsilon = max(self.epsilon_end, self.epsilon * self.epsilon_decay)
        return self.epsilon

    def set_learning_rate(self, new_lr: float) -> None:
        """Set new learning rate on optimizer."""
        self.lr = new_lr
        for param_group in self.optimizer.param_groups:
            param_group['lr'] = new_lr

    def get_learning_rate(self) -> float:
        """Get current learning rate."""
        for param_group in self.optimizer.param_groups:
            return param_group['lr']
        return self.lr

    def save(self, filepath: str, extra_data: Optional[Dict[str, Any]] = None) -> None:
        """Save full agent state to file."""
        os.makedirs(os.path.dirname(filepath) if os.path.dirname(filepath) else '.', exist_ok=True)
        ckpt = {
            'q_net': self.q_net.state_dict(),
            'target_net': self.target_net.state_dict(),
            'optimizer': self.optimizer.state_dict(),
            'buffer': self.buffer.get_state(),
            'epsilon': self.epsilon,
            'steps_done': self.steps_done,
            'lr': self.lr,
        }
        if extra_data:
            ckpt.update(extra_data)
        torch.save(ckpt, filepath)

    def load(self, filepath: str) -> Dict[str, Any]:
        """Load full agent state from file."""
        ckpt = torch.load(filepath, map_location=self.device)
        self.q_net.load_state_dict(ckpt['q_net'])
        if 'target_net' in ckpt:
            self.target_net.load_state_dict(ckpt['target_net'])
        else:
            self.target_net.load_state_dict(ckpt['q_net'])

        if 'optimizer' in ckpt:
            self.optimizer.load_state_dict(ckpt['optimizer'])
        if 'buffer' in ckpt:
            self.buffer.load_state(ckpt['buffer'])
        if 'epsilon' in ckpt:
            self.epsilon = ckpt['epsilon']
        if 'steps_done' in ckpt:
            self.steps_done = ckpt['steps_done']
        if 'lr' in ckpt:
            self.set_learning_rate(ckpt['lr'])

        return ckpt
