import React, { useState, useEffect } from 'react'
import { useCircuitStore } from './core/store/useCircuitStore'
import CodePanel from './CodePanel'

const GATE_INFO = {
  H: {
    name: 'Hadamard (H)',
    desc: 'Puts qubit into an equal superposition of |0⟩ and |1⟩.',
    matrix: [
      ['0.707', '0.707'],
      ['0.707', '-0.707'],
    ],
  },
  X: {
    name: 'Pauli-X (X)',
    desc: 'Quantum NOT gate. Flips |0⟩ to |1⟩ and vice versa.',
    matrix: [
      ['0', '1'],
      ['1', '0'],
    ],
  },
  Y: {
    name: 'Pauli-Y (Y)',
    desc: 'Performs a π rotation around Y-axis of Bloch sphere.',
    matrix: [
      ['0', '-i'],
      ['i', '0'],
    ],
  },
  Z: {
    name: 'Pauli-Z (Z)',
    desc: 'Flips the phase of |1⟩ state by π radians.',
    matrix: [
      ['1', '0'],
      ['0', '-1'],
    ],
  },
  S: {
    name: 'S Gate (Phase)',
    desc: 'Adds a π/2 phase shift to |1⟩ state.',
    matrix: [
      ['1', '0'],
      ['0', 'i'],
    ],
  },
  T: {
    name: 'T Gate (π/8)',
    desc: 'Adds a π/4 phase shift to |1⟩ state.',
    matrix: [
      ['1', '0'],
      ['0', '0.707+0.707i'],
    ],
  },
  RX: {
    name: 'RX(θ) Rotation',
    desc: 'Rotates qubit state around X-axis by angle θ radians.',
    isRotation: true,
  },
  RY: {
    name: 'RY(θ) Rotation',
    desc: 'Rotates qubit state around Y-axis by angle θ radians.',
    isRotation: true,
  },
  RZ: {
    name: 'RZ(θ) Rotation',
    desc: 'Rotates qubit state around Z-axis by angle θ radians.',
    isRotation: true,
  },
  CNOT: {
    name: 'CNOT (CX)',
    desc: 'Controlled-NOT gate. Flips target qubit if control qubit is |1⟩.',
    matrix: [
      ['1', '0', '0', '0'],
      ['0', '1', '0', '0'],
      ['0', '0', '0', '1'],
      ['0', '0', '1', '0'],
    ],
  },
  CZ: {
    name: 'Controlled-Z (CZ)',
    desc: 'Applies Z gate on target if control qubit is |1⟩.',
    matrix: [
      ['1', '0', '0', '0'],
      ['0', '1', '0', '0'],
      ['0', '0', '1', '0'],
      ['0', '0', '0', '-1'],
    ],
  },
  SWAP: {
    name: 'SWAP Gate',
    desc: 'Swaps quantum state values between two qubits.',
    matrix: [
      ['1', '0', '0', '0'],
      ['0', '0', '1', '0'],
      ['0', '1', '0', '0'],
      ['0', '0', '0', '1'],
    ],
  },
  Measure: {
    name: 'Measurement (M)',
    desc: 'Measures quantum state into classical bit register.',
    matrix: null,
  },
}

function computeRotationMatrix(type, theta) {
  const half = (theta || Math.PI / 2) / 2
  const cos = Math.cos(half).toFixed(3)
  const sin = Math.sin(half).toFixed(3)

  if (type === 'RX') {
    return [
      [cos, `-${sin}i`],
      [`-${sin}i`, cos],
    ]
  }
  if (type === 'RY') {
    return [
      [cos, `-${sin}`],
      [sin, cos],
    ]
  }
  if (type === 'RZ') {
    return [
      [`e^(-i${(theta / 2).toFixed(2)})`, '0'],
      ['0', `e^(i${(theta / 2).toFixed(2)})`],
    ]
  }
  return [
    ['1', '0'],
    ['0', `e^(i${(theta || 0).toFixed(2)})`],
  ]
}

