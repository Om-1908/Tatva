import React from 'react'

/**
 * Step 01 Gutter Panel — State Space Reference
 * Displays Hilbert space dimension scaling per qubit count and custom statevector note.
 */
export function Step01GutterPanel({ isActivated }) {
  const dimensions = [
    { qubits: '1 qubit', dim: '2 states', formula: '2¹' },
    { qubits: '2 qubits', dim: '4 states', formula: '2²' },
    { qubits: '3 qubits', dim: '8 states', formula: '2³' },
    { qubits: '4 qubits', dim: '16 states', formula: '2⁴' },
  ]

  return (
    <div
      className={`w-full rounded-2xl border p-5 sm:p-6 transition-all duration-500 text-left ${
        isActivated
          ? 'bg-[#090912]/85 border-white/15 shadow-[0_0_30px_rgba(34,211,238,0.08)] backdrop-blur-sm'
          : 'bg-[#07070d]/50 border-white/5 opacity-40 grayscale'
      }`}
    >
      {/* Header Badge — Single Line No-Wrap */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/10 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#22D3EE] flex-shrink-0 animate-pulse" />
          <span className="font-mono text-xs sm:text-[13px] font-bold text-[#22D3EE] tracking-wider uppercase whitespace-nowrap">
            STATE SPACE
          </span>
        </div>
        <span className="font-mono text-[11px] sm:text-xs text-white/50 whitespace-nowrap flex-shrink-0">
          Hilbert Dim (2ᴺ)
        </span>
      </div>

      {/* Hilbert Space Grid — Clean Non-Overlapping Two-Row Stack */}
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        {dimensions.map((d) => (
          <div
            key={d.qubits}
            className="p-3.5 rounded-xl bg-white/[0.035] border border-white/5 font-mono flex flex-col justify-between transition-all hover:bg-white/[0.06]"
          >
            <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
              <span className="font-medium text-white/90">{d.qubits}</span>
              <span className="text-[11px] text-white/45 font-mono px-1.5 py-0.5 rounded bg-white/5">
                {d.formula}
              </span>
            </div>
            <div className="text-[#22D3EE] font-bold text-base sm:text-lg tracking-tight">
              {d.dim}
            </div>
          </div>
        ))}
      </div>

      {/* Note Box */}
      <div className="p-3 rounded-xl bg-white/[0.025] border border-white/5">
        <p className="text-xs sm:text-[12.5px] text-white/75 leading-relaxed font-light flex items-center gap-2.5">
          <span className="text-[#22D3EE] text-sm flex-shrink-0">ℹ</span>
          <span>Custom statevectors also supported beyond presets.</span>
        </p>
      </div>
    </div>
  )
}

/**
 * Step 02 Gutter Panel — Agent Architecture
 * Compares DQN (Dueling + PER) and PPO (GAE) neural network setups.
 */
export function Step02GutterPanel({ isActivated }) {
  return (
    <div
      className={`w-full rounded-2xl border p-5 sm:p-6 transition-all duration-500 text-left ${
        isActivated
          ? 'bg-[#090912]/85 border-white/15 shadow-[0_0_30px_rgba(79,70,229,0.08)] backdrop-blur-sm'
          : 'bg-[#07070d]/50 border-white/5 opacity-40 grayscale'
      }`}
    >
      {/* Header Badge — Single Line No-Wrap */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/10 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#6366f1] flex-shrink-0 animate-pulse" />
          <span className="font-mono text-xs sm:text-[13px] font-bold text-[#6366f1] tracking-wider uppercase whitespace-nowrap">
            AGENT ARCHITECTURE
          </span>
        </div>
        <span className="font-mono text-[11px] sm:text-xs text-white/50 whitespace-nowrap flex-shrink-0">
          RL Models
        </span>
      </div>

      {/* Agent Comparison Cards */}
      <div className="flex flex-col gap-3">
        {/* DQN */}
        <div className="p-3.5 rounded-xl bg-white/[0.035] border border-white/5 transition-all hover:bg-white/[0.06]">
          <div className="flex items-center justify-between mb-1.5 font-mono text-xs">
            <span className="font-bold text-[#22D3EE] text-[13px]">▸ DQN</span>
            <span className="text-[10.5px] text-white/60 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 font-medium">
              Value-Based
            </span>
          </div>
          <p className="text-xs sm:text-[12.5px] text-white/75 leading-relaxed font-light">
            Dueling architecture, Prioritized Experience Replay (PER), 768-unit hidden layers.
          </p>
        </div>

        {/* PPO */}
        <div className="p-3.5 rounded-xl bg-white/[0.035] border border-white/5 transition-all hover:bg-white/[0.06]">
          <div className="flex items-center justify-between mb-1.5 font-mono text-xs">
            <span className="font-bold text-[#818cf8] text-[13px]">▸ PPO</span>
            <span className="text-[10.5px] text-white/60 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 font-medium">
              Policy-Gradient
            </span>
          </div>
          <p className="text-xs sm:text-[12.5px] text-white/75 leading-relaxed font-light">
            Generalized Advantage Estimation (GAE), entropy-tuned policy, decoupled actor-critic.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Step 03 Gutter Panel — Metrics Tracked
 * Outlines fidelity, gate count, circuit depth, success rate, and classical baseline benchmarks.
 */
export function Step03GutterPanel({ isActivated }) {
  const metricsList = [
    { name: 'Fidelity', desc: 'Target state match accuracy' },
    { name: 'Gate Count', desc: 'Total quantum gates used' },
    { name: 'Circuit Depth', desc: 'Parallel execution layers' },
    { name: 'Success Rate', desc: 'Runs achieving ≥ 0.95' },
    { name: 'Classical Baseline', desc: 'A* / BFS comparison' },
  ]

  return (
    <div
      className={`w-full rounded-2xl border p-5 sm:p-6 transition-all duration-500 text-left ${
        isActivated
          ? 'bg-[#090912]/85 border-white/15 shadow-[0_0_30px_rgba(16,185,129,0.08)] backdrop-blur-sm'
          : 'bg-[#07070d]/50 border-white/5 opacity-40 grayscale'
      }`}
    >
      {/* Header Badge — Single Line No-Wrap */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/10 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#10b981] flex-shrink-0 animate-pulse" />
          <span className="font-mono text-xs sm:text-[13px] font-bold text-[#10b981] tracking-wider uppercase whitespace-nowrap">
            METRICS TRACKED
          </span>
        </div>
        <span className="font-mono text-[11px] sm:text-xs text-white/50 whitespace-nowrap flex-shrink-0">
          Validation Suite
        </span>
      </div>

      {/* Metrics List with Generous Label-to-Description Spacing */}
      <div className="flex flex-col gap-2.5">
        {metricsList.map((m) => (
          <div
            key={m.name}
            className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.035] border border-white/5 text-xs sm:text-[12.5px] gap-4 transition-all hover:bg-white/[0.06]"
          >
            <span className="font-mono text-white/90 font-semibold whitespace-nowrap flex-shrink-0">
              {m.name}
            </span>
            <span className="text-white/65 text-xs font-light text-right leading-tight">
              {m.desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Step 04 Gutter Panel — Export Formats
 * Lists supported output formats: OpenQASM 2.0, PNG diagrams, Qiskit Python, and JSON.
 */
export function Step04GutterPanel({ isActivated }) {
  const formats = [
    { ext: 'QASM 2.0', icon: 'terminal', desc: 'Universal quantum assembly circuit' },
    { ext: 'PNG Diagram', icon: 'image', desc: 'High-res schematic circuit render' },
    { ext: 'Qiskit Python', icon: 'code', desc: 'Ready-to-run IBM Quantum SDK python script' },
    { ext: 'JSON Spec', icon: 'data_object', desc: 'Circuit DAG & gate metadata' },
  ]

  return (
    <div
      className={`w-full rounded-2xl border p-5 sm:p-6 transition-all duration-500 text-left ${
        isActivated
          ? 'bg-[#090912]/85 border-white/15 shadow-[0_0_30px_rgba(168,85,247,0.08)] backdrop-blur-sm'
          : 'bg-[#07070d]/50 border-white/5 opacity-40 grayscale'
      }`}
    >
      {/* Header Badge — Single Line No-Wrap */}
      <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/10 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#a855f7] flex-shrink-0 animate-pulse" />
          <span className="font-mono text-xs sm:text-[13px] font-bold text-[#a855f7] tracking-wider uppercase whitespace-nowrap">
            EXPORT FORMATS
          </span>
        </div>
        <span className="font-mono text-[11px] sm:text-xs text-white/50 whitespace-nowrap flex-shrink-0">
          Interoperability
        </span>
      </div>

      {/* Formats Grid with Clean Natural Line Wrapping */}
      <div className="grid grid-cols-2 gap-3">
        {formats.map((f) => (
          <div
            key={f.ext}
            className="p-3.5 rounded-xl bg-white/[0.035] border border-white/5 flex flex-col justify-between transition-all hover:bg-white/[0.06]"
          >
            <div className="flex items-center gap-2 font-mono text-xs sm:text-[12.5px] text-[#22D3EE] font-semibold mb-2">
              <span className="material-symbols-outlined text-base text-white/70">
                {f.icon}
              </span>
              <span className="whitespace-nowrap text-white/90">{f.ext}</span>
            </div>
            <span className="text-xs text-white/65 leading-relaxed font-light">
              {f.desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}


