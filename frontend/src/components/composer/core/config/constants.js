// =============================================================================
// Gate catalog — single source of truth for palette, sidebar, and circuit cells.
// `tone` maps to a `.gate-<tone>` CSS class defined in styles/index.css.
// `qubits` is how many wires the gate touches (used for the "N qubit" label).
// =============================================================================
export const GATES = {
  H:       { type: 'H',       label: 'Hadamard',  symbol: 'H',    tone: 'violet',  qubits: 1, angle: false, editable: false, desc: 'Creates superposition' },
  X:       { type: 'X',       label: 'Pauli-X',   symbol: 'X',    tone: 'emerald', qubits: 1, angle: false, editable: false, desc: 'Quantum NOT (bit flip)' },
  Y:       { type: 'Y',       label: 'Pauli-Y',   symbol: 'Y',    tone: 'teal',    qubits: 1, angle: false, editable: false, desc: 'Y rotation (bit + phase flip)' },
  Z:       { type: 'Z',       label: 'Pauli-Z',   symbol: 'Z',    tone: 'amber',   qubits: 1, angle: false, editable: false, desc: 'Phase flip' },
  I:       { type: 'I',       label: 'Identity',  symbol: 'I',    tone: 'slate',   qubits: 1, angle: false, editable: false, desc: 'No-op' },
  S:       { type: 'S',       label: 'Phase (S)', symbol: 'S',    tone: 'sky',     qubits: 1, angle: false, editable: false, desc: 'Quarter-turn phase' },
  Sdg:     { type: 'Sdg',     label: 'S-dagger',  symbol: 'S†',   tone: 'sky',     qubits: 1, angle: false, editable: false, desc: 'Inverse S' },
  T:       { type: 'T',       label: 'T Gate',    symbol: 'T',    tone: 'rose',    qubits: 1, angle: false, editable: false, desc: 'Eighth-turn phase' },
  Tdg:     { type: 'Tdg',     label: 'T-dagger',  symbol: 'T†',   tone: 'rose',    qubits: 1, angle: false, editable: false, desc: 'Inverse T' },
  SX:      { type: 'SX',      label: 'Sqrt-X',    symbol: '√X',   tone: 'cyan',    qubits: 1, angle: false, editable: false, desc: 'Square root of X' },
  SXdg:    { type: 'SXdg',    label: 'Sqrt-X†',   symbol: '√X†',  tone: 'cyan',    qubits: 1, angle: false, editable: false, desc: 'Inverse square root of X' },
  P:       { type: 'P',       label: 'Phase (θ)', symbol: 'P',    tone: 'fuchsia', qubits: 1, angle: true,  editable: true,  desc: 'Arbitrary phase rotation' },
  RX:      { type: 'RX',      label: 'RX(θ)',     symbol: 'Rx',   tone: 'fuchsia', qubits: 1, angle: true,  editable: true,  desc: 'Rotation about X' },
  RY:      { type: 'RY',      label: 'RY(θ)',     symbol: 'Ry',   tone: 'fuchsia', qubits: 1, angle: true,  editable: true,  desc: 'Rotation about Y' },
  RZ:      { type: 'RZ',      label: 'RZ(θ)',     symbol: 'Rz',   tone: 'fuchsia', qubits: 1, angle: true,  editable: true,  desc: 'Rotation about Z' },
  CNOT:    { type: 'CNOT',    label: 'Control',   symbol: '⊕',    tone: 'pink',    qubits: 2, angle: false, editable: true,  desc: 'Controlled-NOT' },
  CCNOT:   { type: 'CCNOT',   label: 'Toffoli',   symbol: '⊕',    tone: 'pink',    qubits: 3, angle: false, editable: true,  desc: 'Double-controlled NOT' },
  SWAP:    { type: 'SWAP',    label: 'Swap',      symbol: '×',    tone: 'fuchsia', qubits: 2, angle: false, editable: false, desc: 'Swap two qubits' },
  QFT:     { type: 'QFT',     label: 'QFT',       symbol: 'QFT',  tone: 'violet',  qubits: 2, angle: false, editable: true,  block: true, desc: 'Quantum Fourier Transform block (H, controlled-phase, swap) on the two qubits it spans' },
  IQFT:    { type: 'IQFT',    label: 'Inverse QFT', symbol: 'QFT†', tone: 'violet', qubits: 2, angle: false, editable: true, block: true, desc: 'Inverse Quantum Fourier Transform block on the two qubits it spans' },
  BELL_PHI_PLUS:  { type: 'BELL_PHI_PLUS',  label: 'Bell |Φ+⟩', symbol: 'Φ+', tone: 'teal', qubits: 2, angle: false, editable: true, block: true, desc: 'Bell state (|00⟩+|11⟩)/√2 — H then CNOT on the two qubits it spans' },
  BELL_PHI_MINUS: { type: 'BELL_PHI_MINUS', label: 'Bell |Φ−⟩', symbol: 'Φ−', tone: 'teal', qubits: 2, angle: false, editable: true, block: true, desc: 'Bell state (|00⟩−|11⟩)/√2 — X, H then CNOT on the two qubits it spans' },
  BELL_PSI_PLUS:  { type: 'BELL_PSI_PLUS',  label: 'Bell |Ψ+⟩', symbol: 'Ψ+', tone: 'teal', qubits: 2, angle: false, editable: true, block: true, desc: 'Bell state (|01⟩+|10⟩)/√2 — X on the lower qubit, H then CNOT' },
  BELL_PSI_MINUS: { type: 'BELL_PSI_MINUS', label: 'Bell |Ψ−⟩', symbol: 'Ψ−', tone: 'teal', qubits: 2, angle: false, editable: true, block: true, desc: 'Singlet Bell state (|01⟩−|10⟩)/√2 — X on both qubits, H then CNOT' },
  Measure: { type: 'Measure', label: 'Measure',   symbol: 'M',    tone: 'slate',   qubits: 1, angle: false, editable: false, desc: 'Measurement (collapses qubit to classical bit)' },
  Reset:   { type: 'Reset',   label: 'Reset',     symbol: '|0⟩',  tone: 'slate',   qubits: 1, angle: false, editable: false, desc: 'Reset to |0⟩' },
  Barrier: { type: 'Barrier', label: 'Barrier',   symbol: '⏸',    tone: 'slate',   qubits: 1, angle: false, editable: false, desc: 'Barrier (compiler separator, no operation)' },
}

