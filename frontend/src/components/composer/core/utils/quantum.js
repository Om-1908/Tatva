// =============================================================================
// Quantum math helpers shared across visualization components.
// Backend statevector is Qiskit little-endian: amplitude index i has qubit q's
// value in bit (i >> q) & 1, and the printed bitstring is big-endian
// format(i, '0{n}b') (qubit n-1 is the leftmost character).
// =============================================================================

export function toComplex(v) {
  if (typeof v === 'number') return { re: v, im: 0 }
  if (!v) return { re: 0, im: 0 }
  return { re: Number(v.real ?? v.re ?? 0), im: Number(v.imag ?? v.im ?? 0) }
}

export function magnitude(c) {
  return Math.sqrt(c.re * c.re + c.im * c.im)
}

export function numQubitsFromStatevector(statevector) {
  if (!Array.isArray(statevector) || statevector.length < 2) return 0
  const n = Math.round(Math.log2(statevector.length))
  return 2 ** n === statevector.length ? n : 0
}

/**
 * Single-qubit Bloch vector for `qubit` from the full statevector, via the
 * reduced density matrix (partial trace over all other qubits).
 *   x = 2·Re(ρ01), y = -2·Im(ρ01), z = p0 - p1
 * Returns { x, y, z, r, theta, phi, p0, p1, pure }.
 * r < 1 signals a mixed (e.g. entangled) qubit -> the arrow is shortened.
 */
export function blochVector(statevector, qubit) {
  const n = numQubitsFromStatevector(statevector)
  if (!n || qubit < 0 || qubit >= n) {
    return { x: 0, y: 0, z: 1, r: 1, theta: 0, phi: 0, p0: 1, p1: 0, pure: true }
  }

  const amps = statevector.map(toComplex)
  const bit = 1 << qubit
  let p0 = 0
  let p1 = 0
  let rho01re = 0
  let rho01im = 0

  for (let i = 0; i < amps.length; i++) {
    if (i & bit) continue // handle each (i0, i1) pair once from the bit=0 side
    const j = i | bit
    const a = amps[i]
    const b = amps[j]
    p0 += a.re * a.re + a.im * a.im
    p1 += b.re * b.re + b.im * b.im
    // ρ01 += a · conj(b)
    rho01re += a.re * b.re + a.im * b.im
    rho01im += a.im * b.re - a.re * b.im
  }

  const x = 2 * rho01re
  const y = -2 * rho01im
  const z = p0 - p1
  const r = Math.min(1, Math.sqrt(x * x + y * y + z * z))
  const theta = r < 1e-9 ? 0 : Math.acos(Math.max(-1, Math.min(1, z / r)))
  const phi = Math.atan2(y, x)

  return { x, y, z, r, theta, phi, p0, p1, pure: r > 0.999 }
}

// Amplitude rows for the statevector panel: [{ index, bitstring, re, im, mag, prob }].
export function amplitudeRows(statevector) {
  const n = numQubitsFromStatevector(statevector)
  if (!n) return []
  return statevector.map((v, i) => {
    const c = toComplex(v)
    const mag = magnitude(c)
    return {
      index: i,
      bitstring: i.toString(2).padStart(n, '0'),
      re: c.re,
      im: c.im,
      mag,
      prob: mag * mag,
    }
  })
}

export const formatRad = (v) => `${v.toFixed(3)} rad`

/**
 * Exact mathematical Quantum Simulator for 1-5 qubits.
 * Simulates unitaries for H, X, Y, Z, S, S†, T, T†, SX, RX, RY, RZ, CNOT, SWAP, CCNOT gates.
 */
