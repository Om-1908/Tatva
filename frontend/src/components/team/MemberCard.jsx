import { useState } from 'react'
import useScrollAnimation from '../../hooks/useScrollAnimation'
import { CometCard } from '../ui/comet-card.jsx'

const colorMap = {
  indigo: {
    gradient: 'from-[#4F46E5] to-[#312e81]',
    shadow: 'hover:shadow-[0_20px_45px_rgba(79,70,229,0.3)]',
    border: 'hover:border-[#4F46E5]',
    ring: 'border-[#4F46E5]/40 group-hover:border-[#4F46E5]',
    glow: 'group-hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]',
    accentText: 'group-hover:text-[#818cf8]',
    pillBg: 'bg-[rgba(79,70,229,0.15)]',
    pillText: 'text-[#818cf8]',
    pillBorder: 'border-[#4F46E5]/30',
  },
  cyan: {
    gradient: 'from-[#4F46E5] to-[#312e81]',
    shadow: 'hover:shadow-[0_20px_45px_rgba(79,70,229,0.3)]',
    border: 'hover:border-[#4F46E5]',
    ring: 'border-[#4F46E5]/40 group-hover:border-[#4F46E5]',
    glow: 'group-hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]',
    accentText: 'group-hover:text-[#818cf8]',
    pillBg: 'bg-[rgba(79,70,229,0.15)]',
    pillText: 'text-[#818cf8]',
    pillBorder: 'border-[#4F46E5]/30',
  },
  purple: {
    gradient: 'from-[#4F46E5] to-[#312e81]',
    shadow: 'hover:shadow-[0_20px_45px_rgba(79,70,229,0.3)]',
    border: 'hover:border-[#4F46E5]',
    ring: 'border-[#4F46E5]/40 group-hover:border-[#4F46E5]',
    glow: 'group-hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]',
    accentText: 'group-hover:text-[#818cf8]',
    pillBg: 'bg-[rgba(79,70,229,0.15)]',
    pillText: 'text-[#818cf8]',
    pillBorder: 'border-[#4F46E5]/30',
  },
  green: {
    gradient: 'from-[#4F46E5] to-[#312e81]',
    shadow: 'hover:shadow-[0_20px_45px_rgba(79,70,229,0.3)]',
    border: 'hover:border-[#4F46E5]',
    ring: 'border-[#4F46E5]/40 group-hover:border-[#4F46E5]',
    glow: 'group-hover:shadow-[0_0_25px_rgba(79,70,229,0.5)]',
    accentText: 'group-hover:text-[#818cf8]',
    pillBg: 'bg-[rgba(79,70,229,0.15)]',
    pillText: 'text-[#818cf8]',
    pillBorder: 'border-[#4F46E5]/30',
  },
}

const MemberCard = ({ name, photo, initials, linkedin, designation, color = 'indigo', index }) => {
  const ref = useScrollAnimation(index * 0.1)
  const colors = colorMap[color] || colorMap.indigo
  const [imgError, setImgError] = useState(false)

  const handleCardClick = () => {
    if (linkedin) {
      window.open(linkedin, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <CometCard className="w-full h-full">
      <div
        ref={ref}
        onClick={handleCardClick}
        className={`card card-horizon p-3.5 sm:p-6 md:p-8 rounded-xl flex flex-col items-center justify-center text-center min-h-[250px] sm:min-h-[350px] transition-all duration-300 ${colors.shadow} ${colors.border} group cursor-pointer relative overflow-hidden h-full`}
      >
        {/* Background glow accent */}
        <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-white/5 blur-2xl group-hover:bg-white/10 transition-all pointer-events-none" />

        {/* Profile Image / Initials */}
        <div className="relative mb-2.5">
          <div
            className={`w-24 h-24 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full p-1 border-2 ${colors.ring} ${colors.glow} transition-all duration-300 overflow-hidden bg-surface-container flex items-center justify-center shadow-lg`}
          >
            {photo && !imgError ? (
              <img
                src={photo}
                alt={name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full rounded-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            ) : (
              <div className={`w-full h-full rounded-full bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-2xl sm:text-4xl font-extrabold text-white`}>
                {initials}
              </div>
            )}
          </div>

          {/* LinkedIn Corner Icon */}
          <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-[#0A66C2] text-white p-1.5 sm:p-2 rounded-full shadow-md group-hover:scale-110 transition-transform duration-300">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" viewBox="0 0 24 24">
              <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.25V10.9H6.46M7.86 6.72a1.48 1.48 0 1 0 0 2.96 1.48 1.48 0 0 0 0-2.96Z" />
            </svg>
          </div>
        </div>

        {/* Name and Details */}
        <div className="flex flex-col items-center gap-0.5 sm:gap-1 mt-1 sm:mt-2 w-full">
          <a
            href={linkedin}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`text-base sm:text-xl md:text-2xl font-extrabold text-white ${colors.accentText} transition-colors duration-200 hover:underline leading-tight`}
          >
            {name}
          </a>

          {designation && (
            <span className={`pill ${colors.pillBg} ${colors.pillText} border ${colors.pillBorder} font-bold text-[10px] sm:text-xs mt-1 px-2.5 sm:px-3 py-0.5 sm:py-1 uppercase tracking-wider`}>
              {designation}
            </span>
          )}
        </div>
      </div>
    </CometCard>
  )
}

export default MemberCard

