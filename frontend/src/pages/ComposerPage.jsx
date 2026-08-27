import { useEffect } from 'react'
import Navbar from '../components/layout/Navbar'
import ConfigStrip from '../components/composer/ConfigStrip'
import SynthesisPanel from '../components/composer/SynthesisPanel'
import ComposerWorkspace from '../components/composer/ComposerWorkspace'
import useSynthesisStore from '../store/useSynthesisStore'
import useCircuitStore from '../store/useCircuitStore'

export default function ComposerPage() {
  const { status, logs } = useSynthesisStore()
  const { loadCircuit } = useCircuitStore()

  // ── SYNTHESIS BRIDGE ────────────────────────────────
  // When TATVA's RL synthesis completes, automatically 
  // populate the circuit canvas with the result.
  useEffect(() => {
    if (status !== 'complete' || logs.length === 0) return

    const tatvaGates = logs.map((entry, index) => {
      const base = {
        type: entry.gate,
        target: parseQubitIndex(entry.qubit),
        step: index,
      }
      if (entry.gate === 'CNOT' && entry.qubit.includes('→')) {
        const parts = entry.qubit.split('→')
        const ctrl = parseInt(parts[0].replace('q',''))
        const tgt  = parseInt(parts[1].replace('q',''))
        return { ...base, type: 'CNOT', target: tgt, control: ctrl, step: index }
      }
      return base
    })

    const maxQubit = Math.max(
      0,
      ...logs.map(e => {
        if (e.qubit.includes('→')) {
          const parts = e.qubit.split('→')
          return Math.max(
            parseInt(parts[0].replace('q','')),
            parseInt(parts[1].replace('q',''))
          )
        }
        return parseInt(e.qubit.replace('q','')) || 0
      })
    )
    const inferredQubits = maxQubit + 1

    loadCircuit({
      qubits: inferredQubits,
      gates: tatvaGates,
    })
  }, [status])

  return (
    <div className="min-h-screen flex flex-col bg-[#13121b] text-on-surface">
      <Navbar />
      <div className="pt-[64px] flex-1 flex flex-col">
        <ConfigStrip />
        <SynthesisPanel />
        <ComposerWorkspace />
      </div>
    </div>
  )
}

function parseQubitIndex(qubitStr) {
  if (!qubitStr) return 0
  const match = String(qubitStr).match(/\d+/)
  return match ? parseInt(match[0]) : 0
}
