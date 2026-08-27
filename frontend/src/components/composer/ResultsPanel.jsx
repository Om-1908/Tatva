import React, { useState } from 'react'
import { useCircuitStore } from './core/store/useCircuitStore'
import Qsphere from './Qsphere'
import ProbabilityChart from './ProbabilityChart'

export default function ResultsPanel() {
  const { simulationResult, qubits } = useCircuitStore()
  const [leftTab, setLeftTab] = useState('probabilities') // 'probabilities' | 'statevector' | 'counts'
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)

  const [panelHeight, setPanelHeight] = useState(420) // Default 420px for optimal Q-Sphere visibility
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseDownResize = (e) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startHeight = panelHeight

    const onMouseMove = (moveEvent) => {
      const deltaY = startY - moveEvent.clientY
      const newHeight = Math.max(220, Math.min(window.innerHeight - 100, startHeight + deltaY))
      setPanelHeight(newHeight)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  if (!simulationResult) return null

  const { probabilities, statevector, counts } = simulationResult || {}
  const n = Math.max(1, qubits || 2)
  const totalStates = 1 << n

  // Build full list of basis states (0000 to 1111)
  const allBasisStates = Array.from({ length: totalStates }, (_, idx) => {
    const bitstring = idx.toString(2).padStart(n, '0')
    const prob = probabilities?.[bitstring] ?? 0
    const amp = statevector?.[idx] || { real: idx === 0 ? 1 : 0, imag: 0 }
    const mag = Math.sqrt((amp.real || 0) ** 2 + (amp.imag || 0) ** 2)
    const count = counts?.[bitstring] ?? 0
    return { bitstring, prob, amp, mag, count }
  })

  // Format array string for statevector copy box: [ 1, 0, 0, 0, ... ]
  const rawArrayStr = `[ ${allBasisStates.map((s) => Number(s.amp.real.toFixed(4))).join(', ')} ]`

  const handleCopyArray = () => {
    navigator.clipboard.writeText(rawArrayStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{ height: isCollapsed ? '36px' : `${panelHeight}px` }}
      className={`fixed bottom-0 left-[240px] right-[260px] bg-[#16191d] border-t border-[#262c33] text-white z-[900] shadow-2xl flex flex-col ${
        isResizing ? 'transition-none select-none' : 'transition-all duration-150'
      }`}
    >
      {/* Top Drag Resize Handle Bar (Drag UP/DOWN to adjust height) */}
      <div
        onMouseDown={handleMouseDownResize}
        className="h-2.5 bg-[#1f242d] hover:bg-[#29b6f6] cursor-ns-resize flex items-center justify-center group transition-colors shrink-0"
        title="Click and drag up/down to resize simulation results window"
      >
        <div className="w-12 h-1 rounded-full bg-white/30 group-hover:bg-white transition-colors" />
      </div>

      {/* Panel Top Header Bar */}
      <div className="h-[36px] bg-[#1f242d] border-b border-[#262c33] px-4 flex items-center justify-between shrink-0 select-none text-sm">
        <div className="flex items-center gap-2 font-mono text-[#a8a8a8]">
          <span className="text-white font-bold tracking-wider">SIMULATION RESULTS</span>
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-[#a8a8a8] hover:text-white px-2.5 py-0.5 rounded hover:bg-[#262c33] transition-colors font-mono text-xs"
          title={isCollapsed ? 'Expand results' : 'Collapse results'}
        >
          {isCollapsed ? '▲ Expand' : '▼ Collapse'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 grid grid-cols-2 divide-x divide-[#262c33] overflow-hidden p-2 gap-2">
          {/* LEFT COLUMN: Probabilities / Statevector / Counts Chart */}
          <div className="flex flex-col h-full bg-[#1c2128] rounded-2xl border border-[#262c33] overflow-hidden p-3 select-none">
            {/* Header with Dropdown & Controls */}
            <div className="flex items-center justify-between border-b border-[#262c33] pb-2 mb-2">
              <div className="relative inline-block">
                <select
                  value={leftTab}
                  onChange={(e) => setLeftTab(e.target.value)}
                  className="bg-[#21262d] text-white text-sm font-semibold px-3.5 py-1.5 rounded-xl border border-[#30363d] outline-none cursor-pointer hover:border-[#29b6f6] transition-colors appearance-none pr-8 font-mono"
                >
                  <option value="probabilities">Probabilities</option>
                  <option value="statevector">Statevector</option>
                  <option value="counts">Shot Counts</option>
                </select>
                <span className="absolute right-2.5 top-2 text-xs text-[#a8a8a8] pointer-events-none">
                  ∨
                </span>
              </div>
            </div>

            {/* BAR CHART AREA */}
            <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
              <ProbabilityChart probabilities={probabilities} statevector={statevector} counts={counts} qubits={qubits} tabMode={leftTab} />

              {/* STATEVECTOR ARRAY & PHASE LEGEND (Statevector Tab View) */}
              {leftTab === 'statevector' && (
                <div className="flex items-center gap-3 pt-2 mt-1 border-t border-[#262c33]">
                  {/* Left Conic Phase Wheel */}
                  <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
                    <div
                      className="w-8 h-8 rounded-full p-0.5 flex items-center justify-center"
                      style={{
                        background: 'conic-gradient(from 90deg, #00e5ff, #76ff03, #ff6e40, #e040fb, #00e5ff)',
                      }}
                    >
                      <div className="w-5 h-5 rounded-full bg-[#1c2128] flex items-center justify-center text-[7px] font-mono text-[#a8a8a8]">
                        Phase
                      </div>
                    </div>
                  </div>

                  {/* Raw Array Output Box */}
                  <div className="flex-1 bg-[#16191d] border border-[#262c33] rounded-xl px-3 py-1.5 flex items-center justify-between overflow-x-auto font-mono text-sm text-[#81d4fa]">
                    <span className="truncate pr-2">{rawArrayStr}</span>
                    <button
                      onClick={handleCopyArray}
                      className="text-[#a8a8a8] hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-[#262c33] transition-colors shrink-0"
                      title="Copy array"
                    >
                      {copied ? '✓ Copied' : '📋'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: 3D Q-Sphere */}
          <div className="flex flex-col h-full bg-[#1c2128] rounded-2xl border border-[#262c33] overflow-hidden p-3 select-none">
            {/* Header Bar */}
            <div className="flex items-center justify-between border-b border-[#262c33] pb-2 mb-2">
              <span className="text-sm font-bold text-white">Q-sphere</span>
            </div>

            {/* Interactive 3D Canvas */}
            <div className="flex-1 relative overflow-hidden rounded-xl">
              <Qsphere statevector={statevector} numQubits={qubits} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
