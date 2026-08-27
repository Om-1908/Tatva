import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { API_ENDPOINTS } from '../config/api'

// Re-fetch cadence while the telemetry tab is visible. The server caches the
// (expensive) calibration pull for ~2 minutes, so this is cheap for us and
// keeps queue size / operational status feeling live.
const REFRESH_INTERVAL = 60000

/**
 * Fetches live calibration telemetry (T1/T2, readout & gate errors, status)
 * for one Tatva backend from /hardware/telemetry/<name>.
 *
 * Only fetches while `enabled` is true (i.e. the Telemetry tab is actually
 * visible), refetches when the selected backend changes, and guards against
 * stale responses with a request key ref (same pattern as useHardwareRun).
 */
export function useBackendTelemetry(backendName, enabled) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Identifies the backend the latest request was issued for, so a slow
  // response for a previously-selected device can't overwrite fresher data.
  const activeRef = useRef(null)

  const fetchTelemetry = useCallback(async (name) => {
    activeRef.current = name
    setLoading(true)
    setError(null)
    try {
      // First uncached pull of a 100+ qubit device can take a while.
      const { data: payload } = await axios.get(
        `${API_ENDPOINTS.HW_TELEMETRY}/${name}`,
        { timeout: 60000 },
      )
      if (activeRef.current !== name) return
      setData(payload)
    } catch (err) {
      if (activeRef.current !== name) return
      setError(err.response?.data?.error || err.message || 'Could not load telemetry')
      setData(null)
    } finally {
      if (activeRef.current === name) setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    if (backendName) fetchTelemetry(backendName)
  }, [backendName, fetchTelemetry])

  useEffect(() => {
    if (!enabled || !backendName) return
    fetchTelemetry(backendName)
    const id = setInterval(() => fetchTelemetry(backendName), REFRESH_INTERVAL)
    return () => {
      clearInterval(id)
      activeRef.current = null
    }
  }, [enabled, backendName, fetchTelemetry])

  return { data, loading, error, refresh }
}

export default useBackendTelemetry
