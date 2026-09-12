import React, { useState, useEffect } from 'react'
import { useCircuitStore } from './core/store/useCircuitStore'

export function generateQiskitCode(circuit, qubits = 4) {
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
        if (gate && gate.type !== 'CNOT_TARGET' && gate.role !== 'TARGET') {
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
    else if (t === 'CNOT' || t === 'CX') lines.push(`circuit.cx(qreg_q[${gate.controlQubit ?? 0}], qreg_q[${gate.targetQubit ?? qubit}])`)
    else if (t === 'CZ') lines.push(`circuit.cz(qreg_q[${gate.controlQubit ?? 0}], qreg_q[${gate.targetQubit ?? qubit}])`)
    else if (t === 'CCNOT' || t === 'TOFFOLI') lines.push(`circuit.ccx(qreg_q[${gate.controlQubit ?? 0}], qreg_q[${gate.controlQubit2 ?? 1}], qreg_q[${gate.targetQubit ?? qubit}])`)
    else if (t === 'SWAP') lines.push(`circuit.swap(qreg_q[${qubit}], qreg_q[${gate.swapQubit ?? 1}])`)
    else if (t === 'MEASURE') lines.push(`circuit.measure(qreg_q[${qubit}], creg_c[${qubit}])`)
  })

  return lines.join('\n')
}

export function generateQasmCode(circuit, qubits = 4) {
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
        if (gate && gate.type !== 'CNOT_TARGET' && gate.role !== 'TARGET') {
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
    else if (t === 'CNOT' || t === 'CX') lines.push(`cx q[${gate.controlQubit ?? 0}], q[${gate.targetQubit ?? qubit}];`)
    else if (t === 'CZ') lines.push(`cz q[${gate.controlQubit ?? 0}], q[${gate.targetQubit ?? qubit}];`)
    else if (t === 'CCNOT' || t === 'TOFFOLI') lines.push(`ccx q[${gate.controlQubit ?? 0}], q[${gate.controlQubit2 ?? 1}], q[${gate.targetQubit ?? qubit}];`)
    else if (t === 'SWAP') lines.push(`swap q[${qubit}], q[${gate.swapQubit ?? 1}];`)
    else if (t === 'MEASURE') lines.push(`c[${qubit}] = measure q[${qubit}];`)
  })

  return lines.join('\n')
}

/**
 * STRICTLY SAFE REGEX TEXT PARSER FOR QISKIT CODE.
 * Non-negotiable security requirement: Absolutely NO eval() or exec().
 */
