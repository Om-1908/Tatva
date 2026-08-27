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

  const handleLogout = () => {
    logout()
    setDropdownOpen(false)
    navigate('/auth')
  }

  // Apple-style Dock navigation items in requested order:
  // 1. Home -> 2. Composer -> 3. My Circuits -> 4. My Team (Star icon removed)
  const dockItems = [
    {
      label: 'Home',
      icon: <span className="material-symbols-outlined text-[24px]">home</span>,
      onClick: () => navigate('/'),
      active: location.pathname === '/',
    },
    {
      label: 'Composer',
      icon: <span className="material-symbols-outlined text-[24px]">memory</span>,
      onClick: () => navigate(isLoggedIn ? '/composer' : '/auth'),
      active: location.pathname === '/composer',
    },
    {
      label: 'My Circuits',
      icon: <span className="material-symbols-outlined text-[24px]">schema</span>,
      onClick: () => navigate(isLoggedIn ? '/circuits' : '/auth'),
      active: location.pathname === '/circuits',
    },
    {
      label: 'My Team',
      icon: <span className="material-symbols-outlined text-[24px]">groups</span>,
      onClick: () => navigate('/team'),
      active: location.pathname === '/team',
    },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 w-full h-[64px] z-[500] navbar-glass flex items-center">
      <div className="relative flex justify-between items-center w-full max-w-[1560px] mx-auto px-4 md:px-8 h-full">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-2 shrink-0">
          <img
            src="/tatva_bg.png"
            alt="TATVA Logo"
            className="h-8 max-h-8 w-auto object-contain shrink-0 drop-shadow-[0_0_12px_rgba(56,189,248,0.25)] hover:drop-shadow-[0_0_18px_rgba(56,189,248,0.5)] hover:brightness-110 transition-all duration-300"
          />
        </Link>

        {/* Desktop Dock Navigation */}
        <div className="hidden md:flex items-center absolute left-1/2 -translate-x-1/2">
          <Dock
            items={dockItems}
            baseItemSize={42}
            panelHeight={50}
            magnification={66}
            distance={140}
          />
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-4">
          {isLoggedIn ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="apple-btn-icon-circle w-9 h-9 rounded-full bg-primary-container text-white flex items-center justify-center font-label-sm text-label-sm font-bold hover:shadow-[0_0_15px_rgba(79,70,229,0.5)] transition-all cursor-pointer"
              >
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-surface-container-high border border-outline-variant/30 rounded-md shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-outline-variant/20">
                    <p className="font-body-md text-on-surface text-sm font-semibold truncate">{user?.name}</p>
                    <p className="font-code text-code text-on-surface-variant text-xs truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { setDropdownOpen(false); navigate('/composer') }}
                    className="w-full text-left px-4 py-2.5 text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors font-body-md text-sm flex items-center gap-2 border-b border-white/5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">memory</span>
                    Composer
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); navigate('/circuits') }}
                    className="w-full text-left px-4 py-2.5 text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors font-body-md text-sm flex items-center gap-2 border-b border-white/5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">schema</span>
                    My Circuits
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 text-on-surface-variant hover:text-error hover:bg-error-container/10 transition-colors font-body-md text-sm flex items-center gap-2 cursor-pointer"
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
                className="apple-btn-base apple-btn-secondary px-5 py-1.5 text-xs text-on-surface"
              >
                Login
              </button>
              <button
                onClick={() => navigate('/auth?tab=register')}
                className="apple-btn-base apple-btn-primary px-5 py-1.5 text-xs text-white bg-primary-container"
              >
                Sign Up
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden text-on-surface p-2 apple-btn-icon rounded-xs"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span className="material-symbols-outlined text-2xl">
            {mobileOpen ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden navbar-glass border-t border-white/5">
          <div className="flex flex-col px-4 py-4 space-y-4">
            <Link to="/" onClick={() => setMobileOpen(false)} className={isActive('/') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>Home</Link>
            <Link to="/composer" onClick={() => setMobileOpen(false)} className={isActive('/composer') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>Composer</Link>
            <Link to="/circuits" onClick={() => setMobileOpen(false)} className={isActive('/circuits') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>My Circuits</Link>
            <Link to="/team" onClick={() => setMobileOpen(false)} className={isActive('/team') ? 'text-primary font-body-md' : 'text-on-surface-variant font-body-md'}>My Team</Link>
            <hr className="border-outline-variant" />
            {isLoggedIn ? (
              <button onClick={handleLogout} className="apple-btn-secondary w-full py-2.5 rounded-md font-body-md text-error border border-error/30 cursor-pointer">Logout</button>
            ) : (
              <>
                <button onClick={() => { navigate('/auth'); setMobileOpen(false) }} className="apple-btn-secondary w-full py-2.5 rounded-md font-body-md text-on-surface border border-outline-variant cursor-pointer">Login</button>
                <button onClick={() => { navigate('/auth?tab=register'); setMobileOpen(false) }} className="apple-btn-primary w-full py-2.5 rounded-md font-body-md text-white bg-primary-container cursor-pointer border-t border-white/20">Sign Up</button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

export default Navbar
