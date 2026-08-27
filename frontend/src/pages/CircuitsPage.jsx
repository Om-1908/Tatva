import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import useCircuitStore from '../store/useCircuitStore'
import SpotlightCard from '../components/ui/SpotlightCard'
import DynamicSearch from '../components/ui/DynamicSearch.jsx'
import { API_BASE_URL } from '../config'

const INITIAL_CIRCUITS = [
  {
    id: 'circ-1',
    name: "Grover's Diffusion",
    qubits: 2,
    type: 'AI Synthesized',
    fidelity: 98.5,
    gatesCount: 12,
    depth: 6,
    date: 'Oct 24, 2023 • 14:32 UTC',
    createdAt: 1698157920000,
    gates: [
      { type: 'H', target: 0, step: 0 },
      { type: 'H', target: 1, step: 0 },
      { type: 'X', target: 0, step: 1 },
      { type: 'X', target: 1, step: 1 },
      { type: 'H', target: 1, step: 2 },
      { type: 'CNOT', control: 0, target: 1, step: 3 },
      { type: 'H', target: 1, step: 4 },
      { type: 'X', target: 0, step: 5 },
      { type: 'X', target: 1, step: 5 },
      { type: 'H', target: 0, step: 6 },
      { type: 'H', target: 1, step: 6 },
    ],
  },
  {
    id: 'circ-2',
    name: 'Bell State Prep (|Φ⁺⟩)',
    qubits: 2,
    type: 'Manual',
    fidelity: 99.9,
    gatesCount: 2,
    depth: 2,
    date: 'Oct 23, 2023 • 09:15 UTC',
    createdAt: 1698052500000,
    gates: [
      { type: 'H', target: 0, step: 0 },
      { type: 'CNOT', control: 0, target: 1, step: 1 },
    ],
  },
  {
    id: 'circ-3',
    name: 'GHZ State (3-Qubit)',
    qubits: 3,
    type: 'AI Synthesized',
    fidelity: 97.2,
    gatesCount: 5,
    depth: 3,
    date: 'Oct 22, 2023 • 11:20 UTC',
    createdAt: 1697973600000,
    gates: [
      { type: 'H', target: 0, step: 0 },
      { type: 'CNOT', control: 0, target: 1, step: 1 },
      { type: 'CNOT', control: 1, target: 2, step: 2 },
    ],
  },
  {
    id: 'circ-4',
    name: 'QFT Subroutine (4-Qubit)',
    qubits: 4,
    type: 'AI Synthesized',
    fidelity: 89.4,
    gatesCount: 18,
    depth: 8,
    date: 'Oct 20, 2023 • 18:45 UTC',
    createdAt: 1697827500000,
    gates: [
      { type: 'H', target: 0, step: 0 },
      { type: 'H', target: 1, step: 1 },
      { type: 'H', target: 2, step: 2 },
      { type: 'H', target: 3, step: 3 },
      { type: 'CNOT', control: 0, target: 1, step: 4 },
      { type: 'CNOT', control: 2, target: 3, step: 5 },
    ],
  },
  {
    id: 'circ-5',
    name: 'Quantum Teleportation Protocol',
    qubits: 3,
    type: 'AI Synthesized',
    fidelity: 96.8,
    gatesCount: 8,
    depth: 4,
    date: 'Oct 18, 2023 • 16:10 UTC',
    createdAt: 1697645400000,
    gates: [
      { type: 'H', target: 1, step: 0 },
      { type: 'CNOT', control: 1, target: 2, step: 1 },
      { type: 'CNOT', control: 0, target: 1, step: 2 },
      { type: 'H', target: 0, step: 3 },
    ],
  },
  {
    id: 'circ-6',
    name: 'Bernstein-Vazirani Oracle',
    qubits: 4,
    type: 'AI Synthesized',
    fidelity: 99.1,
    gatesCount: 10,
    depth: 5,
    date: 'Oct 15, 2023 • 10:05 UTC',
    createdAt: 1697364300000,
    gates: [
      { type: 'X', target: 3, step: 0 },
      { type: 'H', target: 0, step: 1 },
      { type: 'H', target: 1, step: 1 },
      { type: 'H', target: 2, step: 1 },
      { type: 'H', target: 3, step: 1 },
      { type: 'CNOT', control: 0, target: 3, step: 2 },
      { type: 'CNOT', control: 2, target: 3, step: 3 },
      { type: 'H', target: 0, step: 4 },
      { type: 'H', target: 1, step: 4 },
      { type: 'H', target: 2, step: 4 },
    ],
  },
]

