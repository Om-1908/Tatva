import React, { useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import TopNavbar from './TopNavbar'
import GatePalette from './GatePalette'
import CircuitCanvas from './CircuitCanvas'
import PropertiesPanel from './PropertiesPanel'
import ResultsPanel from './ResultsPanel'
import { useAutoSimulate } from './core/hooks/useAutoSimulate'
import { useSimulation } from './core/hooks/useSimulation'
import './composer.css'

function QuantumComposerContent() {
  const [selectedGate, setSelectedGate] = useState(null)
  const { runSimulation, error } = useSimulation()

  // Auto-simulate on circuit changes
  useAutoSimulate()

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden bg-[#13121b] text-[#f4f4f4] quantum-composer-root relative min-h-[calc(100vh-80px)]">
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
  return (
    <DndProvider backend={HTML5Backend}>
      <QuantumComposerContent />
    </DndProvider>
  )
}
