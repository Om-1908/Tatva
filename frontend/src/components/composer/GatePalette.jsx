import React, { useState } from 'react'
import { useDrag } from 'react-dnd'

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
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'GATE',
    item: { type: gate.type },
    collect: (m) => ({ isDragging: !!m.isDragging() }),
  }))

  return (
    <div
      ref={drag}
      className={`flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-white/5 cursor-grab active:cursor-grabbing transition-colors select-none ${
        isDragging ? 'opacity-40' : ''
      }`}
      title={`Drag ${gate.name} onto circuit canvas`}
    >
      <div
        className={`w-8 h-8 apple-squircle-gate font-mono font-bold text-xs shrink-0 ${gate.color}`}
      >
        {gate.symbol}
      </div>
      <span className="text-xs text-[#e1e4e8] font-medium truncate">
        {gate.name}
      </span>
    </div>
  )
}

function GateItemTile({ gate }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'GATE',
    item: { type: gate.type },
    collect: (m) => ({ isDragging: !!m.isDragging() }),
  }))

  return (
    <div
      ref={drag}
      className={`w-10 h-10 apple-squircle-gate font-mono font-bold text-sm cursor-grab active:cursor-grabbing ${
        gate.color
      } ${isDragging ? 'opacity-40' : ''}`}
      title={`${gate.name} gate`}
    >
      {gate.symbol}
    </div>
  )
}

export default function GatePalette() {
  const [collapsedCats, setCollapsedCats] = useState(() => {
    const initial = {}
    GATE_CATEGORIES.forEach((c) => {
      initial[c.category] = true
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
