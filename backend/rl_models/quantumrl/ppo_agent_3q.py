"""
ppo_agent_3q.py
----------------
Proximal Policy Optimization (PPO) Agent implementation for TATVA — 3-Qubit Architecture.

Features:
  - ActorCritic3Q: Shared 512-512-256 trunk + separate 252-action Actor head & 1-dim Critic head.
  - RolloutBuffer3Q: Pre-allocated CPU rollout buffer for 2048 rollout steps.
  - PPOAgent3Q: Manages Phase A Supervised Pretraining and Phase B RL Fine-Tuning.
"""

import os
import math
import json
import time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical
from typing import Dict, List, Optional, Tuple


class ActorCritic3Q(nn.Module):
    """
    Decoupled Actor-Critic network with shared trunk for 3-qubit quantum circuit synthesis.

    Input: 34 real float values (observation vector)

    Shared Trunk:
        Linear(34 -> 512) -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512 -> 512) -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512 -> 256) -> LayerNorm(256) -> LeakyReLU(0.01)

    Actor Head (Policy):
        Linear(256 -> 252)  [raw logits output]

    Critic Head (Value):
        Linear(256 -> 1)    [scalar state value V(s)]
    """

    def __init__(self, obs_size: int = 34, action_size: int = 252):
        super().__init__()
        self.obs_size = obs_size
        self.action_size = action_size

        self.shared_trunk = nn.Sequential(
            nn.Linear(obs_size, 512),
            nn.LayerNorm(512),
            nn.LeakyReLU(0.01),
            nn.Linear(512, 512),
            nn.LayerNorm(512),
            nn.LeakyReLU(0.01),
            nn.Linear(512, 256),
            nn.LayerNorm(256),
            nn.LeakyReLU(0.01),
        )

        self.actor_head = nn.Linear(256, action_size)
        self.critic_head = nn.Linear(256, 1)

        self._init_weights()

    def _init_weights(self) -> None:
        """Apply orthogonal initialization to all layers per PPO best practices."""
        gain_base = math.sqrt(2.0)
        for layer in self.shared_trunk:
            if isinstance(layer, nn.Linear):
                nn.init.orthogonal_(layer.weight, gain=gain_base)
                nn.init.constant_(layer.bias, 0.0)

        # Actor head final layer: small initial scale (0.01) for uniform initial policy
        nn.init.orthogonal_(self.actor_head.weight, gain=0.01)
        nn.init.constant_(self.actor_head.bias, 0.0)

        # Critic head final layer: standard scale (1.0)
        nn.init.orthogonal_(self.critic_head.weight, gain=1.0)
        nn.init.constant_(self.critic_head.bias, 0.0)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        feat = self.shared_trunk(x)
        logits = self.actor_head(feat)
        value = self.critic_head(feat)
        return logits, value

    def get_action(self, obs, deterministic: bool = False):
        if not isinstance(obs, torch.Tensor):
            device = next(self.parameters()).device
            obs = torch.tensor(obs, dtype=torch.float32, device=device)
        if obs.dim() == 1:
            obs = obs.unsqueeze(0)
        logits, value = self.forward(obs)
        dist = Categorical(logits=logits)
        if deterministic:
            action = torch.argmax(logits, dim=-1)
        else:
            action = dist.sample()
        log_prob = dist.log_prob(action)
        entropy = dist.entropy()
        return action, log_prob, entropy, value.squeeze(-1)

    def evaluate_actions(self, obs: torch.Tensor, actions: torch.Tensor):
        logits, value = self.forward(obs)
        dist = Categorical(logits=logits)
        log_probs = dist.log_prob(actions)
        entropy = dist.entropy()
        return log_probs, value.squeeze(-1), entropy


class RolloutBuffer3Q:
    """Pre-allocated CPU rollout buffer for storing PPO transition trajectories."""

    def __init__(self, buffer_size: int = 2048, obs_size: int = 34):
        self.buffer_size = buffer_size
        self.obs_size = obs_size
        self.reset()

    def reset(self) -> None:
        self.states = torch.zeros((self.buffer_size, self.obs_size), dtype=torch.float32)
        self.actions = torch.zeros(self.buffer_size, dtype=torch.int64)
        self.log_probs = torch.zeros(self.buffer_size, dtype=torch.float32)
        self.rewards = torch.zeros(self.buffer_size, dtype=torch.float32)
        self.dones = torch.zeros(self.buffer_size, dtype=torch.float32)
        self.values = torch.zeros(self.buffer_size, dtype=torch.float32)
        self.advantages = torch.zeros(self.buffer_size, dtype=torch.float32)
        self.returns = torch.zeros(self.buffer_size, dtype=torch.float32)
        self.ptr = 0

    def add(
        self,
        state: torch.Tensor,
        action: torch.Tensor,
        log_prob: torch.Tensor,
        reward: float,
        done: bool,
        value: torch.Tensor
    ) -> None:
        if self.ptr >= self.buffer_size:
            return
        self.states[self.ptr] = state.detach().cpu()
        self.actions[self.ptr] = action.detach().cpu() if isinstance(action, torch.Tensor) else torch.tensor(action)
        self.log_probs[self.ptr] = log_prob.detach().cpu() if isinstance(log_prob, torch.Tensor) else torch.tensor(log_prob)
        self.rewards[self.ptr] = float(reward)
        self.dones[self.ptr] = float(done)
        self.values[self.ptr] = value.detach().cpu().item() if isinstance(value, torch.Tensor) else float(value)
        self.ptr += 1

    def compute_returns_and_advantages(
        self,
        last_value: float,
        gamma: float = 0.995,
        gae_lambda: float = 0.95
    ) -> None:
        """Compute Generalized Advantage Estimation (GAE) via reverse sweep."""
        gae = 0.0
        for t in reversed(range(self.ptr)):
            if t == self.ptr - 1:
                next_val = last_value
                next_done = 0.0
            else:
                next_val = float(self.values[t + 1])
                next_done = float(self.dones[t + 1])

            delta = self.rewards[t] + gamma * next_val * (1.0 - next_done) - self.values[t]
            gae = delta + gamma * gae_lambda * (1.0 - next_done) * gae
            self.advantages[t] = gae

        self.returns[:self.ptr] = self.advantages[:self.ptr] + self.values[:self.ptr]

    def get_batches(self, minibatch_size: int = 256, device: torch.device = torch.device('cpu')):
        indices = np.arange(self.ptr)
        np.random.shuffle(indices)

        for start_idx in range(0, self.ptr, minibatch_size):
            end_idx = min(start_idx + minibatch_size, self.ptr)
            batch_idx = indices[start_idx:end_idx]

            yield (
                self.states[batch_idx].to(device),
                self.actions[batch_idx].to(device),
                self.log_probs[batch_idx].to(device),
                self.advantages[batch_idx].to(device),
                self.returns[batch_idx].to(device),
                self.values[batch_idx].to(device),
            )


