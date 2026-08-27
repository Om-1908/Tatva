import { create } from 'zustand'

const useSynthesisStore = create((set) => ({
  status: 'idle',
  logs: [],
  currentFidelity: 0,
  bestFidelity: 0,
  episode: 0,
  gateCount: 0,
  panelVisible: false,

  startSynthesis: () =>
    set({
      status: 'running',
      panelVisible: true,
      logs: [],
      currentFidelity: 0,
      bestFidelity: 0,
      episode: 0,
      gateCount: 0,
    }),

  addLog: (entry) =>
    set((state) => ({
      logs: [...state.logs, entry],
    })),

  updateMetrics: (fidelity, episode, gates) =>
    set((state) => ({
      currentFidelity: fidelity,
      bestFidelity: Math.max(state.bestFidelity, fidelity),
      episode,
      gateCount: gates,
    })),

  completeSynthesis: (finalFidelity, gates) =>
    set({
      status: 'complete',
      currentFidelity: finalFidelity,
      bestFidelity: finalFidelity,
      gateCount: gates.length,
    }),

  resetSynthesis: () =>
    set({
      status: 'idle',
      logs: [],
      currentFidelity: 0,
      bestFidelity: 0,
      episode: 0,
      gateCount: 0,
      panelVisible: false,
    }),
}))

export default useSynthesisStore
