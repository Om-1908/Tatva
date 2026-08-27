import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import useAuthStore from '../store/useAuthStore'
import LoginForm from '../components/auth/LoginForm'
import RegisterForm from '../components/auth/RegisterForm'

import animationVideo from '../components/home/animation2.mp4'

const AuthPage = () => {
  const [params] = useSearchParams()
  const [activeTab, setActiveTab] = useState('login')
  const { isLoggedIn } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoggedIn) navigate('/composer', { replace: true })
  }, [isLoggedIn, navigate])

  useEffect(() => {
    if (params.get('tab') === 'register') setActiveTab('register')
  }, [params])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="min-h-screen flex font-body-md text-body-md overflow-hidden bg-[#000000]"
    >
      {/* Left Panel: Video Animation & Branding */}
      <div className="hidden lg:flex w-1/2 flex-col items-center justify-center relative p-8 bg-[#000000]">
        <div className="z-10 flex flex-col items-center text-center max-w-2xl">
          {/* Animation Video with Radial Edge Mask and Screen Blend */}
          <div className="relative flex items-center justify-center mb-4 w-full max-w-[620px]">
            {/* Ambient Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#7c5ce9]/25 to-[#4f46e5]/25 rounded-full blur-3xl opacity-70 pointer-events-none" />

            <video
              src={animationVideo}
              autoPlay
              loop
              muted
              playsInline
              style={{
                mixBlendMode: 'screen',
                WebkitMaskImage: 'radial-gradient(circle at center, black 60%, transparent 95%)',
                maskImage: 'radial-gradient(circle at center, black 60%, transparent 95%)',
              }}
              className="w-full max-w-[580px] md:max-w-[600px] h-auto object-contain relative z-10 pointer-events-none transform scale-105"
            />
          </div>

          <img
            src="/tatva_bg.png"
            alt="TATVA Logo"
            className="h-14 md:h-16 w-auto object-contain mb-3 drop-shadow-[0_0_20px_rgba(56,189,248,0.3)]"
          />
          <p className="font-body-lg text-body-lg text-on-surface-variant font-medium tracking-wide">
            AI-Driven Quantum Circuit Synthesis
          </p>
        </div>
      </div>

      {/* Right Panel: Authentication Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-margin-mobile md:p-margin-desktop bg-[#07080e] border-l border-white/5">
        <div className="w-full max-w-[440px]">
          {/* Auth Card */}
          <div className="bg-[#11111A] border-t-2 border-t-primary-container border-x border-b border-x-[#1A1A24] border-b-[#1A1A24] rounded-3xl shadow-[0_0_50px_rgba(79,70,229,0.1)] overflow-hidden">
            {/* Tab Switcher */}
            <div className="flex border-b border-outline-variant/30 bg-[#0d0d1a]">
              <button
                onClick={() => setActiveTab('login')}
                className={`flex-1 py-4 font-label-sm text-label-sm uppercase tracking-widest text-center transition-colors ${
                  activeTab === 'login' ? 'glass-tab-active' : 'glass-tab-inactive'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setActiveTab('register')}
                className={`flex-1 py-4 font-label-sm text-label-sm uppercase tracking-widest text-center transition-colors ${
                  activeTab === 'register' ? 'glass-tab-active' : 'glass-tab-inactive'
                }`}
              >
                Register
              </button>
            </div>
            <div className="p-8">
              {activeTab === 'login' ? (
                <LoginForm onSwitchToRegister={() => setActiveTab('register')} />
              ) : (
                <RegisterForm onSwitchToLogin={() => setActiveTab('login')} />
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default AuthPage
