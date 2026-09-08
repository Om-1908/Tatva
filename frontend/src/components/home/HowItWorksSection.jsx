import React, { useRef, useState, useEffect } from 'react'
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion'
import HowItWorksVisualizer from './HowItWorksVisualizer'
import {
  Step01TargetStatePanel,
  Step02RLSynthesisPanel,
  Step03EvaluationPanel,
  Step04ExportPanel,
} from './StepTechPanels'
import {
  Step01GutterPanel,
  Step02GutterPanel,
  Step03GutterPanel,
  Step04GutterPanel,
} from './StepGutterPanels'

const steps = [
  {
    num: '01',
    title: 'Configure Target State',
    desc: 'Select your qubit count and desired quantum state — from basis states to entangled Bell pairs and GHZ states.',
    icon: 'tune',
    label: 'State Config',
    tag: 'Target State Space',
  },
  {
    num: '02',
    title: 'RL Agent Synthesis',
    desc: 'Our DQN/PPO agent explores the gate space, building circuits step-by-step to match your target with maximum fidelity.',
    icon: 'psychology',
    label: 'RL Synthesis',
    tag: 'DQN / PPO Exploration',
  },
  {
    num: '03',
    title: 'Evaluate & Visualize',
    desc: 'View the synthesized circuit, generated QASM/Qiskit code, statevector amplitudes, and performance metrics.',
    icon: 'monitoring',
    label: 'Fidelity & Metrics',
    tag: 'Statevector & Metrics',
  },
  {
    num: '04',
    title: 'Edit & Export',
    desc: 'Drag-and-drop additional gates, recalculate fidelity, and export your circuit as production-ready code.',
    icon: 'download',
    label: 'Export Circuit',
    tag: 'OpenQASM / Qiskit Export',
  },
]

