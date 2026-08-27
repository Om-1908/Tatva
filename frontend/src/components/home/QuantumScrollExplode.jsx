import React, { useRef, useEffect, useState, useCallback } from 'react'
import { motion, useScroll, useTransform, useSpring, useMotionValueEvent } from 'framer-motion'
import VariableProximity from '../ui/VariableProximity'

const TOTAL_FRAMES = 50

export default function QuantumScrollExplode() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const imagesRef = useRef([])

  const [isLoading, setIsLoading] = useState(true)
  const [loadedCount, setLoadedCount] = useState(0)
  const [imagesLoaded, setImagesLoaded] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Check prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    const handleChange = (e) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Preload all 50 frames monotonically
  useEffect(() => {
    let count = 0
    const loadedImages = []

    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image()
      const frameNum = String(i).padStart(3, '0')
      img.src = `/frames/ezgif-frame-${frameNum}.jpg`

      const handleLoad = () => {
        count++
        setLoadedCount(count)
        if (count === TOTAL_FRAMES) {
          imagesRef.current = loadedImages
          setImagesLoaded(true)
          setTimeout(() => setIsLoading(false), 250)
        }
      }

      img.onload = handleLoad
      img.onerror = handleLoad
      loadedImages.push(img)
    }
  }, [])

  // Scroll Progress across 500vh with Spring Physics Smoothing
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  // Smooth scroll progress using spring physics for 60fps/120fps fluid movement
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 200,
    damping: 28,
    restDelta: 0.0001,
  })

  // Smooth Frame Index Mapping (0 -> 49)
  const rawFrameIndex = useTransform(smoothProgress, [0, 1], [0, TOTAL_FRAMES - 1])

  const animFrameIdRef = useRef(null)
  const lastDrawnIndexRef = useRef(-1)

  // Canvas drawing: Hardware occupies right ~65-70%, leaving Left Safe Column free for text
  const drawFrame = useCallback((frameIdx) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const clampedIndex = Math.max(0, Math.min(TOTAL_FRAMES - 1, Math.round(frameIdx)))
    if (clampedIndex === lastDrawnIndexRef.current) return
    lastDrawnIndexRef.current = clampedIndex

    const img = imagesRef.current[clampedIndex]
    if (!img || !img.complete) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight

    // Clear background with exact frame edge color (#030802)
    ctx.fillStyle = '#030802'
    ctx.fillRect(0, 0, width, height)

    // Contain scaling: 100% of image frame is visible with ZERO cropping on top, bottom, or sides!
    const imgRatio = (img.naturalWidth || 1920) / (img.naturalHeight || 1080)
    const containerRatio = width / height

    let drawW, drawH
    if (imgRatio > containerRatio) {
      drawW = width
      drawH = width / imgRatio
    } else {
      drawH = height
      drawW = height * imgRatio
    }

    const drawX = (width - drawW) / 2
    const drawY = (height - drawH) / 2

    ctx.drawImage(img, drawX, drawY, drawW, drawH)
  }, [])

  // Subscribe to scroll updates with VSync throttling
  useMotionValueEvent(rawFrameIndex, 'change', (latest) => {
    if (imagesLoaded && !prefersReducedMotion) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current)
      }
      animFrameIdRef.current = requestAnimationFrame(() => drawFrame(latest))
    }
  })

  // Initial draw & resize handlers
  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(dpr, dpr)
    }
  }, [])

  useEffect(() => {
    if (imagesLoaded && canvasRef.current) {
      updateCanvasDimensions()
      drawFrame(0)
    }
  }, [imagesLoaded, drawFrame, updateCanvasDimensions])

  useEffect(() => {
    const handleResize = () => {
      if (imagesLoaded) {
        updateCanvasDimensions()
        lastDrawnIndexRef.current = -1
        drawFrame(rawFrameIndex.get() || 0)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [imagesLoaded, drawFrame, rawFrameIndex, updateCanvasDimensions])

  // Canvas container smooth fade & scale on entry and exit
  const canvasOpacity = useTransform(scrollYProgress, [0, 0.04, 0.90, 0.98], [0.15, 1, 1, 0])
  const canvasScale = useTransform(scrollYProgress, [0, 0.06, 0.90, 0.98], [0.94, 1.0, 1.0, 0.95])

  // Story section crossfades (Left safe text column)
  const sec1Opacity = useTransform(scrollYProgress, [0.02, 0.07, 0.16, 0.20], [0, 1, 1, 0])
  const sec1Y = useTransform(scrollYProgress, [0.02, 0.07, 0.16, 0.20], [20, 0, 0, -20])

  const sec2Opacity = useTransform(scrollYProgress, [0.20, 0.25, 0.36, 0.40], [0, 1, 1, 0])
  const sec2Y = useTransform(scrollYProgress, [0.20, 0.25, 0.36, 0.40], [20, 0, 0, -20])

  const sec3Opacity = useTransform(scrollYProgress, [0.40, 0.45, 0.56, 0.60], [0, 1, 1, 0])
  const sec3Y = useTransform(scrollYProgress, [0.40, 0.45, 0.56, 0.60], [20, 0, 0, -20])

  const sec4Opacity = useTransform(scrollYProgress, [0.75, 0.80, 0.94, 0.98], [0, 1, 1, 0])
  const sec4Y = useTransform(scrollYProgress, [0.75, 0.80, 0.94, 0.98], [20, 0, 0, -20])

  return (
    <div className="relative bg-[#030802] text-white selection:bg-[#22D3EE] selection:text-black">
      {/* 500vh Sticky Scroll Container */}
      <div ref={containerRef} className="relative h-[500vh] bg-[#030802]">
        {/* Top gradient transition from Hero */}
        <div className="absolute top-0 inset-x-0 h-20 md:h-24 bg-gradient-to-b from-[#030802] via-[#030802]/60 to-transparent pointer-events-none z-30" />

        {/* Bottom gradient transition into HowItWorks */}
        <div className="absolute bottom-0 inset-x-0 h-20 md:h-24 bg-gradient-to-t from-[#030802] via-[#030802]/80 to-transparent pointer-events-none z-30" />

        {/* Sticky Canvas Viewport */}
        <motion.div style={{ opacity: canvasOpacity, scale: canvasScale }} className="sticky top-0 h-screen w-full overflow-hidden bg-[#030802] flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full h-full block bg-[#030802] pointer-events-none"
          />

          {/* 3. Text Overlay Story Sections (Narrow Vertical Column Alignment at Extreme Outer Margins) */}
          <div className="absolute inset-0 pointer-events-none">
            
            {/* SECTION 1 (MOBILE TOP / DESKTOP LEFT): WHAT IS A QUANTUM COMPUTER? */}
            <div className="absolute inset-0 flex items-start pt-28 sm:pt-32 md:pt-0 md:items-center justify-center md:justify-start px-4 md:px-8">
              <motion.div
                style={{ opacity: sec1Opacity, y: sec1Y }}
                className="max-w-[320px] sm:max-w-[340px] md:max-w-[380px] text-left pointer-events-auto z-20"
              >
                <div className="inline-flex items-center gap-2 font-mono text-xs md:text-sm text-[#22D3EE] tracking-widest uppercase font-semibold mb-2 sm:mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#22D3EE]" />
                  <span>01 / QUANTUM COMPUTING</span>
                </div>
                <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-[38px] font-extrabold text-white mb-2 sm:mb-3 tracking-tight leading-[1.15] font-headline">
                  <VariableProximity
                    label="What Is a Quantum Computer?"
                    className="text-white cursor-default select-none"
                    fromFontVariationSettings="'wght' 400, 'opsz' 14"
                    toFontVariationSettings="'wght' 900, 'opsz' 40"
                    containerRef={containerRef}
                    radius={140}
                    falloff="linear"
                  />
                </h2>
                <p className="text-xs sm:text-sm md:text-base text-white/80 leading-relaxed font-light">
                  Quantum computers use qubits to represent and manipulate quantum states. Unlike classical bits, qubits can exist in superposition and can become entangled, enabling new approaches to certain computational problems.
                </p>
              </motion.div>
            </div>

            {/* SECTION 2 (MOBILE BOTTOM / DESKTOP RIGHT): HOW DO WE CONTROL QUBITS? */}
            <div className="absolute inset-0 flex items-end pb-28 sm:pb-32 md:pb-0 md:items-center justify-center md:justify-end px-4 md:px-8">
              <motion.div
                style={{ opacity: sec2Opacity, y: sec2Y }}
                className="max-w-[320px] sm:max-w-[340px] md:max-w-[380px] text-left pointer-events-auto z-20"
              >
                <div className="inline-flex items-center gap-2 font-mono text-xs md:text-sm text-[#22D3EE] tracking-widest uppercase font-semibold mb-2 sm:mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#22D3EE]" />
                  <span>02 / QUANTUM CIRCUITS</span>
                </div>
                <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-[38px] font-extrabold text-white mb-2 sm:mb-3 tracking-tight leading-[1.15] font-headline">
                  <VariableProximity
                    label="How Do We Control Qubits?"
                    className="text-white cursor-default select-none"
                    fromFontVariationSettings="'wght' 400, 'opsz' 14"
                    toFontVariationSettings="'wght' 900, 'opsz' 40"
                    containerRef={containerRef}
                    radius={140}
                    falloff="linear"
                  />
                </h2>
                <p className="text-xs sm:text-sm md:text-base text-white/80 leading-relaxed font-light mb-3 sm:mb-4">
                  Quantum gates transform qubit states. By combining gates into a circuit, we can move a quantum system from an initial state toward a desired target state.
                </p>

                {/* Supporting Graphic: Subtle Quantum Circuit Wire */}
                <div className="inline-flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/80 border border-white/15 backdrop-blur-md font-mono text-[11px] text-[#22D3EE]">
                  <span className="text-white/40 font-semibold">|0⟩</span>
                  <span className="text-white/20">──</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#4F46E5]/40 border border-[#4F46E5]/60 text-white font-bold">H</span>
                  <span className="text-white/20">──</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#22D3EE]/30 border border-[#22D3EE]/50 text-[#22D3EE] font-bold">RY</span>
                  <span className="text-white/20">──</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#4F46E5]/40 border border-[#4F46E5]/60 text-white font-bold">RZ</span>
                  <span className="text-white/20">──►</span>
                  <span className="text-[#22D3EE] font-bold">|ψ⟩</span>
                </div>
              </motion.div>
            </div>

            {/* SECTION 3 (MOBILE TOP / DESKTOP LEFT): THE PROBLEM */}
            <div className="absolute inset-0 flex items-start pt-28 sm:pt-32 md:pt-0 md:items-center justify-center md:justify-start px-4 md:px-8">
              <motion.div
                style={{ opacity: sec3Opacity, y: sec3Y }}
                className="max-w-[320px] sm:max-w-[340px] md:max-w-[380px] text-left pointer-events-auto z-20"
              >
                <div className="inline-flex items-center gap-2 font-mono text-xs md:text-sm text-[#22D3EE] tracking-widest uppercase font-semibold mb-2 sm:mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#22D3EE]" />
                  <span>03 / THE CHALLENGE</span>
                </div>
                <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-[38px] font-extrabold text-white mb-2 sm:mb-3 tracking-tight leading-[1.15] font-headline">
                  <VariableProximity
                    label="Finding the Right Circuit Is Hard."
                    className="text-white cursor-default select-none"
                    fromFontVariationSettings="'wght' 400, 'opsz' 14"
                    toFontVariationSettings="'wght' 900, 'opsz' 40"
                    containerRef={containerRef}
                    radius={140}
                    falloff="linear"
                  />
                </h2>
                <p className="text-xs sm:text-sm md:text-base text-white/80 leading-relaxed font-light">
                  A target state can be reached through many possible gate sequences. As the number of qubits and available operations grows, the search space becomes increasingly difficult to explore and optimize manually.
                </p>
              </motion.div>
            </div>

            {/* SECTION 4 (MOBILE BOTTOM / DESKTOP RIGHT): INTRODUCE TATVA */}
            <div className="absolute inset-0 flex items-end pb-28 sm:pb-32 md:pb-0 md:items-center justify-center md:justify-end px-4 md:px-8">
              <motion.div
                style={{ opacity: sec4Opacity, y: sec4Y }}
                className="max-w-[320px] sm:max-w-[340px] md:max-w-[380px] text-left pointer-events-auto z-20"
              >
                <div className="inline-flex items-center gap-2 font-mono text-xs md:text-sm text-[#22D3EE] tracking-widest uppercase font-semibold mb-2 sm:mb-3">
                  <span className="w-2 h-2 rounded-full bg-[#22D3EE]" />
                  <span>04 / TATVA</span>
                </div>
                <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-[38px] font-extrabold text-white mb-2 sm:mb-3 tracking-tight leading-[1.15] font-headline">
                  <VariableProximity
                    label="What If the Circuit Could Learn?"
                    className="text-white cursor-default select-none"
                    fromFontVariationSettings="'wght' 400, 'opsz' 14"
                    toFontVariationSettings="'wght' 900, 'opsz' 40"
                    containerRef={containerRef}
                    radius={140}
                    falloff="linear"
                  />
                </h2>
                <p className="text-xs sm:text-sm md:text-base text-white/80 leading-relaxed font-light">
                  TATVA treats circuit synthesis as a reinforcement-learning problem. Instead of manually searching through gate sequences, an agent learns which actions move the current quantum state closer to the target while reducing unnecessary circuit operations.
                </p>
              </motion.div>
            </div>

          </div>
        </motion.div>
      </div>
    </div>
  )
}
