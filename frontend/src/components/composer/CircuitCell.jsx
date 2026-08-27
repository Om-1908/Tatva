import React from 'react'
import { useDrop, useDrag } from 'react-dnd'
import { useCircuitStore } from './core/store/useCircuitStore'

const GATE_COLOR_MAP = {
  H: 'bg-[#f06292] text-white',
  SX: 'bg-[#f06292] text-white',
  Y: 'bg-[#f06292] text-white',
  RX: 'bg-[#f06292] text-white',
  RY: 'bg-[#f06292] text-white',
  I: 'bg-[#29b6f6] text-white',
  T: 'bg-[#81d4fa] text-slate-900',
  S: 'bg-[#81d4fa] text-slate-900',
  Z: 'bg-[#81d4fa] text-slate-900',
  Tdg: 'bg-[#81d4fa] text-slate-900',
  Sdg: 'bg-[#81d4fa] text-slate-900',
  P: 'bg-[#81d4fa] text-slate-900',
  RZ: 'bg-[#81d4fa] text-slate-900',
  Measure: 'bg-[#78909c] text-white',
  Reset: 'bg-[#78909c] text-white',
  Barrier: 'bg-[#78909c] text-white',
}

function formatAngleDisplay(theta) {
  if (theta === undefined || theta === null) return 'θ=π/2'
  if (Math.abs(theta - Math.PI / 2) < 0.01) return 'θ=π/2'
  if (Math.abs(theta - Math.PI) < 0.01) return 'θ=π'
  if (Math.abs(theta - Math.PI / 4) < 0.01) return 'θ=π/4'
  return `θ=${Number(theta).toFixed(2)}`
}

/**
 * Universal Gate Resolver for any cell (qubit, step).
 * Works for presets, JSON imports, RL agent synthesis, and manual drag-and-drop.
 */
export function getCellGateInfo(circuit, qubit, step, numQubits) {
  for (let q = 0; q < numQubits; q++) {
    const g = circuit[q]?.[step]
    if (!g) continue

    const typeUpper = (g.type || '').toUpperCase()

    // 1. CNOT / CX
    if (typeUpper === 'CNOT' || typeUpper === 'CX') {
      const ctrl = g.controlQubit !== undefined ? g.controlQubit : (g.control !== undefined ? g.control : (q > 0 ? q - 1 : 1))
      const target = g.targetQubit !== undefined ? g.targetQubit : (g.target !== undefined ? g.target : q)
      if (qubit === ctrl) return { ...g, role: 'CONTROL', anchorQubit: q }
      if (qubit === target) return { ...g, role: 'TARGET', anchorQubit: q }
    }

    // 2. CCNOT / TOFFOLI
    if (typeUpper === 'CCNOT' || typeUpper === 'TOFFOLI') {
      const c1 = g.controlQubit ?? g.control ?? 0
      const c2 = g.controlQubit2 ?? g.control2 ?? 1
      const target = g.targetQubit ?? g.target ?? q
      if (qubit === c1 || qubit === c2) return { ...g, role: 'CONTROL', anchorQubit: q }
      if (qubit === target) return { ...g, role: 'TARGET', anchorQubit: q }
    }

    // 3. SWAP
    if (typeUpper === 'SWAP') {
      const q1 = g.qubit !== undefined ? g.qubit : (g.target !== undefined ? g.target : q)
      const q2 = g.swapQubit !== undefined ? g.swapQubit : (g.swap_with !== undefined ? g.swap_with : (q1 > 0 ? q1 - 1 : 1))
      if (qubit === q1 || qubit === q2) return { ...g, role: 'SWAP', anchorQubit: q }
    }

    // 4. CZ
    if (typeUpper === 'CZ') {
      const c = g.controlQubit ?? g.control ?? 0
      const target = g.targetQubit ?? g.target ?? q
      if (qubit === c || qubit === target) return { ...g, role: 'CZ', anchorQubit: q }
    }

    // Single qubit gate on this exact wire
    if (q === qubit) return g
  }

  return null
}

