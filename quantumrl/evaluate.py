"""
evaluate.py
-----------
Evaluation script for QuantumRL.

Loads pre-trained DQN and PPO models, evaluates them on a held-out test
set of random target statevectors, and reports:
  - Mean fidelity achieved
  - Success rate (fidelity > 0.99)
  - Mean gate count used

A comparison bar chart is also saved.

Run with:
    python evaluate.py
"""

import os
import sys

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from dqn_agent import DQNAgent
from ppo_agent import PPOAgent
from quantum_env import QuantumCircuitEnv
from utils import generate_target_states


# ─────────────────────────────────────────────────────────
# Evaluation helper
# ─────────────────────────────────────────────────────────

def evaluate_dqn(agent: DQNAgent, env: QuantumCircuitEnv, test_states, config: Config):
    """
    Run greedy evaluation of a DQN agent on every test state.

    Parameters
    ----------
    agent       : trained DQNAgent
    env         : QuantumCircuitEnv instance
    test_states : list of target statevectors
    config      : Config dataclass

    Returns
    -------
    dict with keys 'fidelities', 'gate_counts', 'successes'
    """
    # Greedy evaluation: epsilon = 0
    original_epsilon = agent.epsilon
    agent.epsilon = 0.0

    fidelities   = []
    gate_counts  = []
    successes    = []

    for target_sv in test_states:
        obs, _ = env.reset(target_sv=target_sv)
        done = False
        final_fidelity = 0.0
        final_steps    = 0

        while not done:
            action = agent.select_action(obs)
            obs, _, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            final_fidelity = info['fidelity']
            final_steps    = info['steps']

        fidelities.append(final_fidelity)
        gate_counts.append(final_steps)
        successes.append(float(final_fidelity > config.FIDELITY_THRESHOLD))

    agent.epsilon = original_epsilon   # Restore epsilon

    return {
        'fidelities':  fidelities,
        'gate_counts': gate_counts,
        'successes':   successes,
    }


def evaluate_ppo(agent: PPOAgent, env: QuantumCircuitEnv, test_states, config: Config):
    """
    Run greedy evaluation of a PPO agent on every test state.

    Parameters
    ----------
    agent       : trained PPOAgent
    env         : QuantumCircuitEnv instance
    test_states : list of target statevectors
    config      : Config dataclass

    Returns
    -------
    dict with keys 'fidelities', 'gate_counts', 'successes'
    """
    fidelities   = []
    gate_counts  = []
    successes    = []

    for target_sv in test_states:
        obs, _ = env.reset(target_sv=target_sv)
        done = False
        final_fidelity = 0.0
        final_steps    = 0

        while not done:
            action = agent.select_action_greedy(obs)
            obs, _, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            final_fidelity = info['fidelity']
            final_steps    = info['steps']

        fidelities.append(final_fidelity)
        gate_counts.append(final_steps)
        successes.append(float(final_fidelity > config.FIDELITY_THRESHOLD))

    return {
        'fidelities':  fidelities,
        'gate_counts': gate_counts,
        'successes':   successes,
    }


# ─────────────────────────────────────────────────────────
# Comparison plot
# ─────────────────────────────────────────────────────────

def plot_comparison(
    dqn_results: dict,
    ppo_results: dict,
    save_path: str,
) -> None:
    """
    Save a three-metric grouped bar chart comparing DQN vs. PPO.

    Metrics: Mean Fidelity, Success Rate (%), Mean Gate Count
    """
    os.makedirs(os.path.dirname(save_path) if os.path.dirname(save_path) else '.', exist_ok=True)

    metrics = ['Mean Fidelity', 'Success Rate (%)', 'Mean Gate Count']

    dqn_vals = [
        float(np.mean(dqn_results['fidelities'])),
        float(np.mean(dqn_results['successes'])) * 100.0,
        float(np.mean(dqn_results['gate_counts'])),
    ]
    ppo_vals = [
        float(np.mean(ppo_results['fidelities'])),
        float(np.mean(ppo_results['successes'])) * 100.0,
        float(np.mean(ppo_results['gate_counts'])),
    ]

    fig, axes = plt.subplots(1, 3, figsize=(14, 5))
    fig.patch.set_facecolor('#1a1a2e')
    fig.suptitle('DQN vs PPO — Evaluation Comparison', color='white', fontsize=14, fontweight='bold')

    colors_dqn = '#e94560'
    colors_ppo = '#0f9b8e'

    for ax, metric, dv, pv in zip(axes, metrics, dqn_vals, ppo_vals):
        ax.set_facecolor('#16213e')
        bars = ax.bar(['DQN', 'PPO'], [dv, pv], color=[colors_dqn, colors_ppo],
                      width=0.5, edgecolor='white', linewidth=0.6)

        # Value labels on bars
        for bar, val in zip(bars, [dv, pv]):
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 0.01 * max(dv, pv, 1),
                f'{val:.3f}',
                ha='center', va='bottom', color='white', fontsize=11, fontweight='bold',
            )

        ax.set_title(metric, color='white', fontsize=11, fontweight='bold')
        ax.set_ylabel(metric, color='#aaaaaa', fontsize=9)
        ax.tick_params(colors='#aaaaaa')
        ax.spines['bottom'].set_color('#444')
        ax.spines['top'].set_color('#444')
        ax.spines['left'].set_color('#444')
        ax.spines['right'].set_color('#444')
        ax.set_ylim(0, max(dv, pv) * 1.25 + 0.01)
        ax.grid(True, axis='y', alpha=0.2, color='#444')

    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"[evaluate] Comparison chart saved -> {save_path}")


# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────

def run_evaluation(config: Config) -> None:
    """
    Load saved models and run full evaluation on held-out test states.

    Parameters
    ----------
    config : Config dataclass instance
    """
    # ── Held-out test states ──────────────────────────────
    # Use a seed that is guaranteed different from both the training seed
    # (config.SEED) and the fixed offset that was used before, so results
    # vary meaningfully across different trained models.
    import time
    test_seed = int(time.time()) % 100000   # fresh seed each run
    print(f"[evaluate] Generating {config.NUM_TEST_STATES} test states (seed={test_seed}) ...")
    test_states = generate_target_states(
        config.NUM_QUBITS, config.NUM_TEST_STATES, seed=test_seed
    )

    env = QuantumCircuitEnv(config)
    obs_size    = env.observation_space.shape[0]
    action_size = env.action_space.n

    # ── Load DQN ──────────────────────────────────────────
    if not os.path.exists(config.DQN_MODEL_PATH):
        raise FileNotFoundError(
            f"DQN model not found at {config.DQN_MODEL_PATH}. "
            "Run train_dqn.py first."
        )

    dqn_agent = DQNAgent(obs_size, action_size, config)
    dqn_agent.load(config.DQN_MODEL_PATH)

    # ── Load PPO ──────────────────────────────────────────
    if not os.path.exists(config.PPO_MODEL_PATH):
        raise FileNotFoundError(
            f"PPO model not found at {config.PPO_MODEL_PATH}. "
            "Run train_ppo.py first."
        )

    ppo_agent = PPOAgent(obs_size, action_size, config)
    ppo_agent.load(config.PPO_MODEL_PATH)

    # -- Evaluate DQN --------------------------------------
    print("\n[evaluate] Evaluating DQN ...")
    dqn_results = evaluate_dqn(dqn_agent, env, test_states, config)

    dqn_mean_fid   = float(np.mean(dqn_results['fidelities']))
    dqn_success    = float(np.mean(dqn_results['successes'])) * 100.0
    dqn_mean_gates = float(np.mean(dqn_results['gate_counts']))
    dqn_median_fid = float(np.median(dqn_results['fidelities']))

    print(f"\n  +-- DQN Results ({config.NUM_TEST_STATES} test states) ----------------+")
    print(f"  |  Mean Fidelity   : {dqn_mean_fid:.4f}                         |")
    print(f"  |  Median Fidelity : {dqn_median_fid:.4f}                         |")
    print(f"  |  Success Rate    : {dqn_success:.1f}%                           |")
    print(f"  |  Mean Gate Count : {dqn_mean_gates:.2f}                          |")
    print(f"  +--------------------------------------------+")
    print(f"  Per-state fidelities:")
    for i, f in enumerate(dqn_results['fidelities']):
        bar = '█' * int(f * 20)
        print(f"    [{i+1:2d}] {f:.4f}  {bar}")

    # -- Evaluate PPO --------------------------------------
    print("\n[evaluate] Evaluating PPO ...")
    ppo_results = evaluate_ppo(ppo_agent, env, test_states, config)

    ppo_mean_fid   = float(np.mean(ppo_results['fidelities']))
    ppo_success    = float(np.mean(ppo_results['successes'])) * 100.0
    ppo_mean_gates = float(np.mean(ppo_results['gate_counts']))
    ppo_median_fid = float(np.median(ppo_results['fidelities']))

    print(f"\n  +-- PPO Results ({config.NUM_TEST_STATES} test states) ----------------+")
    print(f"  |  Mean Fidelity   : {ppo_mean_fid:.4f}                         |")
    print(f"  |  Median Fidelity : {ppo_median_fid:.4f}                         |")
    print(f"  |  Success Rate    : {ppo_success:.1f}%                           |")
    print(f"  |  Mean Gate Count : {ppo_mean_gates:.2f}                          |")
    print(f"  +--------------------------------------------+")
    print(f"  Per-state fidelities:")
    for i, f in enumerate(ppo_results['fidelities']):
        bar = '█' * int(f * 20)
        print(f"    [{i+1:2d}] {f:.4f}  {bar}")

    # -- Comparison plot -----------------------------------
    os.makedirs(config.PLOT_DIR, exist_ok=True)
    plot_comparison(
        dqn_results,
        ppo_results,
        os.path.join(config.PLOT_DIR, 'evaluation_comparison.png'),
    )

    print("\n[evaluate] Done.")


# ─────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────

if __name__ == '__main__':
    cfg = Config()
    run_evaluation(cfg)