export function parseQiskitCode(codeText, maxQubits = 4) {
  if (!codeText || typeof codeText !== 'string') {
    return {
      success: false,
      gates: [],
      totalLines: 0,
      recognizedCount: 0,
      skippedCount: 0,
      skippedLines: [],
      errors: ['No code provided to parse.'],
    }
  }

  const lines = codeText.split(/\r?\n/)
  const parsedGates = []
  const skippedLines = []
  const errors = []
  let recognizedCount = 0

  const parseQubitIndex = (rawStr) => {
    if (!rawStr) return null
    const clean = rawStr.trim()
    const m = clean.match(/^(?:(?:qreg_q|q)\[(\d+)\]|(\d+))$/i)
    if (!m) return null
    return parseInt(m[1] !== undefined ? m[1] : m[2], 10)
  }

  const parseAngle = (rawStr) => {
    if (!rawStr) return null
    const clean = rawStr.replace(/^(?:theta|angle|p)\s*=\s*/i, '').trim()
    const val = parseFloat(clean)
    return isNaN(val) ? null : val
  }

  lines.forEach((line, index) => {
    const lineNum = index + 1
    const trimmed = line.trim()

    // 1. Ignore blank lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return
    }

    // 2. Safe boilerplate / preamble ignore (imports, register definitions, circuit creation)
    if (
      /^(from\s+qiskit|import\s+qiskit|import\s+numpy|import\s+math)/i.test(trimmed) ||
      /^[a-zA-Z0-9_]+\s*=\s*QuantumRegister\s*\(/i.test(trimmed) ||
      /^[a-zA-Z0-9_]+\s*=\s*ClassicalRegister\s*\(/i.test(trimmed) ||
      /^[a-zA-Z0-9_]+\s*=\s*QuantumCircuit\s*\(/i.test(trimmed) ||
      /^(?:circuit|qc)\.draw\s*\(/i.test(trimmed) ||
      /^OPENQASM/i.test(trimmed) ||
      /^include\s+"stdgates/i.test(trimmed) ||
      /^(?:qubit|bit)\[/i.test(trimmed)
    ) {
      return
    }

    // 3. Match Qiskit method calls: (circuit|qc).<method>(...)
    // A) Single-qubit non-parametric gates: h, x, y, z, s, t, sx
    const singleQubitMatch = trimmed.match(/^(?:circuit|qc)\.(h|x|y|z|s|t|sx|not)\s*\(\s*([^)]+)\s*\);?$/i)
    if (singleQubitMatch) {
      const gateType = singleQubitMatch[1].toUpperCase() === 'NOT' ? 'X' : singleQubitMatch[1].toUpperCase()
      const qIdx = parseQubitIndex(singleQubitMatch[2])
      if (qIdx === null) {
        skippedLines.push({ lineNum, text: trimmed, reason: 'Invalid qubit argument' })
        return
      }
      if (qIdx < 0 || qIdx >= maxQubits) {
        errors.push(`Line ${lineNum}: Qubit index q[${qIdx}] in '${trimmed}' is out of range (canvas has ${maxQubits} qubit${maxQubits > 1 ? 's' : ''}, valid indices 0 to ${maxQubits - 1}).`)
        return
      }
      parsedGates.push({ type: gateType, qubit: qIdx })
      recognizedCount++
      return
    }

    // B) Single-qubit parametric rotation gates: rx, ry, rz, p, phase
    const rotationMatch = trimmed.match(/^(?:circuit|qc)\.(rx|ry|rz|p|phase)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\);?$/i)
    if (rotationMatch) {
      let gateType = rotationMatch[1].toUpperCase()
      if (gateType === 'PHASE') gateType = 'P'
      const angle = parseAngle(rotationMatch[2])
      const qIdx = parseQubitIndex(rotationMatch[3])

      if (angle === null) {
        skippedLines.push({ lineNum, text: trimmed, reason: 'Invalid rotation angle' })
        return
      }
      if (qIdx === null) {
        skippedLines.push({ lineNum, text: trimmed, reason: 'Invalid qubit argument' })
        return
      }
      if (qIdx < 0 || qIdx >= maxQubits) {
        errors.push(`Line ${lineNum}: Qubit index q[${qIdx}] in '${trimmed}' is out of range (canvas has ${maxQubits} qubit${maxQubits > 1 ? 's' : ''}, valid indices 0 to ${maxQubits - 1}).`)
        return
      }
      parsedGates.push({ type: gateType, qubit: qIdx, theta: angle })
      recognizedCount++
      return
    }

    // C) Two-qubit gates: cx, cnot, cz
    const twoQubitMatch = trimmed.match(/^(?:circuit|qc)\.(cx|cnot|cz)\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\);?$/i)
    if (twoQubitMatch) {
      const gateType = twoQubitMatch[1].toUpperCase() === 'CNOT' ? 'CNOT' : twoQubitMatch[1].toUpperCase() === 'CX' ? 'CNOT' : 'CZ'
      const ctrl = parseQubitIndex(twoQubitMatch[2])
      const tgt = parseQubitIndex(twoQubitMatch[3])

      if (ctrl === null || tgt === null) {
        skippedLines.push({ lineNum, text: trimmed, reason: 'Invalid control or target qubit argument' })
        return
      }
      if (ctrl < 0 || ctrl >= maxQubits) {
        errors.push(`Line ${lineNum}: Control qubit index q[${ctrl}] is out of range (canvas has ${maxQubits} qubits).`)
        return
      }
      if (tgt < 0 || tgt >= maxQubits) {
        errors.push(`Line ${lineNum}: Target qubit index q[${tgt}] is out of range (canvas has ${maxQubits} qubits).`)
        return
      }
      if (ctrl === tgt) {
        errors.push(`Line ${lineNum}: Control and target qubits cannot be the same wire (q[${ctrl}]).`)
        return
      }

      parsedGates.push({ type: gateType, controlQubit: ctrl, targetQubit: tgt, qubit: ctrl })
      recognizedCount++
      return
    }

    // D) SWAP gate
    const swapMatch = trimmed.match(/^(?:circuit|qc)\.swap\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\);?$/i)
    if (swapMatch) {
      const q1 = parseQubitIndex(swapMatch[2])
      const q2 = parseQubitIndex(swapMatch[3])

      if (q1 === null || q2 === null) {
        skippedLines.push({ lineNum, text: trimmed, reason: 'Invalid SWAP qubit arguments' })
        return
      }
      if (q1 < 0 || q1 >= maxQubits || q2 < 0 || q2 >= maxQubits) {
        errors.push(`Line ${lineNum}: SWAP qubit index out of range for ${maxQubits}-qubit canvas.`)
        return
      }
      if (q1 === q2) {
        errors.push(`Line ${lineNum}: SWAP requires two distinct qubit wires.`)
        return
      }

      parsedGates.push({ type: 'SWAP', qubit: q1, swapQubit: q2 })
      recognizedCount++
      return
    }

    // E) Three-qubit CCNOT / Toffoli
    const ccnotMatch = trimmed.match(/^(?:circuit|qc)\.(ccx|ccnot|toffoli)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\);?$/i)
    if (ccnotMatch) {
      const c1 = parseQubitIndex(ccnotMatch[2])
      const c2 = parseQubitIndex(ccnotMatch[3])
      const tgt = parseQubitIndex(ccnotMatch[4])

      if (c1 === null || c2 === null || tgt === null) {
        skippedLines.push({ lineNum, text: trimmed, reason: 'Invalid CCNOT qubit arguments' })
        return
      }
      if (c1 < 0 || c1 >= maxQubits || c2 < 0 || c2 >= maxQubits || tgt < 0 || tgt >= maxQubits) {
        errors.push(`Line ${lineNum}: CCNOT qubit index out of range for ${maxQubits}-qubit canvas.`)
        return
      }

      parsedGates.push({ type: 'CCNOT', controlQubit: c1, controlQubit2: c2, targetQubit: tgt, qubit: c1 })
      recognizedCount++
      return
    }

    // F) Measurement
    const measureMatch = trimmed.match(/^(?:circuit|qc)\.measure\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\);?$/i)
    if (measureMatch) {
      const qIdx = parseQubitIndex(measureMatch[1])
      if (qIdx !== null && qIdx >= 0 && qIdx < maxQubits) {
        parsedGates.push({ type: 'MEASURE', qubit: qIdx })
        recognizedCount++
        return
      }
    }

    // G) Also support OpenQASM equivalents if user pasted QASM text
    const qasmSingle = trimmed.match(/^(h|x|y|z|s|t|sx)\s+q\[(\d+)\];?$/i)
    if (qasmSingle) {
      const qIdx = parseInt(qasmSingle[2], 10)
      if (qIdx < maxQubits) {
        parsedGates.push({ type: qasmSingle[1].toUpperCase(), qubit: qIdx })
        recognizedCount++
        return
      }
    }

    const qasmRot = trimmed.match(/^(rx|ry|rz|p)\s*\(\s*([^)]+)\s*\)\s+q\[(\d+)\];?$/i)
    if (qasmRot) {
      const angle = parseAngle(qasmRot[2])
      const qIdx = parseInt(qasmRot[3], 10)
      if (angle !== null && qIdx < maxQubits) {
        parsedGates.push({ type: qasmRot[1].toUpperCase(), qubit: qIdx, theta: angle })
        recognizedCount++
        return
      }
    }

    const qasmCx = trimmed.match(/^(cx|cz|swap)\s+q\[(\d+)\]\s*,\s*q\[(\d+)\];?$/i)
    if (qasmCx) {
      const gateType = qasmCx[1].toUpperCase() === 'CX' ? 'CNOT' : qasmCx[1].toUpperCase()
      const q1 = parseInt(qasmCx[2], 10)
      const q2 = parseInt(qasmCx[3], 10)
      if (q1 < maxQubits && q2 < maxQubits) {
        if (gateType === 'SWAP') {
          parsedGates.push({ type: 'SWAP', qubit: q1, swapQubit: q2 })
        } else {
          parsedGates.push({ type: gateType, controlQubit: q1, targetQubit: q2, qubit: q1 })
        }
        recognizedCount++
        return
      }
    }

    // 4. Line did not match any known safe pattern
    skippedLines.push({ lineNum, text: trimmed })
  })

  return {
    success: errors.length === 0 && parsedGates.length > 0,
    gates: parsedGates,
    totalLines: lines.length,
    recognizedCount,
    skippedCount: skippedLines.length,
    skippedLines,
    errors,
  }
}

