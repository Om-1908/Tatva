import axios from 'axios'

function resolveApiBaseUrl() {
  if (import.meta?.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8000'
    }
  }
  return 'https://tatva-0yqc.onrender.com'
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 30000,
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('tatva_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tatva_token')
      localStorage.removeItem('tatva_user')
      window.location.href = '/auth'
    }
    return Promise.reject(err)
  }
)

export const synthesizeCircuit = (targetState, numQubits) =>
  api.post('/synthesize', { target_state: targetState, num_qubits: numQubits })

export default api
