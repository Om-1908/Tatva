"""
tatva_synthesize.py
-------------------
TATVA Dual Quantum Circuit Synthesizer (Parallel DQN + PPO Benchmark & Winner Selection)

Executes DQN and PPO synthesis pipelines simultaneously in parallel processes for a given
target statevector, compares both optimized gate sequences, and returns the WINNER
based on fidelity, minimal gate count, circuit depth, and execution speed.

Supports 1, 2, 3, 4, and 5 Qubit systems.

Usage:
------
  1. Interactive mode (Terminal interface):
         python tatva_synthesize.py

  2. Command line interface (CLI mode):
         python tatva_synthesize.py --qubits 5 --target random
         python tatva_synthesize.py --qubits 5 --target ghz
"""

import argparse
import io
import math
import os
import sys
import time
import warnings

# Suppress all Python/PyTorch deprecation & future warnings globally
os.environ["PYTHONWARNINGS"] = "ignore"
warnings.filterwarnings("ignore")

from concurrent.futures import ProcessPoolExecutor
from typing import Dict, List, Optional, Tuple

# Reconfigure stdout / stderr encoding to utf-8 if supported
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import numpy as np
import torch

# Resolve quantumrl path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
QUANTUMRL_DIR = os.path.join(SCRIPT_DIR, 'quantumrl')
if QUANTUMRL_DIR not in sys.path:
    sys.path.insert(0, QUANTUMRL_DIR)

from ppo_synthesize import parse_statevector, run_ppo_synthesis
from dqn_synthesize import run_dqn_synthesis


def _worker_dqn(target_sv: np.ndarray, n_qubits: int, budget: int, target_fidelity: float) -> Tuple[Dict, str]:
    """Worker task to run DQN synthesis in an isolated process with captured stdout."""
    warnings.filterwarnings("ignore")
    buffer = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = buffer
    try:
        res = run_dqn_synthesis(target_sv, n_qubits, budget, target_fidelity)
    finally:
        sys.stdout = old_stdout

    res_clean = {k: v for k, v in res.items() if k != 'qiskit_circuit'}
    return res_clean, buffer.getvalue()


def _worker_ppo(target_sv: np.ndarray, n_qubits: int, budget: int, target_fidelity: float) -> Tuple[Dict, str]:
    """Worker task to run PPO synthesis in an isolated process with captured stdout."""
    warnings.filterwarnings("ignore")
    buffer = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = buffer
    try:
        res = run_ppo_synthesis(target_sv, n_qubits, budget, target_fidelity)
    finally:
        sys.stdout = old_stdout

    res_clean = {k: v for k, v in res.items() if k != 'qiskit_circuit'}
    return res_clean, buffer.getvalue()


