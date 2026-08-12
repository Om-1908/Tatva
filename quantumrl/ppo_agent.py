"""
ppo_agent.py
------------
Proximal Policy Optimization (PPO) agent implementation for QuantumRL.

Classes:
  ActorCritic   – Independent Actor and Critic neural network branches for stable policy/value learning.
  RolloutBuffer – Fixed-size CPU rollout buffer storing trajectory data and computing GAE.
  PPOAgent      – PPO algorithm managing interaction, policy updates, learning rate decay, and IO.
"""

import os
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical


# ─────────────────────────────────────────────────────────
# Actor-Critic Network (Decoupled Architecture)
# ─────────────────────────────────────────────────────────

class ActorCritic(nn.Module):
    """
    Decoupled Actor-Critic neural network architecture.

    Actor branch (Policy):
        Linear(obs_size, 512) -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512, 512)      -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512, 256)      -> LayerNorm(256) -> LeakyReLU(0.01)
        Linear(256, action_size) [raw logits]

    Critic branch (Value):
        Linear(obs_size, 512) -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512, 512)      -> LayerNorm(512) -> LeakyReLU(0.01)
        Linear(512, 256)      -> LayerNorm(256) -> LeakyReLU(0.01)
        Linear(256, 1)           [scalar state value V(s)]
    """

    def __init__(self, obs_size: int, action_size: int, hidden_size: int = 512):
        super().__init__()
        self.obs_size = obs_size
        self.action_size = action_size
        self.hidden_size = hidden_size

        self.actor = nn.Sequential(
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

        self.critic = nn.Sequential(
            nn.Linear(obs_size, hidden_size),
            nn.LayerNorm(hidden_size),
            nn.LeakyReLU(0.01),
            nn.Linear(hidden_size, hidden_size),
            nn.LayerNorm(hidden_size),
            nn.LeakyReLU(0.01),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.LayerNorm(hidden_size // 2),
            nn.LeakyReLU(0.01),
            nn.Linear(hidden_size // 2, 1),
        )

        self._init_weights()

    def _init_weights(self) -> None:
        """Apply orthogonal initialization to linear layers per PPO best practices."""
        gain_base = np.sqrt(2.0)
        for branch in [self.actor, self.critic]:
            for layer in branch:
                if isinstance(layer, nn.Linear):
                    nn.init.orthogonal_(layer.weight, gain=gain_base)
                    nn.init.constant_(layer.bias, 0.0)

        # Actor head final layer: small initial weights (0.01) for uniform initial exploration
        nn.init.orthogonal_(self.actor[-1].weight, gain=0.01)
        nn.init.constant_(self.actor[-1].bias, 0.0)

        # Critic head final layer: standard scale (1.0)
        nn.init.orthogonal_(self.critic[-1].weight, gain=1.0)
        nn.init.constant_(self.critic[-1].bias, 0.0)

    def forward(self, x: torch.Tensor):
        """
        Parameters
        ----------
        x : float32 tensor of shape (batch, obs_size)

        Returns
        -------
        (logits, value) where:
            logits : float32 tensor of shape (batch, action_size)
            value  : float32 tensor of shape (batch, 1)
        """
        logits = self.actor(x)
        value = self.critic(x)
        return logits, value

    def get_action(self, state, deterministic: bool = False):
        """
        Sample or select action for a given state observation.

        Parameters
        ----------
        state         : numpy array of shape (obs_size,) or torch Tensor
        deterministic : if True, selects argmax action; if False, samples from distribution

        Returns
        -------
        action   : int
        log_prob : torch.Tensor scalar
        entropy  : torch.Tensor scalar
        value    : torch.Tensor scalar
        """
        if isinstance(state, np.ndarray):
            state_t = torch.tensor(state, dtype=torch.float32).unsqueeze(0)
        else:
            state_t = state
            if state_t.dim() == 1:
                state_t = state_t.unsqueeze(0)

        device = next(self.parameters()).device
        state_t = state_t.to(device)

        logits, value = self.forward(state_t)
        dist = Categorical(logits=logits)

        if deterministic:
            action = torch.argmax(logits, dim=-1)
        else:
            action = dist.sample()

        log_prob = dist.log_prob(action)
        entropy = dist.entropy()

        return action.item(), log_prob.squeeze(0), entropy.squeeze(0), value.squeeze(0)

    def evaluate_actions(self, states: torch.Tensor, actions: torch.Tensor):
        """
        Evaluate log probabilities, state values, and entropy for a batch.

        Parameters
        ----------
        states  : float32 tensor of shape (batch, obs_size)
        actions : long tensor of shape (batch,)

        Returns
        -------
        log_probs : float32 tensor of shape (batch,)
        values    : float32 tensor of shape (batch,)
        entropy   : float32 tensor of shape (batch,)
        """
        logits, values = self.forward(states)
        dist = Categorical(logits=logits)
        log_probs = dist.log_prob(actions)
        entropy = dist.entropy()
        return log_probs, values.squeeze(-1), entropy


# ─────────────────────────────────────────────────────────
# Rollout Buffer
# ─────────────────────────────────────────────────────────

class RolloutBuffer:
    """
    CPU-allocated buffer storing rollout transitions for PPO update steps.
    Computes Generalized Advantage Estimation (GAE) and yields minibatches.
    """

    def __init__(self, rollout_steps: int, obs_size: int, device: torch.device):
        self.rollout_steps = rollout_steps
        self.obs_size = obs_size
        self.device = device

        self.states = torch.zeros(rollout_steps, obs_size, dtype=torch.float32)
        self.actions = torch.zeros(rollout_steps, dtype=torch.long)
        self.log_probs = torch.zeros(rollout_steps, dtype=torch.float32)
        self.rewards = torch.zeros(rollout_steps, dtype=torch.float32)
        self.dones = torch.zeros(rollout_steps, dtype=torch.float32)
        self.values = torch.zeros(rollout_steps, dtype=torch.float32)

        self.advantages = torch.zeros(rollout_steps, dtype=torch.float32)
        self.returns = torch.zeros(rollout_steps, dtype=torch.float32)

        self.ptr = 0

    def add(self, state, action: int, log_prob, reward: float, done: bool, value) -> None:
        """Store a single rollout transition at index self.ptr."""
        if isinstance(state, torch.Tensor):
            state = state.detach().cpu()
        else:
            state = torch.tensor(state, dtype=torch.float32)

        if isinstance(log_prob, torch.Tensor):
            log_prob = log_prob.detach().cpu()
        if isinstance(value, torch.Tensor):
            value = value.detach().cpu()

        self.states[self.ptr] = state.squeeze()
        self.actions[self.ptr] = int(action)
        self.log_probs[self.ptr] = float(log_prob)
        self.rewards[self.ptr] = float(reward)
        self.dones[self.ptr] = float(done)
        self.values[self.ptr] = float(value)

        self.ptr += 1

    def compute_returns_and_advantages(
        self, last_value, gamma: float, gae_lambda: float
    ):
        """
        Compute Generalized Advantage Estimation (GAE) and target returns.

        Parameters
        ----------
        last_value : scalar tensor or float, V(s_T) after rollout completion
        gamma      : discount factor
        gae_lambda : GAE lambda weighting parameter
        """
        if isinstance(last_value, torch.Tensor):
            last_val_num = float(last_value.detach().cpu().item())
        else:
            last_val_num = float(last_value)

        advantages = torch.zeros(self.rollout_steps, dtype=torch.float32)
        gae = 0.0

        for t in reversed(range(self.rollout_steps)):
            if t == self.rollout_steps - 1:
                next_value = last_val_num
                next_done = 0.0
            else:
                next_value = self.values[t + 1].item()
                next_done = self.dones[t + 1].item()

            delta = (
                self.rewards[t].item()
                + gamma * next_value * (1.0 - next_done)
                - self.values[t].item()
            )
            gae = delta + gamma * gae_lambda * (1.0 - next_done) * gae
            advantages[t] = gae

        returns = advantages + self.values

        # Normalize advantages across rollout
        adv_std = advantages.std()
        if adv_std < 1e-8:
            adv_std = 1e-8
        advantages = (advantages - advantages.mean()) / adv_std

        self.advantages = advantages
        self.returns = returns

        return self.advantages, self.returns

    def get_minibatches(self, mini_batch_size: int):
        """Yield minibatches of CPU rollout data moved onto self.device."""
        indices = torch.randperm(self.rollout_steps)
        for start_idx in range(0, self.rollout_steps, mini_batch_size):
            batch_indices = indices[start_idx : start_idx + mini_batch_size]

            yield (
                self.states[batch_indices].to(self.device),
                self.actions[batch_indices].to(self.device),
                self.log_probs[batch_indices].to(self.device),
                self.returns[batch_indices].to(self.device),
                self.advantages[batch_indices].to(self.device),
            )

    def reset(self) -> None:
        """Reset buffer pointer."""
        self.ptr = 0


# ─────────────────────────────────────────────────────────
# PPO Agent
# ─────────────────────────────────────────────────────────

class PPOAgent:
    """
    PPO Agent handling action selection, policy/value network optimization,
    learning rate decay schedule, and model persistence.
    """

    def __init__(self, obs_size: int, action_size: int, config, device: torch.device):
        self.config = config
        self.device = device
        self.obs_size = obs_size
        self.action_size = action_size

        self.ac = ActorCritic(obs_size, action_size, config.PPO_HIDDEN_SIZE).to(device)

        self.optimizer = torch.optim.Adam(
            self.ac.parameters(), lr=config.PPO_LR, eps=1e-5
        )

        if getattr(config, 'PPO_LR_DECAY', False):
            lr_min = getattr(config, 'PPO_LR_MIN', 1e-5)
            end_factor = lr_min / config.PPO_LR
            self.scheduler = torch.optim.lr_scheduler.LinearLR(
                self.optimizer,
                start_factor=1.0,
                end_factor=end_factor,
                total_iters=config.PPO_EPISODES,
            )
        else:
            self.scheduler = None

    def select_action(self, state, deterministic: bool = False):
        """Select action via ActorCritic policy under torch.no_grad()."""
        with torch.no_grad():
            return self.ac.get_action(state, deterministic=deterministic)

    def select_action_greedy(self, state: np.ndarray) -> int:
        """Greedy deterministic action selection for evaluation."""
        with torch.no_grad():
            action, _, _, _ = self.ac.get_action(state, deterministic=True)
            return action

    def update(self, buffer: RolloutBuffer) -> dict:
        """
        Perform PPO clipped surrogate policy update and value function training.

        Parameters
        ----------
        buffer : RolloutBuffer containing collected rollouts and computed GAE

        Returns
        -------
        dict containing mean policy_loss, value_loss, and entropy metrics
        """
        policy_losses = []
        value_losses = []
        entropies = []

        clip_eps = self.config.PPO_CLIP_EPSILON
        value_coef = self.config.PPO_VALUE_COEF
        entropy_coef = self.config.PPO_ENTROPY_COEF
        max_grad_norm = self.config.PPO_MAX_GRAD_NORM
        mini_batch_size = self.config.PPO_MINI_BATCH_SIZE

        for epoch in range(self.config.PPO_EPOCHS):
            for states, actions, log_probs_old, returns, advantages in buffer.get_minibatches(mini_batch_size):
                log_probs_new, values_new, entropy = self.ac.evaluate_actions(states, actions)

                ratio = torch.exp(log_probs_new - log_probs_old)

                surr1 = ratio * advantages
                surr2 = torch.clamp(ratio, 1.0 - clip_eps, 1.0 + clip_eps) * advantages
                policy_loss = -torch.min(surr1, surr2).mean()

                value_loss = 0.5 * F.mse_loss(values_new, returns)
                entropy_loss = -entropy.mean()

                total_loss = (
                    policy_loss
                    + value_coef * value_loss
                    + entropy_coef * entropy_loss
                )

                self.optimizer.zero_grad()
                total_loss.backward()
                torch.nn.utils.clip_grad_norm_(self.ac.parameters(), max_grad_norm)
                self.optimizer.step()

                policy_losses.append(policy_loss.item())
                value_losses.append(value_loss.item())
                entropies.append(entropy.mean().item())

        if self.scheduler is not None:
            self.scheduler.step()

        return {
            'policy_loss': float(np.mean(policy_losses)),
            'value_loss': float(np.mean(value_losses)),
            'entropy': float(np.mean(entropies)),
        }

    def save(self, path: str) -> None:
        """Save ActorCritic weights to disk."""
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
        torch.save(self.ac.state_dict(), path)
        print(f"[PPOAgent] Model saved -> {path}")

    def load(self, path: str) -> None:
        """Load ActorCritic weights from disk."""
        state_dict = torch.load(path, map_location=self.device)
        self.ac.load_state_dict(state_dict)
        self.ac.eval()
        print(f"[PPOAgent] Model loaded <- {path}")
