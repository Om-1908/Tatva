import useScrollAnimation from '../../hooks/useScrollAnimation'

const AboutSection = () => {
  const ref = useScrollAnimation()

  return (
    <section
      className="py-24 px-margin-mobile md:px-margin-desktop bg-[#0A0A0F]/80 backdrop-blur-sm relative z-10 border-t border-outline-variant/30"
      id="about"
    >
      <div ref={ref} className="max-w-[820px] mx-auto text-center space-y-10">
        <div className="inline-flex items-center gap-3">
          <img src="/tatva_bg.png" alt="TATVA Logo" className="h-6 w-auto object-contain" />
          <span className="font-label-sm text-label-sm text-secondary tracking-widest uppercase">
            What is TATVA
          </span>
        </div>
        <h2 className="font-headline-md text-headline-md md:text-[36px] md:leading-[44px] text-on-surface">
          Built on Reinforcement Learning.
          <br />
          Designed for{' '}
          <span className="relative inline-block">
            Quantum
            <div className="absolute bottom-1 left-0 w-full h-[2px] bg-primary-container" />
          </span>
          .
        </h2>
        <p className="font-body-md text-body-md md:text-[17px] text-on-surface-variant leading-[1.8] text-left">
          Quantum computing demands precise control sequences (gates) to manipulate qubits into
          specific target states. Designing these circuits manually is complex and often inefficient.
          TATVA automates this synthesis by deploying Reinforcement Learning agents (like Deep
          Q-Networks and Proximal Policy Optimization) that treat circuit construction as a
          sequential decision-making process. The agent explores the space of possible gate
          sequences, learning to build circuits that achieve the target state with minimal
          operations and maximal fidelity.
        </p>
      </div>
    </section>
  )
}

export default AboutSection
