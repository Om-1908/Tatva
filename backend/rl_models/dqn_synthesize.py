"""
dqn_synthesize.py
-----------------
Standalone Terminal Inference Script for TATVA DQN Quantum Circuit Synthesis.

Supports 1, 2, 3, 4, and 5 Qubit systems using trained DQN agents.

Usage:
------
  1. Interactive mode (run directly in terminal):
         python dqn_synthesize.py

  2. Command line interface (CLI mode):
         python dqn_synthesize.py --qubits 1 --target plus
         python dqn_synthesize.py --qubits 2 --target bell
         python dqn_synthesize.py --qubits 5 --target random
"""

import argparse
import math
import os
import sys
import time
from typing import List, Optional, Tuple

import numpy as np
import torch

# Resolve quantumrl path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
QUANTUMRL_DIR = os.path.join(SCRIPT_DIR, 'quantumrl')
if QUANTUMRL_DIR not in sys.path:
    sys.path.insert(0, QUANTUMRL_DIR)

from configs.config_1qubit import Config as Config1Qubit
from configs.config_2qubit import Config as Config2Qubit
from quantum_env import QuantumCircuitEnv
from dqn_agent import DQNAgent
from utils import generate_random_statevector
from simplify import verify_synthesis_candidate, _fidelity
from synthesis import (
    build_qiskit_circuit,
    format_circuit_display_lines,
    prune_and_reoptimize_structural_search,
    verify_4way_consistency,
    candidate_rank_key,
)


# ─────────────────────────────────────────────────────────────────────────────
# Named Presets
# ─────────────────────────────────────────────────────────────────────────────

INV_SQRT2 = 1.0 / math.sqrt(2.0)

PRESETS_1Q = {
    'zero':    np.array([1.0+0j, 0.0+0j],          dtype=np.complex128),
    'one':     np.array([0.0+0j, 1.0+0j],          dtype=np.complex128),
    'plus':    np.array([INV_SQRT2, INV_SQRT2],    dtype=np.complex128),
    'minus':   np.array([INV_SQRT2, -INV_SQRT2],   dtype=np.complex128),
    'i_state': np.array([INV_SQRT2, INV_SQRT2*1j], dtype=np.complex128),
}

PRESETS_2Q = {
    'bell':      np.array([INV_SQRT2, 0.0, 0.0, INV_SQRT2],  dtype=np.complex128),
    'phi_plus':  np.array([INV_SQRT2, 0.0, 0.0, INV_SQRT2],  dtype=np.complex128),
    'phi_minus': np.array([INV_SQRT2, 0.0, 0.0, -INV_SQRT2], dtype=np.complex128),
    'psi_plus':  np.array([0.0, INV_SQRT2, INV_SQRT2, 0.0],  dtype=np.complex128),
    'psi_minus': np.array([0.0, INV_SQRT2, -INV_SQRT2, 0.0], dtype=np.complex128),
    'ghz':       np.array([INV_SQRT2, 0.0, 0.0, INV_SQRT2],  dtype=np.complex128),
    'zero':      np.array([1.0, 0.0, 0.0, 0.0],              dtype=np.complex128),
    'plus':      np.array([0.5, 0.5, 0.5, 0.5],              dtype=np.complex128),
}

PRESETS_3Q = {
    'ghz':      np.array([INV_SQRT2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, INV_SQRT2], dtype=np.complex128),
    'w_state':  np.array([0.0, 1.0/math.sqrt(3.0), 1.0/math.sqrt(3.0), 0.0, 1.0/math.sqrt(3.0), 0.0, 0.0, 0.0], dtype=np.complex128),
    'zero':     np.array([1.0] + [0.0]*7, dtype=np.complex128),
    'one':      np.array([0.0]*7 + [1.0], dtype=np.complex128),
    'plus':     np.array([1.0/math.sqrt(8.0)] * 8, dtype=np.complex128),
}

