// =============================================================================
// Converts the live circuit state into source code text, in step order (the
// same chronological order the backend and the grid itself use), for the
// Code View panel. Two targets: OpenQASM 2.0 and Qiskit (Python).
// =============================================================================

const PI = Math.PI
const EPS = 1e-3
const DENOMS = [1, 2, 3, 4, 6, 8, 12, 16]

// Smallest clean "pi/k" (or "k*pi", "pi") expression for a radian value,
// or null if it isn't recognizably close to one — falls back to a raw
// decimal in that case. `piToken` lets callers use "pi" (QASM) or "np.pi"
// (Python) as the underlying constant.
function angleExpr(rad, piToken) {
  if (!Number.isFinite(rad)) return '0'
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
      const body = n === 1 ? piToken : `${n}*${piToken}`
      const divided = n === 1 ? `${body}/${d}` : `(${body})/${d}`
      return d === 1 ? `${sign}${body}` : `${sign}${divided}`
    }
  }
  return `${rad.toFixed(6)}`
}

function gcd(a, b) {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a || 1
}

// Bell block decompositions — same as the backend's build_bell_block_gate:
// X gates pick the basis pair, then H on the top wire and CNOT(top→bottom).
const BELL_BLOCKS = {
  BELL_PHI_PLUS:  { ket: 'Phi+ = (|00>+|11>)/sqrt(2)', xWires: [] },
  BELL_PHI_MINUS: { ket: 'Phi- = (|00>-|11>)/sqrt(2)', xWires: [0] },
  BELL_PSI_PLUS:  { ket: 'Psi+ = (|01>+|10>)/sqrt(2)', xWires: [1] },
  BELL_PSI_MINUS: { ket: 'Psi- = (|01>-|10>)/sqrt(2)', xWires: [0, 1] },
}

// Flatten the [qubit][step] grid into a step-ordered instruction list —
// same traversal order the circuit was actually authored in.
function stepOrderedGates(circuit, steps) {
  const maxStep = Math.max(steps, ...circuit.map((row) => row.length)) - 1
  const ordered = []
  for (let s = 0; s <= maxStep; s++) {
    for (let q = 0; q < circuit.length; q++) {
      const gate = circuit[q]?.[s]
      if (gate) ordered.push({ qubit: q, step: s, gate })
    }
  }
  return ordered
}

// -----------------------------------------------------------------------------
// OpenQASM 2.0
// -----------------------------------------------------------------------------
export function toOpenQASM(qubits, circuit, steps) {
  const lines = ['OPENQASM 2.0;', 'include "qelib1.inc";', '', `qreg q[${qubits}];`, `creg c[${qubits}];`, '']

  const ordered = stepOrderedGates(circuit, steps)
  let lastStep = -1

  for (const { qubit, step, gate } of ordered) {
    if (lastStep !== -1 && step !== lastStep) lines.push('')
    lastStep = step

    const q = (i) => `q[${i}]`
    const t = gate.theta !== undefined ? angleExpr(Number(gate.theta), 'pi') : null

    switch (gate.type) {
      case 'H': lines.push(`h ${q(qubit)};`); break
      case 'X': lines.push(`x ${q(qubit)};`); break
      case 'Y': lines.push(`y ${q(qubit)};`); break
      case 'Z': lines.push(`z ${q(qubit)};`); break
      case 'I': lines.push(`id ${q(qubit)};`); break
      case 'S': lines.push(`s ${q(qubit)};`); break
      case 'Sdg': lines.push(`sdg ${q(qubit)};`); break
      case 'T': lines.push(`t ${q(qubit)};`); break
      case 'Tdg': lines.push(`tdg ${q(qubit)};`); break
      case 'SX': lines.push(`sx ${q(qubit)};`); break
      case 'SXdg': lines.push(`sxdg ${q(qubit)};`); break
      case 'P': lines.push(`u1(${t}) ${q(qubit)};`); break
      case 'RX': lines.push(`rx(${t}) ${q(qubit)};`); break
      case 'RY': lines.push(`ry(${t}) ${q(qubit)};`); break
      case 'RZ': lines.push(`rz(${t}) ${q(qubit)};`); break
      case 'CNOT': lines.push(`cx ${q(gate.controlQubit)},${q(qubit)};`); break
      case 'CCNOT': lines.push(`ccx ${q(gate.controlQubit)},${q(gate.controlQubit2)},${q(qubit)};`); break
      case 'SWAP': lines.push(`swap ${q(qubit)},${q(gate.swapQubit)};`); break
      case 'Measure': lines.push(`measure ${q(qubit)} -> c[${qubit}];`); break
      case 'Reset': lines.push(`reset ${q(qubit)};`); break
      case 'Barrier': lines.push(`barrier ${q(qubit)};`); break
      case 'QFT':
      case 'IQFT': {
        const targets = gate.targets || [qubit]
        const n = targets.length
        const inverse = gate.type === 'IQFT'
        lines.push(`// ${inverse ? 'IQFT' : 'QFT'} block on q[${targets[0]}..${targets[n - 1]}]`)
        for (const line of qftBlockQASM(targets, inverse)) lines.push(line)
        break
      }
      case 'BELL_PHI_PLUS':
      case 'BELL_PHI_MINUS':
      case 'BELL_PSI_PLUS':
      case 'BELL_PSI_MINUS': {
        const targets = gate.targets || [qubit, qubit + 1]
        const spec = BELL_BLOCKS[gate.type]
        lines.push(`// Bell block ${spec.ket} on q[${targets[0]}],q[${targets[1]}]`)
        for (const w of spec.xWires) lines.push(`x q[${targets[w]}];`)
        lines.push(`h q[${targets[0]}];`)
        lines.push(`cx q[${targets[0]}],q[${targets[1]}];`)
        break
      }
      default: lines.push(`// unsupported gate: ${gate.type}`)
    }
  }

  return lines.join('\n')
}