def decide_winner(dqn_res: Dict, ppo_res: Dict, target_fidelity: float) -> Tuple[str, str, Dict]:
    """
    Compare DQN and PPO results and determine the winning model.
    Criteria:
      1. Target Fidelity Check: Must reach target threshold.
      2. Least Final Optimized Gate Count (primary efficiency metric).
      3. Minimum Circuit Depth (secondary efficiency metric).
      4. Highest Verified Fidelity (precision metric).
      5. Fastest Search & Optimization Time (speed metric).
    """
    dqn_fid = dqn_res.get('final_fidelity', 0.0)
    ppo_fid = ppo_res.get('final_fidelity', 0.0)

    dqn_passes = (dqn_fid >= target_fidelity)
    ppo_passes = (ppo_fid >= target_fidelity)

    if dqn_passes and not ppo_passes:
        return 'DQN Agent', "DQN achieved target fidelity threshold while PPO fell short.", dqn_res
    elif ppo_passes and not dqn_passes:
        return 'PPO Agent', "PPO achieved target fidelity threshold while DQN fell short.", ppo_res

    # Both passed (or both fell short): Compare gate counts
    dqn_gates = dqn_res.get('final_gate_count', 999)
    ppo_gates = ppo_res.get('final_gate_count', 999)

    if dqn_gates < ppo_gates:
        return 'DQN Agent', f"DQN produced fewer optimized gates ({dqn_gates} vs {ppo_gates}).", dqn_res
    elif ppo_gates < dqn_gates:
        return 'PPO Agent', f"PPO produced fewer optimized gates ({ppo_gates} vs {dqn_gates}).", ppo_res

    # Tie on gate count: Compare circuit depth
    dqn_depth = dqn_res.get('circuit_depth', 999)
    ppo_depth = ppo_res.get('circuit_depth', 999)

    if dqn_depth < ppo_depth:
        return 'DQN Agent', f"DQN achieved smaller circuit depth ({dqn_depth} vs {ppo_depth}).", dqn_res
    elif ppo_depth < dqn_depth:
        return 'PPO Agent', f"PPO achieved smaller circuit depth ({ppo_depth} vs {dqn_depth}).", ppo_res

    # Tie on depth: Compare precision fidelity
    if abs(dqn_fid - ppo_fid) > 1e-8:
        if dqn_fid > ppo_fid:
            return 'DQN Agent', f"DQN achieved higher fidelity ({dqn_fid:.10f} vs {ppo_fid:.10f}).", dqn_res
        else:
            return 'PPO Agent', f"PPO achieved higher fidelity ({ppo_fid:.10f} vs {dqn_fid:.10f}).", ppo_res

    # Tie on fidelity: Compare search time
    dqn_time = dqn_res.get('search_time_seconds', 999.0)
    ppo_time = ppo_res.get('search_time_seconds', 999.0)

    if dqn_time < ppo_time:
        return 'DQN Agent', f"DQN completed synthesis faster ({dqn_time:.2f}s vs {ppo_time:.2f}s).", dqn_res
    elif ppo_time < dqn_time:
        return 'PPO Agent', f"PPO completed synthesis faster ({ppo_time:.2f}s vs {dqn_time:.2f}s).", ppo_res

    return 'TIE (DQN & PPO)', "Both models produced identical gate count, depth, and fidelity performance.", dqn_res