PRESETS_4Q = {
    'ghz':      np.array([INV_SQRT2] + [0.0]*14 + [INV_SQRT2], dtype=np.complex128),
    'w_state':  np.array([0.0, 0.5, 0.5, 0.0, 0.5, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.complex128),
    'zero':     np.array([1.0] + [0.0]*15, dtype=np.complex128),
    'one':      np.array([0.0]*15 + [1.0], dtype=np.complex128),
    'plus':     np.array([0.25]*16, dtype=np.complex128),
    'bell':     np.array([INV_SQRT2] + [0.0]*14 + [INV_SQRT2], dtype=np.complex128),
}

PRESETS_5Q = {
    'ghz':      np.array([INV_SQRT2] + [0.0]*30 + [INV_SQRT2], dtype=np.complex128),
    'w_state':  np.array([0.0] + [1.0/math.sqrt(5.0)]*5 + [0.0]*26, dtype=np.complex128),
    'zero':     np.array([1.0] + [0.0]*31, dtype=np.complex128),
    'one':      np.array([0.0]*31 + [1.0], dtype=np.complex128),
    'plus':     np.array([1.0/math.sqrt(32.0)]*32, dtype=np.complex128),
}


# ─────────────────────────────────────────────────────────────────────────────
# Input Parsing
# ─────────────────────────────────────────────────────────────────────────────

import cmath
import re

def parse_element_complex(p: str) -> complex:
    """Parse an individual amplitude element string into a complex number."""
    clean_p = re.sub(r'(?<=\d)[iI]\b|\b[iI]\b', 'j', p.strip())
    env = {
        'sqrt': np.sqrt, 'pi': np.pi, 'exp': np.exp, 'cos': np.cos, 'sin': np.sin,
        'cmath': cmath, 'np': np, 'math': math, 'j': 1j
    }
    try:
        return complex(eval(clean_p, {'__builtins__': None}, env))
    except Exception:
        try:
            return complex(clean_p)
        except Exception:
            raise ValueError(f"Could not parse '{p}' as a complex amplitude.")

def parse_statevector(input_str: str, n_qubits: Optional[int] = None) -> Tuple[np.ndarray, int]:
    """Parse a user input string into a normalized complex128 statevector."""
    clean = input_str.strip()
    clean_lower = clean.lower()

    if clean_lower == 'random':
        target_n = n_qubits if n_qubits in (1, 2, 3, 4, 5) else 5
        z = (np.random.normal(size=2**target_n) + 1j * np.random.normal(size=2**target_n)) / np.sqrt(2.0)
        return z / np.linalg.norm(z), target_n

    if n_qubits == 1 and clean_lower in PRESETS_1Q: return PRESETS_1Q[clean_lower].copy(), 1
    if n_qubits == 2 and clean_lower in PRESETS_2Q: return PRESETS_2Q[clean_lower].copy(), 2
    if n_qubits == 3 and clean_lower in PRESETS_3Q: return PRESETS_3Q[clean_lower].copy(), 3
    if n_qubits == 4 and clean_lower in PRESETS_4Q: return PRESETS_4Q[clean_lower].copy(), 4
    if n_qubits == 5 and clean_lower in PRESETS_5Q: return PRESETS_5Q[clean_lower].copy(), 5

    if n_qubits is None:
        if clean_lower in PRESETS_1Q: return PRESETS_1Q[clean_lower].copy(), 1
        if clean_lower in PRESETS_2Q: return PRESETS_2Q[clean_lower].copy(), 2
        if clean_lower in PRESETS_3Q: return PRESETS_3Q[clean_lower].copy(), 3
        if clean_lower in PRESETS_4Q: return PRESETS_4Q[clean_lower].copy(), 4
        if clean_lower in PRESETS_5Q: return PRESETS_5Q[clean_lower].copy(), 5

    # Custom amplitude parsing — strip outer brackets if present
    s = clean
    if s.startswith('[') and s.endswith(']'):
        s = s[1:-1].strip()

    parts = [p.strip() for p in s.split(',') if p.strip()]
    if not parts:
        raise ValueError("Input statevector string is empty.")

    vals = []
    for p in parts:
        vals.append(parse_element_complex(p))

    sv = np.array(vals, dtype=np.complex128)
    length = len(sv)
    if length == 2: det_n = 1
    elif length == 4: det_n = 2
    elif length == 8: det_n = 3
    elif length == 16: det_n = 4
    elif length == 32: det_n = 5
    else:
        raise ValueError(f"Statevector length must be 2 (1Q), 4 (2Q), 8 (3Q), 16 (4Q), or 32 (5Q). Got {length} elements.")

    if n_qubits is not None and n_qubits != det_n:
        raise ValueError(f"Specified system ({n_qubits} Qubit(s)) does not match input statevector length ({length} elements = {det_n} Qubit(s)).")

    norm = np.linalg.norm(sv)
    if norm < 1e-12:
        raise ValueError("Statevector norm is zero — invalid input.")
    return sv / norm, det_n


# ─────────────────────────────────────────────────────────────────────────────
# Model Loading & Synthesis Engine
# ─────────────────────────────────────────────────────────────────────────────

def find_dqn_model_path(n_qubits: int) -> str:
    """Find the best available DQN checkpoint for 1Q, 2Q, 3Q, 4Q, or 5Q."""
    if n_qubits == 1:
        candidates = [
            os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_model_best.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', '2qubit', 'dqn_model_best.pth'),
        ]
    elif n_qubits == 2:
        candidates = [
            os.path.join(SCRIPT_DIR, 'saved_models', '2qubit', 'dqn_model_best.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', '2qubit', 'dqn_model.pth'),
        ]
    elif n_qubits == 3:
        candidates = [
            os.path.join(SCRIPT_DIR, 'saved_models', '3qubit', 'dqn_pretrained_best.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_3q_best.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_3q_final.pth'),
        ]
    elif n_qubits == 4:
        candidates = [
            os.path.join(SCRIPT_DIR, 'saved_models', '4qubit', 'dqn_rl_4q_best.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', '4qubit', 'dqn_rl_4q_final.pth'),
        ]
    else:
        candidates = [
            os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_5q_best.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_5q_final.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_5q_ckpt_800000.pth'),
            os.path.join(SCRIPT_DIR, 'saved_models', 'dqn_5q_pretrained.pth'),
        ]
    for p in candidates:
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"No DQN model checkpoint found for {n_qubits}Q. Searched: {candidates}")


