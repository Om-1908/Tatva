// Formats a radian value as "1.5708 rad (π/2)" — decimal plus the nearest
// clean π-fraction, when the value is close enough to one to be meaningful.
// Falls back to just the decimal if it doesn't land near a recognizable fraction.

const PI = Math.PI
const EPS = 1e-3

// Small denominators cover every angle these circuits actually produce
// (H/S/T/RX/RY/RZ/P defaults and typical user-entered values).
const DENOMS = [1, 2, 3, 4, 6, 8, 12]

function piFraction(rad) {
  if (Math.abs(rad) < EPS) return '0'

  const sign = rad < 0 ? '-' : ''
  const abs = Math.abs(rad)

  for (const den of DENOMS) {
    const numFloat = (abs * den) / PI
    const num = Math.round(numFloat)
    if (num === 0) continue
    if (Math.abs(numFloat - num) < EPS * den) {
      const g = gcd(num, den)
      const n = num / g
      const d = den / g
      const pi = n === 1 ? 'π' : `${n}π`
      return d === 1 ? `${sign}${pi}` : `${sign}${pi}/${d}`
    }
  }
  return null
}

function gcd(a, b) {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    ;[a, b] = [b, a % b]
  }
  return a || 1
}

// Main export: decimal rounded to `decimals` places, plus " (πfrac)" when the
// value is recognizably close to a clean multiple of π.
export function formatAngle(rad, { decimals = 4, unit = ' rad' } = {}) {
  if (!Number.isFinite(rad)) return '—'
  const decimalStr = `${rad.toFixed(decimals)}${unit}`
  const frac = piFraction(rad)
  return frac ? `${decimalStr} (${frac})` : decimalStr
}

// Standard phase formatting: normalizes to [0, 2π) and shows only the
// π-fraction form (e.g. "7π/4"), falling back to a plain decimal only when
// the value isn't a clean fraction.
export function formatPhaseStandard(rad, decimals = 3) {
  if (!Number.isFinite(rad)) return '—'
  let norm = rad % (2 * PI)
  if (norm < 0) norm += 2 * PI
  const frac = piFraction(norm)
  return frac ?? `${norm.toFixed(decimals)} rad`
}

// Compact variant without the "rad" unit suffix, for tight inline spots
// (e.g. θ/φ chips) — still shows both decimal and π form.
export function formatAngleCompact(rad, decimals = 3) {
  return formatAngle(rad, { decimals, unit: '' })
}