// Single Step Row with scroll-in-view detection, primary card, and secondary gutter panel
function StepCard({
  step,
  index,
  isActivated,
  isCurrentlyActive,
  onActivate,
}) {
  const cardRef = useRef(null)

  // Trigger activation when this card reaches ~30% into viewport
  const inView = useInView(cardRef, {
    amount: 0.3,
    margin: '-5% 0px -15% 0px',
  })

  useEffect(() => {
    if (inView) {
      onActivate(index)
    }
  }, [inView, index, onActivate])

  const isEven = index % 2 === 0 // 0 and 2 -> Left card; 1 and 3 -> Right card

  // Primary Main Card
  const CardNode = (
    <div
      onClick={() => onActivate(index)}
      className={`w-full md:w-[48%] lg:w-[46%] rounded-2xl border p-4 sm:p-5 md:p-5 transition-all duration-500 cursor-pointer relative z-10 ${
        isCurrentlyActive
          ? 'bg-[#11111a]/95 border-[#22D3EE]/60 shadow-[0_0_35px_rgba(34,211,238,0.15)] ring-1 ring-[#22D3EE]/30 scale-[1.01]'
          : isActivated
          ? 'bg-[#0c0c14]/85 border-white/20 hover:border-white/35 hover:bg-[#11111a]/80'
          : 'bg-[#08080d]/40 border-white/5 opacity-35 grayscale hover:opacity-60'
      }`}
    >
      {/* Card Header: Icon & Increased STEP Label Badge */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5">
          {/* Step Icon Box */}
          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all duration-500 transform ${
              isActivated
                ? 'bg-primary-container/25 border-2 border-[#22D3EE] text-[#22D3EE] shadow-[0_0_20px_rgba(34,211,238,0.4)] scale-105'
                : 'bg-[#0a0a10] border border-white/15 text-white/30 scale-95'
            }`}
          >
            <span
              className={`material-symbols-outlined text-xl sm:text-2xl transition-all duration-300 ${
                isActivated ? 'text-[#22D3EE]' : 'text-white/30'
              }`}
            >
              {step.icon}
            </span>
          </div>

          {/* STEP Label Badge (Enlarged to 14–15px for enhanced legibility) */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            {isActivated ? (
              // Genuine SVG stroke-by-stroke checkmark draw on activation
              <svg
                className="w-4 h-4 text-[#22D3EE]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M4 12l5 5L20 6"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.55, ease: 'easeOut' }}
                />
              </svg>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
            )}

            <span
              className={`font-mono text-sm sm:text-[14.5px] font-bold tracking-wider transition-colors duration-300 ${
                isActivated ? 'text-[#22D3EE]' : 'text-white/40'
              }`}
            >
              STEP {step.num}
            </span>
          </div>
        </div>

        {/* Tag */}
        <span className="hidden sm:inline-block font-mono text-[10.5px] text-white/50 uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
          {step.tag}
        </span>
      </div>

      {/* Step Title */}
      <h3 className="text-lg sm:text-xl md:text-[22px] font-extrabold text-white mb-1.5 tracking-tight leading-tight text-left">
        {step.title}
      </h3>

      {/* Step Description */}
      <p className="text-xs sm:text-[13.5px] text-white/75 leading-relaxed font-light mb-2.5 text-left">
        {step.desc}
      </p>

      {/* 3D Visualizer Stage (Preloaded across all cards for zero scroll delay) */}
      <div className="w-full h-[135px] sm:h-[145px] md:h-[155px] rounded-xl bg-black/60 border border-white/10 overflow-hidden relative flex items-center justify-center">
        <HowItWorksVisualizer
          stepIndex={index}
          isActivated={isActivated}
          isCurrentlyActive={isCurrentlyActive}
        />

        {/* Live 3D Badge & Drag Hint */}
        {isActivated ? (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-[#22D3EE]/20 border border-[#22D3EE]/50 text-[#22D3EE] font-mono text-[9px] tracking-wider uppercase pointer-events-none shadow-sm">
            {isCurrentlyActive ? 'Live 3D' : '3D Active'}
          </div>
        ) : (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/40 font-mono text-[9px] tracking-wider uppercase pointer-events-none">
            3D Preview
          </div>
        )}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/70 border border-white/10 text-white/50 font-mono text-[8.5px] pointer-events-none">
          Drag to rotate
        </div>
      </div>

      {/* PER-STEP TECHNICAL INFORMATION PANEL */}
      {index === 0 && <Step01TargetStatePanel isActivated={isActivated} />}
      {index === 1 && <Step02RLSynthesisPanel isActivated={isActivated} />}
      {index === 2 && <Step03EvaluationPanel isActivated={isActivated} />}
      {index === 3 && <Step04ExportPanel isActivated={isActivated} />}

      {/* Status indicator footer */}
      <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-white/5">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isCurrentlyActive
                ? 'bg-[#22D3EE] animate-pulse'
                : isActivated
                ? 'bg-[#10B981]'
                : 'bg-white/20'
            }`}
          />
          <span className="font-mono text-[10.5px] text-white/50">
            {isCurrentlyActive
              ? 'Currently Active Stage'
              : isActivated
              ? 'Stage Complete'
              : 'Pending Exploration'}
          </span>
        </div>

        <span className="font-mono text-[10.5px] text-[#22D3EE]/80 font-semibold">
          {index + 1}/4
        </span>
      </div>
    </div>
  )

  // Secondary Informational Gutter Panel (Rendered opposite to main card on desktop, below on mobile)
  const GutterPanelNode = (
    <div className="w-full relative z-10">
      {index === 0 && <Step01GutterPanel isActivated={isActivated} />}
      {index === 1 && <Step02GutterPanel isActivated={isActivated} />}
      {index === 2 && <Step03GutterPanel isActivated={isActivated} />}
      {index === 3 && <Step04GutterPanel isActivated={isActivated} />}
    </div>
  )

  return (
    <div
      ref={cardRef}
      className="relative w-full flex flex-col md:flex-row items-center justify-between gap-4 md:gap-8 select-none"
    >
      {isEven ? (
        <>
          {CardNode}
          {/* Desktop Right Gutter Panel */}
          <div className="hidden md:flex md:w-[48%] lg:w-[46%] items-center justify-center relative z-10">
            {GutterPanelNode}
          </div>
        </>
      ) : (
        <>
          {/* Desktop Left Gutter Panel */}
          <div className="hidden md:flex md:w-[48%] lg:w-[46%] items-center justify-center relative z-10">
            {GutterPanelNode}
          </div>
          {CardNode}
        </>
      )}

      {/* Mobile Stacked Gutter Panel (Stacked directly below Card on small screens) */}
      <div className="md:hidden w-full">
        {GutterPanelNode}
      </div>
    </div>
  )
}

