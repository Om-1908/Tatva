import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import quantumBgVideo from './quantum_bg.mp4'
import BorderGlow from '../ui/BorderGlow'
import VariableProximity from '../ui/VariableProximity'

const HeroSection = () => {
  const navigate = useNavigate()
  const { isLoggedIn } = useAuthStore()
  const heroContainerRef = useRef(null)

  // Generate particle data once
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, () => ({
      size: Math.random() * 3 + 1,
      left: Math.random() * 100,
      duration: Math.random() * 10 + 10,
      delay: Math.random() * 10,
    }))
  }, [])

  useEffect(() => {
    // Trigger initial fade-up animations
    const timer = setTimeout(() => {
      document.querySelectorAll('.hero-fade-up').forEach((el) => el.classList.add('visible'))
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleCreateCircuit = () => {
    navigate(isLoggedIn ? '/composer' : '/auth')
  }

  return (
    <section ref={heroContainerRef} className="min-h-screen flex flex-col justify-center items-center text-center px-margin-mobile md:px-margin-desktop relative overflow-hidden pt-24 md:pt-28">
      {/* Video Background - Crystal clear without heavy masking */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          src={quantumBgVideo}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        {/* Minimal soft radial vignette only behind the text for essential readability */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_48%,rgba(0,0,0,0.45)_0%,rgba(0,0,0,0)_100%)] pointer-events-none" />
      </div>

      {/* Ambient Background Orbs */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="absolute inset-0 bg-grid z-0" />
        <div className="particles-container">
          {particles.map((p, i) => (
            <div
              key={i}
              className="particle"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                left: `${p.left}vw`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-8 z-10">
        <h1 className="hero-fade-up fade-up delay-500 font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface tracking-tight leading-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)]">
          <VariableProximity
            label="Automated Quantum Circuit Synthesis"
            className="font-headline-lg-mobile md:font-headline-lg text-on-surface cursor-default select-none"
            fromFontVariationSettings="'wght' 400, 'opsz' 14"
            toFontVariationSettings="'wght' 900, 'opsz' 40"
            containerRef={heroContainerRef}
            radius={140}
            falloff="linear"
          />
        </h1>

        {/* Create Your Circuit Button with Solid White Hover Border */}
        <div className="hero-fade-up fade-up delay-900 pt-4 flex flex-col sm:flex-row items-center justify-center">
          <BorderGlow
            backgroundColor="#120F17"
            borderRadius={28}
            onClick={handleCreateCircuit}
            className="cursor-pointer group hover:scale-[1.03] transition-transform duration-300 shadow-2xl"
          >
            <div className="px-8 py-4 text-white font-body-md font-semibold flex items-center">
              <span>Create Your Circuit</span>
              <span className="material-symbols-outlined ml-2 group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </div>
          </BorderGlow>
        </div>
      </div>

      {/* Subtle bottom fade into scrollytelling section */}
      <div className="absolute bottom-0 inset-x-0 h-20 md:h-24 bg-gradient-to-t from-[#010101] via-[#010101]/60 to-transparent pointer-events-none z-10" />
    </section>
  )
}

export default HeroSection
