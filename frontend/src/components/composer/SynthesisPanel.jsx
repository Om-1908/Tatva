import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useSynthesisStore from '../../store/useSynthesisStore'

const pipelineSteps = ['Target Received', 'RL Agent Running...', 'Evaluating', 'Ready']

const SynthesisPanel = () => {
  const { status, logs, currentFidelity, bestFidelity, episode, gateCount, panelVisible } = useSynthesisStore()
  const logContainerRef = useRef(null)
  const [prevFidelity, setPrevFidelity] = useState(0)
  const [flashFidelity, setFlashFidelity] = useState(false)

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs.length])

  // Fidelity flash animation
  useEffect(() => {
    if (currentFidelity > prevFidelity && prevFidelity > 0) {
      setFlashFidelity(true)
      const timer = setTimeout(() => setFlashFidelity(false), 400)
      return () => clearTimeout(timer)
    }
    setPrevFidelity(currentFidelity)
  }, [currentFidelity, prevFidelity])

  // Determine active pipeline step
  const getStepStatus = (index) => {
    if (status === 'complete') return 'complete'
    if (status === 'running') {
      if (index === 0) return 'complete'
      if (index === 1) return 'active'
      return 'pending'
    }
    if (index === 0 && (status === 'running' || status === 'complete')) return 'complete'
    return 'pending'
  }

  // Recalculate step status based on log progress
  const getActiveStep = () => {
    if (status === 'complete') return 3
    if (logs.length > 0) return 1
    return 0
  }

  const activeStepIdx = getActiveStep()

  if (!panelVisible) return null

  return (
    <AnimatePresence>
      <motion.section
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden px-6 py-5 bg-[#13121b] border-b border-white/10"
      >
        {/* Pipeline & Metrics */}
        <div className="tech-border bg-card-bg p-6 rounded-2xl flex flex-col gap-6 relative">
          <h3 className="font-body-lg text-body-lg text-primary flex items-center gap-2">
            <span className="material-symbols-outlined">network_node</span>
            RL Agent Pipeline
          </h3>

          {/* Pipeline Steps */}
          <div className="flex flex-col gap-4 relative pl-4">
            <div className="absolute left-[7px] top-4 bottom-4 w-px bg-outline-variant/30" />
            {pipelineSteps.map((stepName, i) => {
              const isComplete = i <= activeStepIdx || status === 'complete'
              const isActive = i === activeStepIdx && status === 'running'
              return (
                <div key={i} className={`flex items-center gap-4 relative ${!isComplete && !isActive ? 'opacity-50' : ''}`}>
                  <div
                    className={`w-3 h-3 rounded-full z-10 -ml-[22px] ${
                      isComplete ? 'bg-secondary tech-glow' : isActive ? 'bg-secondary tech-glow animate-pulse' : 'bg-surface-variant'
                    }`}
                  />
                  <span
                    className={`font-code text-code ${
                      isActive ? 'text-secondary animate-pulse-slow' : isComplete ? 'text-on-surface' : 'text-on-surface'
                    }`}
                  >
                    {stepName}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Success Banner */}
          {status === 'complete' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="bg-[#0e3b1c] border border-[#22c55e] text-[#22c55e] rounded-xl px-4 py-3 flex items-center gap-3"
            >
              <span className="material-symbols-outlined">check_circle</span>
              <span className="font-code text-[13px] font-medium">
                ✦ TATVA Synthesized — Fidelity: {(currentFidelity * 100).toFixed(2)}% • Gates: {gateCount} • Depth: {gateCount}
              </span>
            </motion.div>
          )}

          {/* Metric Chips */}
          <div className="grid grid-cols-2 gap-4 mt-auto">
            <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/20 flex flex-col gap-1 relative overflow-hidden">
              <span className="font-label-sm text-label-sm text-outline uppercase z-10">Fidelity</span>
              <span className={`font-code text-code text-secondary text-lg z-10 ${flashFidelity ? 'fidelity-flash' : ''}`}>
                {currentFidelity.toFixed(4)}
              </span>
              <div
                className="absolute bottom-0 left-0 h-1 bg-secondary transition-all duration-[2000ms] ease-out z-0"
                style={{
                  width: `${currentFidelity * 100}%`,
                  backgroundColor: currentFidelity > 0.99 ? '#22c55e' : undefined,
                }}
              />
            </div>
            <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/20 flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-outline uppercase">Gates</span>
              <span className="font-code text-code text-primary text-lg">{gateCount}</span>
            </div>
            <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/20 flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-outline uppercase">Episode</span>
              <span className="font-code text-code text-on-surface text-lg">{episode}</span>
            </div>
            <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/20 flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-outline uppercase">Status</span>
              <span className="font-code text-code text-lg flex items-center gap-2">
                {status === 'complete' ? (
                  <span className="text-secondary flex items-center gap-2">
                    <span className="w-2 h-2 bg-secondary rounded-full" />
                    Complete
                  </span>
                ) : status === 'running' ? (
                  <span className="text-tertiary flex items-center gap-2">
                    <span className="w-2 h-2 bg-tertiary rounded-full animate-pulse" />
                    Running
                  </span>
                ) : (
                  <span className="text-outline flex items-center gap-2">
                    <span className="w-2 h-2 bg-outline rounded-full" />
                    Idle
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Log Panel */}
        <div className="tech-border bg-card-bg p-0 rounded-2xl flex flex-col overflow-hidden">
          <div className="bg-surface-container-lowest px-4 py-2 border-b border-outline-variant/20 flex justify-between items-center">
            <span className="font-label-sm text-label-sm text-outline uppercase">
              {status === 'complete' ? (
                <span className="text-[#22c55e] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Synthesis Complete
                </span>
              ) : (
                'Synthesis Log'
              )}
            </span>
            <span className="material-symbols-outlined text-[16px] text-outline">terminal</span>
          </div>
          <div
            ref={logContainerRef}
            className="p-4 font-code text-code text-on-surface-variant h-full overflow-y-auto max-h-[300px] flex flex-col gap-1 bg-[#050508]"
          >
            {logs.length === 0 && status === 'running' && (
              <div className="text-outline log-line-enter">&gt;&gt; Initializing RL Agent...</div>
            )}
            {logs.map((log, i) => {
              const isLast = i === logs.length - 1
              const fidelityColor =
                log.fidelity >= 0.99
                  ? 'text-secondary font-bold'
                  : log.fidelity >= 0.5
                    ? 'text-primary-container'
                    : log.fidelity < 0.3
                      ? 'text-error'
                      : ''

              return (
                <div
                  key={i}
                  className={`log-line-enter ${isLast ? 'text-on-surface' : 'text-on-surface-variant/60'}`}
                >
                  <span className="text-outline">
                    {String(log.step).padStart(2, '0')}
                  </span>
                  {'  '}
                  <span className="text-on-surface">{log.gate.padEnd(5)}</span>
                  {'  '}
                  <span className="text-on-surface-variant">on {log.qubit}</span>
                  {'  →  '}
                  <span className={fidelityColor}>F: {log.fidelity.toFixed(4)}</span>
                </div>
              )
            })}
            {status === 'complete' && (
              <div className="text-secondary font-bold log-line-enter mt-2">
                &gt;&gt; TARGET REACHED. SYNTHESIS COMPLETE.
              </div>
            )}
          </div>
        </div>
      </motion.section>
    </AnimatePresence>
  )
}

export default SynthesisPanel
