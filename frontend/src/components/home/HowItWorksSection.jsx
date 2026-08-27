import useScrollAnimation from '../../hooks/useScrollAnimation'

const steps = [
  {
    num: '01',
    title: 'Configure Target State',
    desc: 'Select your qubit count and desired quantum state — from basis states to entangled Bell pairs and GHZ states.',
    icon: 'tune',
  },
  {
    num: '02',
    title: 'RL Agent Synthesis',
    desc: 'Our DQN/PPO agent explores the gate space, building circuits step-by-step to match your target with maximum fidelity.',
    icon: 'psychology',
  },
  {
    num: '03',
    title: 'Evaluate & Visualize',
    desc: 'View the synthesized circuit, generated QASM/Qiskit code, statevector amplitudes, and performance metrics.',
    icon: 'monitoring',
  },
  {
    num: '04',
    title: 'Edit & Export',
    desc: 'Drag-and-drop additional gates, recalculate fidelity, and export your circuit as production-ready code.',
    icon: 'download',
  },
]

const StepCard = ({ step, index }) => {
  const ref = useScrollAnimation(index * 0.1)

  return (
    <div ref={ref} className="flex flex-col items-center text-center relative px-2 group">
      {/* 4 Icon Boxes with Hover Pop-Up & Neon Glow Effect */}
      <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-primary-container/15 border border-primary-container/35 flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/10 cursor-pointer transform transition-all duration-300 hover:-translate-y-3 hover:scale-110 hover:bg-primary-container/30 hover:border-[#22D3EE] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]">
        <span className="material-symbols-outlined text-primary-container text-3xl sm:text-4xl transition-all duration-300 group-hover:text-[#22D3EE] group-hover:scale-110">
          {step.icon}
        </span>
      </div>
      <span className="font-mono text-sm md:text-base font-bold text-[#22D3EE] tracking-wider mb-2">{step.num}</span>
      <h3 className="text-xl sm:text-2xl text-white mb-3 font-bold tracking-tight">{step.title}</h3>
      <p className="text-sm sm:text-base text-white/80 leading-relaxed font-light max-w-[280px] sm:max-w-none">{step.desc}</p>
    </div>
  )
}

const HowItWorksSection = () => {
  const titleRef = useScrollAnimation()

  return (
    <section
      id="how-it-works"
      className="py-24 px-margin-mobile md:px-margin-desktop relative z-10"
    >
      {/* Seamless top transition gradient above the title text */}
      <div className="absolute top-0 inset-x-0 h-20 md:h-24 bg-gradient-to-b from-[#030802] via-[#030802]/60 to-transparent pointer-events-none z-10" />

      <div className="max-w-max-width mx-auto relative z-20">
        <div ref={titleRef} className="text-center mb-16">
          <span className="font-mono text-xs md:text-sm text-[#22D3EE] tracking-widest uppercase font-bold">
            How It Works
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mt-3 tracking-tight drop-shadow-md">
            From Target State to Quantum Circuit
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {steps.map((step, i) => (
            <StepCard key={step.num} step={step} index={i} />
          ))}

          {/* Arrow connectors (desktop only) */}
          <div className="hidden lg:block absolute top-8 left-[25%] w-[50%] pointer-events-none">
            <div className="flex justify-between px-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="text-outline-variant">
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default HowItWorksSection
