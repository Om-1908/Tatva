import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import useAuthStore from './store/useAuthStore'

import HomePage from './pages/HomePage'
import AuthPage from './pages/AuthPage'
import ComposerPage from './pages/ComposerPage'
import CircuitsPage from './pages/CircuitsPage'
import TeamPage from './pages/TeamPage'
import NotFoundPage from './pages/NotFoundPage'

const ProtectedRoute = ({ children }) => {
  const { isLoggedIn } = useAuthStore()
  const location = useLocation()

  if (!isLoggedIn) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return children
}

const AnimatedRoutes = () => {
  const location = useLocation()

  // Handle hash navigation for /#how-it-works
  useEffect(() => {
    if (location.hash) {
      const timer = setTimeout(() => {
        const el = document.getElementById(location.hash.slice(1))
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }, 400)
      return () => clearTimeout(timer)
    } else {
      window.scrollTo(0, 0)
    }
  }, [location.pathname, location.hash])

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/composer"
          element={
            <ProtectedRoute>
              <ComposerPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/circuits"
          element={
            <ProtectedRoute>
              <CircuitsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/team" element={<TeamPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AnimatePresence>
  )
}

const App = () => {
  const { initFromStorage } = useAuthStore()

  useEffect(() => {
    initFromStorage()
  }, [initFromStorage])

  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}

export default App
