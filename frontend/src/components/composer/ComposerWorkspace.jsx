import React, { useState, useMemo } from 'react'
import TopNavbar from './TopNavbar'
import GatePalette from './GatePalette'
import CircuitCanvas from './CircuitCanvas'
import PropertiesPanel from './PropertiesPanel'
import ResultsPanel from './ResultsPanel'
import { useCircuitStore } from './core/store/useCircuitStore'
import { useAutoSimulate } from './core/hooks/useAutoSimulate'
import { useSimulation } from './core/hooks/useSimulation'
import {
  resolveTargetVector,
  calculateQuantumFidelity,
  computeCanvasStatevector,
} from '../../utils/quantumFidelity'
import './composer.css'

function ValidationHeader({ onClearCircuit }) {
  const {
    qubits,
    circuit,
    gates = [],
    targetStateLabel,
    targetStatevector,
    selectedState,
  } = useCircuitStore()

  const currentLabel = targetStateLabel || selectedState || '|0⟩'

  const targetVector = useMemo(() => {
    return resolveTargetVector(currentLabel, targetStatevector, qubits)
  }, [currentLabel, targetStatevector, qubits])

  // Live fidelity calculated purely and solely from the interactive canvas gates!
  const liveFidelity = useMemo(() => {
    // When no gates have been placed on the canvas, return null (awaiting user gates)
    if (!gates || gates.length === 0) {
      return null
    }

    const canvasVector = computeCanvasStatevector(circuit, qubits)
    if (!canvasVector) return null

    return calculateQuantumFidelity(canvasVector, targetVector, qubits)
  }, [circuit, gates, targetVector, qubits])

  const hasGates = Boolean(gates && gates.length > 0)
  const isMatched = liveFidelity !== null && liveFidelity >= 0.99
  const fidelityPercent = liveFidelity !== null ? (liveFidelity * 100).toFixed(2) : null

  return (
    <div className="w-full bg-[#181726] border-b border-white/10 px-4 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-md">
      {/* Left: Section Label & Target State */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
          <span className="material-symbols-outlined text-[20px]">science</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Validation Workspace
            </h3>
            <span className="apple-pill bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">
              Interactive • Build From Scratch
            </span>
          </div>
          <p className="text-xs text-gray-400 font-sans">
            Validate: build a circuit that reaches target state{' '}
            <span className="text-secondary font-mono font-bold">{currentLabel}</span>
            <span className="text-gray-500 ml-1.5">
              • {hasGates ? 'Live fidelity changes as you edit gates' : 'Place gates on canvas to begin validation'}
            </span>
          </p>
        </div>
      </div>

      {/* Right: Live Canvas Fidelity Readout & Reset Control */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Live Fidelity Readout */}
        <div className="flex items-center gap-3 bg-[#121124] px-3.5 py-1.5 rounded-md border border-white/15 shadow-sm">
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">
              Canvas Fidelity vs Target
            </span>
            <div className="flex items-center gap-1.5 justify-end">
              <span
                className={`font-mono text-sm font-bold ${
                  hasGates
                    ? isMatched
                      ? 'text-emerald-400'
                      : liveFidelity > 0.4
                      ? 'text-cyan-400'
                      : 'text-amber-400'
                    : 'text-gray-400'
                }`}
              >
                {hasGates ? `${fidelityPercent}%` : '--'}
              </span>
              {hasGates && (
                <span className="text-[11px] text-gray-500 font-mono">
                  ({liveFidelity.toFixed(4)})
                </span>
              )}
            </div>
          </div>

          {/* Status Indicator Pill */}
          <div
            className={`apple-pill ${
              !hasGates
                ? 'bg-white/5 border-white/10 text-gray-400'
                : isMatched
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
            }`}
          >
            <span className="material-symbols-outlined text-[15px] leading-none">
              {!hasGates ? 'touch_app' : isMatched ? 'check_circle' : 'trending_up'}
            </span>
            <span className="leading-none">
              {!hasGates
                ? 'Apply gates on canvas'
                : isMatched
                ? '✓ Target Reached!'
                : 'In Progress'}
            </span>
          </div>
        </div>

        {/* Clear / Reset Validation Circuit Button */}
        <button
          onClick={onClearCircuit}
          className="apple-btn-base apple-btn-secondary px-3.5 py-1.5 text-xs font-mono text-rose-400 hover:text-rose-300 border-rose-500/30 hover:border-rose-500/50 gap-1.5"
          title="Clear gates from canvas only"
        >
          <span className="material-symbols-outlined text-sm leading-none">restart_alt</span>
          <span className="leading-none">Reset Canvas</span>
        </button>
      </div>
    </div>
  )
}

function QuantumComposerContent() {
  const [selectedGate, setSelectedGate] = useState(null)
  const { runSimulation, error } = useSimulation()
  const { resetCircuit } = useCircuitStore()

  // Auto-simulate on circuit changes
  useAutoSimulate()

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden bg-[#13121b] text-[#f4f4f4] quantum-composer-root relative min-h-[calc(100vh-80px)]">
      {/* Dedicated Validation Workspace Header with Live Canvas Fidelity against Target State */}
      <ValidationHeader onClearCircuit={resetCircuit} />

      {/* Composer Workspace Toolbar */}
      <TopNavbar onRunClick={runSimulation} />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden relative min-h-[500px]">
        {/* Left Gate Palette */}
        <GatePalette />

        {/* Center Circuit Canvas */}
        <CircuitCanvas selectedGate={selectedGate} setSelectedGate={setSelectedGate} />

        {/* Right Properties Panel */}
        <PropertiesPanel selectedGate={selectedGate} />
      </div>

      {/* Bottom Results Panel */}
      <ResultsPanel />

      {/* Error Toast Notification if simulation backend fails */}
      {error && (
        <div className="fixed top-14 right-6 z-[2000] bg-red-600/90 text-white text-xs font-semibold px-4 py-2.5 rounded shadow-xl border border-red-400 flex items-center gap-2 animate-bounce">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

export default function ComposerWorkspace() {
  return <QuantumComposerContent />
}
