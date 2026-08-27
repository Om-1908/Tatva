/**
 * useAI — Custom hook for AI-powered explanations.
 *
 * Encapsulates all AI interaction logic using the Zustand store,
 * providing a clean API for components to request explanations.
 */

import { useCallback } from 'react'
import { useCircuitStore } from '../store/useCircuitStore'
import { explainGate, explainCircuit, explainStep } from '../services/aiService'

/**
 * Builds the circuit context object from the current store state.
 */
function useCircuitContext() {
  const { qubits, gates, activeCircuitMeta, simulationResult } = useCircuitStore()

  return {
    circuitName: activeCircuitMeta?.name || 'Custom Circuit',
    qubits,
    gates,
    simulationResult,
  }
}

/**
 * Main AI hook — returns actions for requesting AI explanations.
 */
export function useAI() {
  const context = useCircuitContext()
  const {
    setAILoading,
    setAIResponse,
    setAIError,
    setSelectedGateForAI,
    setExplanationMode,
    setAIPanelOpen,
    clearAIResponse,
  } = useCircuitStore()

  /**
   * Explain a specific gate that the user clicked on.
   */
  const handleExplainGate = useCallback(
    async (gate) => {
      setSelectedGateForAI(gate)
      setExplanationMode('gate')
      setAIPanelOpen(true)
      setAILoading(true)
      setAIError(null)

      try {
        const explanation = await explainGate(gate, context)
        setAIResponse(explanation)
      } catch (err) {
        setAIError(err.message || 'Failed to get gate explanation.')
      } finally {
        setAILoading(false)
      }
    },
    [context, setSelectedGateForAI, setExplanationMode, setAIPanelOpen, setAILoading, setAIError, setAIResponse]
  )

  /**
   * Explain the entire circuit.
   */
  const handleExplainCircuit = useCallback(async () => {
    setExplanationMode('circuit')
    setAIPanelOpen(true)
    setAILoading(true)
    setAIError(null)
    setSelectedGateForAI(null)

    try {
      const explanation = await explainCircuit(context)
      setAIResponse(explanation)
    } catch (err) {
      setAIError(err.message || 'Failed to get circuit explanation.')
    } finally {
      setAILoading(false)
    }
  }, [context, setExplanationMode, setAIPanelOpen, setAILoading, setAIError, setAIResponse, setSelectedGateForAI])

  /**
   * Explain a specific step in the circuit.
   */
  const handleExplainStep = useCallback(
    async (stepIndex) => {
      setExplanationMode('step')
      setAIPanelOpen(true)
      setAILoading(true)
      setAIError(null)
      setSelectedGateForAI(null)

      try {
        const explanation = await explainStep(stepIndex, context)
        setAIResponse(explanation)
      } catch (err) {
        setAIError(err.message || 'Failed to get step explanation.')
      } finally {
        setAILoading(false)
      }
    },
    [context, setExplanationMode, setAIPanelOpen, setAILoading, setAIError, setAIResponse, setSelectedGateForAI]
  )

  /**
   * Reset / clear AI state.
   */
  const handleClearAI = useCallback(() => {
    clearAIResponse()
  }, [clearAIResponse])

  return {
    handleExplainGate,
    handleExplainCircuit,
    handleExplainStep,
    handleClearAI,
  }
}
