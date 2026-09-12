import React, { useState, useRef } from 'react'
import { useCircuitStore } from './core/store/useCircuitStore'

const GATE_CATEGORIES = [
  {
    category: 'Hadamard',
    gates: [
      { type: 'H', symbol: 'H', name: 'Hadamard', color: 'bg-[#f06292] text-white' },
    ],
  },
  {
    category: 'Quantum',
    gates: [
      { type: 'SX', symbol: '√X', name: 'SX', color: 'bg-[#f06292] text-white' },
      { type: 'Y', symbol: 'Y', name: 'Y', color: 'bg-[#f06292] text-white' },
      { type: 'RX', symbol: 'RX', name: 'RX', color: 'bg-[#f06292] text-white' },
      { type: 'RY', symbol: 'RY', name: 'RY', color: 'bg-[#f06292] text-white' },
    ],
  },
  {
    category: 'Classical',
    gates: [
      { type: 'X', symbol: '⊕', name: 'NOT', color: 'bg-[#29b6f6] text-white' },
      { type: 'CNOT', symbol: '⟁', name: 'CNOT', color: 'bg-[#29b6f6] text-white' },
      { type: 'CCNOT', symbol: '⟁⟁', name: 'Toffoli', color: 'bg-[#29b6f6] text-white' },
      { type: 'SWAP', symbol: '✕', name: 'SWAP', color: 'bg-[#29b6f6] text-white' },
      { type: 'I', symbol: 'I', name: 'Identity', color: 'bg-[#29b6f6] text-white' },
    ],
  },
  {
    category: 'Phase',
    gates: [
      { type: 'T', symbol: 'T', name: 'T', color: 'bg-[#81d4fa] text-slate-900' },
      { type: 'S', symbol: 'S', name: 'S', color: 'bg-[#81d4fa] text-slate-900' },
      { type: 'Z', symbol: 'Z', name: 'Z', color: 'bg-[#81d4fa] text-slate-900' },
      { type: 'Tdg', symbol: 'T†', name: 'Tdg', color: 'bg-[#81d4fa] text-slate-900' },
      { type: 'Sdg', symbol: 'S†', name: 'Sdg', color: 'bg-[#81d4fa] text-slate-900' },
      { type: 'P', symbol: 'P', name: 'Phase', color: 'bg-[#81d4fa] text-slate-900' },
      { type: 'RZ', symbol: 'RZ', name: 'RZ', color: 'bg-[#81d4fa] text-slate-900' },
    ],
  },
  {
    category: 'Non-unitary & modifiers',
    gates: [
      { type: 'Measure', symbol: '↗^z', name: 'Measure', color: 'bg-[#78909c] text-white' },
      { type: 'Reset', symbol: '|0⟩', name: 'Reset', color: 'bg-[#78909c] text-white' },
      { type: 'Barrier', symbol: '┆', name: 'Barrier', color: 'bg-[#78909c] text-white' },
      { type: 'CNOT', symbol: '●', name: 'Control', color: 'bg-[#78909c] text-white' },
      { type: 'Measure', symbol: 'if', name: 'Conditional', color: 'bg-[#78909c] text-white' },
      { type: 'Barrier', symbol: 'for', name: 'For loop', color: 'bg-[#78909c] text-white' },
      { type: 'Barrier', symbol: 'while', name: 'While loop', color: 'bg-[#78909c] text-white' },
      { type: 'Barrier', symbol: 'box', name: 'Box', color: 'bg-[#78909c] text-white' },
    ],
  },
  {
    category: 'Visualizations',
    gates: [
      { type: 'I', symbol: '🌐', name: 'Phase disk', color: 'bg-[#0288d1] text-white' },
    ],
  },
]

function GateItemRow({ gate }) {
  const { paletteSelectedGate, setPaletteSelectedGate } = useCircuitStore()
  const isSelected = paletteSelectedGate?.type === gate.type
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)

  const handleDragStart = (e) => {
    isDraggingRef.current = true
    setIsDragging(true)
    const payload = JSON.stringify({
      type: gate.type,
      name: gate.name,
      symbol: gate.symbol,
      theta: gate.theta ?? (['RX', 'RY', 'RZ', 'P'].includes((gate.type || '').toUpperCase()) ? Math.PI / 2 : undefined),
    })
    e.dataTransfer.setData('application/json', payload)
    e.dataTransfer.setData('text/plain', gate.type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setTimeout(() => {
      isDraggingRef.current = false
    }, 100)
  }

  const handleClick = (e) => {
    e.stopPropagation()
    if (isDraggingRef.current) return
    setPaletteSelectedGate(gate)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`flex items-center gap-3 py-1.5 px-2 rounded-md transition-all cursor-grab active:cursor-grabbing select-none ${
        isSelected
          ? 'bg-cyan-500/20 ring-1 ring-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
          : 'hover:bg-white/5'
      } ${isDragging ? 'opacity-40 scale-95' : ''}`}
      title={`Drag ${gate.name} onto canvas, or click to place`}
    >
      <div
        className={`w-8 h-8 apple-squircle-gate font-mono font-bold text-xs shrink-0 pointer-events-none ${gate.color}`}
      >
        {gate.symbol}
      </div>
      <span className="text-xs text-[#e1e4e8] font-medium truncate pointer-events-none">
        {gate.name}
      </span>
      {isSelected && (
        <span className="ml-auto w-2 h-2 rounded-full bg-cyan-400 animate-pulse pointer-events-none" />
      )}
    </div>
  )
}

