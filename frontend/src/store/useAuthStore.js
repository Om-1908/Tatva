import { create } from 'zustand'

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoggedIn: false,

  login: (userData, token) => {
    localStorage.setItem('tatva_token', token)
    localStorage.setItem('tatva_user', JSON.stringify(userData))
    set({ user: userData, token, isLoggedIn: true })
  },

  logout: () => {
    localStorage.removeItem('tatva_token')
    localStorage.removeItem('tatva_user')
    set({ user: null, token: null, isLoggedIn: false })
  },

  initFromStorage: () => {
    const token = localStorage.getItem('tatva_token')
    const userStr = localStorage.getItem('tatva_user')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ user, token, isLoggedIn: true })
      } catch {
        localStorage.removeItem('tatva_token')
        localStorage.removeItem('tatva_user')
      }
    }
  },
}))

export default useAuthStore