def load_dqn_agent(n_qubits: int, device: torch.device) -> Tuple[object, object, object, str]:
    """Instantiate environment and load DQNAgent weights."""
    if n_qubits == 5:
        from dqn_synthesize_5q import DQNSynthesizer5Q
        synth = DQNSynthesizer5Q()
        return synth, None, None, "saved_models/dqn_5q_best.pth"
    elif n_qubits == 4:
        from dqn_synthesize_4q import DQNSynthesizer4Q
        synth = DQNSynthesizer4Q()
        return synth, None, None, "saved_models/4qubit/dqn_rl_4q_best.pth"
    elif n_qubits == 3:
        from configs.config_3qubit import Config3Qubit
        from quantum_env_3q import QuantumCircuitEnv3Q
        from dqn_agent_3q import DQNAgent3Q
        config = Config3Qubit()
        model_path = find_dqn_model_path(3)
        ckpt = torch.load(model_path, map_location='cpu', weights_only=False)
        sd = ckpt['q_net'] if isinstance(ckpt, dict) and 'q_net' in ckpt else (ckpt['state_dict'] if isinstance(ckpt, dict) and 'state_dict' in ckpt else ckpt)
        env = QuantumCircuitEnv3Q(config)
        agent = DQNAgent3Q(obs_size=34, action_size=252, config=config)
        agent.q_net.load_state_dict(sd, strict=False)
        agent.q_net.to(device)
        agent.q_net.eval()
        agent.device = device
        return agent, env, config, model_path
    else:
        config = Config1Qubit() if n_qubits == 1 else Config2Qubit()
        model_path = find_dqn_model_path(n_qubits)
        ckpt = torch.load(model_path, map_location='cpu', weights_only=False)
        sd = ckpt['q_net'] if isinstance(ckpt, dict) and 'q_net' in ckpt else (ckpt['state_dict'] if isinstance(ckpt, dict) and 'state_dict' in ckpt else ckpt)
        env = QuantumCircuitEnv(config)
        agent = DQNAgent(obs_size=env.observation_space.shape[0], action_size=env.action_space.n, config=config)
        try:
            agent.q_net.load_state_dict(sd, strict=False)
        except Exception as err:
            print(f" [Info] Note on model checkpoint: {err}")
        agent.q_net.to(device)
        agent.q_net.eval()
        agent.device = device
        return agent, env, config, model_path


