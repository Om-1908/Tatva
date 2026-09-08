import { Link } from 'react-router-dom'

const Footer = () => {
  return (
    <footer className="bg-surface-container-lowest border-t border-outline-variant/30 py-10 md:py-12 px-margin-mobile md:px-margin-desktop relative z-10 w-full">
      <div className="max-w-max-width mx-auto">
        {/* Main 3-Column Footer Layout */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.35fr_1fr] gap-8 md:gap-10 lg:gap-12 items-start">
          {/* LEFT: Brand Section + Copyright */}
          <div className="flex flex-col space-y-3">
            <Link to="/" className="inline-block w-fit">
              <img
                src="/tatva_bg.png"
                alt="TATVA Logo"
                className="h-8 md:h-9 w-auto object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.2)] hover:drop-shadow-[0_0_18px_rgba(56,189,248,0.45)] hover:brightness-110 transition-all duration-300"
              />
            </Link>
            <p className="font-body-md text-sm text-on-surface-variant leading-relaxed">
              Intelligent Synthesis. Quantum Precision.
            </p>
            <span className="font-label-sm text-label-sm text-outline tracking-wider">
              Precise Quantum Intelligence
            </span>
            <div className="pt-2">
              <span className="font-label-sm text-label-sm text-outline-variant">
                © 2026 TATVA Platform.
              </span>
            </div>
          </div>

          {/* CENTER: Contact & Institution Section */}
          <div className="flex flex-col items-center text-center space-y-3 max-w-md mx-auto w-full">
            <span className="font-label-sm text-label-sm text-outline-variant uppercase tracking-wider font-semibold">
              Contact & Institution
            </span>
            <p className="font-body-md text-sm text-on-surface leading-relaxed break-words">
              K. K. Wagh Institute of Engineering Education & Research
            </p>
            <div className="flex flex-col items-center space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="font-label-sm text-label-sm text-outline-variant">Email:</span>
                <a
                  href="mailto:tatva.quantum@gmail.com"
                  className="font-body-md text-sm text-outline hover:text-primary transition-colors duration-200"
                >
                  tatva.quantum@gmail.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-label-sm text-label-sm text-outline-variant">Phone:</span>
                <a
                  href="tel:+918446561545"
                  className="font-body-md text-sm text-outline hover:text-primary transition-colors duration-200"
                >
                  +91 84465 61545
                </a>
              </div>
            </div>
          </div>

          {/* RIGHT: Navigation Section */}
          <div className="flex flex-col space-y-3 md:items-end md:text-right">
            <div className="flex flex-col space-y-2.5 w-full md:w-auto">
              <span className="font-label-sm text-label-sm text-outline-variant uppercase tracking-wider font-semibold">
                Navigation
              </span>
              <nav className="flex flex-col space-y-2">
                <Link
                  to="/"
                  className="font-body-md text-sm text-outline hover:text-primary transition-colors duration-200"
                >
                  Home
                </Link>
                <Link
                  to="/composer"
                  className="font-body-md text-sm text-outline hover:text-primary transition-colors duration-200"
                >
                  Composer
                </Link>
                <Link
                  to="/circuits"
                  className="font-body-md text-sm text-outline hover:text-primary transition-colors duration-200"
                >
                  My Circuits
                </Link>
                <Link
                  to="/team"
                  className="font-body-md text-sm text-outline hover:text-primary transition-colors duration-200"
                >
                  Team
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
