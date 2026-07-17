"""
ppo_agent.py
------------
Proximal Policy Optimization implementation for QuantumRL.

Classes:
  ActorCritic – shared-backbone MLP with separate actor and critic heads
  PPOAgent    – rollout-based PPO with GAE advantage estimation
"""

import os
from typing import Dict, List, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical


# ─────────────────────────────────────────────────────────
# Actor-Critic Network
# ─────────────────────────────────────────────────────────

class ActorCritic(nn.Module):
    """
    Shared-backbone Actor-Critic network.

    Architecture
    ------------
    Shared base : obs_size → hidden → hidden  (ReLU activations)
    Actor head  : hidden → action_size → Softmax  (action probabilities)
    Critic head : hidden → 1                       (state value)
    """

    def __init__(self, obs_size: int, action_size: int, hidden_size: int):
        super().__init__()

        # Shared feature extractor
        self.base = nn.Sequential(
            nn.Linear(obs_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
        )

        # Actor: outputs a probability distribution over actions
        self.actor_head = nn.Linear(hidden_size, action_size)

        # Critic: outputs a scalar state-value estimate
        self.critic_head = nn.Linear(hidden_size, 1)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Parameters
        ----------
        x : float32 tensor (batch, obs_size)

        Returns
        -------
        action_probs : float32 tensor (batch, action_size)
        state_value  : float32 tensor (batch, 1)
        """
        features = self.base(x)
        action_probs = F.softmax(self.actor_head(features), dim=-1)
        state_value  = self.critic_head(features)
        return action_probs, state_value

    def get_action(
        self, state: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Sample an action from the policy for a single state.

        Parameters
        ----------
        state : float32 tensor (1, obs_size) or (obs_size,)

        Returns
        -------
        action   : scalar tensor
        log_prob : scalar tensor, log π(a|s)
        entropy  : scalar tensor, H[π(·|s)]
        """
        action_probs, _ = self.forward(state)
        dist = Categorical(probs=action_probs)
        action = dist.sample()
        log_prob = dist.log_prob(action)
        entropy  = dist.entropy()
        return action, log_prob, entropy

    def evaluate_action(
        self,
        states: torch.Tensor,
        actions: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Evaluate log-probabilities, values, and entropy for a batch.

        Parameters
        ----------
        states  : float32 tensor (batch, obs_size)
        actions : int64 tensor   (batch,)

        Returns
        -------
        log_probs    : float32 tensor (batch,)
        state_values : float32 tensor (batch,)
        entropy      : float32 scalar
        """
        action_probs, state_values = self.forward(states)
        dist = Categorical(probs=action_probs)
        log_probs = dist.log_prob(actions)
        entropy   = dist.entropy().mean()
        return log_probs, state_values.squeeze(-1), entropy


# ─────────────────────────────────────────────────────────
# PPO Agent
# ─────────────────────────────────────────────────────────

class PPOAgent:
    """
    Proximal Policy Optimization agent.

    Collects rollouts externally (in train_ppo.py), then calls update()
    with the accumulated rollout buffer.

    Parameters
    ----------
    obs_size    : observation vector length
    action_size : number of discrete actions
    config      : Config dataclass
    """

    def __init__(self, obs_size: int, action_size: int, config):
        self.config = config
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        self.ac = ActorCritic(obs_size, action_size, config.PPO_HIDDEN_SIZE).to(self.device)
        self.optimizer = torch.optim.Adam(self.ac.parameters(), lr=config.PPO_LR)

    def compute_gae(
        self,
        rewards: List[float],
        values: List[float],
        dones: List[bool],
        next_value: float,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generalized Advantage Estimation (Schulman et al., 2015).

        Parameters
        ----------
        rewards    : list of per-step rewards
        values     : list of critic value estimates V(s_t)
        dones      : list of termination flags
        next_value : V(s_{T+1}), bootstrapped value after rollout

        Returns
        -------
        advantages : float32 numpy array (T,)
        returns    : float32 numpy array (T,), advantage + V(s_t)
        """
        T = len(rewards)
        advantages = np.zeros(T, dtype=np.float32)
        gae = 0.0

        gamma     = self.config.PPO_GAMMA
        lam       = self.config.PPO_GAE_LAMBDA

        # Iterate backwards through timesteps
        for t in reversed(range(T)):
            if t == T - 1:
                next_val = next_value
                next_done = False
            else:
                next_val  = values[t + 1]
                next_done = dones[t + 1]

            delta = (
                rewards[t]
                + gamma * next_val * (1.0 - float(next_done))
                - values[t]
            )
            gae = delta + gamma * lam * (1.0 - float(next_done)) * gae
            advantages[t] = gae

        returns = advantages + np.array(values, dtype=np.float32)
        return advantages, returns

    def update(self, rollout_buffer: Dict) -> float:
        """
        Run PPO_EPOCHS of mini-batch gradient updates on the collected rollout.

        Parameters
        ----------
        rollout_buffer : dict with keys:
            'states'        : float32 (T, obs_size)
            'actions'       : int64   (T,)
            'old_log_probs' : float32 (T,)
            'returns'       : float32 (T,)
            'advantages'    : float32 (T,)

        Returns
        -------
        float : mean total loss over all epochs
        """
        states_t        = torch.tensor(rollout_buffer['states'],        dtype=torch.float32, device=self.device)
        actions_t       = torch.tensor(rollout_buffer['actions'],       dtype=torch.long,    device=self.device)
        old_log_probs_t = torch.tensor(rollout_buffer['old_log_probs'], dtype=torch.float32, device=self.device)
        returns_t       = torch.tensor(rollout_buffer['returns'],       dtype=torch.float32, device=self.device)
        advantages_t    = torch.tensor(rollout_buffer['advantages'],    dtype=torch.float32, device=self.device)

        # Normalize advantages for training stability
        advantages_t = (advantages_t - advantages_t.mean()) / (advantages_t.std() + 1e-8)

        total_loss = 0.0

        for _ in range(self.config.PPO_EPOCHS):
            # Evaluate current policy on stored transitions
            new_log_probs, values, entropy = self.ac.evaluate_action(states_t, actions_t)

            # Probability ratio: π_new / π_old
            ratio = torch.exp(new_log_probs - old_log_probs_t)

            # Clipped surrogate objective
            surr1 = ratio * advantages_t
            surr2 = torch.clamp(
                ratio,
                1.0 - self.config.PPO_CLIP_EPSILON,
                1.0 + self.config.PPO_CLIP_EPSILON,
            ) * advantages_t
            policy_loss = -torch.min(surr1, surr2).mean()

            # Value function loss (MSE)
            value_loss = F.mse_loss(values, returns_t)

            # Combined loss with entropy bonus
            loss = (
                policy_loss
                + self.config.PPO_VALUE_COEF  * value_loss
                - self.config.PPO_ENTROPY_COEF * entropy
            )

            self.optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.ac.parameters(), max_norm=0.5)
            self.optimizer.step()

            total_loss += loss.item()

        return total_loss / self.config.PPO_EPOCHS

    def get_value(self, state: np.ndarray) -> float:
        """
        Return the critic's value estimate for a single state.

        Parameters
        ----------
        state : float32 numpy array

        Returns
        -------
        float scalar
        """
        state_t = torch.tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0)
        with torch.no_grad():
            _, value = self.ac(state_t)
        return value.item()

    def select_action(
        self, state: np.ndarray
    ) -> Tuple[int, float, float]:
        """
        Sample an action (with gradient tracking disabled for inference).

        Parameters
        ----------
        state : float32 numpy array

        Returns
        -------
        (action int, log_prob float, value float)
        """
        state_t = torch.tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0)
        with torch.no_grad():
            action_t, log_prob_t, _ = self.ac.get_action(state_t)
            _, value_t = self.ac(state_t)
        return int(action_t.item()), float(log_prob_t.item()), float(value_t.item())

    def select_action_greedy(self, state: np.ndarray) -> int:
        """
        Deterministic (greedy) action selection for evaluation.

        Parameters
        ----------
        state : float32 numpy array

        Returns
        -------
        int action index (argmax of action probabilities)
        """
        state_t = torch.tensor(state, dtype=torch.float32, device=self.device).unsqueeze(0)
        with torch.no_grad():
            action_probs, _ = self.ac(state_t)
        return int(action_probs.argmax(dim=1).item())

    def save(self, path: str) -> None:
        """Persist actor-critic weights to disk."""
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else '.', exist_ok=True)
        torch.save(self.ac.state_dict(), path)
        print(f"[PPOAgent] Model saved -> {path}")

    def load(self, path: str) -> None:
        """Load actor-critic weights from disk."""
        state_dict = torch.load(path, map_location=self.device)
        self.ac.load_state_dict(state_dict)
        self.ac.eval()
        print(f"[PPOAgent] Model loaded <- {path}")
