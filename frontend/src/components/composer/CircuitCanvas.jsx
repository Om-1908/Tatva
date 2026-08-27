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

  return (
    <div
      className={`flex-1 bg-[#1a1a1a] h-full overflow-x-auto overflow-y-auto flex flex-col p-6 relative select-none ${
        readOnly ? 'rounded-2xl border border-white/10' : ''
      }`}
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
          <div className="w-[100px] shrink-0" />
          {Array.from({ length: totalCols }, (_, colIdx) => (
            <div
              key={colIdx}
              className="w-[48px] text-center font-mono text-sm font-bold text-[#e1e4e8]"
            >
              {colIdx + 1}
            </div>
          ))}
        </div>

        {/* SVG Multi-Qubit Vertical Lines Overlay */}
        <svg
          className="absolute left-[100px] top-[28px] pointer-events-none z-10"
          style={{ width: `${totalCols * 48}px`, height: `${qubits * 48 + 30}px` }}
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
          <div key={qIdx} className="flex items-center h-[48px] relative">
            {/* Left Qubit Wire Label */}
            <div className="w-[100px] shrink-0 flex items-center gap-2 pr-3 justify-end z-10">
              <span className="font-mono text-sm text-white font-bold">
                q[{qIdx}]
              </span>
            </div>

            {/* Wire Cells */}
            <div className="flex items-center relative">
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

        {/* Classical Register c4 line below wires */}
        <div className="flex items-center mt-4 pl-[100px] relative">
          <div className="flex items-center gap-2 pr-3 text-sm text-white font-bold font-mono w-[100px] justify-end -ml-[100px]">
            <span>c4</span>
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
