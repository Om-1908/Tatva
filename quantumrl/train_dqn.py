"""
train_dqn.py
------------
DQN training entry point for QuantumRL.

Run with:
    python train_dqn.py

What happens:
  1. Config is loaded → random seeds are set for reproducibility
  2. Training target statevectors are pre-generated
  3. DQN agent trains for DQN_EPISODES episodes, one target per episode
  4. Model weights, logs, and plots are saved at the end
"""

import os
import random
import sys

import numpy as np
import torch

# Add project root to path so imports resolve correctly when run from any dir
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from dqn_agent import DQNAgent
from quantum_env import QuantumCircuitEnv
from utils import generate_target_states, plot_training_curves, save_logs


def set_seeds(seed: int) -> None:
    """Set all relevant RNG seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_dqn(config: Config) -> None:
    """
    Full DQN training loop.

    Parameters
    ----------
    config : Config dataclass instance
    """
    # ── Reproducibility ───────────────────────────────────
    set_seeds(config.SEED)

    # ── Pre-generate one target state per episode ─────────
    print(f"[DQN] Generating {config.DQN_EPISODES} training target states …")
    target_states = generate_target_states(
        config.NUM_QUBITS, config.DQN_EPISODES, seed=config.SEED
    )

    # ── Environment & agent ───────────────────────────────
    env = QuantumCircuitEnv(config)
    obs_size    = env.observation_space.shape[0]
    action_size = env.action_space.n

    print(f"[DQN] obs_size={obs_size}  action_size={action_size}")
    agent = DQNAgent(obs_size, action_size, config)

    # ── Training log buffers ──────────────────────────────
    episode_rewards    = []
    episode_fidelities = []
    episode_steps      = []

    print(f"[DQN] Starting training for {config.DQN_EPISODES} episodes …\n")

    for episode in range(config.DQN_EPISODES):
        # Each episode uses a fresh, unique target state
        obs, _ = env.reset(target_sv=target_states[episode])
        episode_reward = 0.0
        done = False
        info = {'fidelity': 0.0, 'steps': 0}

        # ── Episode loop ──────────────────────────────────
        while not done:
            action = agent.select_action(obs)
            next_obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            agent.buffer.push(obs, action, reward, next_obs, float(done))
            agent.update()          # Returns loss (ignored for brevity)

            obs = next_obs
            episode_reward += reward

        # ── Per-episode bookkeeping ───────────────────────
        agent.decay_epsilon()

        if episode % config.DQN_TARGET_UPDATE_FREQ == 0:
            agent.update_target()

        episode_rewards.append(episode_reward)
        episode_fidelities.append(info['fidelity'])
        episode_steps.append(info['steps'])

        # ── Console logging every 100 episodes ───────────
        if (episode + 1) % 100 == 0:
            mean_fid = float(np.mean(episode_fidelities[-100:]))
            print(
                f"Episode {episode + 1:4d} | "
                f"Reward: {episode_reward:7.3f} | "
                f"Fidelity: {info['fidelity']:.4f} | "
                f"Steps: {info['steps']:2d} | "
                f"Epsilon: {agent.epsilon:.3f} | "
                f"Mean Fid (100): {mean_fid:.4f}"
            )

    # ── Save model ────────────────────────────────────────
    os.makedirs(os.path.dirname(config.DQN_MODEL_PATH), exist_ok=True)
    agent.save(config.DQN_MODEL_PATH)

    # ── Save logs ─────────────────────────────────────────
    os.makedirs(config.LOG_DIR, exist_ok=True)
    save_logs(
        {
            'rewards':    episode_rewards,
            'fidelities': episode_fidelities,
            'steps':      episode_steps,
        },
        os.path.join(config.LOG_DIR, 'dqn_logs.json'),
    )

    # ── Plot training curves ──────────────────────────────
    os.makedirs(config.PLOT_DIR, exist_ok=True)
    plot_training_curves(
        episode_rewards,
        episode_fidelities,
        episode_steps,
        os.path.join(config.PLOT_DIR, 'dqn_training.png'),
    )

    # ── Final summary ─────────────────────────────────────
    final_mean_fidelity = float(np.mean(episode_fidelities[-100:]))
    print(f"\n[DQN] Training complete.")
    print(f"[DQN] Final 100-episode mean fidelity: {final_mean_fidelity:.4f}")


# ─────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    cfg = Config()
    train_dqn(cfg)