export default function HowItWorksSection() {
  const sectionRef = useRef(null)
  const timelineRef = useRef(null)

  // Track which steps have been activated ([false, false, false, false] on initial load)
  // Once a step becomes true, it NEVER reverts to false
  const [activatedSteps, setActivatedSteps] = useState([false, false, false, false])

  // Track the currently focused step for the 3D visualizer
  const [activeStepIndex, setActiveStepIndex] = useState(0)

  // Scroll tracking scoped to the timeline container to drive the serpentine path fill
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ['start 60%', 'end 75%'],
  })

  // Smooth scroll progress using spring physics for fluid river curve growth
  const smoothCurveProgress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  })

  // Callback when a step enters view
  const handleActivateStep = (idx) => {
    setActivatedSteps((prev) => {
      const next = [...prev]
      for (let i = 0; i <= idx; i++) {
        next[i] = true
      }
      return next
    })
    setActiveStepIndex(idx)
  }

  // Bezier Serpentine Path across the 1000x1000 coordinate space
  // Flows smoothly through cards and gutter panels
  const serpentinePathD =
    'M 240 80 C 240 220, 760 220, 760 360 C 760 500, 240 500, 240 640 C 240 780, 760 780, 760 920'

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="py-24 md:py-32 px-margin-mobile md:px-margin-desktop relative z-10 bg-[#010101] overflow-hidden"
    >
      {/* Seamless top transition gradient above the title text */}
      <div className="absolute top-0 inset-x-0 h-24 md:h-32 bg-gradient-to-b from-[#010101] via-[#010101]/60 to-transparent pointer-events-none z-10" />

      {/* Subtle ambient background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[850px] h-[550px] bg-primary-container/10 rounded-full blur-[170px] pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-20">
        {/* Section Header */}
        <div className="text-center mb-16 md:mb-24">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary-container/15 border border-[#22D3EE]/30 mb-3.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse" />
            <span className="font-mono text-xs md:text-sm text-[#22D3EE] tracking-widest uppercase font-bold">
              How It Works
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mt-2 tracking-tight drop-shadow-md">
            From Target State to Quantum Circuit
          </h2>
          <p className="text-sm md:text-base text-white/70 max-w-xl mx-auto mt-3 font-light leading-relaxed">
            Follow the alternating pipeline flow to explore each stage of reinforcement-learning circuit synthesis.
          </p>
        </div>

        {/* TIMELINE CONTAINER WITH SERPENTINE RIVER PATH */}
        <div ref={timelineRef} className="relative">
          {/* DESKTOP SERPENTINE / RIVER SVG CURVE (Hidden on Mobile) */}
          <div className="hidden md:block absolute inset-0 w-full h-full pointer-events-none z-0">
            <svg
              className="w-full h-full"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              fill="none"
            >
              <defs>
                {/* Glowing cyan-to-indigo gradient for river path */}
                <linearGradient id="riverGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="35%" stopColor="#22d3ee" />
                  <stop offset="70%" stopColor="#00e5ff" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>

                {/* Soft neon glow filter */}
                <filter id="pathGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background inactive curve track */}
              <path
                d={serpentinePathD}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="3.5"
                strokeDasharray="8 8"
                strokeLinecap="round"
              />

              {/* Active scroll-driven glowing river fill path */}
              <motion.path
                d={serpentinePathD}
                stroke="url(#riverGradient)"
                strokeWidth="4"
                strokeLinecap="round"
                filter="url(#pathGlow)"
                style={{
                  pathLength: smoothCurveProgress,
                }}
              />
            </svg>
          </div>

          {/* MOBILE STRAIGHT CONNECTING LINE (Hidden on Desktop) */}
          <div className="md:hidden absolute left-[26px] top-8 bottom-8 w-[2px] pointer-events-none z-0">
            <div className="absolute inset-0 bg-white/10 rounded-full" />
            <motion.div
              className="absolute top-0 left-0 right-0 bg-gradient-to-b from-[#4f46e5] via-[#22d3ee] to-[#22d3ee] rounded-full shadow-[0_0_15px_rgba(34,211,238,0.85)]"
              style={{
                height: useTransform(smoothCurveProgress, [0, 1], ['0%', '100%']),
              }}
            />
          </div>

          {/* 4 STEP CARDS WITH TIGHTENED VERTICAL PACING */}
          <div className="flex flex-col space-y-16 sm:space-y-20 md:space-y-28 lg:space-y-32">
            {steps.map((step, idx) => (
              <StepCard
                key={step.num}
                step={step}
                index={idx}
                isActivated={activatedSteps[idx]}
                isCurrentlyActive={activeStepIndex === idx}
                onActivate={handleActivateStep}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