export default function CircuitsPage() {
  const navigate = useNavigate()
  const { loadCircuit } = useCircuitStore()
  const fileInputRef = useRef(null)

  const [circuits, setCircuits] = useState(() => {
    const saved = localStorage.getItem('tatva_saved_circuits')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error(e)
      }
    }
    return INITIAL_CIRCUITS
  })

  // Sync with MongoDB Atlas on mount & merge with INITIAL_CIRCUITS
  useEffect(() => {
    const syncWithDb = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/db/circuits`)
        if (res.ok) {
          const data = await res.json()
          const dbCircuits = data.circuits || []

          setCircuits((prev) => {
            const combinedMap = new Map()
            INITIAL_CIRCUITS.forEach((c) => combinedMap.set(c.id, c))
            prev.forEach((c) => combinedMap.set(c.id, c))
            dbCircuits.forEach((c) => combinedMap.set(c.id, c))

            const merged = Array.from(combinedMap.values())
            localStorage.setItem('tatva_saved_circuits', JSON.stringify(merged))
            return merged
          })
        }
      } catch (e) {
        console.warn('MongoDB Atlas offline, using local storage fallback')
      }
    }
    syncWithDb()
  }, [])

  const [searchTerm, setSearchTerm] = useState('')
  const [qubitFilter, setQubitFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [sortBy, setSortBy] = useState('Newest')
  const [copiedId, setCopiedId] = useState(null)
  const [hoveredCircuitId, setHoveredCircuitId] = useState(null)

  useEffect(() => {
    localStorage.setItem('tatva_saved_circuits', JSON.stringify(circuits))
  }, [circuits])

  // Open Circuit in Composer
  const handleOpenInComposer = (circ) => {
    loadCircuit({
      qubits: circ.qubits,
      gates: circ.gates || [],
      name: circ.name,
    })
    navigate('/composer')
  }

  // Delete Circuit Card
  const handleDeleteCircuit = (id) => {
    if (window.confirm('Are you sure you want to delete this circuit?')) {
      setCircuits((prev) => prev.filter((c) => c.id !== id))
    }
  }

  // Download Circuit JSON
  const handleDownloadCircuit = (circ) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(circ, null, 2))
    const a = document.createElement('a')
    a.href = dataStr
    a.download = `${circ.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${circ.qubits}q.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Copy Circuit JSON to Clipboard
  const handleCopyCircuit = (circ) => {
    navigator.clipboard.writeText(JSON.stringify(circ, null, 2))
    setCopiedId(circ.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Import Circuit File Handler
  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result)
        const newCirc = {
          id: `circ-${Date.now()}`,
          name: json.name || file.name.replace('.json', ''),
          qubits: Number(json.qubits) || 2,
          type: 'Imported',
          fidelity: 99.0,
          gatesCount: Array.isArray(json.gates) ? json.gates.length : 0,
          depth: Math.max(1, ...((json.gates || []).map((g) => g.step || 0))) + 1,
          date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • Local',
          createdAt: Date.now(),
          gates: json.gates || [],
        }
        setCircuits((prev) => [newCirc, ...prev])
      } catch (err) {
        alert('Invalid JSON circuit file: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Filter & Search Logic
  const filteredCircuits = circuits
    .filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesQubit =
        qubitFilter === 'All'
          ? true
          : qubitFilter === '2Q'
            ? c.qubits === 2
            : qubitFilter === '4Q'
              ? c.qubits === 4
              : qubitFilter === '8Q'
                ? c.qubits === 8
                : true
      const matchesStatus =
        statusFilter === 'All'
          ? true
          : statusFilter === 'Synthesized'
            ? c.type.includes('Synthesized') || c.type.includes('AI')
            : statusFilter === 'Manual'
              ? c.type === 'Manual'
              : true

      return matchesSearch && matchesQubit && matchesStatus
    })
    .sort((a, b) => {
      if (sortBy === 'Newest') return (b.createdAt || 0) - (a.createdAt || 0)
      if (sortBy === 'Fidelity (High-Low)') return b.fidelity - a.fidelity
      if (sortBy === 'Depth (Low-High)') return a.depth - b.depth
      return 0
    })

  // Dynamic Metrics
  const totalCircuitsCount = circuits.length
  const avgFidelity = (
    circuits.reduce((acc, c) => acc + (c.fidelity || 95), 0) / (circuits.length || 1)
  ).toFixed(1)
  const totalGatesPlaced = circuits.reduce((acc, c) => acc + (c.gatesCount || 0), 0)

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0F] text-on-surface select-none">
      <Navbar />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 md:px-16 pt-24 pb-24">
        {/* Hidden File Input for Importing Circuit */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          onChange={handleImportFile}
          className="hidden"
        />

        {/* Header Section */}
        <header className="mb-8 md:mb-10">
          <div className="flex flex-row items-center justify-between gap-3 md:gap-6">
            {/* Left Title & Subtitle */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight mb-1 md:mb-2 truncate">
                My Circuits
              </h1>
              <p className="text-on-surface-variant text-xs sm:text-sm md:text-base hidden sm:block">
                Your saved quantum circuit synthesis history and custom compositions.
              </p>
            </div>

            {/* Right Buttons: Stacked vertically on mobile, side-by-side on desktop */}
            <div className="flex flex-col md:flex-row items-end md:items-center gap-2 md:gap-3 shrink-0">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-transparent hover:bg-primary/10 text-on-surface border border-primary/50 hover:border-primary px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl font-mono text-[10px] sm:text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[15px] sm:text-[18px]">upload</span>
                <span>Import Circuit</span>
              </button>

              <button
                onClick={() => navigate('/composer')}
                className="bg-primary-container hover:shadow-[0_0_20px_rgba(79,70,229,0.4)] text-white px-3.5 sm:px-6 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl font-mono text-[10px] sm:text-xs uppercase tracking-widest transition-all flex items-center gap-1.5 border-t border-white/20"
              >
                <span className="material-symbols-outlined text-[15px] sm:text-[18px]">add</span>
                <span>New Synthesis</span>
              </button>
            </div>
          </div>
          <p className="text-on-surface-variant text-xs mt-2 sm:hidden">
            Your saved quantum circuit synthesis history.
          </p>
        </header>

        {/* Stats Bar — 1 single row on mobile (grid-cols-4), 4 cols on desktop */}
        <section className="grid grid-cols-4 gap-1.5 sm:gap-3 md:gap-4 mb-8 md:mb-10">
          <div className="bg-[#11111A] border border-[#1A1A24] rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4 flex items-center gap-1.5 sm:gap-4 relative overflow-hidden shadow-sm">
            <div className="w-1 sm:w-1.5 absolute left-0 top-0 bottom-0 bg-primary rounded-l-2xl"></div>
            <div className="pl-1 min-w-0">
              <div className="font-mono text-[9px] sm:text-xs text-on-surface-variant uppercase tracking-wider mb-0.5 truncate">
                Total Circuits
              </div>
              <div className="font-mono text-sm sm:text-xl md:text-2xl font-bold text-white leading-none">{totalCircuitsCount}</div>
            </div>
          </div>

          <div className="bg-[#11111A] border border-[#1A1A24] rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4 flex items-center gap-1.5 sm:gap-4 relative overflow-hidden shadow-sm">
            <div className="w-1 sm:w-1.5 absolute left-0 top-0 bottom-0 bg-secondary rounded-l-2xl"></div>
            <div className="pl-1 min-w-0">
              <div className="font-mono text-[9px] sm:text-xs text-on-surface-variant uppercase tracking-wider mb-0.5 truncate">
                Avg Fidelity
              </div>
              <div className="font-mono text-sm sm:text-xl md:text-2xl font-bold text-secondary leading-none">{avgFidelity}%</div>
            </div>
          </div>

          <div className="bg-[#11111A] border border-[#1A1A24] rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4 flex items-center gap-1.5 sm:gap-4 relative overflow-hidden shadow-sm">
            <div className="w-1 sm:w-1.5 absolute left-0 top-0 bottom-0 bg-[#A855F7] rounded-l-2xl"></div>
            <div className="pl-1 min-w-0">
              <div className="font-mono text-[9px] sm:text-xs text-on-surface-variant uppercase tracking-wider mb-0.5 truncate">
                Gates Placed
              </div>
              <div className="font-mono text-sm sm:text-xl md:text-2xl font-bold text-white leading-none">{totalGatesPlaced}</div>
            </div>
          </div>

          <div className="bg-[#11111A] border border-[#1A1A24] rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4 flex items-center gap-1.5 sm:gap-4 relative overflow-hidden shadow-sm">
            <div className="w-1 sm:w-1.5 absolute left-0 top-0 bottom-0 bg-[#22C55E] rounded-l-2xl"></div>
            <div className="pl-1 min-w-0">
              <div className="font-mono text-[9px] sm:text-xs text-on-surface-variant uppercase tracking-wider mb-0.5 truncate">
                Synthesized Today
              </div>
              <div className="font-mono text-sm sm:text-xl md:text-2xl font-bold text-white leading-none">3</div>
            </div>
          </div>
        </section>

        {/* Filter & Search Bar — 1 single row on phone view */}
        <section className="flex flex-row justify-between items-center gap-2 md:gap-4 mb-8 overflow-x-auto pb-1 md:pb-0">
          {/* Search Box */}
          <div className="bg-[#07070A] border border-[#1A1A24] focus-within:border-primary flex items-center px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-xl sm:rounded-2xl shrink-0 w-[140px] sm:w-[220px] md:w-[320px] transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] sm:text-[20px] mr-1.5 sm:mr-2">search</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="bg-transparent border-none outline-none text-on-surface text-xs sm:text-sm w-full placeholder:text-on-surface-variant/50 font-mono"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <select
              value={qubitFilter}
              onChange={(e) => setQubitFilter(e.target.value)}
              className="bg-[#07070A] border border-[#1A1A24] text-white text-[11px] sm:text-xs font-mono rounded-lg sm:rounded-xl px-2 sm:px-3.5 py-1.5 sm:py-2.5 outline-none cursor-pointer hover:border-primary/50 transition-colors"
            >
              <option value="All">Qubits (All)</option>
              <option value="2Q">2Q</option>
              <option value="4Q">4Q</option>
              <option value="8Q">8Q</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#07070A] border border-[#1A1A24] text-white text-[11px] sm:text-xs font-mono rounded-lg sm:rounded-xl px-2 sm:px-3.5 py-1.5 sm:py-2.5 outline-none cursor-pointer hover:border-primary/50 transition-colors"
            >
              <option value="All">Status (All)</option>
              <option value="Synthesized">Synthesized</option>
              <option value="Manual">Manual</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#07070A] border border-[#1A1A24] text-white text-[11px] sm:text-xs font-mono rounded-lg sm:rounded-xl px-2 sm:px-3.5 py-1.5 sm:py-2.5 outline-none cursor-pointer hover:border-primary/50 transition-colors"
            >
              <option value="Newest">Sort: Newest</option>
              <option value="Fidelity (High-Low)">Fidelity</option>
              <option value="Depth (Low-High)">Depth</option>
            </select>
          </div>
        </section>

        {/* Circuit Grid View */}
        {filteredCircuits.length === 0 ? (
          <div className="bg-[#11111A] border border-[#1A1A24] rounded-2xl p-12 text-center text-on-surface-variant font-mono">
            <span className="material-symbols-outlined text-4xl mb-3 text-outline">search_off</span>
            <p className="text-base font-semibold text-white">No circuits match your search filter.</p>
            <p className="text-xs mt-1">Try searching for a different name or reset your filters.</p>
          </div>
        ) : (
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-12">
            {filteredCircuits.map((circ) => (
              <SpotlightCard
                key={circ.id}
                accentColor={circ.type.includes('Manual') ? '#22D3EE' : '#4F46E5'}
                dimmed={hoveredCircuitId !== null && hoveredCircuitId !== circ.id}
                onHoverStart={() => setHoveredCircuitId(circ.id)}
                onHoverEnd={() => setHoveredCircuitId(null)}
                className="rounded-2xl sm:rounded-3xl border-t-2 border-t-[#4F46E5]"
              >
                {/* SVG Visual Circuit Blueprint Preview */}
                <div className="h-24 sm:h-32 bg-[#060608] relative rounded-t-2xl sm:rounded-t-3xl overflow-hidden border-b border-[#1A1A24] flex items-center justify-center p-2">
                  <svg className="w-full h-full opacity-35" preserveAspectRatio="none" viewBox="0 0 100 40">
                    <line x1="0" y1="10" x2="100" y2="10" stroke="#4F46E5" strokeWidth="0.5" />
                    <line x1="0" y1="20" x2="100" y2="20" stroke="#4F46E5" strokeWidth="0.5" />
                    <line x1="0" y1="30" x2="100" y2="30" stroke="#4F46E5" strokeWidth="0.5" />
                    <rect x="20" y="5" width="10" height="10" fill="transparent" stroke="#22D3EE" strokeWidth="1" />
                    <rect x="55" y="15" width="10" height="10" fill="transparent" stroke="#A855F7" strokeWidth="1" />
                    <circle cx="35" cy="10" r="2" fill="#22D3EE" />
                    <line x1="35" y1="10" x2="35" y2="30" stroke="#22D3EE" strokeDasharray="1 1" strokeWidth="0.5" />
                    <circle cx="35" cy="30" r="3" fill="transparent" stroke="#22D3EE" strokeWidth="1" />
                  </svg>

                  <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex gap-1.5 sm:gap-2">
                    {circ.type.includes('Synthesized') || circ.type.includes('AI') ? (
                      <span className="bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono uppercase flex items-center gap-1 backdrop-blur-md font-semibold">
                        <span className="material-symbols-outlined text-[9px] sm:text-[10px]">auto_awesome</span> AI
                      </span>
                    ) : (
                      <span className="bg-secondary/15 text-secondary border border-secondary/30 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono uppercase flex items-center gap-1 backdrop-blur-md font-semibold">
                        Manual
                      </span>
                    )}

                    <span className="bg-surface/80 text-on-surface border border-outline-variant/30 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-mono backdrop-blur-md font-semibold">
                      {circ.qubits}Q
                    </span>
                  </div>
                </div>

                {/* Card Info & Details */}
                <div className="p-3 sm:p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-1 gap-1.5">
                    <h3 className="font-bold text-xs sm:text-base text-white truncate group-hover:text-primary transition-colors">
                      {circ.name}
                    </h3>
                  </div>

                  <div className="font-mono text-[10px] sm:text-xs text-on-surface-variant mb-2.5 sm:mb-4 truncate">{circ.date}</div>

                  {/* Circuit Metrics Table */}
                  <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-3 sm:mb-5 bg-[#07070A] p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-[#1A1A24] mt-auto">
                    <div>
                      <div className="text-[9px] sm:text-[10px] text-on-surface-variant font-mono uppercase mb-0.5 truncate">
                        Fidelity
                      </div>
                      <div className="font-mono text-xs sm:text-xs font-bold text-secondary">{circ.fidelity}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] sm:text-[10px] text-on-surface-variant font-mono uppercase mb-0.5 truncate">
                        Gates
                      </div>
                      <div className="font-mono text-xs sm:text-xs font-bold text-white">{circ.gatesCount}</div>
                    </div>
                    <div>
                      <div className="text-[9px] sm:text-[10px] text-on-surface-variant font-mono uppercase mb-0.5 truncate">
                        Depth
                      </div>
                      <div className="font-mono text-xs sm:text-xs font-bold text-white">{circ.depth}</div>
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="flex items-center justify-between pt-2 sm:pt-3 border-t border-[#1A1A24]">
                    <button
                      onClick={() => handleOpenInComposer(circ)}
                      className="font-mono text-[11px] sm:text-xs text-primary hover:text-primary-fixed transition-colors flex items-center gap-1 group-hover:underline font-semibold"
                    >
                      <span>Open in Composer</span>
                      <span className="material-symbols-outlined text-[13px] sm:text-[14px]">arrow_forward</span>
                    </button>

                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <button
                        onClick={() => handleDownloadCircuit(circ)}
                        className="hover:text-primary transition-colors p-1"
                        title="Download JSON"
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                      </button>

                      <button
                        onClick={() => handleCopyCircuit(circ)}
                        className="hover:text-primary transition-colors p-1"
                        title={copiedId === circ.id ? 'Copied!' : 'Copy JSON'}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {copiedId === circ.id ? 'check' : 'content_copy'}
                        </span>
                      </button>

                      <button
                        onClick={() => handleDeleteCircuit(circ.id)}
                        className="hover:text-red-400 transition-colors p-1"
                        title="Delete circuit"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            ))}
          </section>
        )}
      </main>

      <Footer />
    </div>
  )
}
