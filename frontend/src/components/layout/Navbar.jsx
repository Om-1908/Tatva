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

      {/* Mobile Right-Aligned Dropdown Menu Box */}
      {mobileOpen && (
        <div className="md:hidden absolute top-[76px] right-2 sm:right-4 w-[230px] bg-[#12111a]/98 border border-white/15 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] rounded-2xl z-[600] p-3.5 flex flex-col space-y-2 animate-fadeIn">
          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-base font-semibold text-left transition-colors ${
              isActive('/') ? 'text-[#22D3EE] bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">home</span>
            <span>Home</span>
          </Link>

          <Link
            to="/team"
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-base font-semibold text-left transition-colors ${
              isActive('/team') ? 'text-[#22D3EE] bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">groups</span>
            <span>Team</span>
          </Link>

          <Link
            to={isLoggedIn ? '/circuits' : '/auth'}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-base font-semibold text-left transition-colors ${
              isActive('/circuits') ? 'text-[#22D3EE] bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">schema</span>
            <span>My Circuits</span>
          </Link>

          <Link
            to={isLoggedIn ? '/composer' : '/auth'}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-base font-semibold text-left transition-colors ${
              isActive('/composer') ? 'text-[#22D3EE] bg-white/10' : 'text-white/80 hover:text-white hover:bg-white/5'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">memory</span>
            <span>Composer</span>
          </Link>

          <hr className="border-white/10 my-1" />

          {isLoggedIn ? (
            <button
              onClick={handleLogout}
              className="w-full py-2.5 px-3.5 rounded-xl font-semibold text-red-400 bg-red-500/10 border border-red-500/30 flex items-center justify-start gap-2.5 hover:bg-red-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
              <span>Logout</span>
            </button>
          ) : (
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => { navigate('/auth'); setMobileOpen(false) }}
                className="w-full py-2.5 rounded-xl font-semibold text-white border border-white/20 hover:bg-white/10 transition-colors text-center"
              >
                Login
              </button>
              <button
                onClick={() => { navigate('/auth?tab=register'); setMobileOpen(false) }}
                className="w-full py-2.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all text-center"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  )
}

export default Navbar
