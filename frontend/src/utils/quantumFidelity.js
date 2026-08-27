import { STATE_VECTORS } from './quantumStates.js'
import { simulateLocalCircuit } from '../components/composer/core/utils/quantum.js'

/**
 * Resolves a normalized target statevector from label, custom vector, or preset.
 */
export function resolveTargetVector(targetLabel, customVector, numQubits = 1) {
  const total = 1 << numQubits

  let vec = null

  if (Array.isArray(customVector) && customVector.length === total) {
    vec = customVector.map((amp) => ({
      real: Number(amp.real ?? amp.re ?? 0),
      imag: Number(amp.imag ?? amp.im ?? 0),
    }))
  } else {
    const rawPreset = STATE_VECTORS[targetLabel]
    if (Array.isArray(rawPreset)) {
      vec = Array.from({ length: total }, () => ({ real: 0, imag: 0 }))
      rawPreset.forEach(([basisStr, ampStr]) => {
        const bitStr = String(basisStr).replace(/[^01]/g, '')
        const idx = parseInt(bitStr, 2)
        if (!isNaN(idx) && idx < total) {
          const clean = String(ampStr).replace(/\s+/g, '')
          const match = clean.match(/^([+-]?[\d.]+)?([+-][\d.]+)i$/)
          if (match) {
            vec[idx] = {
              real: match[1] ? parseFloat(match[1]) : 0,
              imag: parseFloat(match[2]),
            }
          } else {
            const r = parseFloat(clean)
            vec[idx] = { real: isNaN(r) ? 0 : r, imag: 0 }
          }
        }
      })
    }
  }

  if (!vec) {
    // Ground state |0...0>
    vec = Array.from({ length: total }, (_, i) => ({
      real: i === 0 ? 1 : 0,
      imag: 0,
    }))
  }

  // Normalize vector to ensure sum of squared magnitudes is exactly 1
  const normSq = vec.reduce((sum, a) => sum + a.real * a.real + a.imag * a.imag, 0)
  if (normSq > 0 && Math.abs(normSq - 1.0) > 1e-6) {
    const factor = 1 / Math.sqrt(normSq)
    vec.forEach((a) => {
      a.real *= factor
      a.imag *= factor
    })
  }

  return vec
}

/**
 * Computes exact quantum state fidelity: F = |<ψ_circuit | ψ_target>|²
 * Returns a number in [0, 1].
 */
export function calculateQuantumFidelity(currentStatevector, targetVector, numQubits = 1) {
  const total = 1 << numQubits

  const current =
    Array.isArray(currentStatevector) && currentStatevector.length === total
      ? currentStatevector.map((a) => ({
          real: Number(a.real ?? a.re ?? 0),
          imag: Number(a.imag ?? a.im ?? 0),
        }))
      : Array.from({ length: total }, (_, i) => ({
          real: i === 0 ? 1 : 0,
          imag: 0,
        }))

  const target =
    Array.isArray(targetVector) && targetVector.length === total
      ? targetVector.map((a) => ({
          real: Number(a.real ?? a.re ?? 0),
          imag: Number(a.imag ?? a.im ?? 0),
        }))
      : Array.from({ length: total }, (_, i) => ({
          real: i === 0 ? 1 : 0,
          imag: 0,
        }))

  let sumRe = 0
  let sumIm = 0

  for (let i = 0; i < total; i++) {
    const c = current[i]
    const t = target[i]
    // <current | target> = (c.re - i c.im) * (t.re + i t.im)
    sumRe += c.real * t.real + c.imag * t.imag
    sumIm += c.real * t.imag - c.imag * t.real
  }

  const fidelity = sumRe * sumRe + sumIm * sumIm
  // Snap very close 1.0 numbers to 1.0 to avoid e.g. 0.99999999999 displaying 99.99% instead of 100.0%
  if (Math.abs(fidelity - 1.0) < 1e-4) return 1.0
  return Math.max(0, Math.min(1, fidelity))
}

/**
 * Extracts gates from the interactive canvas circuit grid and computes its statevector locally and instantly.
 * Returns null if the canvas has no gates.
 */
export function computeCanvasStatevector(circuit, qubits = 1) {
  if (!circuit || !Array.isArray(circuit)) return null

  const gates = []
  circuit.forEach((row, qIdx) => {
    if (!Array.isArray(row)) return
    row.forEach((g, stepIdx) => {
      if (!g || g.type === 'CNOT_TARGET' || g.role === 'TARGET') return
      gates.push({
        type: g.type,
        target: qIdx,
        qubit: qIdx,
        step: stepIdx,
        control:
          g.controlQubit !== undefined
            ? g.controlQubit
            : g.control !== undefined
            ? g.control
            : qIdx > 0
            ? qIdx - 1
            : 1,
        control2: g.controlQubit2,
        swap_with: g.swapQubit,
        theta: g.theta,
      })
    })
  })

  if (gates.length === 0) return null

  try {
    const res = simulateLocalCircuit(qubits, gates, 1024)
    return res?.statevector || null
  } catch (err) {
    console.error('Error simulating canvas circuit:', err)
    return null
  }
}