// Same decomposition the backend actually runs (build_qft_block_gate),
// emitted as real instructions rather than a fixed-arity custom gate, so it
// stays correct for any qubit count.
function qftBlockQASM(targets, inverse) {
  const n = targets.length
  const out = []
  const h = (i) => out.push(`h q[${targets[i]}];`)
  const cp = (a, b, theta) => out.push(`cu1(${angleExpr(theta, 'pi')}) q[${targets[a]}],q[${targets[b]}];`)
  const swap = (a, b) => out.push(`swap q[${targets[a]}],q[${targets[b]}];`)

  if (!inverse) {
    for (let m = n - 1; m >= 0; m--) {
      h(m)
      for (let control = m - 1; control >= 0; control--) {
        cp(control, m, PI / 2 ** (m - control))
      }
    }
    for (let i = 0; i < Math.floor(n / 2); i++) swap(i, n - 1 - i)
  } else {
    for (let i = 0; i < Math.floor(n / 2); i++) swap(i, n - 1 - i)
    for (let target = 1; target <= n - 1; target++) {
      h(target - 1)
      for (let control = target - 1; control >= 0; control--) {
        cp(control, target, -PI / 2 ** (target - control))
      }
    }
    h(n - 1)
  }
  return out
}

// -----------------------------------------------------------------------------
// Qiskit (Python)
// -----------------------------------------------------------------------------
export function toQiskit(qubits, circuit, steps, shots) {
  const lines = [
    'from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister',
    'from qiskit_aer import AerSimulator',
    'import numpy as np',
    '',
    `shots = ${shots}`,
    '',
    `q = QuantumRegister(${qubits}, 'q')`,
    `c = ClassicalRegister(${qubits}, 'c')`,
    'qc = QuantumCircuit(q, c)',
    '',
  ]

  const ordered = stepOrderedGates(circuit, steps)
  let lastStep = -1
  let wrote = false

  for (const { qubit, step, gate } of ordered) {
    if (lastStep !== -1 && step !== lastStep) lines.push('')
    lastStep = step
    wrote = true

    const t = gate.theta !== undefined ? angleExpr(Number(gate.theta), 'np.pi') : null

    switch (gate.type) {
      case 'H': lines.push(`qc.h(q[${qubit}])`); break
      case 'X': lines.push(`qc.x(q[${qubit}])`); break
      case 'Y': lines.push(`qc.y(q[${qubit}])`); break
      case 'Z': lines.push(`qc.z(q[${qubit}])`); break
      case 'I': lines.push(`qc.id(q[${qubit}])`); break
      case 'S': lines.push(`qc.s(q[${qubit}])`); break
      case 'Sdg': lines.push(`qc.sdg(q[${qubit}])`); break
      case 'T': lines.push(`qc.t(q[${qubit}])`); break
      case 'Tdg': lines.push(`qc.tdg(q[${qubit}])`); break
      case 'SX': lines.push(`qc.sx(q[${qubit}])`); break
      case 'SXdg': lines.push(`qc.sxdg(q[${qubit}])`); break
      case 'P': lines.push(`qc.p(${t}, q[${qubit}])`); break
      case 'RX': lines.push(`qc.rx(${t}, q[${qubit}])`); break
      case 'RY': lines.push(`qc.ry(${t}, q[${qubit}])`); break
      case 'RZ': lines.push(`qc.rz(${t}, q[${qubit}])`); break
      case 'CNOT': lines.push(`qc.cx(q[${gate.controlQubit}], q[${qubit}])`); break
      case 'CCNOT': lines.push(`qc.ccx(q[${gate.controlQubit}], q[${gate.controlQubit2}], q[${qubit}])`); break
      case 'SWAP': lines.push(`qc.swap(q[${qubit}], q[${gate.swapQubit}])`); break
      case 'Measure': lines.push(`qc.measure(q[${qubit}], c[${qubit}])`); break
      case 'Reset': lines.push(`qc.reset(q[${qubit}])`); break
      case 'Barrier': lines.push(`qc.barrier(q[${qubit}])`); break
      case 'QFT':
      case 'IQFT': {
        const targets = gate.targets || [qubit]
        const n = targets.length
        const inverse = gate.type === 'IQFT'
        lines.push(`# ${inverse ? 'IQFT' : 'QFT'} block on q[${targets[0]}..${targets[n - 1]}]`)
        for (const line of qftBlockPython(targets, inverse)) lines.push(line)
        break
      }
      case 'BELL_PHI_PLUS':
      case 'BELL_PHI_MINUS':
      case 'BELL_PSI_PLUS':
      case 'BELL_PSI_MINUS': {
        const targets = gate.targets || [qubit, qubit + 1]
        const spec = BELL_BLOCKS[gate.type]
        lines.push(`# Bell block ${spec.ket} on q[${targets[0]}],q[${targets[1]}]`)
        for (const w of spec.xWires) lines.push(`qc.x(q[${targets[w]}])`)
        lines.push(`qc.h(q[${targets[0]}])`)
        lines.push(`qc.cx(q[${targets[0]}], q[${targets[1]}])`)
        break
      }
      default: lines.push(`# unsupported gate: ${gate.type}`)
    }
  }

  if (!wrote) lines.push('# (empty circuit)')

  lines.push('', 'backend = AerSimulator()', 'result = backend.run(qc, shots=shots).result()', 'counts = result.get_counts()', 'print(counts)')

  return lines.join('\n')
}

function qftBlockPython(targets, inverse) {
  const n = targets.length
  const out = []
  const h = (i) => out.push(`qc.h(q[${targets[i]}])`)
  const cp = (a, b, theta) => out.push(`qc.cp(${angleExpr(theta, 'np.pi')}, q[${targets[a]}], q[${targets[b]}])`)
  const swap = (a, b) => out.push(`qc.swap(q[${targets[a]}], q[${targets[b]}])`)

  if (!inverse) {
    for (let m = n - 1; m >= 0; m--) {
      h(m)
      for (let control = m - 1; control >= 0; control--) {
        cp(control, m, PI / 2 ** (m - control))
      }
    }
    for (let i = 0; i < Math.floor(n / 2); i++) swap(i, n - 1 - i)
  } else {
    for (let i = 0; i < Math.floor(n / 2); i++) swap(i, n - 1 - i)
    for (let target = 1; target <= n - 1; target++) {
      h(target - 1)
      for (let control = target - 1; control >= 0; control--) {
        cp(control, target, -PI / 2 ** (target - control))
      }
    }
    h(n - 1)
  }
  return out
}