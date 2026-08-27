import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/useAuthStore'
import Dock from '../ui/Dock'

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isLoggedIn, user, logout } = useAuthStore()

  const isActive = (path) => location.pathname === path

  const handleHowItWorks = (e) => {
    e?.preventDefault()
    if (location.pathname === '/') {
      document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/#how-it-works')
    }
    setMobileOpen(false)
  }

  const handleLogout = () => {
    logout()
    setDropdownOpen(false)
    navigate('/auth')
  }

  const dockItems = [
    {
      label: 'Home',
      icon: <span className="material-symbols-outlined text-[22px]">home</span>,
      onClick: () => navigate('/'),
      active: location.pathname === '/',
    },
    {
      label: 'Team',
      icon: <span className="material-symbols-outlined text-[22px]">groups</span>,
      onClick: () => navigate('/team'),
      active: location.pathname === '/team',
    },
    {
      label: 'My Circuits',
      icon: <span className="material-symbols-outlined text-[22px]">schema</span>,
      onClick: () => navigate(isLoggedIn ? '/circuits' : '/auth'),
      active: location.pathname === '/circuits',
    },
    {
      label: 'Composer',
      icon: <span className="material-symbols-outlined text-[22px]">memory</span>,
      onClick: () => navigate(isLoggedIn ? '/composer' : '/auth'),
      active: location.pathname === '/composer',
    },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 w-full h-[76px] z-[500] bg-[#12111a]/95 backdrop-blur-xl border-b border-white/10 flex items-center shadow-lg">
      <div className="flex justify-between items-center w-full max-w-[1560px] mx-auto px-4 md:px-8 h-full">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-2 shrink-0">
          <img src="/tatva_bg.png" alt="TATVA Logo" className="h-[36px] w-auto max-h-[36px] object-contain hover:opacity-90 transition-opacity" />
        </Link>

        {/* Desktop Dock Navigation (Home, Team, My Circuits, Composer) */}
        <div className="hidden md:flex items-center">
          <Dock items={dockItems} />
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-4">
          {isLoggedIn ? (
            <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-10 h-10 rounded-full bg-primary-container text-white flex items-center justify-center font-label-sm text-label-sm font-bold hover:shadow-[0_0_15px_rgba(79,70,229,0.5)] transition-all"
                >
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-surface-container-high border border-outline-variant/30 rounded-lg shadow-xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-outline-variant/20">
                      <p className="font-body-md text-on-surface text-sm font-semibold truncate">{user?.name}</p>
                      <p className="font-code text-code text-on-surface-variant text-xs truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => { setDropdownOpen(false); navigate('/circuits') }}
                      className="w-full text-left px-4 py-2.5 text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors font-body-md text-sm flex items-center gap-2 border-b border-white/5"
                    >
                      <span className="material-symbols-outlined text-[18px]">schema</span>
                      My Circuits
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-3 text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-colors font-body-md text-sm flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px]">logout</span>
                      Logout
                    </button>
                  </div>
                )}
              </div>
          ) : (
            <>
              <button
                onClick={() => navigate('/auth')}
                className="px-6 py-2 rounded font-body-md text-on-surface border border-outline-variant hover:border-primary-container hover:bg-primary-container/10 transition-all duration-300"
              >
                Login
              </button>
              <button
                onClick={() => navigate('/auth?tab=register')}
                className="px-6 py-2 rounded font-body-md text-white bg-primary-container hover:shadow-[0_0_15px_rgba(79,70,229,0.5)] hover:-translate-y-0.5 transition-all duration-300 border-t border-white/20"
              >
                Sign Up
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-on-surface p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span className="material-symbols-outlined text-2xl">
            {mobileOpen ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-surface-container-high border-t border-white/5">
          <div className="flex flex-col px-4 py-4 space-y-4">
            <Link to="/" onClick={() => setMobileOpen(false)} className={isActive('/') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>Home</Link>
            <Link to="/team" onClick={() => setMobileOpen(false)} className={isActive('/team') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>Team</Link>
            <hr className="border-outline-variant" />
            {isLoggedIn ? (
              <>
                <Link to="/circuits" onClick={() => setMobileOpen(false)} className={isActive('/circuits') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>My Circuits</Link>
                <Link to="/composer" onClick={() => setMobileOpen(false)} className={isActive('/composer') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>Composer</Link>
                <button onClick={handleLogout} className="w-full py-2 rounded font-body-md text-error border border-error/30">Logout</button>
              </>
            ) : (
              <>
                <button onClick={() => { navigate('/auth'); setMobileOpen(false) }} className="w-full py-2 rounded font-body-md text-on-surface border border-outline-variant">Login</button>
                <button onClick={() => { navigate('/auth?tab=register'); setMobileOpen(false) }} className="w-full py-2 rounded font-body-md text-white bg-primary-container">Sign Up</button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