function GateItemTile({ gate }) {
  const { paletteSelectedGate, setPaletteSelectedGate } = useCircuitStore()
  const isSelected = paletteSelectedGate?.type === gate.type
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)

  const handleDragStart = (e) => {
    isDraggingRef.current = true
    setIsDragging(true)
    const payload = JSON.stringify({
      type: gate.type,
      name: gate.name,
      symbol: gate.symbol,
      theta: gate.theta ?? (['RX', 'RY', 'RZ', 'P'].includes((gate.type || '').toUpperCase()) ? Math.PI / 2 : undefined),
    })
    e.dataTransfer.setData('application/json', payload)
    e.dataTransfer.setData('text/plain', gate.type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setTimeout(() => {
      isDraggingRef.current = false
    }, 100)
  }

  const handleClick = (e) => {
    e.stopPropagation()
    if (isDraggingRef.current) return
    setPaletteSelectedGate(gate)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`w-10 h-10 apple-squircle-gate font-mono font-bold text-sm cursor-grab active:cursor-grabbing transition-transform ${
        gate.color
      } ${isSelected ? 'ring-2 ring-cyan-400 scale-110 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : ''} ${
        isDragging ? 'opacity-40 scale-90' : ''
      }`}
      title={`${gate.name} gate (drag or click to place)`}
    >
      <span className="pointer-events-none">{gate.symbol}</span>
    </div>
  )
}

export default function GatePalette() {
  const { paletteSelectedGate, setPaletteSelectedGate } = useCircuitStore()
  // Keep the most common quantum gate categories open by default for immediate drag-and-drop
  const DEFAULT_OPEN_CATS = ['Hadamard', 'Quantum', 'Classical', 'Phase']
  const [collapsedCats, setCollapsedCats] = useState(() => {
    const initial = {}
    GATE_CATEGORIES.forEach((c) => {
      initial[c.category] = !DEFAULT_OPEN_CATS.includes(c.category)
    })
    return initial
  })
  const [viewMode, setViewMode] = useState('list') // 'list' or 'grid'
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const toggleCat = (cat) => {
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  // Filter gates based on search query
  const filteredCategories = GATE_CATEGORIES.map((cat) => ({
    ...cat,
    gates: cat.gates.filter(
      (g) =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.type.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.gates.length > 0)

  // Flat list of all gates for grid view
  const allGates = filteredCategories.flatMap((c) => c.gates)

  return (
    <aside className="w-[240px] bg-[#16191d] border-r border-[#262c33] h-full overflow-y-auto flex flex-col p-3 shrink-0 select-none text-[#e1e4e8]">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[#262c33] mb-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
          Operations
        </h3>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="apple-btn-icon"
            title="Search Operations"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            className="apple-btn-icon"
            title={viewMode === 'list' ? 'Switch to Icon Grid View' : 'Switch to Category List View'}
          >
            <span className="material-symbols-outlined text-[16px]">
              {viewMode === 'list' ? 'grid_view' : 'format_list_bulleted'}
            </span>
          </button>
        </div>
      </div>

      {/* Inline Search Bar */}
      {showSearch && (
        <div className="mb-3">
          <input
            type="text"
            placeholder="Filter operations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1e1b2e] border border-white/10 text-xs text-white px-3 py-1.5 rounded-md outline-none font-mono focus:border-indigo-500/50"
            autoFocus
          />
        </div>
      )}

      {/* Active Selected Gate Hint (Click-to-Place Mode) */}
      {paletteSelectedGate && (
        <div className="mb-3 px-2.5 py-2 rounded-md bg-cyan-950/80 border border-cyan-500/40 text-[11px] text-cyan-200 flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center gap-1.5 truncate">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <span className="truncate">
              Selected <strong>{paletteSelectedGate.name}</strong> • Click any cell
            </span>
          </div>
          <button
            onClick={() => setPaletteSelectedGate(null)}
            className="text-cyan-400 hover:text-white ml-2 text-xs font-bold shrink-0 cursor-pointer"
            title="Cancel selection"
          >
            ✕
          </button>
        </div>
      )}

      {/* GRID VIEW MODE */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-5 gap-2 p-1">
          {allGates.map((gate, idx) => (
            <GateItemTile key={`${gate.type}-${idx}`} gate={gate} />
          ))}
        </div>
      ) : (
        /* LIST / ACCORDION VIEW MODE */
        <div className="flex flex-col gap-2.5">
          {filteredCategories.map((group) => {
            const isClosed = collapsedCats[group.category]
            return (
              <div key={group.category} className="flex flex-col">
                <button
                  onClick={() => toggleCat(group.category)}
                  className="flex items-center justify-between text-xs font-semibold text-gray-300 py-1.5 px-1 hover:text-white transition-colors border-b border-[#262c33]/40 mb-1 cursor-pointer"
                >
                  <span className="uppercase tracking-wider">{group.category}</span>
                  <span className="material-symbols-outlined text-[14px] text-gray-400">
                    {isClosed ? 'expand_more' : 'expand_less'}
                  </span>
                </button>

                {!isClosed && (
                  <div className="flex flex-col gap-0.5 pl-0.5">
                    {group.gates.map((gate, idx) => (
                      <GateItemRow key={`${gate.type}-${idx}`} gate={gate} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
