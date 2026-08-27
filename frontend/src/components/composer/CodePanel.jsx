import React, { useState } from 'react'
import { useCircuitStore } from './core/store/useCircuitStore'

function generateQiskitCode(circuit, qubits = 4) {
  const lines = [
    "from qiskit import QuantumRegister, ClassicalRegister, QuantumCircuit",
    "",
    `qreg_q = QuantumRegister(${qubits}, 'q')`,
    `creg_c = ClassicalRegister(${qubits}, 'c')`,
    "circuit = QuantumCircuit(qreg_q, creg_c)",
    ""
  ]

  const gates = []
  if (Array.isArray(circuit)) {
    circuit.forEach((row, qIdx) => {
      row.forEach((gate, stepIdx) => {
        if (gate && gate.type !== 'CNOT_TARGET') {
          gates.push({ qubit: qIdx, step: stepIdx, gate })
        }
      })
    })
  }

  gates.sort((a, b) => a.step - b.step || a.qubit - b.qubit)

  gates.forEach(({ qubit, gate }) => {
    const t = (gate.type || '').toUpperCase()
    if (t === 'H') lines.push(`circuit.h(qreg_q[${qubit}])`)
    else if (t === 'X' || t === 'NOT') lines.push(`circuit.x(qreg_q[${qubit}])`)
    else if (t === 'Y') lines.push(`circuit.y(qreg_q[${qubit}])`)
    else if (t === 'Z') lines.push(`circuit.z(qreg_q[${qubit}])`)
    else if (t === 'S') lines.push(`circuit.s(qreg_q[${qubit}])`)
    else if (t === 'T') lines.push(`circuit.t(qreg_q[${qubit}])`)
    else if (t === 'SX') lines.push(`circuit.sx(qreg_q[${qubit}])`)
    else if (t === 'RX') lines.push(`circuit.rx(${(gate.theta || Math.PI / 2).toFixed(4)}, qreg_q[${qubit}])`)
    else if (t === 'RY') lines.push(`circuit.ry(${(gate.theta || Math.PI / 2).toFixed(4)}, qreg_q[${qubit}])`)
    else if (t === 'RZ') lines.push(`circuit.rz(${(gate.theta || Math.PI / 2).toFixed(4)}, qreg_q[${qubit}])`)
    else if (t === 'P' || t === 'PHASE') lines.push(`circuit.p(${(gate.theta || Math.PI / 2).toFixed(4)}, qreg_q[${qubit}])`)
    else if (t === 'CNOT' || t === 'CX') lines.push(`circuit.cx(qreg_q[${gate.controlQubit ?? 0}], qreg_q[${qubit}])`)
    else if (t === 'CZ') lines.push(`circuit.cz(qreg_q[${gate.controlQubit ?? 0}], qreg_q[${qubit}])`)
    else if (t === 'CCNOT' || t === 'TOFFOLI') lines.push(`circuit.ccx(qreg_q[${gate.controlQubit ?? 0}], qreg_q[${gate.controlQubit2 ?? 1}], qreg_q[${qubit}])`)
    else if (t === 'SWAP') lines.push(`circuit.swap(qreg_q[${qubit}], qreg_q[${gate.swapQubit ?? 1}])`)
    else if (t === 'MEASURE') lines.push(`circuit.measure(qreg_q[${qubit}], creg_c[${qubit}])`)
  })

  return lines.join('\n')
}