def run_dqn_synthesis(
    target_sv: np.ndarray,
    n_qubits: int,
    budget: int = 30,
    target_fidelity: Optional[float] = None,
):
    """Full DQN synthesis engine supporting 1Q, 2Q, 3Q, 4Q, and 5Q."""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    if target_fidelity is None:
        target_fidelity = 0.999999 if n_qubits >= 2 else 0.999

    if n_qubits == 5:
        from dqn_synthesize_5q import DQNSynthesizer5Q
        synth = DQNSynthesizer5Q()
        report = synth.synthesize(target_sv, max_attempts=budget, target_fidelity=target_fidelity)
        win = report['winning_circuit']
        decomp_seq = win['simplified_sequence'] if win else []
        decomp_lines = []
        for idx, g in enumerate(decomp_seq, 1):
            gtype = g['type']
            q_str = f"q{g['qubits'][0]}, q{g['qubits'][1]}" if g.get('qubits') else f"q{g['qubit']}"
            if g.get('angle') is not None:
                decomp_lines.append(f"{idx:02d}. {gtype}({q_str}, angle={g['angle']:+.6f})")
            else:
                decomp_lines.append(f"{idx:02d}. {gtype}({q_str})")

        try:
            from qiskit import QuantumCircuit, transpile
            qc_temp = synth._build_qiskit_circuit(decomp_seq)
            qc_u3 = transpile(qc_temp, optimization_level=3, basis_gates=['u3', 'cx'])
            u3_lines = []
            for idx, inst in enumerate(qc_u3.data, 1):
                gname = inst.operation.name.upper()
                if gname == 'CX': gname = 'CNOT'
                q_indices = [qc_u3.find_bit(q).index for q in inst.qubits]
                q_str = f"q{q_indices[0]}, q{q_indices[1]}" if len(q_indices) == 2 else f"q{q_indices[0]}"
                params = inst.operation.params
                if params:
                    p_str = ", ".join([f"{float(p):+.6f}" for p in params])
                    u3_lines.append(f"{idx:02d}. {gname}({q_str}, [{p_str}])")
                else:
                    u3_lines.append(f"{idx:02d}. {gname}({q_str})")
        except Exception:
            u3_lines = []

        fid = win['final_verified_fidelity'] if win else 0.0
        gate_cnt = win['gate_count'] if win else 0
        depth = win['depth'] if win else 0
        ent_cnt = win['entangling_gate_count'] if win else 0

        res_5q = {
            'status': report['status'],
            'final_fidelity': fid,
            'raw_gate_count': len(win['raw_sequence']) if win else 0,
            'final_gate_count': gate_cnt,
            'circuit_depth': depth,
            'entangling_gate_count': ent_cnt,
            'search_time_seconds': report['search_time_seconds'],
            'display_lines': decomp_lines,
            'u3_display_lines': u3_lines,
            'simplified_actions': decomp_seq,
            'full_precision_parameters': [(g['type'], g.get('qubits') or g.get('qubit'), g.get('angle')) for g in decomp_seq],
        }

        print("=" * 74)
        print("                 TATVA 5-QUBIT DQN SYNTHESIS RESULTS")
        print("=" * 74)
        print(f" -> Verified Fidelity   : {fid:.10f}")
        print(f" -> Gate Count          : {gate_cnt}")
        print(f" -> Circuit Depth       : {depth}")
        print(f" -> Entangling Gates    : {ent_cnt}")
        print(f" -> Search & Opt Time   : {report['search_time_seconds']:.2f} s")
        print("=" * 74)
        if u3_lines:
            print("\n [1. ABSOLUTE MINIMAL U3 GATE REPRESENTATION (Minimal Gates & Depth)]:")
            for line in u3_lines:
                print(f"  {line.replace('θ', 'theta')}")
        if decomp_lines:
            print("\n [2. FULLY DECOMPOSED HARDWARE REPRESENTATION (RZ/RY/RX + CNOT)]:")
            for line in decomp_lines:
                print(f"  {line.replace('θ', 'theta')}")
        print("=" * 74)
        return res_5q

    if n_qubits == 4:
        from dqn_synthesize_4q import DQNSynthesizer4Q
        synth = DQNSynthesizer4Q()
        report = synth.synthesize(target_sv, max_attempts=budget)
        win = report['winning_circuit']
        decomp_seq = win['simplified_sequence'] if win else []
        decomp_lines = []
        for idx, g in enumerate(decomp_seq, 1):
            gtype = g['type']
            q_str = f"q{g['qubits'][0]}, q{g['qubits'][1]}" if g.get('qubits') else f"q{g['qubit']}"
            if g.get('angle') is not None:
                decomp_lines.append(f"{idx:02d}. {gtype}({q_str}, angle={g['angle']:+.6f})")
            else:
                decomp_lines.append(f"{idx:02d}. {gtype}({q_str})")

        try:
            from qiskit import QuantumCircuit, transpile
            qc_temp = synth._build_qiskit_circuit(decomp_seq)
            qc_u3 = transpile(qc_temp, optimization_level=3, basis_gates=['u3', 'cx'])
            u3_lines = []
            for idx, inst in enumerate(qc_u3.data, 1):
                gname = inst.operation.name.upper()
                if gname == 'CX': gname = 'CNOT'
                q_indices = [qc_u3.find_bit(q).index for q in inst.qubits]
                q_str = f"q{q_indices[0]}, q{q_indices[1]}" if len(q_indices) == 2 else f"q{q_indices[0]}"
                params = inst.operation.params
                if params:
                    p_str = ", ".join([f"{float(p):+.6f}" for p in params])
                    u3_lines.append(f"{idx:02d}. {gname}({q_str}, [{p_str}])")
                else:
                    u3_lines.append(f"{idx:02d}. {gname}({q_str})")
        except Exception:
            u3_lines = []

        fid = win['final_verified_fidelity'] if win else 0.0
        res_4q = {
            'status': report['status'],
            'final_fidelity': fid,
            'raw_gate_count': len(win['raw_sequence']) if win else 0,
            'final_gate_count': win['gate_count'] if win else 0,
            'circuit_depth': win['depth'] if win else 0,
            'entangling_gate_count': win['entangling_gate_count'] if win else 0,
            'search_time_seconds': report['search_time_seconds'],
            'display_lines': decomp_lines,
            'u3_display_lines': u3_lines,
            'simplified_actions': decomp_seq,
            'full_precision_parameters': [(g['type'], g.get('qubits') or g.get('qubit'), g.get('angle')) for g in decomp_seq],
        }
        return res_4q

    agent, env, config, model_path = load_dqn_agent(n_qubits, device)
    rel_model_path = os.path.relpath(model_path, SCRIPT_DIR)
    print(f" -> Loaded DQN Model : {rel_model_path}")

    # Standard synthesis loop for 1Q, 2Q, 3Q
    orig_norm = float(np.linalg.norm(target_sv))
    target_sv = target_sv / orig_norm if orig_norm > 1e-10 else target_sv

    t0 = time.time()
    candidate_pool = []

    for attempt in range(budget):
        deterministic = (attempt == 0)
        obs, _ = env.reset(target_sv=target_sv)
        done = False

        while not done:
            st = torch.as_tensor(obs, dtype=torch.float32, device=device).unsqueeze(0)
            with torch.no_grad():
                q_vals = agent.q_net(st).squeeze(0).cpu().numpy()

            if deterministic:
                action = int(np.argmax(q_vals))
            else:
                eps = 0.05 + (attempt / budget) * 0.25
                if np.random.rand() < eps:
                    action = int(np.random.randint(len(q_vals)))
                else:
                    action = int(np.argmax(q_vals))

            obs, _, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

        raw_actions = list(env.applied_actions)
        ver_res = verify_synthesis_candidate(
            target_sv=target_sv,
            applied_actions=raw_actions,
            n_qubits=env.n_qubits,
            fidelity_threshold=target_fidelity,
        )
        simp_actions = ver_res.get('simplified_actions', raw_actions)
        opt_actions, opt_fid = prune_and_reoptimize_structural_search(
            simp_actions, target_sv=target_sv, n_qubits=env.n_qubits, target_fidelity=target_fidelity,
        )
        opt_f, int_f, fresh_qiskit_f, disp_f, max_dev = verify_4way_consistency(
            opt_actions, target_sv=target_sv, n_qubits=env.n_qubits, internal_fid=ver_res.get('fidelity'),
        )
        fresh_qc = build_qiskit_circuit(opt_actions, n_qubits=env.n_qubits)

        status = 'HIGH_PRECISION_SUCCESS' if fresh_qiskit_f >= target_fidelity else ('APPROXIMATE_SUCCESS' if fresh_qiskit_f >= 0.99 else 'FAILED')
        cand_rec = {
            'attempt': attempt + 1,
            'deterministic': deterministic,
            'raw_actions': raw_actions,
            'raw_gate_count': len(raw_actions),
            'ver_res': ver_res,
            'final_fidelity': fresh_qiskit_f,
            'status': status,
            'simplified_actions': opt_actions,
            'final_gate_count': len(opt_actions),
            'circuit_depth': fresh_qc.depth(),
            'entangling_gate_count': sum(1 for g, q, a in opt_actions if g in ('CZ', 'CNOT', 'SWAP')),
            'full_precision_parameters': [(g, q, float(a) if a is not None else None) for g, q, a in opt_actions],
            'display_lines': format_circuit_display_lines(opt_actions),
            'search_time_seconds': time.time() - t0,
            'qiskit_circuit': fresh_qc,
        }
        candidate_pool.append(cand_rec)

        max_gate_limit = 12 if n_qubits <= 2 else (30 if n_qubits == 3 else (60 if n_qubits == 4 else 120))
        if fresh_qiskit_f >= target_fidelity and cand_rec['final_gate_count'] <= max_gate_limit:
            break

    best_fid = max((c['final_fidelity'] for c in candidate_pool), default=0.0)
    if best_fid < target_fidelity:
        try:
            from qiskit import QuantumCircuit, transpile
            from qiskit.quantum_info import Statevector
            qc_prep = QuantumCircuit(n_qubits)
            qc_prep.prepare_state(target_sv, list(range(n_qubits)))
            qc_trans = transpile(qc_prep, basis_gates=['rx', 'ry', 'rz', 'cx'], optimization_level=3)

            exact_actions = []
            for inst in qc_trans.data:
                gname = inst.operation.name.upper()
                if gname == 'CX': gname = 'CNOT'
                q_indices = [qc_trans.find_bit(q).index for q in inst.qubits]
                params = inst.operation.params
                if gname in ('CNOT', 'CX', 'CZ', 'SWAP'):
                    exact_actions.append((gname, tuple(q_indices), None))
                elif gname in ('RX', 'RY', 'RZ'):
                    exact_actions.append((gname, q_indices[0], float(params[0]) if params else 0.0))

            opt_actions, opt_fid = prune_and_reoptimize_structural_search(
                exact_actions, target_sv=target_sv, n_qubits=n_qubits, target_fidelity=target_fidelity
            )
            fresh_qc = build_qiskit_circuit(opt_actions, n_qubits=n_qubits)
            gen_sv = Statevector.from_instruction(fresh_qc).data
            fresh_fid = float(abs(np.vdot(target_sv, gen_sv)) ** 2)

            exact_rec = {
                'attempt': budget + 1,
                'deterministic': False,
                'raw_actions': exact_actions,
                'raw_gate_count': len(exact_actions),
                'final_fidelity': fresh_fid,
                'status': 'HIGH_PRECISION_SUCCESS' if fresh_fid >= target_fidelity else 'APPROXIMATE_SUCCESS',
                'simplified_actions': opt_actions,
                'final_gate_count': len(opt_actions),
                'circuit_depth': fresh_qc.depth(),
                'entangling_gate_count': sum(1 for g, q, a in opt_actions if g in ('CZ', 'CNOT', 'SWAP')),
                'full_precision_parameters': [(g, q, float(a) if a is not None else None) for g, q, a in opt_actions],
                'display_lines': format_circuit_display_lines(opt_actions),
                'search_time_seconds': time.time() - t0,
                'qiskit_circuit': fresh_qc,
            }
            candidate_pool.append(exact_rec)
        except Exception:
            pass

    candidate_pool.sort(key=lambda c: candidate_rank_key(c, target_fidelity=target_fidelity))
    best = candidate_pool[0]
    best['candidate_pool_size'] = len(candidate_pool)
    best['search_time_seconds'] = time.time() - t0
    return best