export default function PropertiesPanel({ selectedGate }) {
  const { updateGateTheta } = useCircuitStore()
  const [angleRad, setAngleRad] = useState(Math.PI / 2)
  const [panelWidth, setPanelWidth] = useState(280)
  const [isResizing, setIsResizing] = useState(false)

  const gate = selectedGate?.gate
  const info = gate ? GATE_INFO[gate.type] || { name: gate.type, desc: 'Quantum gate instruction' } : null

  useEffect(() => {
    if (gate && gate.theta !== undefined) {
      setAngleRad(gate.theta)
    } else {
      setAngleRad(Math.PI / 2)
    }
  }, [gate])

  const handleMouseDownResize = (e) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = panelWidth

    const onMouseMove = (moveEvent) => {
      const deltaX = startX - moveEvent.clientX
      const newWidth = Math.max(220, Math.min(650, startWidth + deltaX))
      setPanelWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleApplyAngle = () => {
    if (selectedGate && updateGateTheta) {
      updateGateTheta(selectedGate.qubit, selectedGate.step, Number(angleRad))
    }
  }

  const angleDeg = (angleRad * (180 / Math.PI)).toFixed(1)

  return (
    <aside
      style={{ width: `${panelWidth}px` }}
      className={`bg-[#262626] border-l border-[#393939] h-full overflow-y-auto flex flex-col p-4 shrink-0 select-none relative group ${
        isResizing ? 'transition-none' : 'transition-[width] duration-100'
      }`}
    >
      {/* Left Resizable Drag Bar */}
      <div
        onMouseDown={handleMouseDownResize}
        className="absolute top-0 bottom-0 left-0 w-2 hover:bg-[#0062ff] cursor-ew-resize flex items-center justify-center transition-colors group/bar z-30"
        title="Click and drag to resize panel width"
      >
        <div className="w-0.5 h-10 rounded-full bg-white/20 group-hover/bar:bg-white transition-colors" />
      </div>

      <div className="text-xs font-bold tracking-wider uppercase text-white border-b border-[#393939] pb-2 mb-4">
        Gate Properties
      </div>

      {!gate ? (
        <div className="flex-1 flex items-center justify-center text-center px-4">
          <p className="text-sm text-[#a8a8a8] leading-relaxed">
            Select a gate on the circuit canvas to view and edit its properties.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Gate Header */}
          <div>
            <h3 className="text-lg font-bold text-white">{info.name}</h3>
            <p className="text-sm text-[#a8a8a8] mt-1 leading-relaxed">{info.desc}</p>
            <div className="mt-2 text-xs font-mono text-[#0062ff] font-bold">
              Qubit: q[{selectedGate.qubit}] | Step: {selectedGate.step + 1}
            </div>
          </div>

          {/* Angle Input for Rotation Gates */}
          {info.isRotation && (
            <div className="bg-[#1f1f1f] p-3.5 rounded-2xl border border-[#393939] flex flex-col gap-2">
              <label className="text-sm font-semibold text-[#f4f4f4]">Rotation Angle θ (radians):</label>
              <input
                type="number"
                step="0.1"
                value={angleRad}
                onChange={(e) => setAngleRad(Number(e.target.value))}
                className="bg-[#262626] border border-[#525252] focus:border-[#0062ff] text-white text-sm px-3.5 py-2 rounded-xl outline-none font-mono"
              />
              <span className="text-xs text-[#a8a8a8] font-mono">
                Equivalent: {angleDeg}°
              </span>
              <button
                onClick={handleApplyAngle}
                className="mt-1 w-full bg-[#0062ff] hover:bg-[#0050d4] text-white text-sm font-semibold py-2 rounded-xl transition-colors"
              >
                Apply Angle
              </button>
            </div>
          )}

          {/* Unitary Matrix Display */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#a8a8a8]">Unitary Matrix:</span>
            {(() => {
              const matrix = info.isRotation
                ? computeRotationMatrix(gate.type, angleRad)
                : info.matrix

              if (!matrix) return <span className="text-sm text-[#a8a8a8]">Non-unitary / Measurement</span>

              return (
                <div className="bg-[#393939] p-3 rounded-2xl border border-[#525252] overflow-x-auto">
                  <div
                    className="grid gap-2 text-center font-mono text-sm text-white"
                    style={{ gridTemplateColumns: `repeat(${matrix.length}, minmax(0, 1fr))` }}
                  >
                    {matrix.map((row, rIdx) =>
                      row.map((val, cIdx) => (
                        <div
                          key={`${rIdx}-${cIdx}`}
                          className="bg-[#262626] py-1.5 px-2 rounded-lg text-xs border border-[#525252]"
                        >
                          {val}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Qiskit / OpenQASM Code Export Panel (Matching Screenshots) */}
      <CodePanel />
    </aside>
  )
}