function generateQasmCode(circuit, qubits = 4) {
  const lines = [
    "OPENQASM 3.0;",
    'include "stdgates.inc";',
    "",
    `qubit[${qubits}] q;`,
    `bit[${qubits}] c;`,
    ""
  ]

  const gates = []
  if (Array.isArray(circuit)) {
    circuit.forEach((row, qIdx) => {
      row.forEach((gate, stepIdx) => {
        if (gate && gate.type !== 'CNOT_TARGET') {
          gates.push({ qubit: qIdx, step: stepIdx, gate })
        }
      })
    })
  }

  gates.sort((a, b) => a.step - b.step || a.qubit - b.qubit)

  gates.forEach(({ qubit, gate }) => {
    const t = (gate.type || '').toUpperCase()
    if (t === 'H') lines.push(`h q[${qubit}];`)
    else if (t === 'X' || t === 'NOT') lines.push(`x q[${qubit}];`)
    else if (t === 'Y') lines.push(`y q[${qubit}];`)
    else if (t === 'Z') lines.push(`z q[${qubit}];`)
    else if (t === 'S') lines.push(`s q[${qubit}];`)
    else if (t === 'T') lines.push(`t q[${qubit}];`)
    else if (t === 'SX') lines.push(`sx q[${qubit}];`)
    else if (t === 'RX') lines.push(`rx(${(gate.theta || Math.PI / 2).toFixed(4)}) q[${qubit}];`)
    else if (t === 'RY') lines.push(`ry(${(gate.theta || Math.PI / 2).toFixed(4)}) q[${qubit}];`)
    else if (t === 'RZ') lines.push(`rz(${(gate.theta || Math.PI / 2).toFixed(4)}) q[${qubit}];`)
    else if (t === 'P' || t === 'PHASE') lines.push(`p(${(gate.theta || Math.PI / 2).toFixed(4)}) q[${qubit}];`)
    else if (t === 'CNOT' || t === 'CX') lines.push(`cx q[${gate.controlQubit ?? 0}], q[${qubit}];`)
    else if (t === 'CZ') lines.push(`cz q[${gate.controlQubit ?? 0}], q[${qubit}];`)
    else if (t === 'CCNOT' || t === 'TOFFOLI') lines.push(`ccx q[${gate.controlQubit ?? 0}], q[${gate.controlQubit2 ?? 1}], q[${qubit}];`)
    else if (t === 'SWAP') lines.push(`swap q[${qubit}], q[${gate.swapQubit ?? 1}];`)
    else if (t === 'MEASURE') lines.push(`c[${qubit}] = measure q[${qubit}];`)
  })

  return lines.join('\n')
}

export default function CodePanel() {
  const { circuit, qubits, circuitName } = useCircuitStore()
  const [langMode, setLangMode] = useState('qiskit') // 'qiskit' | 'openqasm'

  const codeText = langMode === 'qiskit' ? generateQiskitCode(circuit, qubits) : generateQasmCode(circuit, qubits)
  const codeLines = codeText.split('\n')

  const handleDownloadCode = () => {
    const ext = langMode === 'qiskit' ? 'py' : 'qasm'
    const mimeType = langMode === 'qiskit' ? 'text/x-python' : 'text/plain'
    const blob = new Blob([codeText], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(circuitName || 'circuit').replace(/\s+/g, '_')}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col border-t border-[#393939] pt-3 mt-3 select-none text-xs text-[#e1e4e8]">
      {/* Header Dropdown & Badges */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className="relative inline-block">
            <select
              value={langMode}
              onChange={(e) => setLangMode(e.target.value)}
              className="bg-[#21262d] text-white text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[#30363d] outline-none cursor-pointer hover:border-[#29b6f6] transition-colors appearance-none pr-7 font-mono"
            >
              <option value="qiskit">Qiskit</option>
              <option value="openqasm">OpenQASM</option>
            </select>
            <span className="absolute right-2.5 top-1.5 text-[10px] text-[#a8a8a8] pointer-events-none">
              ∨
            </span>
          </div>

          <button
            onClick={handleDownloadCode}
            className="text-[11px] font-mono bg-[#21262d] hover:bg-[#30363d] text-white px-2.5 py-1.5 rounded-xl border border-[#30363d] transition-colors flex items-center gap-1"
            title={`Download ${langMode === 'qiskit' ? '.py file' : '.qasm file'}`}
          >
            <span>💾</span>
            <span>Download .{langMode === 'qiskit' ? 'py' : 'qasm'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-[#30363d] text-[#8b949e] px-2 py-0.5 rounded-full font-mono">
            Read only
          </span>
        </div>
      </div>

      {/* Code Display Area with Line Numbers */}
      <div className="bg-[#16191d] border border-[#30363d] rounded-2xl p-3 font-mono text-[11px] overflow-x-auto max-h-[280px] overflow-y-auto leading-relaxed shadow-inner">
        {codeLines.map((line, idx) => (
          <div key={idx} className="flex gap-3 min-w-max">
            <span className="text-[#484f58] select-none w-4 text-right shrink-0">{idx + 1}</span>
            <span className={line.startsWith('import') || line.startsWith('from') || line.startsWith('OPENQASM') ? 'text-[#ff7b72] font-semibold' : line.startsWith('qreg') || line.startsWith('qubit') ? 'text-[#79c0ff]' : 'text-[#7ee787]'}>
              {line || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
