# TATVA QuantumRL: Non-Destructive 20-Vector Winner-Selection Audit

## Objective

Run a controlled audit of TATVA's existing quantum-state synthesis workflow using all 20 predefined stress-test vectors in `TATVA_QuantumRL_Stress_Test_Vectors.md` (5 vectors each for 1, 2, 3, and 4 qubits).

The purpose is to determine whether the current DQN-versus-PPO comparison, fidelity reporting, circuit association, and final winner selection behave according to the existing implementation and the winner-selection rules below. This is an **investigation only**. Do not fix, refactor, optimize, or otherwise change the application's synthesis or winner-selection behavior during this audit.

## Strict safety and scope boundaries

1. **Do not modify existing application behavior.** Do not change the winner-selection algorithm, thresholds, rewards, training, optimization, circuit construction, fidelity calculation, APIs, database schema, UI, or deployment configuration.
2. Do not refactor or clean up unrelated code. Do not rename, move, delete, or overwrite existing project files.
3. Do not change dependencies or package versions. Do not run destructive database operations, clear user data, reset production data, or deploy anything.
4. Do not use production data or production credentials for test runs. Use the existing local/development environment and its configured test-safe resources.
5. You may add **isolated audit-only files** such as a test runner, raw-result JSON/JSONL, logs, and a Markdown report. Keep them in a clearly named audit folder and do not wire them into the production application. Do not modify application source files just to make the audit easier.
6. If automated execution requires a code change, missing service, unavailable model weights, unavailable credentials, or an unsafe action, **stop at that point**, document the blocker, and report what can be verified without changing the application. Do not silently work around the blocker.
7. Do not fabricate runs, metrics, circuit sequences, fidelity values, timestamps, or pass/fail statuses. Clearly label unavailable fields as `NOT CAPTURED`, `NOT RUN`, or `UNVERIFIED`.
8. Before running anything, inspect the repository and identify the existing synthesis entry point, test/development environment, how DQN and PPO are invoked, where optimized circuits and metrics are produced, and where the winner cascade is implemented. Record the relevant file paths and function names in the report. Do not edit those files.
9. Preserve the exact target statevectors from the provided stress-test file. Do not regenerate, round, reorder, renormalize, or otherwise alter the supplied vectors for the test input. If the application itself normalizes inputs, record that behavior and preserve both the submitted input and the application's effective input if observable.
10. Use the same configuration for both agents within each test. If the workflow is stochastic, capture the random seed/configuration. Do not compare one model's best-of-many result against the other model's single run.

## Required winner-selection rules

Audit the existing implementation against the following specified five-level priority cascade. **Observe and report only; do not change it.**

Thresholds:
- 1 qubit: `target_fidelity = 0.999`
- 2, 3, and 4 qubits: `target_fidelity = 0.999999`

Priority order:
1. **Eligibility / target fidelity:** Determine whether each model's verified final-circuit fidelity meets its qubit-count threshold. If exactly one model passes, that model wins outright. If both pass or neither passes, proceed to the next criterion.
2. **Optimized gate count:** Fewer optimized gates wins.
3. **Circuit depth:** If optimized gate counts tie, smaller depth wins.
4. **Verified fidelity precision:** If gate count and depth tie, higher independently verified fidelity wins only when the difference is greater than `1e-8`. Record the raw values and difference.
5. **Synthesis time:** If all prior criteria remain tied, shorter synthesis time wins.
6. **Fallback:** `TIE` only if all five criteria are identical under the rules above.

Important audit notes:
- Apply the eligibility comparison exactly as specified above. In particular, record separately whether each model passes its threshold and whether the threshold rule alone determines the winner.
- If neither model passes, do not label either circuit as meeting the target. Continue the specified cascade for comparison, and flag that **neither model met the target**.
- If both pass, continue to gate count, depth, verified fidelity precision, and time in that order.
- Use **independently recomputed fidelity of the exact final circuit** for audit conclusions wherever it is technically possible. Also preserve the application's reported fidelity. Never silently substitute one for the other.
- Distinguish `reported_fidelity`, `verified_fidelity`, and any internal/selection fidelity found in code or logs. If the winner cascade uses a different value, document it.
- Record whether the application compares raw fidelity values or rounded/displayed percentages.
- For criterion 4, apply the `> 1e-8` difference rule exactly. If the absolute difference is `<= 1e-8`, proceed to synthesis time.
- Follow the implementation's actual definitions of optimized gate count and circuit depth, but document the source of each metric and any discrepancy with a count independently derived from the returned circuit.
- A model's reported metrics, selected winner label, returned final circuit, and final result panel must all refer to the same agent and the same run. Verify this association.

