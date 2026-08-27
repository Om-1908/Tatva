import { useState } from 'react'
import useAuthStore from '../../store/useAuthStore'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../../config'

const RegisterForm = ({ onSwitchToLogin }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const validate = () => {
    const errs = {}
    if (!name.trim()) errs.name = 'Full name is required'
    if (!email.trim()) errs.email = 'Email is required'
    else if (!email.includes('@')) errs.email = 'Please enter a valid email address'
    if (!password.trim()) errs.password = 'Password is required'
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters'
    if (!confirmPassword.trim()) errs.confirmPassword = 'Please confirm your password'
    else if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (res.ok && data.user) {
        login(data.user, data.token)
        setLoading(false)
        navigate('/composer')
        return
      } else if (data.error) {
        setErrors({ general: data.error })
        setLoading(false)
        return
      }
    } catch (e) {
      console.warn('Backend auth offline, using local registration')
    }

    // Fallback if backend offline
    login({ name, email, id: 'user-' + Date.now() }, 'mock-token-456')
    setLoading(false)
    navigate('/composer')
  }

  const handleGoogleOAuth = () => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '1001085190771-dmur74m24ejm3sgltn1b0fuiihleutk2.apps.googleusercontent.com'

    setErrors({})

    if (window.google?.accounts?.oauth2) {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'email profile openid',
        callback: async (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            setLoading(true)
            try {
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
              })
              const googleProfile = await userInfoRes.json()

              if (googleProfile.email) {
                const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: googleProfile.email,
                    name: googleProfile.name || googleProfile.email.split('@')[0],
                    googleId: googleProfile.sub,
                    isRegister: true
                  })
                })
                const data = await res.json()
                if (res.ok && data.user) {
                  login(data.user, data.token)
                  navigate('/composer')
                  return
                } else if (data.error) {
                  setErrors({ general: data.error })
                }
              }
            } catch (err) {
              console.error('Google profile fetch error:', err)
              setErrors({ general: 'Failed to fetch Google profile. Please try again.' })
            } finally {
              setLoading(false)
            }
          }
        }
      })
      tokenClient.requestAccessToken()
      return
    }

    // Fallback prompt if Google SDK script is still loading
    const userEmail = window.prompt("Google SDK loading... Enter your Google Account email address to Register:", email.trim() || "")
    if (!userEmail || !userEmail.includes('@')) return

    setLoading(true)
    fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        name: name.trim() || userEmail.split('@')[0],
        isRegister: true
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          login(data.user, data.token)
          navigate('/composer')
        } else if (data.error) {
          setErrors({ general: data.error })
        }
      })
      .catch(() => setErrors({ general: 'Backend offline' }))
      .finally(() => setLoading(false))
  }

  const clearError = (field) => {
    setErrors((p) => ({ ...p, [field]: '' }))
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Create Account</h2>
        <p className="text-on-surface-variant text-sm">Join TATVA for advanced circuit synthesis</p>
      </div>

      {errors.general && (
        <div className="mb-6 p-3.5 bg-red-900/30 border border-red-500/50 rounded-2xl text-red-300 text-xs font-mono">
          ⚠️ {errors.general}
        </div>
      )}

      {/* Google Register Button */}
      <button
        type="button"
        onClick={handleGoogleOAuth}
        className="w-full bg-[#181a24] hover:bg-[#222533] border border-[#2d3247] text-white py-3 px-4 rounded-xl font-label-sm text-sm font-semibold flex items-center justify-center gap-3 transition-all mb-6 shadow-md cursor-pointer"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.15C3.26 21.3 7.33 24 12 24z"/>
          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.29C.47 8.21 0 10.05 0 12s.47 3.79 1.29 5.42l3.99-3.15z"/>
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.7 1.29 6.58l3.99 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
        </svg>
        <span>Sign up with Google</span>
      </button>

      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 h-[1px] bg-[#2d3247]" />
        <span className="text-xs text-[#a8a8a8] font-mono uppercase">Or register with email</span>
        <div className="flex-1 h-[1px] bg-[#2d3247]" />
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase" htmlFor="reg-name">
            Full Name
          </label>
          <input
            id="reg-name"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); clearError('name') }}
            className="w-full bg-[#07070A] border border-[#1A1A24] rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-0 input-glow transition-all font-code text-code"
            placeholder="Dr. Jane Doe"
          />
          {errors.name && <p className="text-error text-xs mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase" htmlFor="reg-email">
            Email Address
          </label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError('email') }}
            className="w-full bg-[#07070A] border border-[#1A1A24] rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-0 input-glow transition-all font-code text-code"
            placeholder="user@tatva.quantum"
          />
          {errors.email && <p className="text-error text-xs mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase" htmlFor="reg-password">
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError('password') }}
            className="w-full bg-[#07070A] border border-[#1A1A24] rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-0 input-glow transition-all font-code text-code"
            placeholder="At least 6 characters"
          />
          {errors.password && <p className="text-error text-xs mt-1">{errors.password}</p>}
        </div>
        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2 uppercase" htmlFor="reg-confirm">
            Confirm Password
          </label>
          <input
            id="reg-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); clearError('confirmPassword') }}
            className="w-full bg-[#07070A] border border-[#1A1A24] rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-0 input-glow transition-all font-code text-code"
            placeholder="Repeat password"
          />
          {errors.confirmPassword && <p className="text-error text-xs mt-1">{errors.confirmPassword}</p>}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-container text-white py-3 px-4 rounded-xl font-label-sm text-label-sm uppercase tracking-widest hover:shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-shadow flex items-center justify-center gap-2 border-t border-white/20 disabled:opacity-60 cursor-pointer"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Creating Account...
            </>
          ) : (
            <>
              Create Account
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default RegisterForm
