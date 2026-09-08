import React, { useState } from 'react'

export default function BorderGlow({
  children,
  className = '',
  backgroundColor = '#120F17',
  borderRadius = 28,
  onClick,
  style = {},
}) {
  const [isHovered, setIsHovered] = useState(false)
  const radiusPx = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`relative inline-block transition-all duration-300 ease-out ${className}`}
      style={{
        borderRadius: radiusPx,
        backgroundColor: backgroundColor,
        padding: '1.5px', // Uniform solid border thickness
        boxShadow: isHovered
          ? '0 0 24px rgba(255, 255, 255, 0.25), 0 0 8px rgba(255, 255, 255, 0.35)'
          : '0 4px 20px rgba(0, 0, 0, 0.4)',
        ...style,
      }}
    >
      {/* Subtle White Glow layer on hover */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 ease-out blur-[3px]"
        style={{
          opacity: isHovered ? 0.45 : 0,
          backgroundColor: '#ffffff',
        }}
      />

      {/* Solid Uniform Pure White Border on Hover */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300 ease-out"
        style={{
          opacity: isHovered ? 1 : 0.15,
          backgroundColor: isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.15)',
        }}
      />

      {/* Inner Content Container preserving exact dark background and shape */}
      <div
        className="relative z-10 w-full h-full flex items-center justify-center transition-colors duration-300"
        style={{
          backgroundColor: backgroundColor,
          borderRadius: `calc(${radiusPx} - 1.5px)`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

