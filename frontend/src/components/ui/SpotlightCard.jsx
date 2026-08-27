import React, { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

const TILT_MAX = 9
const TILT_SPRING = { stiffness: 300, damping: 28 }
const GLOW_SPRING = { stiffness: 180, damping: 22 }

export default function SpotlightCard({
  children,
  dimmed = false,
  onHoverStart,
  onHoverEnd,
  className = '',
  accentColor = '#4F46E5',
  onClick,
}) {
  const cardRef = useRef(null)

  const normX = useMotionValue(0.5)
  const normY = useMotionValue(0.5)

  const rawRotateX = useTransform(normY, [0, 1], [TILT_MAX, -TILT_MAX])
  const rawRotateY = useTransform(normX, [0, 1], [-TILT_MAX, TILT_MAX])

  const rotateX = useSpring(rawRotateX, TILT_SPRING)
  const rotateY = useSpring(rawRotateY, TILT_SPRING)
  const glowOpacity = useSpring(0, GLOW_SPRING)

  const handleMouseMove = (e) => {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    normX.set((e.clientX - rect.left) / rect.width)
    normY.set((e.clientY - rect.top) / rect.height)
  }

  const handleMouseEnter = () => {
    glowOpacity.set(1)
    onHoverStart?.()
  }

  const handleMouseLeave = () => {
    normX.set(0.5)
    normY.set(0.5)
    glowOpacity.set(0)
    onHoverEnd?.()
  }

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      animate={{
        scale: dimmed ? 0.96 : 1,
        opacity: dimmed ? 0.5 : 1,
      }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 900,
      }}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#11111A] shadow-xl hover:border-indigo-500/50 transition-all duration-300 cursor-pointer ${className}`}
    >
      {/* Static Accent Radial Tint — Always Visible */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-3xl z-0"
        style={{
          background: `radial-gradient(ellipse at 20% 20%, ${accentColor}18, transparent 65%)`,
        }}
      />

      {/* Dynamic Hover Glow Layer */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-3xl z-0"
        style={{
          opacity: glowOpacity,
          background: `radial-gradient(ellipse at 20% 20%, ${accentColor}35, transparent 65%)`,
        }}
      />

      {/* Shimmer Sweep Animation */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[55%] -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[280%] z-10"
      />

      {/* Card Content */}
      <div className="relative z-20 flex-1 flex flex-col">{children}</div>

      {/* Accent Bottom Line */}
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[2px] w-0 rounded-full transition-all duration-500 group-hover:w-full z-20"
        style={{
          background: `linear-gradient(to right, ${accentColor}, transparent)`,
        }}
      />
    </motion.div>
  )
}
