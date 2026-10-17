# TATVA QuantumRL — 20-Vector Stress Test Audit

## Purpose

Non-destructive audit of TATVA's quantum circuit synthesis workflow.
Runs all 20 predefined stress-test vectors (5 each for 1, 2, 3, 4 qubits)
through the existing DQN and PPO synthesis pipelines and verifies:
- Fidelity reporting correctness
- Winner-selection cascade correctness (5-level priority)
- Circuit-to-winner-label association
- Independent fidelity verification

**No application behavior was changed. No production files were modified.**

## Environment

| Package | Version |
|---------|---------|
| Python  | 3.x     |
| torch   | 2.6.0+cpu |
| qiskit  | 2.5.0   |
| numpy   | 2.2.6   |
| CUDA    | False (CPU only) |

## Synthesis entry points (observed, not modified)

| Component | File | Key function |
|-----------|------|--------------|
| Main orchestrator | 	atva_synthesize.py | main(), _worker_dqn, _worker_ppo, decide_winner |
| Winner cascade | 	atva_synthesize.py | decide_winner() lines 88-143 |
| DQN 1Q/2Q/3Q | dqn_synthesize.py | un_dqn_synthesis() |
| PPO 1Q/2Q/3Q | ppo_synthesize.py | un_ppo_synthesis() |
| DQN 4Q | dqn_synthesize_4q.py | DQNSynthesizer4Q.synthesize() |
| PPO 4Q | ppo_synthesize_4q.py | PPOSynthesizer4Q.synthesize() |

## Thresholds

| Qubits | Target Fidelity |
|--------|----------------|
| 1      | 0.999          |
| 2, 3, 4 | 0.999999     |

## Commands used

`powershell
# From rl_models/ directory:
python audit/quantumrl_stress_test/audit_runner.py
`

## Deliverables

| File | Description |
|------|-------------|
| aw_results.jsonl | One JSON record per test |
| 	est_results.csv  | One row per test, all metrics |
| winner_decision_traces.md | Per-test 5-priority cascade trace |
| issue_register.md | All bugs and warnings |
| inal_audit_report.md | Executive summary + full analysis |

## Safety statement

This audit is strictly read-only with respect to application source and
production data. The audit_runner.py imports existing workers via Python
import — no monkey-patching, no source edits.

All 20 test vectors are embedded verbatim from the audit specification.
They were not regenerated, rounded, reordered, renormalized, or altered.
