/**
 * API Configuration for Tatva
 * 
 * Automatically uses:
 * - Deployed backend URL in production
 * - Local backend in development
 */

function normalizeApiBaseUrl(url) {
  if (!url) return 'http://localhost:5000'
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
    return url
  }
  return url.replace(/^http:\/\//i, 'https://')
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_TATVA_API_URL || 'http://localhost:5000')

export function getAPIEndpoint(path) {
  let cleanPath = path.startsWith('/') ? path : `/${path}`
  if (!cleanPath.startsWith('/api/')) {
    cleanPath = `/api${cleanPath}`
  }
  return `${API_BASE_URL}${cleanPath}`
}

export const API_ENDPOINTS = {
  SIMULATE: getAPIEndpoint('simulate'),
  ENCODE: getAPIEndpoint('encode'),
  KERNEL: getAPIEndpoint('kernel'),
  SHOR: getAPIEndpoint('shor'),
  HEALTH: getAPIEndpoint('health'),
  AI_EXPLAIN: getAPIEndpoint('ai-explain'),
  LEARN_EXPLAIN: getAPIEndpoint('learn/explain'),
  // Real Tatva Quantum hardware execution.
  HW_BACKENDS: getAPIEndpoint('hardware/backends'),
  HW_RUN: getAPIEndpoint('hardware/run'),
  // Job polling — append the job id: `${HW_JOB}/${jobId}`.
  HW_JOB: getAPIEndpoint('hardware/job'),
  // Device calibration telemetry — append the backend name: `${HW_TELEMETRY}/${name}`.
  HW_TELEMETRY: getAPIEndpoint('hardware/telemetry'),
}

export default API_BASE_URL