## Embedded test vectors: authoritative input

**All 20 exact test vectors are embedded in the `EMBEDDED TEST VECTORS` section at the end of this same Markdown file.** Use those embedded vectors directly. This prompt is intentionally self-contained: do not require a separate vector file to be attached or present.

Do not regenerate, replace, round, reorder, renormalize, or otherwise alter the embedded vectors. Preserve each exact test ID, description, qubit count, and amplitude order. If this file's embedded vector section is missing or malformed, stop and report that issue instead of inventing replacement vectors.

## Execution plan

### Phase 1: Repository and environment inspection

- Identify the repository root and current branch/working-tree status.
- Check whether the working tree already contains user changes. Do not overwrite or revert them.
- Find the stress-test vector file.
- Locate the current synthesis entry point, DQN/PPO execution paths, optimizer, fidelity calculation, winner-selection cascade, and result serialization/display paths.
- Record relevant file paths and function/class names. Include line numbers if available.
- Determine the safest supported way to run the current application locally or in a test environment.
- Before execution, state whether the planned test route is read-only with respect to application source and production data.

### Phase 2: Execute all 20 tests

Run tests in this order, preserving IDs:
1. `T1-A`, `T1-B`, `T1-C`, `T1-D`, `T1-E`
2. `T2-A`, `T2-B`, `T2-C`, `T2-D`, `T2-E`
3. `T3-A`, `T3-B`, `T3-C`, `T3-D`, `T3-E`
4. `T4-A`, `T4-B`, `T4-C`, `T4-D`, `T4-E`

For each test:
- Submit the exact target vector and record the exact input payload.
- Use the same run configuration for DQN and PPO.
- Run both agents through the existing supported workflow, in parallel if that is how the application normally operates.
- Capture each agent's raw result before winner selection, if available.
- Capture each agent's pre-optimization and post-optimization circuit/metrics if the existing workflow exposes them. Do not add instrumentation to production code to obtain them.
- Capture the final selected winner and exact circuit returned/displayed by the app.
- Save raw output as structured JSON or JSONL, including errors and warnings.
- Record elapsed time separately for each agent and for the overall request where possible.
- Do not stop after a failed test. Continue with remaining tests if it is safe and the failure does not invalidate the environment. Record failures and their cause.
- If running all 20 automatically is not supported without application changes, do not make those changes. Run only what the existing safe interface supports and mark remaining tests `NOT RUN`, with the exact blocker.

### Phase 3: Independent circuit and fidelity verification

For every circuit that is captured:
- Recompute the output statevector using a reliable simulator or an independent exact simulator that supports all gates actually present in the circuit.
- Match the application's qubit ordering, control/target conventions, and gate parameter conventions. Specifically document Qiskit little-endian statevector indexing if Qiskit is used.
- Compute pure-state fidelity as `F = abs(vdot(target_normalized, output_statevector))**2`, accounting for global phase naturally.
- Record target-vector norm, output-state norm, raw fidelity in `[0, 1]`, and percentage only as a display convenience.
- Normalize only inside the verification calculation if needed, and explicitly report if the supplied target vector or simulator output is not normalized. Preserve the original vector.
- Independently count gates and derive depth only when the exact circuit representation makes that calculation reliable. State assumptions and do not present estimates as verified facts.
- If the circuit contains unsupported gates, unknown parameter conventions, hidden subcircuits, or unavailable simulator dependencies, mark independent verification `UNVERIFIED`, state why, and preserve the app's reported result.
- Verify the **exact circuit returned for the selected winner**, not merely an intermediate circuit or a circuit belonging to the other agent.
- Do not treat a displayed `100.00%` as proof of exact 100% fidelity. Compare the raw values and account for display rounding.

### Phase 4: Winner-cascade audit