export default function CodePanel() {
  const { circuit, qubits, circuitName, applyParsedGates } = useCircuitStore()
  const [langMode, setLangMode] = useState('qiskit') // 'qiskit' | 'openqasm'
  const [isEditMode, setIsEditMode] = useState(false)
  const [editableCode, setEditableCode] = useState('')
  const [feedback, setFeedback] = useState(null) // { type: 'success'|'warning'|'error', title: string, message: string }

  const generatedCodeText =
    langMode === 'qiskit' ? generateQiskitCode(circuit, qubits) : generateQasmCode(circuit, qubits)

  // Keep code in sync with canvas circuit when it changes
  useEffect(() => {
    setEditableCode(generatedCodeText)
  }, [generatedCodeText])

  const handleDownloadCode = () => {
    const codeToDownload = editableCode || generatedCodeText
    const ext = langMode === 'qiskit' ? 'py' : 'qasm'
    const mimeType = langMode === 'qiskit' ? 'text/x-python' : 'text/plain'
    const blob = new Blob([codeToDownload], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(circuitName || 'circuit').replace(/\s+/g, '_')}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleApplyCodeToCanvas = () => {
    setFeedback(null)

    if (!editableCode || !editableCode.trim()) {
      setFeedback({
        type: 'error',
        title: 'Empty Code',
        message: 'Please paste or write Qiskit Python code with gate instructions.',
      })
      return
    }

    const parseResult = parseQiskitCode(editableCode, qubits)

    // Critical error (e.g. out of range qubit)
    if (parseResult.errors.length > 0) {
      setFeedback({
        type: 'error',
        title: 'Invalid Qubit Index',
        message: parseResult.errors[0],
      })
      return
    }

    // No valid gates found
    if (parseResult.gates.length === 0) {
      setFeedback({
        type: 'error',
        title: 'No Valid Gates Found',
        message:
          'No recognized gate instructions found. Supported patterns include circuit.h(0), circuit.ry(4.67, 0), circuit.cx(0, 1), circuit.swap(0, 1).',
      })
      return
    }

    // Apply safely to the canvas store!
    if (applyParsedGates) {
      applyParsedGates(parseResult.gates)
    }

    // Feedback according to Part 4
    if (parseResult.skippedCount > 0) {
      setFeedback({
        type: 'warning',
        title: `Partial Application (${parseResult.recognizedCount} gates applied)`,
        message: `${parseResult.recognizedCount} lines recognized as valid gates; ${parseResult.skippedCount} line${parseResult.skippedCount > 1 ? 's were' : ' was'} not understood and skipped.`,
      })
    } else {
      setFeedback({
        type: 'success',
        title: 'Circuit Applied Successfully',
        message: `✓ Applied ${parseResult.recognizedCount} gates (with exact angles) directly to the Validation Canvas.`,
      })
    }
  }

  return (
    <div className="flex flex-col border-t border-[#393939] pt-3 mt-3 select-none text-xs text-[#e1e4e8]">
      {/* Header Dropdown & Action Controls */}
      <div className="flex items-center justify-between pb-2 flex-wrap gap-2">
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

        {/* Status Badge: Always Editable */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Editable</span>
          </span>
        </div>
      </div>

      {/* Code Area: Always in Editable / Paste Mode */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <textarea
            value={editableCode}
            onChange={(e) => setEditableCode(e.target.value)}
            spellCheck={false}
            placeholder="Paste generated Qiskit code here (e.g. circuit.ry(4.67, qreg_q[0]) or circuit.h(0))..."
            rows={8}
            className="w-full bg-[#16191d] border border-cyan-500/40 focus:border-cyan-400 rounded-2xl p-3 font-mono text-[11px] text-gray-300 placeholder-gray-500 outline-none leading-relaxed shadow-inner resize-y min-h-[140px] max-h-[300px]"
          />
        </div>

        {/* Action Bar: "Apply Code to Canvas" */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={handleApplyCodeToCanvas}
            className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs py-2 px-3.5 rounded-xl shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] border border-cyan-400/30"
            title="Parse this code and apply the exact gates to the validation canvas"
          >
            <span className="material-symbols-outlined text-[16px] leading-none">play_arrow</span>
            <span>Apply Code to Canvas</span>
          </button>

          <button
            onClick={() => {
              setEditableCode(generateQiskitCode(circuit, qubits))
              setFeedback(null)
            }}
            className="bg-[#21262d] hover:bg-[#30363d] text-gray-300 font-mono text-xs py-2 px-2.5 rounded-xl border border-[#30363d] transition-colors flex items-center gap-1"
            title="Reset text to current canvas code"
          >
            <span className="material-symbols-outlined text-[14px] leading-none">restart_alt</span>
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Real-time Feedback Banner */}
      {feedback && (
        <div
          className={`mt-2.5 p-2.5 rounded-xl border font-mono text-[11px] flex flex-col gap-1 transition-all ${
            feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              : feedback.type === 'warning'
              ? 'bg-amber-950/40 border-amber-500/50 text-amber-300'
              : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold">
            <span className="material-symbols-outlined text-sm leading-none">
              {feedback.type === 'error' ? 'error' : feedback.type === 'warning' ? 'warning' : 'check_circle'}
            </span>
            <span>{feedback.title}</span>
          </div>
          <p className="text-[10.5px] leading-normal opacity-90">{feedback.message}</p>
        </div>
      )}
    </div>
  )
}
