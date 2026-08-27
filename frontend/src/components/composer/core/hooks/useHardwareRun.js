import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { useCircuitStore } from '../store/useCircuitStore'
import { useSimulation } from './useSimulation'
import { API_ENDPOINTS } from '../config/api'

// How often to poll a submitted job for status/results (ms).
const POLL_INTERVAL = 3000

/**
 * Drives a full real-hardware run against Tatva Quantum:
 *
 *   idle → loading backends → (user picks) → submitting → queued → running → done
 *                                                                         ↘ error
 *
 * Submission is non-blocking on the backend: /hardware/run returns a job_id and
 * the transpiled ("hardware-compatible") circuit immediately, then we poll
 * /hardware/job/<id> for queue position, "running on QPU", and final counts.
 *
 * Reuses `circuitToGates` from useSimulation so the exact circuit shown in the
 * editor is what gets submitted.
 */
export function useHardwareRun() {
  const { qubits, shots, gates } = useCircuitStore()
  const { circuitToGates } = useSimulation()

  // 'idle' | 'loading-backends' | 'ready' | 'submitting'
  //        | 'queued' | 'running' | 'done' | 'error'
  const [phase, setPhase] = useState('idle')
  const [backends, setBackends] = useState([])
  const [selectedBackend, setSelectedBackend] = useState('')
  const [job, setJob] = useState(null)          // { job_id, backend, transpiled, ... }
  const [status, setStatus] = useState(null)    // latest /hardware/job payload
  const [error, setError] = useState(null)

  const pollRef = useRef(null)
  const activeJobRef = useRef(null)

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Stop polling if the component using the hook unmounts.
  useEffect(() => clearPoll, [clearPoll])

  const loadBackends = useCallback(async () => {
    setPhase('loading-backends')
    setError(null)
    try {
      const { data } = await axios.get(API_ENDPOINTS.HW_BACKENDS, { timeout: 30000 })
      const list = data?.backends || []
      setBackends(list)
      // Pre-select the least-busy device as a convenience; the user still
      // confirms/changes it before submitting.
      setSelectedBackend((prev) => prev || data?.least_busy || list[0]?.name || '')
      setPhase('ready')
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not load backends')
      setPhase('error')
    }
  }, [])

  const pollJob = useCallback((jobId) => {
    clearPoll()
    pollRef.current = setInterval(async () => {
      // Ignore responses for a job we're no longer tracking (e.g. after reset).
      if (activeJobRef.current !== jobId) return
      try {
        const { data } = await axios.get(`${API_ENDPOINTS.HW_JOB}/${jobId}`, {
          timeout: 30000,
        })
        if (activeJobRef.current !== jobId) return
        setStatus(data)
        const s = data.status
        if (s === 'DONE') {
          setPhase('done')
          clearPoll()
        } else if (s === 'ERROR' || s === 'CANCELLED') {
          setError(data.error || `Job ${s.toLowerCase()} on hardware`)
          setPhase('error')
          clearPoll()
        } else if (s === 'RUNNING') {
          setPhase('running')
        } else {
          setPhase('queued')
        }
      } catch (err) {
        if (activeJobRef.current !== jobId) return
        setError(err.response?.data?.error || err.message || 'Lost contact with the job')
        setPhase('error')
        clearPoll()
      }
    }, POLL_INTERVAL)
  }, [clearPoll])

  const submit = useCallback(async () => {
    if (!selectedBackend) {
      setError('Select a backend first')
      return
    }
    if (gates.length === 0) {
      setError('Add at least one gate to the circuit first')
      return
    }
    setPhase('submitting')
    setError(null)
    setStatus(null)
    setJob(null)
    try {
      const { data } = await axios.post(
        API_ENDPOINTS.HW_RUN,
        { qubits, gates: circuitToGates(), shots, backend: selectedBackend },
        { timeout: 60000 },
      )
      setJob(data)
      activeJobRef.current = data.job_id
      setPhase('queued')
      setStatus({ status: 'QUEUED', backend: data.backend, queue_position: null })
      pollJob(data.job_id)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Submission failed')
      setPhase('error')
    }
  }, [selectedBackend, gates.length, qubits, shots, circuitToGates, pollJob])

  const reset = useCallback(() => {
    clearPoll()
    activeJobRef.current = null
    setJob(null)
    setStatus(null)
    setError(null)
    setPhase(backends.length ? 'ready' : 'idle')
  }, [clearPoll, backends.length])

  return {
    phase,
    backends,
    selectedBackend,
    setSelectedBackend,
    job,
    status,
    error,
    loadBackends,
    submit,
    reset,
  }
}

export default useHardwareRun
