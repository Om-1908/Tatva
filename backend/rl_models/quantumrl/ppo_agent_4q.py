"""
ppo_agent_4q.py
----------------
Proximal Policy Optimization (PPO) Agent implementation for TATVA — 4-Qubit Architecture.
Strictly adheres to TATVA 4-Qubit PPO Training Final Clean Specification.

Features:
  - ActorCritic4Q: 66-dim obs input -> Shared Trunk (768-768-512-512) -> 344-action Actor head & 1-dim Critic head.
  - RolloutBuffer4Q: CPU/GPU rollout buffer for 2048 rollout steps across 256 CUDA parallel environments.
  - PPOAgent4Q: Manages Phase A Supervised Pretraining and Phase B RL Fine-Tuning.
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


class ActorCritic4Q(nn.Module):
    """
    Decoupled Actor-Critic network with shared trunk for 4-qubit quantum circuit synthesis.

    Input: 66 real float values (observation vector)

    Shared Trunk:
        Linear(66 -> 768) -> LayerNorm(768) -> LeakyReLU(0.01)
        Linear(768 -> 768) -> LayerNorm(768) -> LeakyReLU(0.01)
        Linear(768 -> 512) -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512 -> 512) -> LayerNorm(512) -> LeakyReLU(0.01)

    Actor Head (Policy):
        Linear(512 -> 344)  [raw logits output]

    Critic Head (Value):
        Linear(512 -> 256) -> LeakyReLU(0.01) -> Linear(256 -> 1)  [V(s)]
    """

    def __init__(self, obs_size: int = 66, action_size: int = 344):
        super().__init__()
        self.obs_size = obs_size
        self.action_size = action_size

        self.shared_trunk = nn.Sequential(
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

        self.actor_head = nn.Linear(512, action_size)
        self.critic_head = nn.Sequential(
            nn.Linear(512, 256),
            nn.LeakyReLU(0.01),
            nn.Linear(256, 1)
        )

        self._init_weights()

    def _init_weights(self) -> None:
        """Apply orthogonal initialization to all layers per PPO specification."""
        gain_base = math.sqrt(2.0)
        for module in self.shared_trunk:
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, gain=gain_base)
                nn.init.constant_(module.bias, 0.0)

        for module in self.critic_head:
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, gain=gain_base)
                nn.init.constant_(module.bias, 0.0)

        # Actor head final layer: gain = 0.01 for uniform initial exploration
        nn.init.orthogonal_(self.actor_head.weight, gain=0.01)
        nn.init.constant_(self.actor_head.bias, 0.0)

        # Critic head final layer: gain = 1.0
        nn.init.orthogonal_(self.critic_head[-1].weight, gain=1.0)
        nn.init.constant_(self.critic_head[-1].bias, 0.0)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        feat = self.shared_trunk(x)
        logits = self.actor_head(feat)
        value = self.critic_head(feat)
        return logits, value

    def get_action(self, obs: torch.Tensor, deterministic: bool = False):
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


class RolloutBuffer4Q:
    """Vectorized Rollout Buffer for 4-Qubit PPO (2048 rollout steps x 256 parallel environments)."""

    def __init__(self, buffer_size: int = 2048, num_envs: int = 256, obs_size: int = 66, device: torch.device = torch.device('cpu')):
        self.buffer_size = buffer_size
        self.num_envs = num_envs
        self.obs_size = obs_size
        self.device = device
        self.reset()

    def reset(self) -> None:
        self.states = torch.zeros((self.buffer_size, self.num_envs, self.obs_size), dtype=torch.float32, device=self.device)
        self.actions = torch.zeros((self.buffer_size, self.num_envs), dtype=torch.int64, device=self.device)
        self.log_probs = torch.zeros((self.buffer_size, self.num_envs), dtype=torch.float32, device=self.device)
        self.rewards = torch.zeros((self.buffer_size, self.num_envs), dtype=torch.float32, device=self.device)
        self.dones = torch.zeros((self.buffer_size, self.num_envs), dtype=torch.float32, device=self.device)
        self.values = torch.zeros((self.buffer_size, self.num_envs), dtype=torch.float32, device=self.device)
        self.advantages = torch.zeros((self.buffer_size, self.num_envs), dtype=torch.float32, device=self.device)
        self.returns = torch.zeros((self.buffer_size, self.num_envs), dtype=torch.float32, device=self.device)
        self.ptr = 0

    def add(
        self,
        state: torch.Tensor,
        action: torch.Tensor,
        log_prob: torch.Tensor,
        reward: torch.Tensor,
        done: torch.Tensor,
        value: torch.Tensor
    ) -> None:
        if self.ptr >= self.buffer_size:
            return
        self.states[self.ptr] = state.detach()
        self.actions[self.ptr] = action.detach()
        self.log_probs[self.ptr] = log_prob.detach()
        self.rewards[self.ptr] = reward.detach() if isinstance(reward, torch.Tensor) else torch.tensor(reward, device=self.device)
        self.dones[self.ptr] = done.detach().float() if isinstance(done, torch.Tensor) else torch.tensor(done, dtype=torch.float32, device=self.device)
        self.values[self.ptr] = value.detach()
        self.ptr += 1

    def compute_returns_and_advantages(
        self,
        last_value: torch.Tensor,
        gamma: float = 0.995,
        gae_lambda: float = 0.95
    ) -> None:
        """
        Compute Generalized Advantage Estimation (GAE) per Section 15:
            delta_t = reward_t + gamma * V(next_state_t) * (1 - done_t) - V(state_t)
            gae_t = delta_t + gamma * lambda * (1 - done_t) * gae_{t+1}
        Done mask corresponds strictly to transition t.
        """
        gae = torch.zeros(self.num_envs, dtype=torch.float32, device=self.device)
        for t in reversed(range(self.ptr)):
            if t == self.ptr - 1:
                next_val = last_value
            else:
                next_val = self.values[t + 1]

            done_mask = 1.0 - self.dones[t]
            delta = self.rewards[t] + gamma * next_val * done_mask - self.values[t]
            gae = delta + gamma * gae_lambda * done_mask * gae
            self.advantages[t] = gae

        self.returns[:self.ptr] = self.advantages[:self.ptr] + self.values[:self.ptr]

    def get_flat_batches(self, minibatch_size: int = 256):
        # Flatten (buffer_size, num_envs) -> (N_samples,)
        total_samples = self.ptr * self.num_envs
        flat_states = self.states[:self.ptr].reshape(total_samples, self.obs_size)
        flat_actions = self.actions[:self.ptr].reshape(total_samples)
        flat_log_probs = self.log_probs[:self.ptr].reshape(total_samples)
        flat_advantages = self.advantages[:self.ptr].reshape(total_samples)
        flat_returns = self.returns[:self.ptr].reshape(total_samples)
        flat_values = self.values[:self.ptr].reshape(total_samples)

        indices = torch.randperm(total_samples, device=self.device)

        for start_idx in range(0, total_samples, minibatch_size):
            end_idx = min(start_idx + minibatch_size, total_samples)
            batch_idx = indices[start_idx:end_idx]

            yield (
                flat_states[batch_idx],
                flat_actions[batch_idx],
                flat_log_probs[batch_idx],
                flat_advantages[batch_idx],
                flat_returns[batch_idx],
                flat_values[batch_idx],
            )


class PPOAgent4Q:
    """Master 4-Qubit PPO Agent managing ActorCritic4Q model, RolloutBuffer4Q updates, and IO."""

    def __init__(self, config, device: str = 'cuda'):
        self.config = config
        self.device = torch.device(device if (device == 'cuda' and torch.cuda.is_available()) else 'cpu')

        self.ac = ActorCritic4Q(obs_size=self.config.OBS_SIZE, action_size=self.config.ACTION_SIZE).to(self.device)
        self.buffer = RolloutBuffer4Q(
            buffer_size=self.config.PPO_ROLLOUT_STEPS,
            num_envs=self.config.NUM_PARALLEL_ENVS,
            obs_size=self.config.OBS_SIZE,
            device=self.device
        )

        self.phase_b_optimizer = None
        self.phase_b_scheduler = None

    def init_phase_b_optimizer(self, total_episodes: int = 700000) -> None:
        """Create fresh AdamW optimizer and linear LR scheduler for Phase B RL fine-tuning."""
        self.phase_b_optimizer = torch.optim.AdamW(
            self.ac.parameters(),
            lr=self.config.PPO_LR,
            eps=1e-5,
            weight_decay=1e-4
        )
        total_updates = math.ceil(total_episodes / (self.config.PPO_ROLLOUT_STEPS / 10.0))
        total_updates = max(total_updates, 1000)

        # Linear LR decay schedule from PPO_LR (2e-4) -> PPO_LR_MIN (1e-5)
        def lr_lambda(step):
            pct = min(1.0, max(0.0, step / float(total_updates)))
            lr_start = self.config.PPO_LR
            lr_end = self.config.PPO_LR_MIN
            current_lr = lr_start - pct * (lr_start - lr_end)
            return current_lr / lr_start

        self.phase_b_scheduler = torch.optim.lr_scheduler.LambdaLR(self.phase_b_optimizer, lr_lambda=lr_lambda)

    def update(self) -> Dict[str, float]:
        """Perform PPO-CLIP updates using collected rollout transitions."""
        if self.phase_b_optimizer is None:
            self.init_phase_b_optimizer(total_episodes=self.config.PPO_EPISODES)

        policy_losses = []
        value_losses = []
        entropy_losses = []
        total_losses = []

        for _ in range(self.config.PPO_EPOCHS):
            for states, actions, log_probs_old, advantages, returns, old_values in self.buffer.get_flat_batches(
                minibatch_size=self.config.PPO_MINI_BATCH_SIZE
            ):
                # Minibatch advantage normalization
                adv_mean = advantages.mean()
                adv_std = advantages.std() + 1e-8
                norm_advantages = (advantages - adv_mean) / adv_std

                log_probs_new, values_new, entropy = self.ac.evaluate_actions(states, actions)

                # Ratio
                ratio = torch.exp(log_probs_new - log_probs_old)
                surr1 = ratio * norm_advantages
                surr2 = torch.clamp(ratio, 1.0 - self.config.PPO_CLIP_EPSILON, 1.0 + self.config.PPO_CLIP_EPSILON) * norm_advantages
                policy_loss = -torch.min(surr1, surr2).mean()

                # Value loss with clipping
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

    def save(self, filepath: str, extra_meta: Optional[Dict] = None) -> None:
        """Save comprehensive resumable PPO checkpoint."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        ckpt = {
            'actor_critic': self.ac.state_dict(),
            'optimizer': self.phase_b_optimizer.state_dict() if self.phase_b_optimizer else None,
            'scheduler': self.phase_b_scheduler.state_dict() if self.phase_b_scheduler else None,
            'config': self.config.__dict__,
            'rng_state_torch': torch.get_rng_state(),
            'rng_state_cuda': torch.cuda.get_rng_state() if torch.cuda.is_available() else None,
            'rng_state_numpy': np.random.get_state(),
            'extra_meta': extra_meta or {},
        }
        torch.save(ckpt, filepath)

    def load(self, filepath: str) -> Dict:
        """Load resumable PPO checkpoint."""
        ckpt = torch.load(filepath, map_location=self.device, weights_only=False)
        if isinstance(ckpt, dict) and 'actor_critic' in ckpt:
            self.ac.load_state_dict(ckpt['actor_critic'])
            if self.phase_b_optimizer and ckpt.get('optimizer'):
                self.phase_b_optimizer.load_state_dict(ckpt['optimizer'])
            if self.phase_b_scheduler and ckpt.get('scheduler'):
                self.phase_b_scheduler.load_state_dict(ckpt['scheduler'])
        elif isinstance(ckpt, dict) and 'state_dict' in ckpt:
            self.ac.load_state_dict(ckpt['state_dict'])
        else:
            self.ac.load_state_dict(ckpt)
        return ckpt