export default function CircuitCell({
  qubit,
  step,
  isSelected,
  onSelectGate,
  onRemoveGate,
  numQubits,
}) {
  const { circuit, addGate, moveGate } = useCircuitStore()

  const gate = getCellGateInfo(circuit, qubit, step, numQubits)
  const anchorQ = gate?.anchorQubit ?? qubit

  // Drag handler for moving an ALREADY PLACED gate on the canvas
  const [{ isDraggingPlaced }, dragPlacedRef] = useDrag(
    () => ({
      type: 'PLACED_GATE',
      item: { fromQubit: anchorQ, fromStep: step, gate, type: gate?.type },
      canDrag: Boolean(gate),
      collect: (m) => ({
        isDraggingPlaced: Boolean(m.isDragging()),
      }),
    }),
    [anchorQ, step, gate]
  )

  // Drop handler
  const [{ isOver, canDrop }, dropRef] = useDrop(
    () => ({
      accept: ['GATE', 'PLACED_GATE'],
      drop: (item) => {
        if (item.fromQubit !== undefined && item.fromStep !== undefined) {
          if (item.fromQubit === qubit && item.fromStep === step) return
          moveGate(item.fromQubit, item.fromStep, qubit, step)
        } else {
          addGate(qubit, step, { type: item.type })
        }
      },
      collect: (monitor) => ({
        isOver: !!monitor.isOver(),
        canDrop: !!monitor.canDrop(),
      }),
    }),
    [qubit, step, moveGate, addGate]
  )

  const handleClick = (e) => {
    e.stopPropagation()
    if (gate) {
      onSelectGate({ qubit: anchorQ, step, gate })
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (gate) {
      onRemoveGate(anchorQ, step)
    }
  }

  const role = gate?.role
  const typeUpper = (gate?.type || '').toUpperCase()

  const isControlDot = role === 'CONTROL' || (typeUpper === 'CZ' && role === 'CZ')

  // Quantum Composer Target Badge: Rounded squircle badge with white border and black plus sign
  const isTargetPlus =
    role === 'TARGET' ||
    typeUpper === 'CNOT_TARGET' ||
    typeUpper === 'CCNOT_TARGET' ||
    typeUpper === 'CNOT' ||
    typeUpper === 'CX' ||
    typeUpper === 'CCNOT' ||
    typeUpper === 'TOFFOLI' ||
    typeUpper === 'X' ||
    typeUpper === 'NOT'

  const isSwapCross = role === 'SWAP' || typeUpper === 'SWAP'

  return (
    <div
      ref={dropRef}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={`w-[48px] h-[48px] relative flex items-center justify-center border-r border-[#393939]/60 select-none ${
        isOver && canDrop ? 'bg-[#29b6f6]/20' : ''
      } ${!gate && isOver && !canDrop ? 'bg-red-500/20' : ''}`}
    >
      {/* Horizontal wire line */}
      <div className="absolute left-0 right-0 h-[1.5px] bg-[#525252] z-0 pointer-events-none" />

      {/* Render Gate Element */}
      {gate && (
        <div
          ref={dragPlacedRef}
          className={`z-20 relative flex items-center justify-center cursor-grab active:cursor-grabbing ${
            isDraggingPlaced ? 'opacity-20 scale-90' : ''
          }`}
          title="Click to select, drag to move, right-click to delete"
        >
          {/* 1. Control Dot (Solid Blue Circle) */}
          {isControlDot ? (
            <div
              className={`w-4 h-4 rounded-full bg-[#29b6f6] shadow-md flex items-center justify-center transition-transform hover:scale-110 ${
                isSelected ? 'ring-2 ring-white scale-110' : ''
              }`}
            />
          ) : isTargetPlus ? (
            /* 2. Target Squircle Badge ⊕ (Rounded Blue Squircle with White Border and Black Plus Sign) */
            <div
              className={`w-8 h-8 rounded-xl bg-[#29b6f6] border-2 border-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 ${
                isSelected ? 'ring-2 ring-white scale-105' : ''
              }`}
            >
              <svg className="w-5 h-5 text-[#11111a]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="square">
                <line x1="12" y1="4" x2="12" y2="20" />
                <line x1="4" y1="12" x2="20" y2="12" />
              </svg>
            </div>
          ) : isSwapCross ? (
            /* 3. SWAP Cross ✕ (Strictly 2 qubits) */
            <div
              className={`w-7 h-7 flex items-center justify-center text-[#29b6f6] font-bold transition-transform hover:scale-110 ${
                isSelected ? 'scale-110' : ''
              }`}
            >
              <svg className="w-6 h-6 text-[#29b6f6]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </div>
          ) : typeUpper === 'BARRIER' ? (
            /* 4. Barrier Dashed Bar */
            <div className="w-3 h-11 bg-[#78909c]/40 border-x border-dashed border-[#78909c] flex items-center justify-center" />
          ) : gate.type === 'Measure' ? (
            /* 5. Measurement Meter Tile */
            <div
              className={`w-[36px] h-[36px] aspect-square rounded-xl bg-[#78909c] flex flex-col items-center justify-center text-white shadow-md transition-all ${
                isSelected ? 'border-2 border-white ring-2 ring-[#29b6f6]' : 'border border-transparent'
              }`}
            >
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 15a9 9 0 0118 0" />
                <path d="M12 15l4-7" />
              </svg>
            </div>
          ) : gate.type === 'Reset' ? (
            /* 6. Reset State Badge |0⟩ */
            <div
              className={`w-[36px] h-[36px] aspect-square rounded-xl bg-[#78909c] flex flex-col items-center justify-center text-white font-mono font-bold text-xs shadow-md transition-all ${
                isSelected ? 'border-2 border-white ring-2 ring-[#29b6f6]' : 'border border-transparent'
              }`}
            >
              |0⟩
            </div>
          ) : (
            /* 7. Standard Single-Qubit Gate Tile (H, Y, Z, S, T, RX, RY, RZ, P) */
            <div
              className={`w-[36px] h-[36px] aspect-square rounded-xl ${
                GATE_COLOR_MAP[gate.type] || 'bg-[#29b6f6] text-white'
              } flex flex-col items-center justify-center shadow-md transition-all cursor-pointer select-none ${
                isSelected ? 'border-2 border-white ring-2 ring-[#29b6f6]' : 'border border-transparent'
              }`}
            >
              <span className="font-bold text-xs font-mono leading-none">{gate.symbol || gate.type}</span>
              {['RX', 'RY', 'RZ', 'P'].includes(gate.type) && (
                <span className="text-[8px] font-mono mt-0.5 opacity-90 leading-none">
                  {formatAngleDisplay(gate.theta)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
