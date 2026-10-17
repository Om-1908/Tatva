function resolveBackendUrl() {
  if (import.meta?.env?.VITE_TATVA_API_URL) {
    return import.meta.env.VITE_TATVA_API_URL
  }
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000'
    }
  }
  return 'https://tatva-0yqc.onrender.com'
}

export const API_BASE_URL = resolveBackendUrl().replace(/\/$/, '')
