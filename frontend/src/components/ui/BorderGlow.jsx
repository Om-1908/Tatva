import React, { useRef, useState } from 'react'

export default function BorderGlow({
  children,
  className = '',
  edgeSensitivity = 30,
  glowColor = '40 80 80',
  backgroundColor = '#120F17',
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = ['#c084fc', '#f472b6', '#38bdf8'],
  onClick,
  style = {},
}) {
  const containerRef = useRef(null)
  const [mousePos, setMousePos] = useState({ x: 50, y: 50, opacity: 0 })

  const handleMouseMove = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setMousePos({ x, y, opacity: 1 })
  }

  const handleMouseLeave = () => {
    setMousePos((prev) => ({ ...prev, opacity: 0 }))
  }

  const gradientColors = colors.join(', ')
  const radiusPx = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative inline-block overflow-hidden transition-all duration-300 ${className}`}
      style={{
        borderRadius: radiusPx,
        backgroundColor: backgroundColor,
        padding: '2px', // 2px border gap for edge glow
        ...style,
      }}
    >
      {/* Animated Edge Glow Gradient Radial Layer */}
      <div
        className="pointer-events-none absolute inset-[-50%] transition-opacity duration-300 z-0"
        style={{
          opacity: animated ? 1 : mousePos.opacity,
          background: `radial-gradient(circle ${glowRadius * 3}px at ${mousePos.x}% ${mousePos.y}%, ${colors[0]}, ${colors[1] || colors[0]}, ${colors[2] || colors[0]}, transparent 70%)`,
          filter: `blur(${glowRadius / 3}px)`,
        }}
      />

      {/* Outer Border Track Light */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] z-0 transition-opacity duration-300"
        style={{
          opacity: mousePos.opacity * glowIntensity,
          padding: '1.5px',
          background: `conic-gradient(from ${mousePos.x * 3.6}deg at ${mousePos.x}% ${mousePos.y}%, ${gradientColors}, ${gradientColors})`,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />

      {/* Inner Content Container */}
      <div
        className="relative z-10 w-full h-full rounded-[inherit] flex items-center justify-center"
        style={{
          backgroundColor: backgroundColor,
          borderRadius: `calc(${radiusPx} - 2px)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
