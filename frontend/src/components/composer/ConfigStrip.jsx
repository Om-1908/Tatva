import { useState, useEffect } from 'react'
import useCircuitStore from '../../store/useCircuitStore'
import { useCircuitStore as useTatvaStore } from './core/store/useCircuitStore'
import useSynthesisStore from '../../store/useSynthesisStore'
import useSynthesis from '../../hooks/useSynthesis'
import { PRESET_STATES } from '../../utils/quantumStates'

const ConfigStrip = () => {
  const { qubits, selectedState, setQubits, setSelectedState, resetCircuit, clearCircuit } = useCircuitStore()
  const { setTargetState } = useTatvaStore()
  const { status, resetSynthesis } = useSynthesisStore()
  const { runSynthesis } = useSynthesis()

  const numQubits = qubits || 1
  const states = PRESET_STATES[numQubits] || PRESET_STATES[1]

  // Custom Statevector Modal State
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customVector, setCustomVector] = useState(
    Array.from({ length: 1 << numQubits }, (_, i) => ({ real: i === 0 ? 1 : 0, imag: 0 }))
  )
  const [compactTextInput, setCompactTextInput] = useState('')
  const [textInputError, setTextInputError] = useState(false)
  const [errorToast, setErrorToast] = useState(null)

  // Sync custom vector when qubit count changes
  useEffect(() => {
    const totalStates = 1 << numQubits
    setCustomVector(
      Array.from({ length: totalStates }, (_, i) => ({ real: i === 0 ? 1 : 0, imag: 0 }))
    )
    setCompactTextInput('')
    setTextInputError(false)
  }, [numQubits])

  useEffect(() => {
    const validStates = PRESET_STATES[numQubits] || []
    if (validStates.length > 0 && (!selectedState || (!validStates.includes(selectedState) && !selectedState.startsWith('|Custom')))) {
      setSelectedState(validStates[0])
    }
  }, [numQubits, selectedState, setSelectedState])

  const handleQubitChange = (n) => {
    const newN = Number(n)
    setQubits(newN)
    const newStates = PRESET_STATES[newN] || []
    if (newStates.length > 0) {
      setSelectedState(newStates[0])
      if (setTargetState) {
        setTargetState(newStates[0], null, newN)
      }
    }
    if (status !== 'idle') {
      resetSynthesis()
    }
    if (resetCircuit) resetCircuit()
    else if (clearCircuit) clearCircuit()
  }

  const handlePresetSelect = (presetLabel) => {
    setSelectedState(presetLabel)
    if (setTargetState) {
      setTargetState(presetLabel, null, numQubits)
    }
  }

  const handleBeginSynthesis = () => {
    if (!selectedState) return
    if (status === 'complete') {
      resetSynthesis()
      if (resetCircuit) resetCircuit()
      else if (clearCircuit) clearCircuit()
      setTimeout(() => {
        runSynthesis(selectedState, numQubits)
      }, 100)
    } else {
      runSynthesis(selectedState, numQubits)
    }
  }

  // Custom vector amplitude cell edit
  const handleCustomCellChange = (idx, field, value) => {
    const num = Number(value) || 0
    const updated = [...customVector]
    updated[idx] = { ...updated[idx], [field]: num }
    setCustomVector(updated)
  }

  // Calculate L2 Norm of custom vector
  const computeNorm = (vector) => {
    const sumSq = vector.reduce((acc, amp) => acc + (amp.real || 0) ** 2 + (amp.imag || 0) ** 2, 0)
    return Math.sqrt(sumSq)
  }

  const currentNorm = computeNorm(customVector)
  const isNormValid = Math.abs(currentNorm - 1.0) <= 0.001

  // Normalize Automatically button
  const handleNormalize = () => {
    const norm = computeNorm(customVector)
    if (norm === 0) return
    const normalized = customVector.map((amp) => ({
      real: Number((amp.real / norm).toFixed(4)),
      imag: Number((amp.imag / norm).toFixed(4)),
    }))
    setCustomVector(normalized)
  }

  // Apply Custom Statevector
  const handleCustomApply = () => {
    if (!isNormValid) {
      setErrorToast(`Invalid Statevector: L2 Norm is ${currentNorm.toFixed(4)} (Required: 1.0000). Click "Normalize Automatically".`)
      setTimeout(() => setErrorToast(null), 4000)
      return
    }
    const label = `|Custom ${numQubits}Q⟩`
    setSelectedState(label)
    if (setTargetState) {
      setTargetState(label, customVector, numQubits)
    }
    setShowCustomModal(false)
  }

  // Parse Compact Text Input
  const handleCompactTextInput = (raw) => {
    setCompactTextInput(raw)
    setTextInputError(false)
    if (!raw.trim()) return

    try {
      const clean = raw.replace(/[\[\]]/g, '').trim()
      const parts = clean.split(',').map((s) => s.trim())
      const totalStates = 1 << numQubits

      if (parts.length === totalStates) {
        const parsedVec = parts.map((p) => {
          const match = p.match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([+-]\s*\d*\.?\d+(?:e[+-]?\d+)?)?[ij]?$/i)
          if (match) {
            const re = Number(match[1]) || 0
            const im = Number(match[2]?.replace(/\s+/g, '')) || 0
            return { real: re, imag: im }
          }
          const val = Number(p)
          if (!isNaN(val)) return { real: val, imag: 0 }
          return { real: 0, imag: 0 }
        })
        setCustomVector(parsedVec)
      } else {
        setTextInputError(true)
      }
    } catch (e) {
      setTextInputError(true)
    }
  }

  return (
    <section className="bg-card-bg px-8 py-6 flex flex-col gap-6 border-b border-white/10 tech-glow relative z-[100]">
      <div className="flex flex-wrap items-center gap-8 w-full justify-between">
        <div className="flex flex-wrap items-center gap-8">
          {/* Qubit Selector Dropdown */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-outline uppercase tracking-wider">Qubits</label>
            <div className="relative inline-block">
              <select
                value={numQubits}
                onChange={(e) => handleQubitChange(Number(e.target.value))}
                className="bg-[#1e1b2e] hover:bg-[#28243d] text-white font-mono text-base font-bold px-4 py-2.5 rounded-xl border border-[#0062ff]/50 hover:border-[#0062ff] focus:border-[#0062ff] focus:ring-2 focus:ring-[#0062ff]/40 outline-none cursor-pointer transition-all duration-300 shadow-md hover:shadow-[0_0_15px_rgba(0,98,255,0.4)] min-w-[140px]"
              >
                <option value={1} className="bg-[#120F17] text-white">1 Qubit</option>
                <option value={2} className="bg-[#120F17] text-white">2 Qubits</option>
                <option value={3} className="bg-[#120F17] text-white">3 Qubits</option>
                <option value={4} className="bg-[#120F17] text-white">4 Qubits</option>
              </select>
            </div>
          </div>

          {/* Preset State Selector Dropdown */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-outline uppercase tracking-wider">Preset State</label>
            <div className="relative inline-block">
              <select
                value={selectedState || (states[0] || '')}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="bg-[#1e1b2e] hover:bg-[#28243d] text-white font-mono text-base font-bold px-4 py-2.5 rounded-xl border border-[#0062ff]/50 hover:border-[#0062ff] focus:border-[#0062ff] focus:ring-2 focus:ring-[#0062ff]/40 outline-none cursor-pointer transition-all duration-300 shadow-md hover:shadow-[0_0_15px_rgba(0,98,255,0.4)] min-w-[160px]"
              >
                {states.map((s) => (
                  <option key={s} value={s} className="bg-[#120F17] text-white font-mono">
                    {s}
                  </option>
                ))}
                {selectedState && selectedState.startsWith('|Custom') && (
                  <option value={selectedState} className="bg-[#120F17] text-[#0062ff] font-mono">
                    {selectedState}
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* Custom Statevector Button */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-outline uppercase tracking-wider opacity-0 pointer-events-none">Custom</label>
            <button
              onClick={() => setShowCustomModal(!showCustomModal)}
              className={`px-5 py-2.5 text-sm font-mono font-bold rounded-xl border transition-all duration-300 flex items-center gap-2 shadow-md ${
                showCustomModal || (selectedState && selectedState.startsWith('|Custom'))
                  ? 'bg-[#0062ff] text-white border-[#0062ff] shadow-[0_0_15px_rgba(0,98,255,0.6)]'
                  : 'bg-[#1e1b2e] hover:bg-[#28243d] text-white border-[#0062ff]/50 hover:border-[#0062ff]'
              }`}
            >
              <span>⚙️</span>
              <span>Custom Statevector</span>
              <span className="text-xs opacity-75">{showCustomModal ? '▲' : '▼'}</span>
            </button>
          </div>
        </div>

        {/* Synthesis Button */}
        <button
          onClick={handleBeginSynthesis}
          disabled={!selectedState || status === 'running'}
          className="mt-6 md:mt-0 px-9 py-3.5 bg-primary-container text-white text-sm font-bold uppercase tracking-widest rounded-xl primary-glow hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'running' ? (
            <>
              <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
              <span>Synthesizing...</span>
            </>
          ) : status === 'complete' ? (
            <>
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              <span>Re-synthesize ↺</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              <span>Begin Synthesis</span>
            </>
          )}
        </button>
      </div>

      {/* Popover Custom Statevector Editor Box (Appears ONLY when clicking Custom Statevector button) */}
      {showCustomModal && (
        <div className="w-full bg-[#181627] border border-[#0062ff]/40 rounded-2xl p-5 mt-2 shadow-2xl animate-fadeIn flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#0062ff] flex items-center gap-2">
              <span>⚙️</span> Custom Statevector Editor ({1 << numQubits} Basis States)
            </span>
            <button
              onClick={() => setShowCustomModal(false)}
              className="text-xs text-[#a8a8a8] hover:text-white font-mono px-2.5 py-1 rounded-lg hover:bg-white/10"
            >
              ✕ Close
            </button>
          </div>

          {/* Compact Vector Text Input */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-[#a8a8a8]">Compact Vector Input (optional):</label>
              {textInputError && <span className="text-[10px] text-rose-400 font-mono">Invalid format (expected {1 << numQubits} elements)</span>}
            </div>
            <input
              type="text"
              value={compactTextInput}
              onChange={(e) => handleCompactTextInput(e.target.value)}
              placeholder={`e.g. [0.7071+0j, ${Array((1 << numQubits) - 1).fill('0').join(', ')}]`}
              className="bg-[#120F17] border border-[#393939] focus:border-[#0062ff] text-white text-xs px-3.5 py-2 rounded-xl font-mono outline-none transition-colors"
            />
          </div>

          {/* Basis State Amplitudes Input Table */}
          <div className="border border-white/10 rounded-xl bg-[#120F17] p-2.5 max-h-[180px] overflow-y-auto shadow-inner">
            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] font-bold text-[#a8a8a8] pb-1.5 border-b border-white/10 mb-1.5">
              <span>Basis State</span>
              <span className="text-center">Real Part</span>
              <span className="text-center">Imaginary Part</span>
            </div>
            {customVector.map((amp, idx) => {
              const bitstring = idx.toString(2).padStart(numQubits, '0')
              return (
                <div key={idx} className="grid grid-cols-3 gap-2 items-center font-mono text-xs text-white py-1 border-b border-white/5 hover:bg-white/5">
                  <span className="text-[#0062ff] font-bold">|{bitstring}⟩</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={amp.real}
                    onChange={(e) => handleCustomCellChange(idx, 'real', e.target.value)}
                    className="bg-[#1e1b2e] border border-[#525252] focus:border-[#0062ff] text-white text-xs text-center px-2 py-1 rounded-lg outline-none font-mono"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={amp.imag}
                    onChange={(e) => handleCustomCellChange(idx, 'imag', e.target.value)}
                    className="bg-[#1e1b2e] border border-[#525252] focus:border-[#0062ff] text-white text-xs text-center px-2 py-1 rounded-lg outline-none font-mono"
                  />
                </div>
              )
            })}
          </div>

          {/* Validation Status & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div
              className={`font-mono text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-2 border ${
                isNormValid
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                  : 'bg-rose-950/80 text-rose-400 border-rose-700/60'
              }`}
            >
              <span>{isNormValid ? '✓ Valid quantum statevector' : '✕ Invalid quantum statevector'}</span>
              <span className="text-[11px] opacity-80">(Norm: {currentNorm.toFixed(4)})</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleNormalize}
                className="bg-[#28243d] hover:bg-[#383354] text-white text-xs font-mono font-semibold px-3.5 py-2 rounded-xl transition-colors border border-[#0062ff]/40"
              >
                Normalize Automatically
              </button>
              <button
                onClick={handleCustomApply}
                className="bg-[#0062ff] hover:bg-[#0050d4] text-white text-xs font-semibold px-5 py-2 rounded-xl transition-all shadow-md active:scale-95"
              >
                Set Custom State
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {errorToast && (
        <div className="bg-red-600 text-white text-xs px-3.5 py-2 rounded-xl shadow font-semibold animate-bounce">
          ⚠️ {errorToast}
        </div>
      )}
    </section>
  )
}

export default ConfigStrip