// Ordered groups for the palette / sidebar.
export const GATE_GROUPS = [
  { title: 'Single-Qubit', gates: ['H', 'X', 'Y', 'Z', 'I', 'SX', 'SXdg'] },
  { title: 'Phase',        gates: ['S', 'Sdg', 'T', 'Tdg', 'P'] },
  { title: 'Rotations',    gates: ['RX', 'RY', 'RZ'] },
  { title: 'Multi-Qubit',  gates: ['CNOT', 'CCNOT', 'SWAP'] },
  { title: 'Transforms',   gates: ['QFT', 'IQFT'] },
  { title: 'Bell States',  gates: ['BELL_PHI_PLUS', 'BELL_PHI_MINUS', 'BELL_PSI_PLUS', 'BELL_PSI_MINUS'] },
  { title: 'Operations',   gates: ['Measure', 'Reset', 'Barrier'] },
]

// Multi-wire "block" gates that live at their topmost target row and render
// as one box spanning every wire in `targets` (QFT-style plumbing).
export const BELL_GATE_TYPES = ['BELL_PHI_PLUS', 'BELL_PHI_MINUS', 'BELL_PSI_PLUS', 'BELL_PSI_MINUS']
export const BLOCK_GATE_TYPES = ['QFT', 'IQFT', ...BELL_GATE_TYPES]
export const isBellType = (type) => BELL_GATE_TYPES.includes(type)
export const isBlockType = (type) => BLOCK_GATE_TYPES.includes(type)
// Bell blocks span exactly 2 wires; QFT/IQFT span 2+. Returns the required
// target count, or null when any count >= 2 is allowed.
export const blockExactTargets = (type) => (isBellType(type) ? 2 : null)

// Flat, ordered list of every gate (for the full sidebar rail).
export const ALL_GATE_TYPES = GATE_GROUPS.flatMap((g) => g.gates)

// Human display symbol for a placed gate.
export const gateSymbol = (type) => GATES[type]?.symbol ?? type

// =============================================================================
// Circuit grid geometry — one source of truth so wires, cells, and the
// control/target connector lines all agree (fixes the old 64px vs 60px drift).
// =============================================================================
export const GRID = {
  CELL: 40,       // gate tile size (px)
  ROW_PITCH: 56,  // vertical distance between adjacent qubit-wire centers (px)
  COL_WIDTH: 52,  // horizontal distance between adjacent step centers (px)
  LABEL_WIDTH: 56, // width of the q[n] gutter (px)
  CLASSICAL_ROW: 40, // height of each classical register row (px)
}

// API Configuration (kept for backwards compatibility with older imports)
export const API_CONFIG = {
  BASE_URL: (() => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
    if (baseUrl.startsWith('http://localhost') || baseUrl.startsWith('http://127.0.0.1')) {
      return baseUrl
    }
    return baseUrl.replace(/^http:\/\//i, 'https://')
  })(),
  ENDPOINTS: {
    SIMULATE: '/simulate',
    GATES: '/gates',
    HEALTH: '/health',
    AI_EXPLAIN: '/ai-explain',
  },
  TIMEOUT: 30000,
}

// Circuit Configuration
export const CIRCUIT_CONFIG = {
  MAX_QUBITS: 5,
  MIN_QUBITS: 1,
  MAX_STEPS: 20,
  MIN_STEPS: 5,
  DEFAULT_QUBITS: 2,
  DEFAULT_STEPS: 14,
  DEFAULT_SHOTS: 1024,
}

export const DEFAULT_SHOTS = 1024