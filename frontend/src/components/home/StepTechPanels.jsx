import React, { useState, useEffect, useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * KaTeX Formula Renderer Helper
 */
function KaTeXFormula({ math, className = '' }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: false,
        throwOnError: false,
      })
    } catch (e) {
      return math
    }
  }, [math])

  return (
    <span
      className={`inline-block ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/**
 * Step 01 Technical Panel — Configure Target State (Compact)
 * Displays preset state chips, qubit range, and a KaTeX state equation.
 */
export function Step01TargetStatePanel({ isActivated }) {
  const presets = [
    { label: '|0⟩', math: '|\\psi\\rangle = 1.0|0\\rangle + 0.0|1\\rangle' },
    { label: '|1⟩', math: '|\\psi\\rangle = 0.0|0\\rangle + 1.0|1\\rangle' },
    { label: '|+⟩', math: '|\\psi\\rangle = 0.707|0\\rangle + 0.707|1\\rangle' },
    { label: '|−⟩', math: '|\\psi\\rangle = 0.707|0\\rangle - 0.707|1\\rangle' },
    { label: 'Bell', math: '|\\Phi^+\\rangle = \\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)' },
    { label: 'GHZ', math: '|\\text{GHZ}\\rangle = \\frac{1}{\\sqrt{2}}(|000\\rangle + |111\\rangle)' },
  ]

  const [selectedIdx, setSelectedIdx] = useState(2) // Default |+⟩ superposition

  return (
    <div className="w-full mt-2.5 pt-2 border-t border-white/10 flex flex-col gap-2 text-left">
      {/* Preset State Pills */}
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-1 flex-wrap">
          {presets.map((preset, idx) => (
            <button
              key={preset.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedIdx(idx)
              }}
              className={`px-1.5 py-0.5 rounded text-[10.5px] font-mono transition-all ${
                selectedIdx === idx
                  ? 'bg-[#22D3EE]/20 border border-[#22D3EE]/60 text-[#22D3EE] font-semibold'
                  : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <span className="font-mono text-[10px] text-[#22D3EE]/80">
          Supports 1–4 qubits
        </span>
      </div>

      {/* KaTeX State Vector Equation Box */}
      <div className="px-2.5 py-1.5 rounded-lg bg-[#08080e]/90 border border-white/10 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
          <span className="font-mono text-[10px] text-white/40 uppercase tracking-wider">
            State:
          </span>
          <KaTeXFormula
            math={presets[selectedIdx].math}
            className="text-xs text-white/95 font-mono"
          />
        </div>

        <span className="text-[9px] font-mono text-white/40 hidden sm:inline">
          {presets[selectedIdx].label}
        </span>
      </div>
    </div>
  )
}

/**
 * Step 02 Technical Panel — RL Agent Synthesis (Compact)
 * Displays an animated terminal training console and agent specifications.
 */
export function Step02RLSynthesisPanel({ isActivated }) {
  const logSequences = [
    [
      'Episode 1247 | Fidelity: 0.87 | ε: 0.12',
      'Episode 1248 | Fidelity: 0.91 | ε: 0.12',
      'Episode 1249 | Fidelity: 0.86 | ε: 0.11',
    ],
    [
      'Episode 1250 | Fidelity: 0.93 | ε: 0.10',
      'Episode 1251 | Fidelity: 0.96 | ε: 0.09',
      'Episode 1252 | Fidelity: 0.98 | ε: 0.08',
    ],
    [
      'Episode 1253 | Fidelity: 0.97 | ε: 0.07',
      'Episode 1254 | Fidelity: 0.99 | ε: 0.06',
      'Episode 1255 | Fidelity: 0.999| ε: 0.05',
    ],
  ]

  const [seqIdx, setSeqIdx] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setSeqIdx((prev) => (prev + 1) % logSequences.length)
    }, 2800)
    return () => clearInterval(timer)
  }, [logSequences.length])

  return (
    <div className="w-full mt-2.5 pt-2 border-t border-white/10 flex flex-col gap-1.5 text-left">
      {/* Terminal Console Block */}
      <div className="rounded-lg bg-[#07070c] border border-white/10 p-2 font-mono text-[10.5px] overflow-hidden">
        {/* Terminal Title Bar */}
        <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10 text-[9.5px] text-white/40">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
            <span className="ml-1 text-white/50">training_session.log</span>
          </div>
          <span className="text-[#22D3EE]/70 font-semibold">DQN+PPO</span>
        </div>

        {/* Animated Terminal Lines */}
        <div className="space-y-0.5 text-white/80">
          {logSequences[seqIdx].map((line, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-white/30 text-[9px] select-none">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className={idx === 2 ? 'text-[#22D3EE] font-semibold' : ''}>
                {line}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Space & Agent Specifications */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10.5px] font-mono text-white/60">
        <div className="flex items-center gap-1.5">
          <span className="text-[#22D3EE]">▸</span>
          <span>Action space: 154 gate operations</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#6366f1]">▸</span>
          <span>Agents: DQN (Dueling+PER) vs PPO</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Step 03 Technical Panel — Evaluate & Visualize (Compact)
 * Displays a 2x2 grid of validated project evaluation metrics.
 */
export function Step03EvaluationPanel({ isActivated }) {
  const metrics = [
    { label: 'Mean Fidelity', value: '0.82', desc: 'Avg across test set', color: 'text-[#22D3EE]' },
    { label: 'Median Fidelity', value: '0.90', desc: 'Target fidelity', color: 'text-[#38bdf8]' },
    { label: 'Success Rate', value: '34%', desc: 'Fidelity > 0.95', color: 'text-[#10b981]' },
    { label: 'Avg Gate Count', value: '7', desc: 'Depth optimization', color: 'text-[#a855f7]' },
  ]

  return (
    <div className="w-full mt-2.5 pt-2 border-t border-white/10 flex flex-col gap-1.5 text-left">
      {/* 2x2 Stat Tiles Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="p-1.5 px-2 rounded-lg bg-[#08080e]/90 border border-white/10 flex flex-col justify-between"
          >
            <span className="text-[9.5px] font-mono text-white/50 uppercase tracking-wider">
              {m.label}
            </span>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className={`text-sm sm:text-base font-mono font-bold ${m.color}`}>
                {m.value}
              </span>
              <span className="text-[8.5px] font-mono text-white/40 hidden sm:inline">
                {m.desc}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Step 04 Technical Panel — Edit & Export (Compact)
 * Displays a syntax code block and export button affordances.
 */
export function Step04ExportPanel({ isActivated }) {
  const qasmCode = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[1];
ry(0.3927) q[0];
h q[0];`

  return (
    <div className="w-full mt-2.5 pt-2 border-t border-white/10 flex flex-col gap-2 text-left">
      {/* QASM Snippet Container */}
      <div className="rounded-lg bg-[#07070c] border border-white/10 p-2 font-mono text-[10px]">
        <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10 text-[9.5px] text-white/40">
          <span>circuit_export.qasm</span>
          <span className="text-[#22D3EE]/70">OpenQASM 2.0</span>
        </div>
        <pre className="text-white/80 leading-tight whitespace-pre font-mono text-[10px]">
          <code>{qasmCode}</code>
        </pre>
      </div>

      {/* Export Action Affordances */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="px-2.5 py-1 rounded-lg bg-[#1a1a24] border border-white/10 hover:border-[#22D3EE]/50 hover:bg-[#222230] text-[10.5px] font-mono text-white/80 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm text-[#22D3EE]">
            download
          </span>
          <span>Download .qasm</span>
        </button>

        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="px-2.5 py-1 rounded-lg bg-[#1a1a24] border border-white/10 hover:border-[#6366f1]/50 hover:bg-[#222230] text-[10.5px] font-mono text-white/80 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm text-[#6366f1]">
            image
          </span>
          <span>Download .png</span>
        </button>
      </div>
    </div>
  )
}