For each test, create an audit decision trace:
- Target threshold for the qubit count.
- DQN reported fidelity and independently verified fidelity.
- PPO reported fidelity and independently verified fidelity.
- Threshold pass/fail for each model using verified fidelity, where available.
- Winner that the documented cascade would select using verified metrics.
- Winner that the application's actual cascade selected, if observable.
- Winner label displayed in the UI/API response.
- Agent identity of the circuit actually returned.
- First priority level that decided the result.
- Gate-count comparison, depth comparison, raw fidelity difference, time comparison, or `TIE`, as applicable.
- Whether the actual winner agrees with the documented cascade.
- Whether the winner label, metrics, and returned circuit belong to the same agent/run.
- If the result cannot be determined, mark it `UNVERIFIED` and explain why.

If only app-reported fidelity is available, produce a separate **reported-metrics-only provisional comparison** and do not claim independent winner verification.

## Issue flags

Use clear issue IDs and severity. Do not fix issues during this audit.

- `BUG-01 — WINNER_CASCADE_MISMATCH`: actual selected winner differs from the winner implied by the specified cascade and verified metrics.
- `BUG-02 — FIDELITY_MISMATCH`: reported fidelity materially differs from independently verified fidelity beyond a documented numerical/display-rounding tolerance.
- `BUG-03 — WRONG_CIRCUIT_RETURNED`: selected winner label does not match the agent/run that produced the returned final circuit.
- `BUG-04 — METRIC_ASSOCIATION_MISMATCH`: gate count, depth, fidelity, or timing shown in the result belongs to a different circuit/agent/run.
- `BUG-05 — THRESHOLD_HANDLING`: eligibility threshold or qubit-count threshold is applied incorrectly.
- `BUG-06 — TIE_BREAK_ORDER`: gate count, depth, fidelity precision, or time is compared out of the specified order.
- `BUG-07 — FIDELITY_PRECISION`: criterion 4 does not honor the strict `absolute difference > 1e-8` rule.
- `BUG-08 — CIRCUIT_METRIC_MISMATCH`: displayed/recorded gate count or depth conflicts with the returned circuit under the application's documented definitions.
- `BUG-09 — INVALID_OR_MISMATCHED_STATE`: wrong target vector, qubit count, endianness, normalization, or state/circuit association.
- `BUG-10 — REPRODUCIBILITY_GAP`: seed/configuration or run identity is missing where needed to interpret a stochastic comparison.
- `WARN-01 — BOTH_BELOW_THRESHOLD`: neither model meets the target threshold.
- `WARN-02 — INDEPENDENT_VERIFICATION_UNAVAILABLE`: circuit cannot be independently simulated.
- `WARN-03 — TEST_NOT_RUN`: test could not be executed.
- `WARN-04 — INCOMPLETE_AGENT_OUTPUT`: one or both agent circuits or metrics were not captured.
- `WARN-05 — DISPLAY_ROUNDING_AMBIGUITY`: UI rounding prevents conclusions from displayed values alone.

For every flag, include the test ID, severity (`CRITICAL`, `HIGH`, `MEDIUM`, or `LOW` for bugs; `WARNING` for warnings), evidence, expected behavior, actual behavior, and relevant source path/function if identified. Clearly separate confirmed bugs from suspected issues and incomplete evidence. Do not create a bug flag solely because a circuit has more gates or lower fidelity if the documented cascade still selects it correctly.

## Required deliverables

Create an audit-only folder, for example `audit/quantumrl_stress_test/`, without overwriting existing files. Include:

1. `README.md`
   - Purpose, run environment, commands actually used, prerequisites, and limitations.
   - Clearly state that no application behavior was changed.

2. `raw_results.jsonl` or `raw_results.json`
   - One record per test, with exact input vector, run/configuration/seed, DQN raw output, PPO raw output, app winner, returned circuit, logs/errors, timestamps, and captured metrics.
   - Preserve the raw source output or a faithful unmodified representation wherever possible.

3. `test_results.csv`
   - One row per test, including test ID, qubits, status, DQN/PPO reported fidelity, DQN/PPO verified fidelity, gate counts, depths, times, threshold pass/fail, app winner, expected winner, returned-circuit agent, and issue IDs.

