import { Link } from 'react-router-dom'

const Footer = () => {
  return (
    <footer className="bg-surface-container-lowest border-t border-outline-variant py-12 px-margin-mobile md:px-margin-desktop relative z-10 w-full">
      <div className="max-w-max-width mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
        <div className="flex flex-col space-y-2">
          <Link to="/">
            <img src="/tatva_bg.png" alt="TATVA Logo" className="h-8 md:h-9 w-auto object-contain hover:opacity-90 transition-opacity" />
          </Link>
          <span className="font-label-sm text-label-sm text-outline">Precise Quantum Intelligence</span>
        </div>
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          <Link to="/" className="font-label-sm text-label-sm text-outline hover:text-primary transition-colors hover:opacity-80">Home</Link>
          <Link to="/team" className="font-label-sm text-label-sm text-outline hover:text-primary transition-colors hover:opacity-80">Team</Link>
          <a
            href="#contact"
            onClick={(e) => {
              e.preventDefault()
              window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
            }}
            className="font-label-sm text-label-sm text-outline hover:text-primary transition-colors hover:opacity-80"
          >
            Contact
          </a>
        </div>
        <div className="flex flex-col items-start md:items-end space-y-2">
          <span className="font-label-sm text-label-sm text-outline">Built at K.K. Wagh Institute</span>
          <span className="font-label-sm text-label-sm text-outline-variant">© 2026 TATVA Platform.</span>
        </div>
      </div>
    </footer>
  )
}

export default Footer