class PPOAgent3Q:
    """Master 3-Qubit PPO Agent managing ActorCritic3Q model, rollout updates, and IO."""

    def __init__(self, config, device: torch.device):
        self.config = config
        self.device = device

        self.ac = ActorCritic3Q(obs_size=34, action_size=252).to(device)
        self.buffer = RolloutBuffer3Q(buffer_size=config.PPO_ROLLOUT_STEPS, obs_size=34)

        self.phase_b_optimizer = None
        self.phase_b_scheduler = None

    def init_phase_b_optimizer(self) -> None:
        """Create fresh AdamW optimizer and linear LR scheduler for Phase B RL fine-tuning."""
        self.phase_b_optimizer = torch.optim.AdamW(
            self.ac.parameters(),
            lr=self.config.PPO_LR,
            eps=1e-5,
            weight_decay=1e-4
        )
        total_updates = math.ceil(self.config.PPO_EPISODES / 100.0) # approx rollout steps
        self.phase_b_scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.phase_b_optimizer,
            T_max=max(total_updates, 1000),
            eta_min=self.config.PPO_LR_MIN
        )

    def update(self) -> Dict[str, float]:
        """Perform PPO-CLIP update using collected rollout buffer transitions."""
        if self.phase_b_optimizer is None:
            self.init_phase_b_optimizer()

        policy_losses = []
        value_losses = []
        entropy_losses = []
        total_losses = []

        for _ in range(self.config.PPO_EPOCHS):
            for states, actions, log_probs_old, advantages, returns, old_values in self.buffer.get_batches(
                minibatch_size=self.config.PPO_MINI_BATCH_SIZE, device=self.device
            ):
                # Advantage normalization per minibatch
                adv_mean = advantages.mean()
                adv_std = advantages.std() + 1e-8
                norm_advantages = (advantages - adv_mean) / adv_std

                log_probs_new, values_new, entropy = self.ac.evaluate_actions(states, actions)

                # Ratio
                ratio = torch.exp(log_probs_new - log_probs_old)
                surr1 = ratio * norm_advantages
                surr2 = torch.clamp(ratio, 1.0 - self.config.PPO_CLIP_EPSILON, 1.0 + self.config.PPO_CLIP_EPSILON) * norm_advantages
                policy_loss = -torch.min(surr1, surr2).mean()

                # Value loss with optional clipping
                val_loss_unclipped = 0.5 * (values_new - returns) ** 2
                val_clipped = old_values + torch.clamp(values_new - old_values, -self.config.PPO_CLIP_EPSILON, self.config.PPO_CLIP_EPSILON)
                val_loss_clipped = 0.5 * (val_clipped - returns) ** 2
                value_loss = torch.max(val_loss_unclipped, val_loss_clipped).mean()

                entropy_loss = -entropy.mean()

                total_loss = (
                    policy_loss
                    + self.config.PPO_VALUE_COEF * value_loss
                    + self.config.PPO_ENTROPY_COEF * entropy_loss
                )

                self.phase_b_optimizer.zero_grad()
                total_loss.backward()
                nn.utils.clip_grad_norm_(self.ac.parameters(), self.config.PPO_MAX_GRAD_NORM)
                self.phase_b_optimizer.step()

                policy_losses.append(policy_loss.item())
                value_losses.append(value_loss.item())
                entropy_losses.append(entropy_loss.item())
                total_losses.append(total_loss.item())

        if self.phase_b_scheduler is not None:
            self.phase_b_scheduler.step()

        self.buffer.reset()

        return {
            'policy_loss': float(np.mean(policy_losses)),
            'value_loss': float(np.mean(value_losses)),
            'entropy': float(-np.mean(entropy_losses)),
            'total_loss': float(np.mean(total_losses)),
            'lr': float(self.phase_b_optimizer.param_groups[0]['lr']),
        }