4. `winner_decision_traces.md`
   - A readable, per-test trace of all five priority levels, including why each level did or did not decide the winner.

5. `issue_register.md`
   - All confirmed/suspected bugs and warnings, evidence, severity, affected tests, source locations, confidence, and what additional evidence is needed.
   - If no issue is found, explicitly state that no issue was observed **within the executed and independently verified tests**, and list coverage limitations. Do not claim the entire system is bug-free.

6. `final_audit_report.md`
   - Executive summary.
   - Environment and source-path map.
   - Test coverage summary: 20 planned, how many run, how many independently verified, how many failed/not run.
   - Per-qubit-count findings (1Q, 2Q, 3Q, 4Q).
   - Overall result table for all 20 tests.
   - Fidelity discrepancy analysis.
   - Winner-cascade correctness analysis.
   - Returned-circuit and metric-association analysis.
   - Reproducibility and runtime analysis.
   - Issue register summary, with confirmed bugs distinguished from suspected issues.
   - Explicit limitations and recommended next debugging steps, without applying fixes.

7. Optional screenshots or text snapshots of result panels, if the existing safe workflow can capture them without changing the app.

## Required per-test report table

Include these columns at minimum:

| Field | Meaning |
|---|---|
| Test ID / description | Exact ID and source description |
| Qubits / threshold | Qubit count and required fidelity |
| Run status | PASS / FAIL / ERROR / NOT RUN / PARTIAL |
| DQN reported / verified fidelity | Keep the two values separate |
| PPO reported / verified fidelity | Keep the two values separate |
| DQN gates / depth / time | Raw and independently checked metrics where possible |
| PPO gates / depth / time | Raw and independently checked metrics where possible |
| DQN / PPO threshold status | PASS / FAIL / UNKNOWN |
| App-selected winner | Exact app result |
| Cascade-expected winner | Derived from the documented cascade |
| First decisive priority | Eligibility, gates, depth, fidelity, time, tie, or unverified |
| Returned-circuit source | DQN, PPO, unknown, or mismatch |
| Metric/circuit association | Verified / mismatch / unknown |
| Issue IDs | Any applicable flags |

## Final response after audit

When the audit artifacts are complete, summarize:
- Number of tests run out of 20.
- Number of circuits independently verified.
- Confirmed bugs versus suspected issues.
- Any cases where the app-selected winner conflicts with the specified cascade.
- Any cases where reported fidelity differs from independently verified fidelity.
- Any cases where the returned circuit does not match the winner label.
- Exact paths to the created audit artifacts.
- Any blocked or unrun tests and why.

Do not propose or implement a code fix until the audit results have been reviewed. The immediate deliverable is evidence, not a patch.

---

# EMBEDDED TEST VECTORS

> These 20 vectors are the exact fixed inputs for this audit. Use them as written. The IDs and statevectors below are authoritative.

### T1-A | 1 qubit(s) | Unequal complex amplitudes

```python
[
    -0.668485603970+0.066433218476j,
    0.625097985526-0.397449535488j,
]
```

### T1-B | 1 qubit(s) | Balanced phase-only state

```python
[
    0.260597391013-0.657334769959j,
    0.421100224475+0.568044541341j,
]
```

### T1-C | 1 qubit(s) | Near-basis perturbation

```python
[
    0.089758539294+0.092003298907j,
    -0.985286908057-0.112643270665j,
]
```

### T1-D | 1 qubit(s) | Sparse superposition

```python
[
    0.381954490176-0.410319070642j,
    -0.591474694069+0.579574597423j,
]
```

### T1-E | 1 qubit(s) | Arbitrary complex state

```python
[
    -0.546497074313-0.641342628193j,
    -0.420562070352+0.336374978276j,
]
```

### T2-A | 2 qubit(s) | Sparse amplitudes

```python
[
    -0.233158029118-0.479703961438j,
    0.408182212335-0.298373076710j,
    0.220089046733-0.319974132356j,
    -0.427019025124+0.355969591088j,
]
```

### T2-B | 2 qubit(s) | Balanced complex phases

```python
[
    -0.460511415821-0.194754296225j,
    -0.398015353577-0.302628118847j,
    -0.462799446002-0.189252933347j,
    -0.459169712058+0.197896881049j,
]
```

