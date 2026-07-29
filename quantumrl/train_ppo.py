"""
train_ppo.py
------------
PPO training entry point for QuantumRL.

Run with:
    python train_ppo.py

What happens:
  1. Config is loaded → random seeds are set
  2. Training target states are pre-generated
  3. A rollout of PPO_ROLLOUT_STEPS environment steps is collected
  4. GAE advantages are computed; the actor-critic is updated
  5. This repeats until PPO_EPISODES total episodes have completed
  6. Model, logs, and plots are saved at the end
"""

import os
import random
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from ppo_agent import PPOAgent
from quantum_env import QuantumCircuitEnv
from utils import generate_target_states, plot_training_curves, save_logs


def set_seeds(seed: int) -> None:
    """Set all relevant RNG seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train_ppo(config: Config) -> None:
    """
    Full PPO training loop with rollout-based updates.

    Parameters
    ----------
    config : Config dataclass instance
    """
    # ── Reproducibility ───────────────────────────────────
    set_seeds(config.SEED)

    # -- Pre-generate target states ------------------------
    print(f"[PPO] Generating {config.PPO_EPISODES} training target states ...")
    target_states = generate_target_states(
        config.NUM_QUBITS, config.PPO_EPISODES, seed=config.SEED
    )

    # -- Environment & agent -------------------------------
    env = QuantumCircuitEnv(config)
    obs_size    = env.observation_space.shape[0]
    action_size = env.action_space.n

    print(f"[PPO] obs_size={obs_size}  action_size={action_size}")
    agent = PPOAgent(obs_size, action_size, config)

    # -- Training log buffers ------------------------------
    episode_rewards    = []
    episode_fidelities = []
    episode_steps      = []

    # -- Rollout buffer (cleared after each update) --------
    rollout_states     = []
    rollout_actions    = []
    rollout_log_probs  = []
    rollout_rewards    = []
    rollout_dones      = []
    rollout_values     = []

    # -- Episode tracking state ----------------------------
    episode         = 0
    episode_reward  = 0.0
    last_fidelity   = 0.0
    last_steps      = 0

    target_sv = target_states[episode % config.PPO_EPISODES]
    obs, _    = env.reset(target_sv=target_sv)

    rollout_step_count = 0    # steps collected in the current rollout window

    print(f"[PPO] Starting training for {config.PPO_EPISODES} episodes ...\n")

    while episode < config.PPO_EPISODES:
        # ── Collect one rollout of PPO_ROLLOUT_STEPS steps ─
        for _ in range(config.PPO_ROLLOUT_STEPS):
            action, log_prob, value = agent.select_action(obs)
            next_obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            rollout_states.append(obs)
            rollout_actions.append(action)
            rollout_log_probs.append(log_prob)
            rollout_rewards.append(reward)
            rollout_dones.append(float(done))
            rollout_values.append(value)

            obs = next_obs
            episode_reward += reward
            rollout_step_count += 1

            last_fidelity = info['fidelity']
            last_steps    = info['steps']

            if done:
                # Record completed episode
                episode_rewards.append(episode_reward)
                episode_fidelities.append(last_fidelity)
                episode_steps.append(last_steps)

                if (episode + 1) % 100 == 0:
                    mean_fid = float(np.mean(episode_fidelities[-100:]))
                    print(
                        f"Episode {episode + 1:4d} | "
                        f"Reward: {episode_reward:7.3f} | "
                        f"Fidelity: {last_fidelity:.4f} | "
                        f"Steps: {last_steps:2d} | "
                        f"Mean Fid (100): {mean_fid:.4f}"
                    )

                episode += 1
                episode_reward = 0.0

                if episode >= config.PPO_EPISODES:
                    break

                # Start the next episode with its own target state
                target_sv = target_states[episode % config.PPO_EPISODES]
                obs, _    = env.reset(target_sv=target_sv)

        # ── Bootstrap value for GAE ───────────────────────
        next_value = agent.get_value(obs)

        # ── Compute GAE advantages and returns ────────────
        advantages, returns = agent.compute_gae(
            rollout_rewards,
            rollout_values,
            rollout_dones,
            next_value,
        )

        # ── Build rollout buffer dict for update ──────────
        rollout_buffer = {
            'states':        np.array(rollout_states,    dtype=np.float32),
            'actions':       np.array(rollout_actions,   dtype=np.int64),
            'old_log_probs': np.array(rollout_log_probs, dtype=np.float32),
            'returns':       returns,
            'advantages':    advantages,
        }

        agent.update(rollout_buffer)

        # ── Clear rollout buffers ─────────────────────────
        rollout_states.clear()
        rollout_actions.clear()
        rollout_log_probs.clear()
        rollout_rewards.clear()
        rollout_dones.clear()
        rollout_values.clear()
        rollout_step_count = 0

    # ── Save model ─────────────────────────────────────────
    os.makedirs(os.path.dirname(config.PPO_MODEL_PATH), exist_ok=True)
    agent.save(config.PPO_MODEL_PATH)

    # ── Save logs ──────────────────────────────────────────
    os.makedirs(config.LOG_DIR, exist_ok=True)
    save_logs(
        {
            'rewards':    episode_rewards,
            'fidelities': episode_fidelities,
            'steps':      episode_steps,
        },
        os.path.join(config.LOG_DIR, 'ppo_logs.json'),
    )

    # ── Plot training curves ───────────────────────────────
    os.makedirs(config.PLOT_DIR, exist_ok=True)
    plot_training_curves(
        episode_rewards,
        episode_fidelities,
        episode_steps,
        os.path.join(config.PLOT_DIR, 'ppo_training.png'),
    )

    # ── Final summary ──────────────────────────────────────
    final_mean_fidelity = float(np.mean(episode_fidelities[-100:]))
    print(f"\n[PPO] Training complete.")
    print(f"[PPO] Final 100-episode mean fidelity: {final_mean_fidelity:.4f}")


# ─────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    cfg = Config()
    train_ppo(cfg)
