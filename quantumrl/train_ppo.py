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
from collections import Counter

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from ppo_agent import PPOAgent
from quantum_env import QuantumCircuitEnv
from utils import (
    generate_curriculum_pool,
    generate_target_states,
    load_logs,
    plot_training_curves,
    save_logs,
)


def _print_curriculum_fidelity_stats(
    per_target_fidelities: dict[int, list[float]],
    label: str,
) -> None:
    """Print min/max/mean of per-pool-target mean fidelities."""
    per_target_means = [
        float(np.mean(fids))
        for fids in per_target_fidelities.values()
        if fids
    ]
    if not per_target_means:
        return
    pool_min = float(np.min(per_target_means))
    pool_max = float(np.max(per_target_means))
    pool_mean = float(np.mean(per_target_means))
    print(f"[{label}] Curriculum pool per-target fidelity — "
          f"min: {pool_min:.4f} | max: {pool_max:.4f} | mean: {pool_mean:.4f}")


def _print_fidelity_delta(log_path: str, current_mean: float, label: str) -> None:
    """Compare final 100-episode mean fidelity against a previous log file."""
    if not os.path.exists(log_path):
        return
    prev_logs = load_logs(log_path)
    prev_fidelities = prev_logs.get('fidelities', [])
    if not prev_fidelities:
        return
    window = prev_fidelities[-100:]
    prev_mean = float(np.mean(window))
    delta = current_mean - prev_mean
    sign = '+' if delta >= 0 else ''
    print(
        f"[{label}] Previous: {prev_mean:.4f} | "
        f"Current: {current_mean:.4f} | "
        f"Delta: {sign}{delta:.4f}"
    )


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

    if os.path.exists(config.PPO_MODEL_PATH):
        print(
            f"[PPO] WARNING: Existing model at '{config.PPO_MODEL_PATH}' "
            "will be overwritten by this run."
        )

    # -- Target sampling: curriculum pool or per-episode random -------------
    curriculum_pool = None
    target_states = None
    if config.CURRICULUM_ENABLED:
        curriculum_pool = generate_curriculum_pool(
            config.CURRICULUM_POOL_SIZE, config.NUM_QUBITS, config.SEED
        )
        print(
            f"[PPO] Curriculum mode active — sampling from a fixed pool of "
            f"{config.CURRICULUM_POOL_SIZE} target states (with replacement)"
        )
    else:
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
    action_counts      = Counter()
    per_target_fidelities: dict[int, list[float]] = {}

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

    pool_idx = None
    if config.CURRICULUM_ENABLED:
        pool_idx = random.randint(0, len(curriculum_pool) - 1)
        target_sv = curriculum_pool[pool_idx]
    else:
        target_sv = target_states[episode % config.PPO_EPISODES]
    obs, _ = env.reset(target_sv=target_sv)

    rollout_step_count = 0    # steps collected in the current rollout window

    print(f"[PPO] Starting training for {config.PPO_EPISODES} episodes ...\n")

    while episode < config.PPO_EPISODES:
        # ── Collect one rollout of PPO_ROLLOUT_STEPS steps ─
        for _ in range(config.PPO_ROLLOUT_STEPS):
            action, log_prob, value = agent.select_action(obs)
            action_counts[action] += 1
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
                if config.CURRICULUM_ENABLED:
                    per_target_fidelities.setdefault(pool_idx, []).append(last_fidelity)

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

                # Start the next episode with a target state
                if config.CURRICULUM_ENABLED:
                    pool_idx = random.randint(0, len(curriculum_pool) - 1)
                    target_sv = curriculum_pool[pool_idx]
                else:
                    pool_idx = None
                    target_sv = target_states[episode % config.PPO_EPISODES]
                obs, _ = env.reset(target_sv=target_sv)

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

    # ── Final summary (before overwriting logs) ───────────
    final_mean_fidelity = float(np.mean(episode_fidelities[-100:]))
    log_path = os.path.join(config.LOG_DIR, 'ppo_logs.json')
    _print_fidelity_delta(log_path, final_mean_fidelity, 'PPO')

    # ── Save logs ──────────────────────────────────────────
    os.makedirs(config.LOG_DIR, exist_ok=True)
    logs_dict = {
        'rewards':    episode_rewards,
        'fidelities': episode_fidelities,
        'steps':      episode_steps,
    }
    if config.CURRICULUM_ENABLED:
        logs_dict['curriculum_per_target_fidelities'] = {
            str(idx): fids for idx, fids in per_target_fidelities.items()
        }
    save_logs(logs_dict, log_path)

    # ── Plot training curves ───────────────────────────────
    os.makedirs(config.PLOT_DIR, exist_ok=True)
    plot_training_curves(
        episode_rewards,
        episode_fidelities,
        episode_steps,
        os.path.join(config.PLOT_DIR, 'ppo_training.png'),
    )

    print(f"\n[PPO] Training complete.")
    print(f"[PPO] Final 100-episode mean fidelity: {final_mean_fidelity:.4f}")

    if config.CURRICULUM_ENABLED:
        _print_curriculum_fidelity_stats(per_target_fidelities, 'PPO')

    if config.LOG_ACTION_HISTOGRAM:
        used_count = sum(1 for i in range(action_size) if action_counts.get(i, 0) > 0)
        least_used = sorted(
            ((i, action_counts.get(i, 0)) for i in range(action_size)),
            key=lambda x: (x[1], x[0]),
        )[:5]
        print(
            f"[PPO] Action usage: {used_count}/{action_size} actions "
            "used at least once"
        )
        print("[PPO] 5 least-used action indices:")
        for idx, count in least_used:
            print(f"  action {idx}: {count}")


# ─────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    cfg = Config()
    train_ppo(cfg)
