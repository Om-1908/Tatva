import useScrollAnimation from '../../hooks/useScrollAnimation'

const VisionSection = () => {
  const visionRef = useScrollAnimation(0.1)
  const missionRef = useScrollAnimation(0.2)

  return (
    <section className="px-margin-mobile md:px-margin-desktop max-w-4xl mx-auto mb-20">
      <div className="grid grid-cols-2 gap-3 sm:gap-6 md:gap-8">
        {/* Vision Card */}
        <div
          ref={visionRef}
          className="relative bg-[#12111a]/90 backdrop-blur-xl border border-indigo-500/25 p-4 sm:p-6 md:p-8 rounded-2xl min-h-[260px] sm:min-h-[290px] md:min-h-[310px] flex flex-col items-center justify-center text-center transition-all duration-300 ease-in-out hover:scale-[1.03] hover:-rotate-1 hover:shadow-[0_20px_40px_rgba(79,70,229,0.35)] hover:border-indigo-500/80 group cursor-pointer overflow-hidden shadow-2xl"
        >
          {/* Accent Glow Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

          {/* Resting Logo & Heading (Visible when not hovering) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 sm:p-5 transition-all duration-300 ease-in-out group-hover:opacity-0 group-hover:scale-90 pointer-events-none">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-indigo-500/25">
              <span className="material-symbols-outlined text-[#818CF8] text-2.5xl sm:text-3.5xl">visibility</span>
            </div>
            <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight">Vision</h3>
          </div>

          {/* Blurred Background Logo on Hover (.img effect) */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-20 transition-all duration-300 ease-in-out group-hover:scale-125 group-hover:blur-[6px] pointer-events-none">
            <span className="material-symbols-outlined text-[#818CF8] text-[90px] sm:text-[140px]">visibility</span>
          </div>

          {/* Hover Text Box (.textBox effect) */}
          <div className="relative z-10 opacity-0 group-hover:opacity-100 transform translate-y-3 group-hover:translate-y-0 transition-all duration-300 ease-in-out flex flex-col items-center justify-center gap-1.5 sm:gap-2.5">
            <h3 className="text-base sm:text-xl md:text-2xl font-extrabold text-indigo-300 tracking-tight">
              Vision
            </h3>
            <p className="text-[11px] sm:text-xs md:text-sm text-white/90 leading-normal sm:leading-relaxed font-light text-center">
              To democratize quantum circuit design by making intelligent, automated synthesis accessible to every researcher, developer, and student through Reinforcement Learning.
            </p>
          </div>
        </div>

        {/* Mission Card */}
        <div
          ref={missionRef}
          className="relative bg-[#12111a]/90 backdrop-blur-xl border border-[#22D3EE]/25 p-4 sm:p-6 md:p-8 rounded-2xl min-h-[260px] sm:min-h-[290px] md:min-h-[310px] flex flex-col items-center justify-center text-center transition-all duration-300 ease-in-out hover:scale-[1.03] hover:rotate-1 hover:shadow-[0_20px_40px_rgba(34,211,238,0.35)] hover:border-[#22D3EE]/80 group cursor-pointer overflow-hidden shadow-2xl"
        >
          {/* Accent Glow Line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#22D3EE] to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />

          {/* Resting Logo & Heading (Visible when not hovering) */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 sm:p-5 transition-all duration-300 ease-in-out group-hover:opacity-0 group-hover:scale-90 pointer-events-none">
            <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl bg-[#22D3EE]/15 border border-[#22D3EE]/40 flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-cyan-500/25">
              <span className="material-symbols-outlined text-[#22D3EE] text-2.5xl sm:text-3.5xl">my_location</span>
            </div>
            <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight">Mission</h3>
          </div>

          {/* Blurred Background Logo on Hover (.img effect) */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-20 transition-all duration-300 ease-in-out group-hover:scale-125 group-hover:blur-[6px] pointer-events-none">
            <span className="material-symbols-outlined text-[#22D3EE] text-[90px] sm:text-[140px]">my_location</span>
          </div>

          {/* Hover Text Box (.textBox effect) */}
          <div className="relative z-10 opacity-0 group-hover:opacity-100 transform translate-y-3 group-hover:translate-y-0 transition-all duration-300 ease-in-out flex flex-col items-center justify-center gap-1.5 sm:gap-2.5">
            <h3 className="text-base sm:text-xl md:text-2xl font-extrabold text-[#22D3EE] tracking-tight">
              Mission
            </h3>
            <p className="text-[11px] sm:text-xs md:text-[13px] text-white/90 leading-normal sm:leading-relaxed font-light text-center">
              To build a research-grade Reinforcement Learning framework that autonomously synthesizes optimal quantum circuits for arbitrary target quantum states with maximum fidelity.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default VisionSection

