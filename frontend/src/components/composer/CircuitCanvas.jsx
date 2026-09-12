import React, { useEffect, useState } from 'react'
import { useCircuitStore } from './core/store/useCircuitStore'
import CircuitCell, { getCellGateInfo } from './CircuitCell'

export default function CircuitCanvas({
  selectedGate,
  setSelectedGate,
  readOnly = false,
  customCircuit = null,
  customQubits = null,
  customSteps = null,
}) {
  const {
    qubits: storeQubits,
    steps: storeSteps,
    circuit: storeCircuit,
    removeGate,
    resetCircuit,
    undo,
    redo,
    historyIndex,
    history,
  } = useCircuitStore()

  const qubits = customQubits ?? storeQubits
  const steps = customSteps ?? (customCircuit ? (customCircuit[0]?.length || 10) : storeSteps)
  const circuit = customCircuit ?? storeCircuit

  const [activeCell, setActiveCell] = useState(null)

  const minCols = 10
  const totalCols = Math.max(minCols, steps)

  const handleSelectGate = (cellInfo) => {
    if (readOnly) return
    setActiveCell(cellInfo)
    if (setSelectedGate) {
      setSelectedGate(cellInfo)
    }
  }

  const handleRemoveGate = (qubit, step) => {
    if (readOnly) return
    removeGate(qubit, step)
    if (activeCell && activeCell.qubit === qubit && activeCell.step === step) {
      setActiveCell(null)
      if (setSelectedGate) setSelectedGate(null)
    }
  }

  // Keyboard Delete key support (only active in editable mode)
  useEffect(() => {
    if (readOnly) return
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeCell) {
          removeGate(activeCell.qubit, activeCell.step)
          setActiveCell(null)
          if (setSelectedGate) setSelectedGate(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeCell, removeGate, setSelectedGate, readOnly])

  const labelWidth = readOnly ? 46 : 70

  return (
    <div
      className={`flex-1 ${
        readOnly ? 'bg-[#161622] p-3 sm:p-3.5' : 'bg-[#1a1a1a] p-6'
      } h-full min-h-0 min-w-0 overflow-x-auto overflow-y-auto flex flex-col relative select-none [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-[#0d1117] [&::-webkit-scrollbar-thumb]:bg-cyan-500/50 hover:[&::-webkit-scrollbar-thumb]:bg-cyan-400 [&::-webkit-scrollbar-thumb]:rounded-full`}
      style={{ scrollbarColor: 'rgba(6, 182, 212, 0.5) #0d1117', scrollbarWidth: 'thin' }}
      onClick={() => {
        if (readOnly) return
        setActiveCell(null)
        if (setSelectedGate) setSelectedGate(null)
      }}
    >
      {/* Top Controls Strip (Undo, Redo, Reset) — only rendered in interactive mode */}
      {!readOnly && (
        <div className="flex items-center justify-between border-b border-[#393939] pb-3 mb-6 shrink-0">
          <div className="flex items-center gap-3 text-sm font-semibold">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="apple-btn-base apple-btn-secondary px-3.5 py-1.5 text-xs font-semibold"
            >
              ↩ Undo
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className="apple-btn-base apple-btn-secondary px-3.5 py-1.5 text-xs font-semibold"
            >
              ↪ Redo
            </button>
            <button
              onClick={resetCircuit}
              className="apple-btn-base apple-btn-secondary px-3.5 py-1.5 text-xs font-semibold"
            >
              ⨂ Clear Canvas
            </button>
          </div>
        </div>
      )}

      {/* Main Grid Area */}
      <div className="inline-flex flex-col min-w-max relative">
        {/* Column Headers (1, 2, 3...) */}
        <div className="flex items-center mb-2">
          {/* Wire header padding */}
          <div style={{ width: `${labelWidth}px` }} className="shrink-0" />
          {Array.from({ length: totalCols }, (_, colIdx) => (
            <div
              key={colIdx}
              className="w-[48px] text-center font-mono text-sm font-bold text-[#e1e4e8]"
            >
              {colIdx + 1}
            </div>
          ))}
        </div>

        {/* SVG Multi-Qubit Vertical Lines Overlay (z-0 behind cells so drop hit testing works) */}
        <svg
          className="absolute top-[28px] pointer-events-none z-0"
          style={{ left: `${labelWidth}px`, width: `${totalCols * 48}px`, height: `${qubits * 48 + 30}px` }}
        >
          {Array.from({ length: totalCols }, (_, stepIdx) => {
            const resolvedCells = []
            for (let q = 0; q < qubits; q++) {
              const info = getCellGateInfo(circuit, q, stepIdx, qubits)
              if (info) resolvedCells.push({ qubit: q, gate: info })
            }

            if (resolvedCells.length === 0) return null

            const x = stepIdx * 48 + 24

            // 1. CNOT: Find control and target
            const cnotTarget = resolvedCells.find(
              (c) => c.gate.role === 'TARGET' && (c.gate.type === 'CNOT' || c.gate.type === 'CX')
            )
            const cnotControl = resolvedCells.find(
              (c) => c.gate.role === 'CONTROL' && (c.gate.type === 'CNOT' || c.gate.type === 'CX')
            )
            if (cnotTarget && cnotControl) {
              const y1 = cnotControl.qubit * 48 + 24
              const y2 = cnotTarget.qubit * 48 + 24
              return (
                <line
                  key={`cnot-${stepIdx}`}
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke="#29b6f6"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )
            }

            // 2. CCNOT (Toffoli): Find controls and target
            const ccnotTarget = resolvedCells.find(
              (c) => c.gate.role === 'TARGET' && (c.gate.type === 'CCNOT' || c.gate.type === 'TOFFOLI')
            )
            const ccnotControls = resolvedCells.filter(
              (c) => c.gate.role === 'CONTROL' && (c.gate.type === 'CCNOT' || c.gate.type === 'TOFFOLI')
            )
            if (ccnotTarget && ccnotControls.length > 0) {
              const allQ = [ccnotTarget.qubit, ...ccnotControls.map((c) => c.qubit)]
              const y1 = Math.min(...allQ) * 48 + 24
              const y2 = Math.max(...allQ) * 48 + 24
              return (
                <line
                  key={`ccnot-${stepIdx}`}
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke="#29b6f6"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )
            }

            // 3. SWAP: Find the 2 SWAP cells
            const swapCells = resolvedCells.filter((c) => c.gate.role === 'SWAP' || c.gate.type === 'SWAP')
            if (swapCells.length === 2) {
              const y1 = swapCells[0].qubit * 48 + 24
              const y2 = swapCells[1].qubit * 48 + 24
              return (
                <line
                  key={`swap-${stepIdx}`}
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke="#29b6f6"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )
            }

            // 4. CZ: Find CZ cells
            const czCells = resolvedCells.filter((c) => c.gate.type === 'CZ')
            if (czCells.length === 2) {
              const y1 = czCells[0].qubit * 48 + 24
              const y2 = czCells[1].qubit * 48 + 24
              return (
                <line
                  key={`cz-${stepIdx}`}
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke="#81d4fa"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )
            }

            // 5. Measure
            const measureCell = resolvedCells.find((c) => c.gate.type === 'Measure' || c.gate.type === 'MEASURE')
            if (measureCell) {
              const y1 = measureCell.qubit * 48 + 24
              const y2 = qubits * 48 + 16
              return (
                <line
                  key={`measure-${stepIdx}`}
                  x1={x}
                  y1={y1}
                  x2={x}
                  y2={y2}
                  stroke="#78909c"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )
            }

            return null
          })}
        </svg>

        {/* Qubit Rows */}
        {Array.from({ length: qubits }, (_, qIdx) => (
          <div key={qIdx} className="flex items-center h-[48px] relative z-10">
            {/* Left Qubit Wire Label */}
            <div
              style={{ width: `${labelWidth}px` }}
              className="shrink-0 flex items-center pr-2.5 justify-end z-20"
            >
              <span className="font-mono text-xs sm:text-sm text-white font-bold tracking-tight">
                q[{qIdx}]
              </span>
            </div>

            {/* Wire Cells */}
            <div className="flex items-center relative z-10">
              {Array.from({ length: totalCols }, (_, colIdx) => {
                const isSelected =
                  !readOnly && activeCell?.qubit === qIdx && activeCell?.step === colIdx

                return (
                  <CircuitCell
                    key={colIdx}
                    qubit={qIdx}
                    step={colIdx}
                    isSelected={isSelected}
                    onSelectGate={handleSelectGate}
                    onRemoveGate={handleRemoveGate}
                    numQubits={qubits}
                    readOnly={readOnly}
                    customCircuit={circuit}
                  />
                )
              })}
            </div>

            {/* Right End Wire Measurement Symbol */}
            <div
              className="ml-2 w-6 h-6 rounded-full border border-[#a8a8a8]/70 flex items-center justify-center text-white text-xs font-mono shrink-0 shadow-sm"
              title="Measurement meter"
            >
              ◒
            </div>
          </div>
        ))}

        {/* Classical Register c{qubits} line below wires */}
        <div className="flex items-center mt-3 relative" style={{ paddingLeft: `${labelWidth}px` }}>
          <div
            style={{ width: `${labelWidth}px`, marginLeft: `-${labelWidth}px` }}
            className="flex items-center pr-2.5 text-xs sm:text-sm text-white font-bold font-mono justify-end"
          >
            <span>c{qubits}</span>
          </div>
          <div
            className="h-[2px] bg-[#525252]"
            style={{ width: `${totalCols * 48}px` }}
          />
        </div>
      </div>
    </div>
  )
}
