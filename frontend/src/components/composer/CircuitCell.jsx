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
  if (!circuit || !Array.isArray(circuit)) return null
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

function GateVisual({ gate, isSelected = false }) {
  if (!gate) return null
  const role = gate?.role
  const typeUpper = (gate?.type || '').toUpperCase()

  const isControlDot = role === 'CONTROL' || (typeUpper === 'CZ' && role === 'CZ')
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

  if (isControlDot) {
    return (
      <div
        className={`w-4 h-4 rounded-full bg-[#29b6f6] shadow-md flex items-center justify-center transition-transform ${
          isSelected ? 'ring-2 ring-white scale-110' : ''
        }`}
      />
    )
  }

  if (isTargetPlus) {
    return (
      <div
        className={`w-8 h-8 apple-squircle-gate bg-[#29b6f6] border border-white/40 flex items-center justify-center shadow-md transition-transform ${
          isSelected ? 'ring-2 ring-white scale-105' : ''
        }`}
      >
        <svg className="w-5 h-5 text-[#11111a]" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="square">
          <line x1="12" y1="4" x2="12" y2="20" />
          <line x1="4" y1="12" x2="20" y2="12" />
        </svg>
      </div>
    )
  }

  if (isSwapCross) {
    return (
      <div
        className={`w-7 h-7 flex items-center justify-center text-[#29b6f6] font-bold text-lg select-none transition-transform ${
          isSelected ? 'ring-2 ring-white rounded-xs' : ''
        }`}
      >
        ✕
      </div>
    )
  }

  return (
    <div
      className={`w-9 h-9 apple-squircle-gate flex flex-col items-center justify-center font-bold font-mono text-xs shadow-md border border-white/20 transition-all ${
        GATE_COLOR_MAP[gate.type] || 'bg-[#29b6f6] text-white'
      } ${isSelected ? 'ring-2 ring-white scale-105 shadow-xl' : ''}`}
    >
      <span className="leading-none">{gate.type === 'NOT' ? 'X' : gate.type}</span>
      {gate.theta !== undefined && (
        <span className="text-[8px] leading-none font-normal opacity-90 mt-0.5">
          {formatAngleDisplay(gate.theta)}
        </span>
      )}
    </div>
  )
}

/**
 * Pure Read-Only Cell: Does NOT use React DnD hooks at all.
 * Guaranteed to never throw "Expected drag drop context".
 */
function ReadOnlyCircuitCell({ qubit, step, numQubits, customCircuit }) {
  const gate = getCellGateInfo(customCircuit, qubit, step, numQubits)

  return (
    <div className="w-[48px] h-[48px] relative flex items-center justify-center border-r border-[#393939]/60 select-none">
      {/* Horizontal wire line */}
      <div className="absolute left-0 right-0 h-[1.5px] bg-[#525252] z-0 pointer-events-none" />

      {/* Render Gate Element statically */}
      {gate && (
        <div className="z-20 relative flex items-center justify-center cursor-default pointer-events-none" title={`${gate.type} gate`}>
          <GateVisual gate={gate} isSelected={false} />
        </div>
      )}
    </div>
  )
}

/**
 * Interactive Cell: Connected to react-dnd and useCircuitStore
 */
function InteractiveCircuitCell({
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
    if (gate && onSelectGate) {
      onSelectGate({ qubit: anchorQ, step, gate })
    }
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (gate && onRemoveGate) {
      onRemoveGate(anchorQ, step)
    }
  }

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
          className={`z-20 relative flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-105 ${
            isDraggingPlaced ? 'opacity-20 scale-90' : ''
          }`}
          title="Click to select, drag to move, right-click to delete"
        >
          <GateVisual gate={gate} isSelected={isSelected} />
        </div>
      )}
    </div>
  )
}

export default function CircuitCell(props) {
  if (props.readOnly) {
    return <ReadOnlyCircuitCell {...props} />
  }
  return <InteractiveCircuitCell {...props} />
}