def main():
    parser = argparse.ArgumentParser(
        description="TATVA Dual Quantum Circuit Synthesizer (Parallel DQN + PPO Comparison)"
    )
    parser.add_argument(
        "-q", "--qubits", type=int, choices=[1, 2, 3, 4, 5], default=None,
        help="Number of qubits (1, 2, 3, 4, or 5). Interactive prompt if omitted."
    )
    parser.add_argument(
        "-t", "--target", type=str, default=None,
        help="Target statevector: preset name ('bell', 'ghz', 'plus', etc.) or comma-separated amplitudes or 'random'."
    )
    parser.add_argument(
        "-b", "--budget", type=int, default=30,
        help="Number of policy candidate rollouts per agent (default: 30)."
    )
    parser.add_argument(
        "-f", "--fidelity-threshold", type=float, default=None,
        help="Target fidelity threshold (default: 0.999 for 1Q, 0.999999 for 2Q/3Q/4Q/5Q)."
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="Print raw per-attempt execution logs from both DQN and PPO models."
    )

    args = parser.parse_args()

    # CLI mode vs Interactive Terminal mode
    if args.target is not None:
        target_str = args.target
        n_qubits = args.qubits
    else:
        print("\n" + "=" * 74)
        print("    WELCOME TO TATVA DUAL QUANTUM CIRCUIT SYNTHESIZER (DQN + PPO)")
        print("=" * 74)

        if args.qubits is None:
            print(" Select System:")
            print("   1) 1-Qubit System")
            print("   2) 2-Qubit System")
            print("   3) 3-Qubit System")
            print("   4) 4-Qubit System")
            print("   5) 5-Qubit System")
            q_choice = input(" Choice [1-5, default: 5]: ").strip()
            if q_choice in ('1', '2', '3', '4', '5'):
                n_qubits = int(q_choice)
            else:
                n_qubits = 5
        else:
            n_qubits = args.qubits

        print(f"\n Enter Target Statevector for {n_qubits}-Qubit System.")
        if n_qubits == 1:
            print(" Presets : 'plus', 'minus', 'zero', 'one', 'i_state', 'random'")
        elif n_qubits == 2:
            print(" Presets : 'bell', 'phi_plus', 'phi_minus', 'psi_plus', 'psi_minus', 'zero', 'plus', 'random'")
        else:
            print(" Presets : 'ghz', 'w_state', 'bell', 'zero', 'plus', 'one', 'random'")

        target_str = input("\n Input Target Statevector: ").strip()
        if not target_str:
            target_str = 'random'
            print(f" [No input provided -> using default 'random']")

    try:
        target_sv, n_qubits = parse_statevector(target_str, n_qubits=n_qubits)
    except Exception as err:
        print(f"\n [ERROR] Failed to parse target statevector: {err}")
        sys.exit(1)

    target_fidelity = args.fidelity_threshold
    if target_fidelity is None:
        target_fidelity = 0.999999 if n_qubits >= 2 else 0.999

    print("\n" + "=" * 74)
    print("          STARTING SIMULTANEOUS DUAL SYNTHESIS (DQN & PPO)")
    print("=" * 74)
    print(f" -> Qubit System    : {n_qubits}-Qubit(s)")
    print(f" -> Target Fidelity : {target_fidelity:.6f}")
    print(f" -> Rollout Budget  : {args.budget} candidates per agent")
    print(" -> Parallel Exec   : Running DQN and PPO simultaneously...", end="", flush=True)

    t_global_start = time.time()

    # Launch DQN and PPO concurrently in process pool
    with ProcessPoolExecutor(max_workers=2) as executor:
        dqn_future = executor.submit(_worker_dqn, target_sv, n_qubits, args.budget, target_fidelity)
        ppo_future = executor.submit(_worker_ppo, target_sv, n_qubits, args.budget, target_fidelity)

        dqn_res, dqn_log = dqn_future.result()
        ppo_res, ppo_log = ppo_future.result()

    t_global_elapsed = time.time() - t_global_start
    print(f" Done! ({t_global_elapsed:.2f}s)")

    # Print raw logs only if verbose flag is set
    if args.verbose:
        print("\n" + "-" * 74)
        print(" [RAW LOG] DQN SYNTHESIS ENGINE OUTPUT")
        print("-" * 74)
        print(dqn_log.strip() if dqn_log.strip() else "[No output]")

        print("\n" + "-" * 74)
        print(" [RAW LOG] PPO SYNTHESIS ENGINE OUTPUT")
        print("-" * 74)
        print(ppo_log.strip() if ppo_log.strip() else "[No output]")

    # Decide Winner
    winner_name, win_reason, winner_res = decide_winner(dqn_res, ppo_res, target_fidelity)

    # Format Comparison Table
    print("\n" + "=" * 78)
    print("              TATVA MODEL COMPARISON & WINNER BENCHMARK")
    print("=" * 78)
    print(f"{'Metric / Property':<28} | {'DQN Agent':<22} | {'PPO Agent':<22}")
    print("-" * 78)

    dqn_fid = dqn_res.get('final_fidelity', 0.0)
    ppo_fid = ppo_res.get('final_fidelity', 0.0)
    dqn_raw = dqn_res.get('raw_gate_count', 0)
    ppo_raw = ppo_res.get('raw_gate_count', 0)
    dqn_opt = dqn_res.get('final_gate_count', 0)
    ppo_opt = ppo_res.get('final_gate_count', 0)
    dqn_dep = dqn_res.get('circuit_depth', 0)
    ppo_dep = ppo_res.get('circuit_depth', 0)
    dqn_ent = dqn_res.get('entangling_gate_count', 0)
    ppo_ent = ppo_res.get('entangling_gate_count', 0)
    dqn_time = dqn_res.get('search_time_seconds', 0.0)
    ppo_time = ppo_res.get('search_time_seconds', 0.0)
    dqn_stat = dqn_res.get('status', 'N/A')
    ppo_stat = ppo_res.get('status', 'N/A')

    print(f"{'Synthesis Status':<28} | {dqn_stat:<22} | {ppo_stat:<22}")
    print(f"{'Final Verified Fidelity':<28} | {f'{dqn_fid:.10f}':<22} | {f'{ppo_fid:.10f}':<22}")
    print(f"{'Raw Gate Count':<28} | {dqn_raw:<22} | {ppo_raw:<22}")
    print(f"{'Final Optimized Gates':<28} | {dqn_opt:<22} | {ppo_opt:<22}")
    print(f"{'Circuit Depth':<28} | {dqn_dep:<22} | {ppo_dep:<22}")
    print(f"{'Entangling Gates (CNOT)':<28} | {dqn_ent:<22} | {ppo_ent:<22}")
    print(f"{'Search & Opt Time (s)':<28} | {f'{dqn_time:.2f}s':<22} | {f'{ppo_time:.2f}s':<22}")
    print("=" * 78)

    print(f"\n *** OVERALL WINNER: {winner_name} ***")
    print(f" Rationale      : {win_reason}")
    print(f" Total Time     : {t_global_elapsed:.2f}s (Concurrent Dual Process Execution)")
    print("-" * 78)

    u3_lines = winner_res.get('u3_display_lines', [])
    decomp_lines = winner_res.get('display_lines', [])

    if not u3_lines and winner_res.get('full_precision_parameters'):
        try:
            from qiskit import QuantumCircuit, transpile
            qc_temp = QuantumCircuit(n_qubits)
            for gname, target, angle in winner_res['full_precision_parameters']:
                g = gname.upper()
                if g == 'H': qc_temp.h(target)
                elif g == 'X': qc_temp.x(target)
                elif g == 'Y': qc_temp.y(target)
                elif g == 'Z': qc_temp.z(target)
                elif g == 'S': qc_temp.s(target)
                elif g in ('SDG', 'SG'): qc_temp.sdg(target)
                elif g == 'T': qc_temp.t(target)
                elif g in ('TDG', 'TG'): qc_temp.tdg(target)
                elif g == 'RX': qc_temp.rx(angle if angle is not None else 0.0, target)
                elif g == 'RY': qc_temp.ry(angle if angle is not None else 0.0, target)
                elif g == 'RZ': qc_temp.rz(angle if angle is not None else 0.0, target)
                elif g in ('CNOT', 'CX'):
                    ctrl, tgt = target if isinstance(target, (tuple, list)) else (0, 1)
                    qc_temp.cx(ctrl, tgt)
                elif g == 'CZ':
                    q1, q2 = target if isinstance(target, (tuple, list)) else (0, 1)
                    qc_temp.cz(q1, q2)
                elif g == 'SWAP':
                    q1, q2 = target if isinstance(target, (tuple, list)) else (0, 1)
                    qc_temp.swap(q1, q2)

            qc_u3 = transpile(qc_temp, optimization_level=3, basis_gates=['u3', 'cx'])
            u3_lines = []
            for idx, inst in enumerate(qc_u3.data, 1):
                gname = inst.operation.name.upper()
                if gname == 'CX':
                    gname = 'CNOT'
                q_indices = [qc_u3.find_bit(q).index for q in inst.qubits]
                q_str = f"q{q_indices[0]}, q{q_indices[1]}" if len(q_indices) == 2 else f"q{q_indices[0]}"
                params = inst.operation.params
                if params:
                    p_str = ", ".join([f"{float(p):+.10f}" for p in params])
                    u3_lines.append(f"{idx:02d}. {gname}({q_str}, [{p_str}])")
                else:
                    u3_lines.append(f"{idx:02d}. {gname}({q_str})")
        except Exception:
            u3_lines = []

    print("\n [WINNING SYNTHESIZED GATE SEQUENCES]:")

    if u3_lines:
        print("\n [1. ABSOLUTE MINIMAL UNIVERSAL U3 GATE REPRESENTATION (Minimal Gates & Depth)]:")
        for line in u3_lines:
            print(f"  {line.replace('θ', 'theta')}")

    if decomp_lines:
        print("\n [2. FULLY DECOMPOSED HARDWARE REPRESENTATION (RZ/RY/RX + CNOT)]:")
        for line in decomp_lines:
            print(f"  {line.replace('θ', 'theta')}")

    if not u3_lines and not decomp_lines:
        print("  [Identity / Empty Circuit]")

    print("=" * 78 + "\n")


if __name__ == '__main__':
    main()
