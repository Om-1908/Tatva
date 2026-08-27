import React from 'react'
import { motion } from 'framer-motion'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import HeroSection from '../components/home/HeroSection'
import QuantumScrollExplode from '../components/home/QuantumScrollExplode'
import HowItWorksSection from '../components/home/HowItWorksSection'

const HomePage = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="bg-[#010101] min-h-screen text-white"
    >
      {/* 1. Existing Navbar */}
      <Navbar />

      {/* 2. Page Content */}
      <main className="relative z-10 bg-[#010101]">
        {/* Existing Hero Section */}
        <HeroSection />

        {/* Full-Screen Quantum Storytelling Experience */}
        <QuantumScrollExplode />

        {/* Existing How It Works Section */}
        <HowItWorksSection />
      </main>

      {/* 3. Existing Footer */}
      <Footer />
    </motion.div>
  )
}

export default HomePage