### T2-C | 2 qubit(s) | Highly skewed amplitudes

```python
[
    -0.127301088163+0.238867120951j,
    -0.101101442832-0.512721825337j,
    -0.115502322037-0.683604537467j,
    0.037251400023-0.414231991420j,
]
```

### T2-D | 2 qubit(s) | Near-basis perturbation

```python
[
    -0.034919631410-0.106183513090j,
    0.248704325480+0.956505469310j,
    -0.084465067134-0.027302080277j,
    -0.026585978999+0.046503345315j,
]
```

### T2-E | 2 qubit(s) | Arbitrary complex state

```python
[
    0.118031361505+0.051637796046j,
    0.171426179128-0.860215376222j,
    0.364200389947+0.016733638822j,
    -0.082632247260-0.272570505280j,
]
```

### T3-A | 3 qubit(s) | Sparse amplitudes

```python
[
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    -0.435078543721+0.709027482506j,
    0.495572158975+0.182963106584j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.096596528001+0.027840740618j,
    -0.116959543524-0.071651209621j,
]
```

### T3-B | 3 qubit(s) | Balanced complex phases

```python
[
    0.112377749744+0.335218199629j,
    -0.248700749162-0.251292533447j,
    -0.077767301213+0.344894544553j,
    -0.318666565199-0.153139218440j,
    -0.353540711925+0.002994162897j,
    -0.165372034092+0.312493344474j,
    0.217113814341+0.279036900109j,
    0.353463619979+0.007966765431j,
]
```

### T3-C | 3 qubit(s) | Phase-structured state

```python
[
    -0.003886181653+0.156565572037j,
    0.007197738410+0.441942485796j,
    -0.021777186457+0.314861748926j,
    0.459644956901+0.009545883264j,
    -0.255463108228+0.008345554231j,
    0.330582742999+0.031062233791j,
    -0.380939060763+0.029447277869j,
    -0.029501924421-0.383011018072j,
]
```

### T3-D | 3 qubit(s) | Highly skewed amplitudes

```python
[
    -0.002560409057+0.001410367213j,
    -0.382296276014+0.057512215336j,
    0.014646400572+0.091939762661j,
    -0.034450941388-0.572684723557j,
    -0.056947204480-0.340915311209j,
    0.145108531511+0.386559992126j,
    0.035927499131+0.041490940120j,
    0.273452273288-0.380751210925j,
]
```

### T3-E | 3 qubit(s) | Arbitrary complex state

```python
[
    0.011254040403-0.066069554650j,
    0.024099480908+0.125571290318j,
    0.342274321675-0.028999982364j,
    0.032074531070+0.128203499692j,
    -0.168670458872+0.262302066903j,
    0.634950466900+0.093330820974j,
    0.500020477306+0.052718731051j,
    -0.210751001933-0.193290043086j,
]
```

### T4-A | 4 qubit(s) | Sparse amplitudes

```python
[
    0.499530819760+0.091528130359j,
    0.000000000000+0.000000000000j,
    0.162122212545+0.222919447588j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.268521734751-0.363362614642j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
    0.604952935500-0.309855617386j,
    0.000000000000+0.000000000000j,
    0.000000000000+0.000000000000j,
]
```

### T4-B | 4 qubit(s) | Balanced complex phases

```python
[
    0.159328143434+0.192651350138j,
    0.180648447834-0.172818223273j,
    -0.093686422774+0.231781910830j,
    0.064150049278+0.241629408760j,
    0.099835534121-0.229200493295j,
    -0.161455608179+0.190871911468j,
    0.179637257787-0.173869076074j,
    0.209533937963-0.136365423923j,
    -0.152239427689+0.198300672356j,
    -0.039108826739+0.246922051812j,
    0.156359867095+0.195068172601j,
    -0.077593684580+0.237653571640j,
    0.073087344059-0.239077895545j,
    -0.084499736430-0.235286622108j,
    0.159904363483+0.192173345028j,
    -0.157160275083+0.194423887256j,
]
```

### T4-C | 4 qubit(s) | Phase-structured state