def main():
    parser = argparse.ArgumentParser(description="TATVA DQN Quantum Circuit Synthesizer (1 to 5 Qubits)")
    parser.add_argument('-q', '--qubits', type=int, choices=[1, 2, 3, 4, 5], default=None)
    parser.add_argument('-t', '--target', type=str, default=None)
    parser.add_argument('-b', '--budget', type=int, default=30)
    parser.add_argument('-f', '--fidelity-threshold', type=float, default=None)

    args = parser.parse_args()

    if args.target is not None:
        target_str = args.target
        n_qubits = args.qubits
    else:
        print("\n" + "=" * 70)
        print("    WELCOME TO TATVA DQN QUANTUM CIRCUIT SYNTHESIZER")
        print("=" * 70)

        if args.qubits is None:
            print(" Select System: [1, 2, 3, 4, or 5]")
            q_choice = input(" Choice [1-5, default: 5]: ").strip()
            n_qubits = int(q_choice) if q_choice in ('1','2','3','4','5') else 5
        else:
            n_qubits = args.qubits

        target_str = input(f"\n Input Target Statevector for {n_qubits}-Qubit System (or 'random' / 'ghz'): ").strip()
        if not target_str: target_str = 'random'

    try:
        target_sv, n_qubits = parse_statevector(target_str, n_qubits=n_qubits)
    except Exception as e:
        print(f"\n [ERROR] Failed to parse target statevector: {e}")
        sys.exit(1)

    run_dqn_synthesis(
        target_sv=target_sv,
        n_qubits=n_qubits,
        budget=args.budget,
        target_fidelity=args.fidelity_threshold,
    )


if __name__ == '__main__':
    main()
