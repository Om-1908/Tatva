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
from collections import Counter

import numpy as np
import torch

# Add project root to path so imports resolve correctly when run from any dir
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from dqn_agent import DQNAgent
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


def train_dqn(config: Config) -> None:
    """
    Full DQN training loop.

    Parameters
    ----------
    config : Config dataclass instance
    """
    # ── Reproducibility ───────────────────────────────────
    set_seeds(config.SEED)

    if os.path.exists(config.DQN_MODEL_PATH):
        print(
            f"[DQN] WARNING: Existing model at '{config.DQN_MODEL_PATH}' "
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
            f"[DQN] Curriculum mode active — sampling from a fixed pool of "
            f"{config.CURRICULUM_POOL_SIZE} target states (with replacement)"
        )
    else:
        print(f"[DQN] Generating {config.DQN_EPISODES} training target states ...")
        target_states = generate_target_states(
            config.NUM_QUBITS, config.DQN_EPISODES, seed=config.SEED
        )

    # -- Environment & agent -------------------------------
    env = QuantumCircuitEnv(config)
    obs_size    = env.observation_space.shape[0]   # 4*2^n_qubits + 2
    action_size = env.action_space.n

    print(f"[DQN] obs_size={obs_size}  action_size={action_size}")
    agent = DQNAgent(obs_size, action_size, config)
    print(f"[DQN] Training device: {agent.device}")

    # -- Replay buffer warm-up (5000 random transitions) ---
    # Ensures the first gradient update sees diverse uncorrelated experiences
    # rather than highly correlated early-episode transitions.
    print("[DQN] Warming up replay buffer with 5000 random transitions...")
    warmup_obs, _ = env.reset()
    for _wu in range(5000):
        warmup_action = env.action_space.sample()
        warmup_next_obs, warmup_reward, warmup_term, warmup_trunc, _ = env.step(warmup_action)
        agent.buffer.push(warmup_obs, warmup_action, warmup_reward,
                          warmup_next_obs, float(warmup_term or warmup_trunc))
        warmup_obs = warmup_next_obs
        if warmup_term or warmup_trunc:
            warmup_obs, _ = env.reset()
    print(f"[DQN] Warm-up complete. Buffer size: {len(agent.buffer)}")

    # -- Training log buffers ------------------------------
    episode_rewards    = []
    episode_fidelities = []
    episode_steps      = []
    action_counts      = Counter()

    print(f"[DQN] Starting training for {config.DQN_EPISODES} episodes ...\n")

    for episode in range(config.DQN_EPISODES):
        # Fresh random target generated inside env.reset() each episode
        obs, _ = env.reset()
        episode_reward = 0.0
        done = False
        info = {'fidelity': 0.0, 'steps': 0}

        # ── Episode loop ──────────────────────────────────
        while not done:
            action = agent.select_action(obs)
            action_counts[action] += 1
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

    # ── Final summary (before overwriting logs) ───────────
    final_mean_fidelity = float(np.mean(episode_fidelities[-100:]))
    log_path = os.path.join(config.LOG_DIR, 'dqn_logs.json')
    _print_fidelity_delta(log_path, final_mean_fidelity, 'DQN')

    # ── Save logs ─────────────────────────────────────────
    os.makedirs(config.LOG_DIR, exist_ok=True)
    logs_dict = {
        'rewards':    episode_rewards,
        'fidelities': episode_fidelities,
        'steps':      episode_steps,
    }
    save_logs(logs_dict, log_path)

    # ── Plot training curves ──────────────────────────────
    os.makedirs(config.PLOT_DIR, exist_ok=True)
    plot_training_curves(
        episode_rewards,
        episode_fidelities,
        episode_steps,
        os.path.join(config.PLOT_DIR, 'dqn_training.png'),
    )

    print(f"\n[DQN] Training complete.")
    print(f"[DQN] Final 100-episode mean fidelity: {final_mean_fidelity:.4f}")

    if config.LOG_ACTION_HISTOGRAM:
        used_count = sum(1 for i in range(action_size) if action_counts.get(i, 0) > 0)
        least_used = sorted(
            ((i, action_counts.get(i, 0)) for i in range(action_size)),
            key=lambda x: (x[1], x[0]),
        )[:5]
        print(
            f"[DQN] Action usage: {used_count}/{action_size} actions "
            "used at least once"
        )
        print("[DQN] 5 least-used action indices:")
        for idx, count in least_used:
            print(f"  action {idx}: {count}")


# ─────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    cfg = Config()
    train_dqn(cfg)