```python
[
    0.043527414696-0.409580182025j,
    0.319463112667-0.061422610718j,
    -0.028760399003-0.286369260771j,
    -0.010325870144+0.142151501372j,
    -0.036615766011+0.396961421434j,
    -0.001124373793-0.148568106055j,
    0.176535834186-0.011585115266j,
    0.001490893079+0.122694387778j,
    0.003931848288-0.086837463280j,
    -0.014303354036+0.144430795664j,
    -0.007843036354+0.304863026242j,
    0.416240933134-0.005045710419j,
    -0.185236248788+0.019027806261j,
    0.110295593052+0.001025692730j,
    0.187942478954-0.007987845165j,
    -0.008523743863-0.129685099535j,
]
```

### T4-D | 4 qubit(s) | Highly skewed amplitudes

```python
[
    -0.163333324919-0.241533282224j,
    -0.073286712478+0.123554832161j,
    0.110292011918+0.035037360558j,
    -0.067018798349+0.192235194336j,
    -0.035786316192-0.043567010944j,
    -0.019032928146-0.013016374369j,
    -0.230391998193+0.059002367390j,
    -0.152147447473+0.110996377122j,
    0.021351473971+0.191478897323j,
    0.002251897253-0.167688109230j,
    0.245444916100+0.147415859497j,
    0.247799122130+0.060581663659j,
    -0.114317243461-0.058919052044j,
    0.222723531012+0.042785016109j,
    0.500440597875-0.449064925206j,
    0.075774096549+0.075209498240j,
]
```

### T4-E | 4 qubit(s) | Arbitrary complex state

```python
[
    0.037179252746-0.075350126382j,
    0.479609031187-0.133993222611j,
    0.193030615804+0.131204903672j,
    0.093726958236+0.116126885375j,
    -0.483049955892-0.091118466202j,
    -0.221806855810-0.069905442854j,
    0.115432881064+0.084525010580j,
    0.046975255986-0.018255702677j,
    -0.120404153838+0.206944333614j,
    -0.068914211945+0.060556392052j,
    0.027624341653+0.116405699763j,
    -0.357816842172-0.062178026489j,
    0.102217905674-0.082570609983j,
    -0.071775885277-0.199955520808j,
    -0.108679287433-0.000113985612j,
    -0.201474831758-0.150750781408j,
]
```

## Result sheet

| ID | Qubits | PPO fidelity | PPO gates | PPO depth | PPO time | DQN fidelity | DQN gates | DQN depth | DQN time | Reported winner | Returned circuit matches winner? | Verified fidelity passes? |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| T1-A | 1 | | | | | | | | | | | |
| T1-B | 1 | | | | | | | | | | | |
| T1-C | 1 | | | | | | | | | | | |
| T1-D | 1 | | | | | | | | | | | |
| T1-E | 1 | | | | | | | | | | | |
| T2-A | 2 | | | | | | | | | | | |
| T2-B | 2 | | | | | | | | | | | |
| T2-C | 2 | | | | | | | | | | | |
| T2-D | 2 | | | | | | | | | | | |
| T2-E | 2 | | | | | | | | | | | |
| T3-A | 3 | | | | | | | | | | | |
| T3-B | 3 | | | | | | | | | | | |
| T3-C | 3 | | | | | | | | | | | |
| T3-D | 3 | | | | | | | | | | | |
| T3-E | 3 | | | | | | | | | | | |
| T4-A | 4 | | | | | | | | | | | |
| T4-B | 4 | | | | | | | | | | | |
| T4-C | 4 | | | | | | | | | | | |
| T4-D | 4 | | | | | | | | | | | |
| T4-E | 4 | | | | | | | | | | | |

## Winner-selection checks

- **Eligibility:** Only circuits that meet the configured fidelity threshold are eligible to win.
- **Primary objective:** Among eligible circuits, apply the objective configured by the project (for example, gate count or a documented weighted score).
- **Tie-breaks:** Define explicitly, for example: higher verified fidelity, then fewer gates, then lower depth, then shorter synthesis time.
- **Correct output:** The winner label, displayed metrics, and returned circuit must all refer to the same agent and run.
- **No hard-coded winner:** Winner selection must respond to measured outcomes, not default to PPO or DQN.
