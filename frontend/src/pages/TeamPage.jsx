import { motion } from 'framer-motion'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import VisionSection from '../components/team/VisionSection'
import MemberCard from '../components/team/MemberCard'
import MentorCard from '../components/team/MentorCard'
import useScrollAnimation from '../hooks/useScrollAnimation'

const members = [
  {
    name: 'Om Bhamare',
    linkedin: 'https://www.linkedin.com/in/ombhamare8/',
    photo: 'https://media.licdn.com/dms/image/v2/D4D03AQHcI_DmqxECLg/profile-displayphoto-scale_200_200/B4DZh0nCPDHwAY-/0/1754303056051?e=1788998400&v=beta&t=IdUW6yM_O9-9cCytr8wWf7wMkANjklfaJYOaDHDtGlk',
    initials: 'OB',
    color: 'indigo',
  },
  {
    name: 'Aryan Jadhav',
    linkedin: 'https://www.linkedin.com/in/aryan-jadhav-15a99730a/',
    photo: 'https://media.licdn.com/dms/image/v2/D4E03AQEpLn3pttc0Nw/profile-displayphoto-crop_800_800/B4EZipCBXzGcAQ-/0/1755182543144?e=1788998400&v=beta&t=CiPuSA3yihixQ2XQDdJiR0MiqaROOB3K9GNQqVNH_fk',
    initials: 'AJ',
    color: 'indigo',
  },
  {
    name: 'Manas Shinde',
    linkedin: 'https://www.linkedin.com/in/manas-hs060805/',
    photo: 'https://media.licdn.com/dms/image/v2/D4D03AQGTiYR3mqHd4A/profile-displayphoto-crop_800_800/B4DZ_r0SIhHQAI-/0/1786367781317?e=1788998400&v=beta&t=A_lFZDlMEVkqCT_9_F6lerz3-cC8msFpzml8J2iXn6g',
    initials: 'MS',
    color: 'indigo',
  },
  {
    name: 'Prithvi Shinde',
    linkedin: 'https://www.linkedin.com/in/prithvi-shinde-12926635b/',
    photo: 'https://media.licdn.com/dms/image/v2/D4E03AQEqr2F3NUDryQ/profile-displayphoto-shrink_800_800/B4EZaGT25qGYAc-/0/1746010080584?e=1788998400&v=beta&t=soAfCyZDtMBoAylO_nKyUNlvKLxPf25txOKLdTQfS4U',
    initials: 'PS',
    color: 'indigo',
  },
]

const mentors = [
  {
    name: 'Prof. Sheetal Bhandare',
    designation: 'PROJECT GUIDE',
    linkedin: 'https://www.linkedin.com/in/shital-bhandare-pawar-19a352177/',
    photo: 'https://www.kkwagh.edu.in/public/frontend/uploads/faculty/196frt_ms.s.s.bhandare_s.jpg',
    initials: 'SB',
    color: 'indigo',
  },
  {
    name: 'Prof. Uday Wad',
    designation: 'INDUSTRY MENTOR',
    linkedin: 'https://www.linkedin.com/in/uday-wad-8740b41a1/',
    photo: 'https://www.esds.co.in/home-images/management/uday-wad.jpg',
    initials: 'UW',
    color: 'indigo',
  },
]

const TeamPage = () => {
  const heroRef = useScrollAnimation()
  const teamTitleRef = useScrollAnimation()
  const mentorTitleRef = useScrollAnimation()

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="min-h-screen flex flex-col"
    >
      <Navbar />
      <main className="flex-grow pt-16 md:pt-20 pb-16">
        {/* Hero Section */}
        <section className="relative py-10 md:py-14 px-margin-mobile md:px-margin-desktop overflow-hidden flex flex-col items-center text-center">
          <div className="absolute inset-0 hero-glow z-0 pointer-events-none" />
          <div ref={heroRef} className="z-10 max-w-3xl">
            <span className="pill bg-[rgba(34,211,238,0.1)] text-[#22D3EE] border border-[rgba(34,211,238,0.2)] mb-4 inline-block uppercase font-bold tracking-widest text-xs px-4 py-1.5 rounded-full">
              THE PEOPLE BEHIND TATVA
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
              Built by Curious Minds.
              <br />
              <span className="text-on-surface-variant font-light underline decoration-primary-container decoration-4 underline-offset-8">
                Driven by Quantum.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-on-surface-variant mt-6 max-w-3xl mx-auto leading-relaxed">
              TATVA is a culminating final year project developed at K.K. Wagh Institute, exploring the
              uncharted territories where deep reinforcement learning meets quantum state simulation. We
              are engineering the next generation of algorithmic resilience.
            </p>
          </div>
        </section>

        {/* Vision & Mission */}
        <VisionSection />

        {/* Core Team */}
        <section className="px-margin-mobile md:px-margin-desktop max-w-max-width mx-auto mb-16 md:mb-20">
          <h2
            ref={teamTitleRef}
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-8 sm:mb-10 text-center flex items-center justify-center gap-3 sm:gap-4"
          >
            <div className="h-px bg-outline-variant/30 flex-grow max-w-[60px] sm:max-w-[100px]" />
            Core Engineering Team
            <div className="h-px bg-outline-variant/30 flex-grow max-w-[60px] sm:max-w-[100px]" />
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {members.map((member, i) => (
              <MemberCard key={member.name} {...member} index={i} />
            ))}
          </div>
        </section>

        {/* Mentors */}
        <section className="px-margin-mobile md:px-margin-desktop max-w-max-width mx-auto">
          <h2
            ref={mentorTitleRef}
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white mb-8 sm:mb-10 text-center flex items-center justify-center gap-3 sm:gap-4"
          >
            <div className="h-px bg-outline-variant/30 flex-grow max-w-[60px] sm:max-w-[100px]" />
            Project Mentorship
            <div className="h-px bg-outline-variant/30 flex-grow max-w-[60px] sm:max-w-[100px]" />
          </h2>
          <div className="grid grid-cols-2 max-w-3xl mx-auto gap-3 sm:gap-8">
            {mentors.map((mentor, i) => (
              <MentorCard key={mentor.name} {...mentor} index={i} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </motion.div>
  )
}

export default TeamPage

