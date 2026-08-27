import React, { useRef, useState } from 'react'

export function CometCard({ children, className = '', style = {} }) {
  const cardRef = useRef(null)
  const [transform, setTransform] = useState('')
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 })

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Calculate 3D tilt rotation based on mouse cursor position
    const rotateX = ((y - centerY) / centerY) * -15
    const rotateY = ((x - centerX) / centerX) * 15

    const glareX = (x / rect.width) * 100
    const glareY = (y / rect.height) * 100

    setTransform(
      `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.04, 1.04, 1.04)`
    )
    setGlare({ x: glareX, y: glareY, opacity: 0.4 })
  }

  const handleMouseLeave = () => {
    setTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)')
    setGlare((prev) => ({ ...prev, opacity: 0 }))
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative transition-transform duration-200 ease-out preserve-3d cursor-pointer ${className}`}
      style={{
        transformStyle: 'preserve-3d',
        transform: transform || 'perspective(1000px) rotateX(0deg) rotateY(0deg)',
        ...style,
      }}
    >
      {/* Dynamic Comet Light Sheen Glare */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300 z-20 overflow-hidden"
        style={{
          opacity: glare.opacity,
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255, 255, 255, 0.4) 0%, rgba(79, 70, 229, 0.25) 40%, transparent 75%)`,
        }}
      />
      {children}
    </div>
  )
}