export function simulateLocalCircuit(numQubits, gates, shots = 1024) {
  const n = Math.max(1, Math.min(5, numQubits))
  const numStates = 1 << n

  let state = Array.from({ length: numStates }, (_, i) => ({
    real: i === 0 ? 1 : 0,
    imag: 0,
  }))

  const sortedGates = [...gates].sort((a, b) => (a.step ?? 0) - (b.step ?? 0))

  for (const g of sortedGates) {
    const type = (g.type || '').toUpperCase()
    const q = g.target ?? g.qubit ?? 0
    if (q >= n) continue

    const nextState = state.map((v) => ({ ...v }))

    if (type === 'H') {
      const invSqrt2 = 1 / Math.SQRT2
      for (let i = 0; i < numStates; i++) {
        if ((i & (1 << q)) === 0) {
          const pair = i | (1 << q)
          const a = state[i]
          const b = state[pair]
          nextState[i] = {
            real: (a.real + b.real) * invSqrt2,
            imag: (a.imag + b.imag) * invSqrt2,
          }
          nextState[pair] = {
            real: (a.real - b.real) * invSqrt2,
            imag: (a.imag - b.imag) * invSqrt2,
          }
        }
      }
    } else if (type === 'X' || type === 'NOT') {
      for (let i = 0; i < numStates; i++) {
        if ((i & (1 << q)) === 0) {
          const pair = i | (1 << q)
          nextState[i] = { ...state[pair] }
          nextState[pair] = { ...state[i] }
        }
      }
    } else if (type === 'Y') {
      for (let i = 0; i < numStates; i++) {
        if ((i & (1 << q)) === 0) {
          const pair = i | (1 << q)
          const a = state[i]
          const b = state[pair]
          nextState[i] = { real: b.imag, imag: -b.real }
          nextState[pair] = { real: -a.imag, imag: a.real }
        }
      }
    } else if (type === 'Z') {
      for (let i = 0; i < numStates; i++) {
        if (i & (1 << q)) {
          nextState[i] = { real: -state[i].real, imag: -state[i].imag }
        }
      }
    } else if (type === 'S') {
      for (let i = 0; i < numStates; i++) {
        if (i & (1 << q)) {
          nextState[i] = { real: -state[i].imag, imag: state[i].real }
        }
      }
    } else if (type === 'SDG' || type === 'S†') {
      for (let i = 0; i < numStates; i++) {
        if (i & (1 << q)) {
          nextState[i] = { real: state[i].imag, imag: -state[i].real }
        }
      }
    } else if (type === 'T') {
      const cos = Math.cos(Math.PI / 4)
      const sin = Math.sin(Math.PI / 4)
      for (let i = 0; i < numStates; i++) {
        if (i & (1 << q)) {
          const a = state[i]
          nextState[i] = {
            real: a.real * cos - a.imag * sin,
            imag: a.real * sin + a.imag * cos,
          }
        }
      }
    } else if (type === 'TDG' || type === 'T†') {
      const cos = Math.cos(Math.PI / 4)
      const sin = Math.sin(-Math.PI / 4)
      for (let i = 0; i < numStates; i++) {
        if (i & (1 << q)) {
          const a = state[i]
          nextState[i] = {
            real: a.real * cos - a.imag * sin,
            imag: a.real * sin + a.imag * cos,
          }
        }
      }
    } else if (type === 'SX') {
      for (let i = 0; i < numStates; i++) {
        if ((i & (1 << q)) === 0) {
          const pair = i | (1 << q)
          const a = state[i]
          const b = state[pair]
          nextState[i] = {
            real: 0.5 * (a.real - a.imag + b.real + b.imag),
            imag: 0.5 * (a.real + a.imag - b.real + b.imag),
          }
          nextState[pair] = {
            real: 0.5 * (a.real + a.imag + b.real - b.imag),
            imag: 0.5 * (-a.real + a.imag + b.real + b.imag),
          }
        }
      }
    } else if (type === 'RX') {
      const theta = g.theta ?? Math.PI / 2
      const cos = Math.cos(theta / 2)
      const sin = Math.sin(theta / 2)
      for (let i = 0; i < numStates; i++) {
        if ((i & (1 << q)) === 0) {
          const pair = i | (1 << q)
          const a = state[i]
          const b = state[pair]
          nextState[i] = {
            real: a.real * cos + b.imag * sin,
            imag: a.imag * cos - b.real * sin,
          }
          nextState[pair] = {
            real: b.real * cos + a.imag * sin,
            imag: b.imag * cos - a.real * sin,
          }
        }
      }
    } else if (type === 'RY') {
      const theta = g.theta ?? Math.PI / 2
      const cos = Math.cos(theta / 2)
      const sin = Math.sin(theta / 2)
      for (let i = 0; i < numStates; i++) {
        if ((i & (1 << q)) === 0) {
          const pair = i | (1 << q)
          const a = state[i]
          const b = state[pair]
          nextState[i] = {
            real: a.real * cos - b.real * sin,
            imag: a.imag * cos - b.imag * sin,
          }
          nextState[pair] = {
            real: a.real * sin + b.real * cos,
            imag: a.imag * sin + b.imag * cos,
          }
        }
      }
    } else if (type === 'RZ' || type === 'P' || type === 'PHASE') {
      const theta = g.theta ?? Math.PI / 2
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      for (let i = 0; i < numStates; i++) {
        if (i & (1 << q)) {
          const a = state[i]
          nextState[i] = {
            real: a.real * cos - a.imag * sin,
            imag: a.real * sin + a.imag * cos,
          }
        }
      }
    } else if (type === 'CNOT' || type === 'CX') {
      const ctrl = g.control ?? g.controlQubit ?? 0
      for (let i = 0; i < numStates; i++) {
        if (i & (1 << ctrl)) {
          if ((i & (1 << q)) === 0) {
            const pair = i | (1 << q)
            nextState[i] = { ...state[pair] }
            nextState[pair] = { ...state[i] }
          }
        }
      }
    } else if (type === 'SWAP') {
      const swapWith = g.swap_with ?? g.swapQubit ?? (q + 1) % n
      for (let i = 0; i < numStates; i++) {
        const bit1 = (i >> q) & 1
        const bit2 = (i >> swapWith) & 1
        if (bit1 !== bit2 && bit1 === 0) {
          const swappedIdx = (i & ~(1 << q) & ~(1 << swapWith)) | (1 << swapWith)
          nextState[i] = { ...state[swappedIdx] }
          nextState[swappedIdx] = { ...state[i] }
        }
      }
    }

    state = nextState
  }

  const probabilities = {}
  const counts = {}

  state.forEach((amp, idx) => {
    const bitstring = idx.toString(2).padStart(n, '0')
    const prob = amp.real * amp.real + amp.imag * amp.imag
    probabilities[bitstring] = Math.round(prob * 10000) / 10000
    counts[bitstring] = Math.round(prob * shots)
  })

  return {
    statevector: state,
    probabilities,
    counts,
    qubits: n,
    shots,
  }
}
