import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
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
