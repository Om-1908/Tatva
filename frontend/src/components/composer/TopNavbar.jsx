import React, { useState } from 'react'
import { useCircuitStore } from './core/store/useCircuitStore'
import { useSimulation } from './core/hooks/useSimulation'

export default function TopNavbar({ onRunClick }) {
  const { circuitName, setCircuitName, qubits, setQubits, gates, circuit, targetStateLabel, loadCircuit, saveCircuit, isSimulating } = useCircuitStore()
  const { runSimulation } = useSimulation()
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState(circuitName || 'QuantumRL Composer')
  const [saveStatus, setSaveStatus] = useState(null)
  const fileInputRef = React.useRef(null)

  const handleSaveToMyCircuits = () => {
    saveCircuit(circuitName)
    setSaveStatus('Saved!')
    setTimeout(() => setSaveStatus(null), 2500)
  }

  const handleNameSubmit = (e) => {
    e.preventDefault()
    setIsEditingName(false)
    if (tempName.trim()) {
      setCircuitName(tempName.trim())
    }
  }

  const handleRun = async () => {
    if (onRunClick) {
      onRunClick()
    } else {
      await runSimulation()
    }
  }

  // Load Circuit from JSON File
  const handleFileImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result)
        loadCircuit(json)
      } catch (err) {
        alert('Invalid JSON circuit file: ' + err.message)
      }
    }
    reader.readAsText(file)
    // Reset file input value
    e.target.value = ''
  }

  // Download Synthesized Circuit JSON File
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(
      JSON.stringify(
        {
          name: circuitName || 'QuantumRL Composer',
          qubits,
          targetStateLabel,
          gates,
          circuit,
        },
        null,
        2
      )
    )

    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `${(circuitName || 'circuit').replace(/\s+/g, '_')}_${qubits}q.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  return (
    <header className="w-full h-[52px] bg-[#1b1b24] border-b border-white/10 text-white flex items-center justify-between px-4 z-[40] select-none shrink-0 flex-wrap gap-2">
      {/* Left Branding, Qubit Selector & Project Name */}
      <div className="flex items-center gap-3">
        {/* TATVA Logo */}
        <div className="flex items-center gap-2">
          <img src="/tatva_bg.png" alt="TATVA Logo" className="h-6 w-auto object-contain" />
          <span className="font-bold text-xs tracking-wider uppercase text-primary font-mono hidden sm:inline">Composer</span>
        </div>

        <div className="h-4 w-px bg-white/10" />

        {/* Editable Project Name */}
        {isEditingName ? (
          <form onSubmit={handleNameSubmit} className="flex items-center">
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleNameSubmit}
              autoFocus
              className="bg-[#262626] border border-primary text-white text-xs px-2 py-1 rounded outline-none font-mono"
            />
          </form>
        ) : (
          <button
            onClick={() => setIsEditingName(true)}
            className="text-xs font-semibold text-on-surface-variant hover:text-primary hover:bg-white/5 px-2 py-1 rounded transition-colors flex items-center gap-1.5 font-mono"
            title="Click to edit project name"
          >
            <span>{circuitName || 'QuantumRL Composer'}</span>
            <span className="text-[10px] text-outline">✎</span>
          </button>
        )}
      </div>

      {/* Right Controls: Load, Export, Run Buttons */}
      <div className="flex items-center gap-2.5">
        {/* Hidden File Input for Loading Circuit */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          onChange={handleFileImport}
          className="hidden"
        />

        {/* Save to My Circuits Button */}
        <button
          onClick={handleSaveToMyCircuits}
          className="bg-[#0062ff] hover:bg-[#0050d4] text-white text-xs font-mono font-semibold px-3 py-1.5 rounded-xl transition-all border border-[#0062ff]/50 flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
          title="Save this circuit to My Circuits page and MongoDB Atlas"
        >
          <span>{saveStatus ? '✅' : '💾'}</span>
          <span>{saveStatus || 'Save'}</span>
        </button>

        {/* Load Circuit Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-[#262626] hover:bg-[#393939] text-white text-xs font-mono font-semibold px-3 py-1.5 rounded-xl transition-all border border-[#525252] flex items-center shadow cursor-pointer"
          title="Load circuit from a downloaded JSON file"
        >
          <span>Load</span>
        </button>

        {/* Download Circuit JSON Button */}
        <button
          onClick={handleExportJSON}
          className="bg-[#262626] hover:bg-[#393939] text-white text-xs font-mono font-semibold px-3 py-1.5 rounded-xl transition-all border border-[#525252] flex items-center shadow cursor-pointer"
          title="Download synthesized circuit as JSON file"
        >
          <span>Download</span>
        </button>

        {/* Run Button matching TATVA primary purple button */}
        <button
          onClick={handleRun}
          disabled={isSimulating}
          className="bg-primary-container hover:shadow-[0_0_15px_rgba(79,70,229,0.5)] active:scale-95 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-xl transition-all flex items-center gap-2 shadow-md border-t border-white/20 ml-1"
        >
          {isSimulating ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Simulating...</span>
            </>
          ) : (
            <>
              <span className="text-[10px]">▶</span>
              <span>Run</span>
            </>
          )}
        </button>
      </div>
    </header>
  )
}
