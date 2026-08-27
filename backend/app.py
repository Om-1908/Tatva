from flask import Flask, request, jsonify
from flask_cors import CORS
from qiskit import QuantumCircuit, transpile
from qiskit.circuit.library import UnitaryGate
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator
from fractions import Fraction
import math
import numpy as np
import random
from typing import List, Dict, Any
import logging
import os
import requests as http_requests

# Setup
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv is optional, env vars can be set directly

app = Flask(__name__)
frontend_url = os.getenv("FRONTEND_URL", "*")
CORS(app, resources={
    r"/*": {
        "origins": [frontend_url, "http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "*"]
    }
})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/', methods=['GET'])
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "TATVA Quantum Synthesis API",
        "timestamp": time.time()
    }), 200

# The line above sets the ROOT logger to INFO, which every library's logger
# inherits unless told otherwise — that's what was printing Qiskit's
# per-transpiler-pass timings and werkzeug's per-request lines on every
# /simulate call. Silence those specifically; keep this app's own INFO logs.
for noisy in ("werkzeug", "qiskit", "qiskit.transpiler", "qiskit.compiler", "stevedore"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

import time

# MongoDB Atlas Connection
mongo_uri = os.getenv("MONGODB_URI", "mongodb+srv://thisguycaptures5_db_user:tatva123@tatva.tgnd1go.mongodb.net/?appName=TATVA")
mongo_db = None
mongo_client = None

try:
    from pymongo import MongoClient
    mongo_client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    mongo_db = mongo_client.get_database("tatva_db")
    logger.info("Connected to MongoDB Atlas (tatva_db) successfully")
except Exception as e:
    logger.warning(f"MongoDB Atlas Connection Warning: {e}")


def build_qft_block_gate(n: int, inverse: bool = False):
    """
    Build an n-qubit QFT (or inverse QFT) as a self-contained gate, using the
    same decomposition Qniverse shows for its 2-qubit `qft2` block:

        gate qft2 a, b {
            h b;
            cu1(pi/2) a, b;
            h a;
            swap a, b;
        }

    which is one valid ordering of the standard QFT circuit: Hadamards
    interleaved with controlled-phase rotations, finished by a reversal
    swap. This builds that same shape for any n, on a small local
    sub-circuit, so it can be appended onto exactly the qubits the user
    dropped the block on — never the whole register.

    The rotation cascade must run from the HIGHEST-indexed target down to
    the lowest (m = n-1 .. 0), each H followed by controlled-phase rotations
    from every lower qubit into it — not ascending. Verified numerically
    against Qiskit's QFT(n, do_swaps=True) reference for n=2..5; ascending
    order looks superficially fine (uniform |QFT|00..0>| probabilities,
    self-inverse round-trips) but produces the wrong relative phases, which
    only shows up once you check the actual unitary, not just probabilities.

    Within a single H's cascade, the controls are applied nearest-qubit-first
    (descending), matching Qniverse's own qft2/qft3 circuits exactly — pixel-
    verified against its reference screenshots. This particular ordering is
    cosmetic (any two controlled-phase gates sharing a target are diagonal
    and commute, so ascending vs. descending controls give the identical
    unitary either way), but keeping it matched means the actual circuit
    built here is the same one the Gate Expand modal describes, not just an
    equivalent one.
    """
    sub = QuantumCircuit(n, name=('IQFT' if inverse else 'QFT'))
    for m in reversed(range(n)):
        sub.h(m)
        for control in range(m - 1, -1, -1):
            angle = np.pi / (2 ** (m - control))
            sub.cp(angle, control, m)
    for i in range(n // 2):
        sub.swap(i, n - 1 - i)

    gate = sub.to_gate(label=('IQFT' if inverse else 'QFT'))
    return gate.inverse() if inverse else gate


# Which X gates precede the H+CNOT core for each Bell block. Wire 0 is the
# block's top target ("a"), wire 1 the bottom ("b"). Standard preparation:
# X gates select the basis pair, then H(a) + CNOT(a->b) entangle it.
#   |Phi+> = (|00>+|11>)/sqrt(2) : no X
#   |Phi-> = (|00>-|11>)/sqrt(2) : X(a)
#   |Psi+> = (|01>+|10>)/sqrt(2) : X(b)
#   |Psi-> = (|01>-|10>)/sqrt(2) : X(a), X(b)
BELL_BLOCK_X = {
    'BELL_PHI_PLUS': (),
    'BELL_PHI_MINUS': (0,),
    'BELL_PSI_PLUS': (1,),
    'BELL_PSI_MINUS': (0, 1),
}


def build_bell_block_gate(bell_type: str):
    """
    Build a 2-qubit Bell-state preparation block as a self-contained gate,
    the same way build_qft_block_gate scopes a QFT to the wires it was
    dropped on. Applied to |00> it produces the corresponding Bell state.
    """
    sub = QuantumCircuit(2, name=bell_type)
    for wire in BELL_BLOCK_X[bell_type]:
        sub.x(wire)
    sub.h(0)
    sub.cx(0, 1)
    return sub.to_gate(label=bell_type)


# =============================================================================
# Classical -> quantum data encoding.
#
# Three standard schemes for loading classical data into a quantum state,
# each returned as a list of gates in the SAME editor format /simulate consumes
# ({"type", "target", "step", optional "control"/"theta"}). That means an
# encoding circuit can be visualized here AND loaded straight into the circuit
# editor, where every existing panel (statevector, Q-sphere, histogram) works
# on it unchanged.
# =============================================================================

# Keep encoding circuits inside the same size envelope the rest of the app
# uses. Amplitude encoding grows a circuit as log2(len(data)); basis/angle grow
# it linearly, one qubit per value — so cap the qubit count, not the data length.
MAX_ENCODING_QUBITS = 8


def _parse_bits(data):
    """Coerce basis-encoding input into a list of 0/1 ints.

    Accepts a bitstring ("1011"), a list of numbers/bools, or a comma/space
    separated string ("1, 0, 1"). Any nonzero value counts as 1.
    """
    if isinstance(data, str):
        cleaned = data.strip()
        if all(c in '01' for c in cleaned) and cleaned:
            tokens = list(cleaned)
        else:
            tokens = [t for t in cleaned.replace(',', ' ').split() if t != '']
    elif isinstance(data, (list, tuple)):
        tokens = list(data)
    else:
        raise ValueError('Basis encoding needs a bitstring or a list of bits')

    if not tokens:
        raise ValueError('No data provided to encode')

    bits = []
    for tok in tokens:
        try:
            bits.append(1 if float(tok) != 0 else 0)
        except (TypeError, ValueError):
            raise ValueError(f'Invalid bit value: {tok!r}')
    return bits


def _parse_numbers(data):
    """Coerce amplitude/angle input into a list of floats."""
    if isinstance(data, str):
        tokens = [t for t in data.replace(',', ' ').split() if t != '']
    elif isinstance(data, (list, tuple)):
        tokens = list(data)
    else:
        raise ValueError('Encoding needs a list of numbers')

    if not tokens:
        raise ValueError('No data provided to encode')

    values = []
    for tok in tokens:
        try:
            values.append(float(tok))
        except (TypeError, ValueError):
            raise ValueError(f'Invalid number: {tok!r}')
    return values


def _circuit_to_editor_gates(qc: QuantumCircuit):
    """Flatten a Qiskit circuit into editor-format gates (one per time step).

    Used by amplitude encoding, whose state-preparation circuit is produced by
    the transpiler rather than hand-built. Only the gate set amplitude encoding
    transpiles to (ry, rz, rx, x, h, cx) is mapped; anything else is skipped.
    """
    editor_gates = []
    step = 0
    single = {'ry': 'RY', 'rz': 'RZ', 'rx': 'RX', 'x': 'X', 'h': 'H'}
    for instruction in qc.data:
        op = instruction.operation
        qubits = [qc.find_bit(q).index for q in instruction.qubits]
        name = op.name
        if name in single:
            gate = {'type': single[name], 'target': qubits[0], 'step': step}
            if name in ('ry', 'rz', 'rx'):
                gate['theta'] = float(op.params[0])
            editor_gates.append(gate)
        elif name == 'cx':
            editor_gates.append({
                'type': 'CNOT', 'target': qubits[1], 'control': qubits[0], 'step': step,
            })
        elif name in ('barrier', 'id'):
            continue
        else:
            # global phase / unmapped op — irrelevant to the visualized state
            continue
        step += 1
    return editor_gates


def _basis_encoding(data):
    """|b_0 b_1 ... > : one qubit per bit, an X gate wherever the bit is 1."""
    bits = _parse_bits(data)
    n = len(bits)
    if n > MAX_ENCODING_QUBITS:
        raise ValueError(f'Basis encoding is limited to {MAX_ENCODING_QUBITS} bits')

    gates = [
        {'type': 'X', 'target': i, 'step': i}
        for i, b in enumerate(bits) if b
    ]
    meta = {
        'bits': bits,
        'basis_state': ''.join(str(b) for b in bits),
        'formula': '|' + ''.join(str(b) for b in bits) + '⟩',
    }
    return n, gates, meta


def _angle_encoding(data, axis='RY', scale=1.0):
    """One rotation per feature: R_axis(scale · x_i) on qubit i, from |0...0>."""
    axis = str(axis).upper()
    if axis not in ('RX', 'RY', 'RZ'):
        raise ValueError('Angle encoding axis must be RX, RY or RZ')
    values = _parse_numbers(data)
    n = len(values)
    if n > MAX_ENCODING_QUBITS:
        raise ValueError(f'Angle encoding is limited to {MAX_ENCODING_QUBITS} features')
    try:
        scale = float(scale)
    except (TypeError, ValueError):
        scale = 1.0

    angles = [scale * v for v in values]
    gates = [
        {'type': axis, 'target': i, 'theta': angles[i], 'step': 0}
        for i in range(n)
    ]
    meta = {
        'values': values,
        'axis': axis,
        'scale': scale,
        'angles': angles,
    }
    return n, gates, meta


def _amplitude_encoding(data):
    """Encode a normalized vector as the amplitudes of the state.

    len(data) values -> ceil(log2(len)) qubits. The vector is padded to the
    next power of two, L2-normalized, and prepared with Qiskit's initialize,
    then transpiled to a basic gate set so it maps to editor gates.
    """
    values = _parse_numbers(data)
    length = len(values)
    if length < 2:
        raise ValueError('Amplitude encoding needs at least 2 values')

    n = int(np.ceil(np.log2(length)))
    if n > MAX_ENCODING_QUBITS:
        raise ValueError(f'Amplitude encoding is limited to {2 ** MAX_ENCODING_QUBITS} values')

    dim = 1 << n
    vec = np.zeros(dim, dtype=float)
    vec[:length] = values

    norm = float(np.linalg.norm(vec))
    if norm < 1e-12:
        raise ValueError('Amplitude encoding needs a non-zero vector')
    vec = vec / norm

    qc = QuantumCircuit(n)
    # prepare_state (not initialize): initialize prepends reset instructions,
    # which have no translation to the editor's gate set and make transpile
    # fail on Qiskit 2.x. From |0...0> both are equivalent.
    qc.prepare_state(vec, range(n))
    # Decompose the opaque state-preparation into gates the editor knows.
    # rx is included because Qiskit 2.x's equivalence library has no
    # u -> {ry, rz} path without it.
    tqc = transpile(qc, basis_gates=['rx', 'ry', 'rz', 'cx'], optimization_level=1)
    gates = _circuit_to_editor_gates(tqc)

    meta = {
        'input': values,
        'padded_length': dim,
        'norm': norm,
        'normalized': [float(x) for x in vec],
    }
    return n, gates, meta


ENCODERS = {
    'basis': _basis_encoding,
    'amplitude': _amplitude_encoding,
    'angle': _angle_encoding,
}


MAX_SHOR_NUMBER = 100000
MAX_SHOR_QUANTUM_NUMBER = 31


def _choose_shor_base(number: int) -> int:
    """Choose a small base that is coprime with the input number."""
    for candidate in range(2, min(number, 32)):
        if math.gcd(candidate, number) == 1:
            return candidate
    raise ValueError('Could not find a coprime base for the given number')


def _multiplicative_order(base: int, modulus: int, limit: int | None = None):
    """Return the smallest r such that base**r mod modulus == 1.

    The residues list records the modular powers a^1, a^2, ... so the UI can
    show the periodic orbit that Shor's algorithm is trying to recover.
    """
    residues = []
    value = 1
    max_steps = limit or modulus
    for period in range(1, max_steps + 1):
        value = (value * base) % modulus
        residues.append(value)
        if value == 1:
            return period, residues
    return None, residues


def _shor_period_analysis(number: int, base: int | None = None):
    if number < 3:
        raise ValueError('Enter an integer greater than 2')
    if number > MAX_SHOR_NUMBER:
        raise ValueError(f'Number is too large for the educational Shor demo (max {MAX_SHOR_NUMBER})')

    chosen_base = int(base) if base is not None else _choose_shor_base(number)
    if chosen_base <= 1 or chosen_base >= number:
        raise ValueError('Base must be between 2 and N-1')

    gcd_value = math.gcd(chosen_base, number)
    if gcd_value > 1:
        return {
            'success': True,
            'number': number,
            'base': chosen_base,
            'coprime': False,
            'gcd': gcd_value,
            'period': None,
            'residues': [],
            'factors': [gcd_value, number // gcd_value],
            'factorization_status': 'trivial_factor_found',
            'message': f'Base shares a common factor with {number}; Shor can factor it immediately.',
        }

    period, residues = _multiplicative_order(chosen_base, number)
    if period is None:
        return {
            'success': False,
            'number': number,
            'base': chosen_base,
            'coprime': True,
            'gcd': 1,
            'period': None,
            'residues': residues[:32],
            'factors': [],
            'factorization_status': 'period_not_found',
            'message': 'Could not find a period within the search bound.',
        }

    half_power = pow(chosen_base, period // 2, number) if period % 2 == 0 else None
    factors = []
    factorization_status = 'period_found_no_factor'

    if period % 2 == 0 and half_power not in (1, number - 1):
        p = math.gcd(half_power - 1, number)
        q = math.gcd(half_power + 1, number)
        if 1 < p < number:
            factors.append(p)
        if 1 < q < number and q != p:
            factors.append(q)
        if factors:
            factorization_status = 'factors_derived_from_period'

    return {
        'success': True,
        'number': number,
        'base': chosen_base,
        'coprime': True,
        'gcd': 1,
        'period': period,
        'residues': residues[:64],
        'factors': factors,
        'half_power': half_power,
        'factorization_status': factorization_status,
        'message': 'Period found using the order-finding stage of Shor-style factorization.',
    }


def _modular_multiplication_gate(multiplier: int, modulus: int) -> UnitaryGate:
    """Return a basis-permutation gate for |x> -> |multiplier * x mod modulus>."""
    work_qubits = int(math.ceil(math.log2(modulus)))
    dimension = 1 << work_qubits
    matrix = np.zeros((dimension, dimension), dtype=complex)

    for value in range(dimension):
        target = (multiplier * value) % modulus if value < modulus else value
        matrix[target, value] = 1.0

    return UnitaryGate(matrix, label=f'M_{multiplier}_mod_{modulus}')


def _build_shor_qpe_circuit(number: int, base: int, counting_qubits: int | None = None) -> QuantumCircuit:
    """Build the order-finding phase-estimation circuit used in Shor's algorithm."""
    work_qubits = int(math.ceil(math.log2(number)))
    counting_qubits = counting_qubits or max(2 * work_qubits + 1, 4)
    total_qubits = counting_qubits + work_qubits

    qc = QuantumCircuit(total_qubits, counting_qubits)
    work_start = counting_qubits
    work_qubit_indices = list(range(work_start, work_start + work_qubits))

    # Prepare |1> in the work register.
    qc.x(work_start)

    # Create a uniform superposition over the counting register.
    for qubit in range(counting_qubits):
        qc.h(qubit)

    # Controlled modular multiplication by a^(2^k) mod N.
    for qubit in range(counting_qubits):
        multiplier = pow(base, 1 << qubit, number)
        modular_gate = _modular_multiplication_gate(multiplier, number)
        qc.append(modular_gate.control(1), [qubit, *work_qubit_indices])

    # Uncompute the phase information into the counting register.
    qc.append(build_qft_block_gate(counting_qubits, inverse=True), list(range(counting_qubits)))
    qc.measure(range(counting_qubits), range(counting_qubits))
    return qc


def _estimate_period_from_measurements(counts: Dict[str, int], number: int, base: int, counting_qubits: int):
    """Convert measured phases into period candidates and pick the best valid order."""
    if not counts:
        return None, []

    total_shots = sum(counts.values()) or 1
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    candidates = []
    seen = set()

    for bitstring, count in ordered:
        phase_index = int(bitstring.replace(' ', ''), 2)
        phase = phase_index / (1 << counting_qubits)
        approx = Fraction(phase).limit_denominator(number)
        denominator = approx.denominator
        if denominator <= 1:
            continue

        valid = pow(base, denominator, number) == 1
        if denominator not in seen:
            seen.add(denominator)
            candidates.append({
                'bitstring': bitstring,
                'shots': count,
                'probability': count / total_shots,
                'phase': phase,
                'approximation': f'{approx.numerator}/{approx.denominator}',
                'period_candidate': denominator,
                'valid': valid,
            })

    valid_candidates = sorted(
        [entry for entry in candidates if entry['valid']],
        key=lambda entry: (-entry['shots'], entry['period_candidate'])
    )
    estimated_period = valid_candidates[0]['period_candidate'] if valid_candidates else None
    return estimated_period, candidates


def _run_shor_quantum_demo(number: int, base: int):
    """Run a small quantum phase-estimation demo for Shor order finding."""
    work_qubits = int(math.ceil(math.log2(number)))
    counting_qubits = max(2 * work_qubits + 1, 4)
    qc = _build_shor_qpe_circuit(number, base, counting_qubits=counting_qubits)

    simulator = AerSimulator(method='automatic')
    transpiled = transpile(qc, simulator)
    job = simulator.run(transpiled, shots=1024)
    result = job.result()
    counts = result.get_counts(0)

    estimated_period, period_candidates = _estimate_period_from_measurements(
        counts, number, base, counting_qubits
    )

    top_measurements = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:8]
    return {
        'mode': 'quantum-phase-estimation',
        'counting_qubits': counting_qubits,
        'work_qubits': work_qubits,
        'total_qubits': counting_qubits + work_qubits,
        'shots': 1024,
        'counts': counts,
        'top_measurements': [
            {
                'bitstring': bitstring,
                'shots': shots,
                'probability': shots / 1024,
            }
            for bitstring, shots in top_measurements
        ],
        'period_candidates': period_candidates,
        'estimated_period': estimated_period,
        'circuit_depth': transpiled.depth(),
        'circuit_size': transpiled.size(),
        'circuit_width': transpiled.width(),
    }


# Quantum circuit builder and simulator
class QuantumCircuitBuilder:
    """Helper class to build and simulate quantum circuits"""
    
    @staticmethod
    def build_circuit(qubits: int, gates: List[Dict[str, Any]]) -> QuantumCircuit:
        """
        Build a quantum circuit from a list of gates
        
        Args:
            qubits: Number of qubits
            gates: List of gate dictionaries with structure:
                {
                    "type": "H" | "X" | "Y" | "Z" | "CNOT" | "Measure",
                    "target": qubit_index,
                    "control": control_qubit_index (for CNOT),
                    "step": time_step
                }
        
        Returns:
            QuantumCircuit object
        """
        qc = QuantumCircuit(qubits, qubits)
        
        # Sort gates by step to apply them in order
        sorted_gates = sorted(gates, key=lambda g: g.get('step', 0))
        
        for gate in sorted_gates:
            gate_type = gate.get('type', '').upper()
            target = gate.get('target', 0)
            
            try:
                if gate_type in ('H', 'HADAMARD'):
                    qc.h(target)
                elif gate_type in ('X', 'NOT'):
                    qc.x(target)
                elif gate_type == 'Z':
                    qc.z(target)
                elif gate_type == 'Y':
                    qc.y(target)
                elif gate_type == 'I':
                    qc.id(target)
                elif gate_type == 'S':
                    qc.s(target)
                elif gate_type in ('SDG', 'S†', 'S-DAGGER'):
                    qc.sdg(target)
                elif gate_type == 'T':
                    qc.t(target)
                elif gate_type in ('TDG', 'T†', 'T-DAGGER'):
                    qc.tdg(target)
                elif gate_type == 'SX':
                    qc.sx(target)
                elif gate_type in ('SXDG', 'SX†'):
                    qc.sxdg(target)
                elif gate_type == 'RX':
                    theta = float(gate.get('theta', np.pi / 2))
                    qc.rx(theta, target)
                elif gate_type == 'RY':
                    theta = float(gate.get('theta', np.pi / 2))
                    qc.ry(theta, target)
                elif gate_type == 'RZ':
                    theta = float(gate.get('theta', np.pi / 2))
                    qc.rz(theta, target)
                elif gate_type in ('P', 'PHASE'):
                    theta = float(gate.get('theta', np.pi / 2))
                    qc.p(theta, target)
                elif gate_type in ('CNOT', 'CX'):
                    control = gate.get('control', 0)
                    qc.cx(control, target)
                elif gate_type == 'CZ':
                    control = gate.get('control', 0)
                    qc.cz(control, target)
                elif gate_type in ('CCNOT', 'TOFFOLI'):
                    control = gate.get('control', 0)
                    control2 = gate.get('control2', 1)
                    qc.ccx(control, control2, target)
                elif gate_type == 'SWAP':
                    swap_with = gate.get('swap_with')
                    if swap_with is None:
                        raise ValueError('SWAP requires swap_with qubit index')
                    qc.swap(target, int(swap_with))
                elif gate_type == 'BARRIER' or gate_type == '|':
                    if gate.get('target') is None:
                        qc.barrier()
                    else:
                        qc.barrier(target)
                elif gate_type == 'RESET':
                    qc.reset(target)
                elif gate_type in ('QFT', 'IQFT'):
                    # A QFT/IQFT block scoped to the specific qubits it was
                    # dropped across — matches the Qniverse "qft2 a, b" block
                    # (a = top wire, b = bottom wire), not the whole register.
                    targets = gate.get('targets')
                    if not targets:
                        a = gate.get('target')
                        b = gate.get('qftQubit', gate.get('partnerQubit', gate.get('partner')))
                        targets = [a, b]
                    targets = [int(t) for t in targets if t is not None]

                    if len(targets) < 2:
                        raise ValueError(f'{gate_type} requires at least 2 target qubits')
                    if len(set(targets)) != len(targets):
                        raise ValueError(f'{gate_type} target qubits must be distinct')
                    if any(t < 0 or t >= qc.num_qubits for t in targets):
                        raise ValueError(f'{gate_type} target qubit out of range')

                    qft_gate = build_qft_block_gate(len(targets), inverse=(gate_type == 'IQFT'))
                    qc.append(qft_gate, targets)
                elif gate_type in BELL_BLOCK_X:
                    # A Bell-state block scoped to the two qubits it was
                    # dropped across — targets[0] is the top wire (H +
                    # control), targets[1] the bottom (CNOT target).
                    targets = gate.get('targets')
                    if not targets:
                        a = gate.get('target')
                        b = gate.get('partnerQubit', gate.get('partner'))
                        targets = [a, b]
                    targets = [int(t) for t in targets if t is not None]

                    if len(targets) != 2:
                        raise ValueError(f'{gate_type} requires exactly 2 target qubits')
                    if targets[0] == targets[1]:
                        raise ValueError(f'{gate_type} target qubits must be distinct')
                    if any(t < 0 or t >= qc.num_qubits for t in targets):
                        raise ValueError(f'{gate_type} target qubit out of range')

                    qc.append(build_bell_block_gate(gate_type), targets)
                elif gate_type == 'MEASURE':
                    pass  # Measurement will be added after all gates
                else:
                    logger.warning(f"Unknown gate type: {gate_type}")
            except Exception as e:
                logger.error(f"Error applying gate {gate_type}: {e}")
                raise ValueError(f"Invalid gate configuration: {e}")
        
        # Add measurements
        qc.measure(range(qubits), range(qubits))
        
        return qc
    
    @staticmethod
    def simulate(qc: QuantumCircuit, shots: int = 1024) -> Dict[str, Any]:
        """
        Simulate the quantum circuit
        
        Args:
            qc: QuantumCircuit to simulate
            shots: Number of measurement shots
        
        Returns:
            Dictionary with simulation results
        """
        try:
            # Create a circuit copy for statevector (without measurements)
            qc_statevector = qc.copy()
            qc_statevector.remove_final_measurements(inplace=True)
            
            # Simulate statevector
            try:
                from qiskit.quantum_info import Statevector as QkStatevector
                sv_obj = QkStatevector.from_instruction(qc_statevector)
                statevector_data = sv_obj.data
            except Exception:
                qc_statevector.save_statevector()
                simulator_sv = AerSimulator(method='statevector')
                tqc_statevector = transpile(qc_statevector, simulator_sv)
                job_sv = simulator_sv.run(tqc_statevector)
                result_sv = job_sv.result()
                try:
                    statevector_data = result_sv.get_statevector(0).data
                except:
                    statevector_data = result_sv.data(0)['statevector']
            
            # Simulate measurement probabilities using automatic method
            simulator_qasm = AerSimulator(method='automatic')
            tqc_qasm = transpile(qc, simulator_qasm)
            job_qasm = simulator_qasm.run(tqc_qasm, shots=shots)
            result_qasm = job_qasm.result()
            counts = result_qasm.get_counts(0)
            
            # Exact probabilities from statevector (deterministic and ideal)
            num_qubits = qc.num_qubits
            probabilities = {}
            for idx, amp in enumerate(statevector_data):
                prob = float((amp.real * amp.real) + (amp.imag * amp.imag))
                if prob > 1e-12:
                    bitstring = format(idx, f'0{num_qubits}b')
                    probabilities[bitstring] = prob

            # Keep sampled probabilities as additional debug output.
            sampled_probabilities = {
                bitstring: count / shots for bitstring, count in counts.items()
            }
            
            return {
                'success': True,
                'statevector': [
                    {'real': float(v.real), 'imag': float(v.imag)} 
                    for v in statevector_data
                ],
                'probabilities': probabilities,
                'sampled_probabilities': sampled_probabilities,
                'counts': counts,
                'num_qubits': qc.num_qubits,
            }
        except Exception as e:
            logger.error(f"Simulation error: {e}")
            return {
                'success': False,
                'error': str(e)
            }


# Global storage for current RL synthesis target state
CURRENT_TARGET_STATE = {
    'qubits': 1,
    'label': '|0⟩',
    'statevector': np.array([1+0j, 0+0j], dtype=np.complex128)
}

@app.route('/api/set-target', methods=['POST'])
@app.route('/set-target', methods=['POST'])
def set_target():
    """Endpoint for setting target statevector for RL synthesis"""
    global CURRENT_TARGET_STATE
    try:
        data = request.get_json() or {}
        n_qubits = int(data.get('qubits', 1))
        label = str(data.get('target_state', '|0⟩'))
        sv_raw = data.get('statevector', [])
        
        # Convert statevector to complex128 numpy array
        complex_list = []
        for item in sv_raw:
            if isinstance(item, dict):
                r = float(item.get('real', 0))
                i = float(item.get('imag', 0))
                complex_list.append(complex(r, i))
            elif isinstance(item, (int, float, complex)):
                complex_list.append(complex(item))
            else:
                complex_list.append(0+0j)
                
        target_np = np.array(complex_list, dtype=np.complex128)
        CURRENT_TARGET_STATE = {
            'qubits': n_qubits,
            'label': label,
            'statevector': target_np
        }
        logger.info(f"Target state set to {label} ({n_qubits} qubits), shape: {target_np.shape}")
        return jsonify({
            'success': True,
            'message': f'Target state set to {label}',
            'qubits': n_qubits,
            'label': label
        })
    except Exception as e:
        logger.error(f"Error setting target state: {e}")
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/health', methods=['GET'])
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'quantum-simulator'})


@app.route('/api/simulate', methods=['POST'])
@app.route('/simulate', methods=['POST'])
def simulate_circuit():
    """
    Main endpoint for circuit simulation
    
    Expected JSON body:
    {
        "qubits": 2,
        "gates": [
            {"type": "H", "target": 0, "step": 0},
            {"type": "CNOT", "control": 0, "target": 1, "step": 1}
        ]
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        qubits = data.get('qubits', 2)
        gates = data.get('gates', [])
        shots = data.get('shots', 1024)
        
        # Validation
        if qubits < 1 or qubits > 10:
            return jsonify({'error': 'Qubits must be between 1 and 10'}), 400
        
        if not isinstance(gates, list):
            return jsonify({'error': 'Gates must be a list'}), 400
        
        logger.info(f"Building circuit with {qubits} qubits and {len(gates)} gates")
        
        # Build circuit
        qc = QuantumCircuitBuilder.build_circuit(qubits, gates)
        
        # Simulate
        result = QuantumCircuitBuilder.simulate(qc, shots=shots)
        
        if not result['success']:
            return jsonify({'error': result.get('error', 'Simulation failed')}), 500
        
        return jsonify(result), 200
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/encode', methods=['POST'])
@app.route('/encode', methods=['POST'])
def encode_data():
    """
    Encode classical data into a quantum state-preparation circuit.

    Expected JSON body:
    {
        "encoding": "basis" | "amplitude" | "angle",
        "data": "1011"  |  [0.5, 0.5, ...]  |  [0.1, 0.9],
        "axis": "RY",    (angle encoding only, default RY)
        "scale": 1.0,    (angle encoding only, default 1.0)
        "shots": 1024    (optional)
    }

    Returns the generated gates (editor format), qubit count, the resulting
    statevector / probabilities, and encoding-specific metadata.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        encoding = str(data.get('encoding', 'basis')).lower()
        encoder = ENCODERS.get(encoding)
        if encoder is None:
            return jsonify({'error': f'Unknown encoding: {encoding}'}), 400

        payload = data.get('data')
        shots = data.get('shots', 1024)

        if encoding == 'angle':
            qubits, gates, meta = encoder(
                payload, axis=data.get('axis', 'RY'), scale=data.get('scale', 1.0)
            )
        else:
            qubits, gates, meta = encoder(payload)

        if qubits < 1:
            return jsonify({'error': 'Encoding produced no qubits'}), 400

        logger.info(f"Encoding '{encoding}' -> {qubits} qubits, {len(gates)} gates")

        qc = QuantumCircuitBuilder.build_circuit(qubits, gates)
        result = QuantumCircuitBuilder.simulate(qc, shots=shots)

        if not result['success']:
            return jsonify({'error': result.get('error', 'Simulation failed')}), 500

        result.update({
            'encoding': encoding,
            'qubits': qubits,
            'gates': gates,
            'meta': meta,
        })
        return jsonify(result), 200

    except ValueError as e:
        logger.error(f"Encoding validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected encoding error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


def _encode_statevector(encoding, point, axis='RY', scale=1.0):
    """Encode one classical data point and return its statevector (np array).

    Reuses the same encoders /encode uses, then evaluates the prepared state
    directly (no sampling) so kernel entries are exact. Returns (qubits, sv).
    """
    encoder = ENCODERS[encoding]
    if encoding == 'angle':
        qubits, gates, _ = encoder(point, axis=axis, scale=scale)
    else:
        qubits, gates, _ = encoder(point)

    qc = QuantumCircuitBuilder.build_circuit(qubits, gates)
    qc.remove_final_measurements(inplace=True)
    sv = np.asarray(Statevector(qc).data)
    return qubits, sv


# Cap the kernel matrix so a request stays fast (each cell is an inner product,
# and every point runs its own state preparation).
MAX_KERNEL_POINTS = 16


@app.route('/api/kernel', methods=['POST'])
@app.route('/kernel', methods=['POST'])
def quantum_kernel():
    """
    Compute the quantum (fidelity) kernel matrix for a set of data points.

    Each point x is mapped to a state |φ(x)⟩ by the chosen encoding feature
    map; the kernel entry is the state fidelity

        K[i][j] = |⟨φ(xᵢ)|φ(xⱼ)⟩|²

    which is exactly what quantum-kernel SVMs use as their similarity measure.

    Expected JSON body:
    {
        "encoding": "angle" | "amplitude" | "basis",
        "points": [[0.1, 0.2], [0.9, 0.8], ...],   (each point a feature list)
        "axis": "RY",   (angle only)
        "scale": 1.0    (angle only)
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        encoding = str(data.get('encoding', 'angle')).lower()
        if encoding not in ENCODERS:
            return jsonify({'error': f'Unknown encoding: {encoding}'}), 400

        points = data.get('points')
        if not isinstance(points, list) or len(points) < 2:
            return jsonify({'error': 'Provide at least 2 data points'}), 400
        if len(points) > MAX_KERNEL_POINTS:
            return jsonify({'error': f'At most {MAX_KERNEL_POINTS} data points'}), 400

        axis = data.get('axis', 'RY')
        scale = data.get('scale', 1.0)

        # Encode every point; all states must share a qubit count to be
        # comparable (guaranteed when points have equal length).
        qubits = None
        states = []
        for idx, point in enumerate(points):
            n, sv = _encode_statevector(encoding, point, axis=axis, scale=scale)
            if qubits is None:
                qubits = n
            elif n != qubits:
                return jsonify({
                    'error': 'All data points must have the same length'
                }), 400
            states.append(sv)

        # Fidelity kernel — symmetric, unit diagonal.
        size = len(states)
        matrix = [[0.0] * size for _ in range(size)]
        for i in range(size):
            matrix[i][i] = 1.0
            for j in range(i + 1, size):
                overlap = complex(np.vdot(states[i], states[j]))
                fidelity = float(abs(overlap) ** 2)
                matrix[i][j] = fidelity
                matrix[j][i] = fidelity

        return jsonify({
            'success': True,
            'encoding': encoding,
            'qubits': qubits,
            'kernel': matrix,
            'num_points': size,
        }), 200

    except ValueError as e:
        logger.error(f"Kernel validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected kernel error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/shor', methods=['POST'])
@app.route('/shor', methods=['POST'])
def shor_period_finding():
    """Educational Shor-style period finding and factorization demo."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        number = int(data.get('number', 0))
        base = data.get('base')
        base_value = int(base) if base not in (None, '') else None

        classical_result = _shor_period_analysis(number, base_value)
        if not classical_result.get('success'):
            return jsonify(classical_result), 400

        quantum_result = None
        if number <= MAX_SHOR_QUANTUM_NUMBER:
            quantum_result = _run_shor_quantum_demo(number, classical_result['base'])
        else:
            quantum_result = {
                'mode': 'classical-fallback',
                'message': f'Quantum phase-estimation demo is capped at {MAX_SHOR_QUANTUM_NUMBER} to keep the state space manageable.',
                'counting_qubits': None,
                'work_qubits': None,
                'total_qubits': None,
                'shots': None,
                'counts': {},
                'top_measurements': [],
                'period_candidates': [],
                'estimated_period': None,
                'circuit_depth': None,
                'circuit_size': None,
                'circuit_width': None,
            }

        response = {
            **classical_result,
            'quantum': quantum_result,
            'mode': quantum_result['mode'],
            'estimated_period': quantum_result.get('estimated_period') or classical_result.get('period'),
        }
        return jsonify(response), 200

    except ValueError as e:
        logger.error(f"Shor validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected shor error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# =============================================================================
# Real Quantum hardware execution.
#
# Kept entirely in a separate, lazily-imported module so the local simulation
# path above never depends on it. Jobs are async — /hardware/run submits and
# returns a job_id immediately; the frontend polls /hardware/job/<id> for queue
# position, "running on QPU", and final counts.
# =============================================================================

@app.route('/api/hardware/backends', methods=['GET'])
@app.route('/hardware/backends', methods=['GET'])
def hardware_backends():
    """List operational real quantum devices with their live queue sizes."""
    try:
        from hardware import list_backends, HardwareError
    except Exception as e:
        logger.error(f"Hardware module import failed: {e}")
        return jsonify({'error': 'Hardware support unavailable on this server.'}), 503

    try:
        min_qubits = int(request.args.get('min_qubits', 1))
        return jsonify(list_backends(min_qubits=min_qubits)), 200
    except HardwareError as e:
        return jsonify({'error': e.message}), e.status
    except Exception as e:
        logger.error(f"Unexpected hardware/backends error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/hardware/run', methods=['POST'])
@app.route('/hardware/run', methods=['POST'])
def hardware_run():
    """
    Submit a circuit to a real Quantum backend (non-blocking).

    Expected JSON body (same circuit format as /simulate, plus a backend name):
    {
        "qubits": 2,
        "gates": [ ... ],
        "backend": "quantum_device",
        "shots": 1024
    }

    Returns { job_id, backend, shots, transpiled: {...} } — the transpiled
    section is the hardware-compatible ("ISA") circuit: depth, gate counts and
    OpenQASM 3. Poll /hardware/job/<job_id> for status and results.
    """
    try:
        from hardware import submit_job, HardwareError
    except Exception as e:
        logger.error(f"Hardware module import failed: {e}")
        return jsonify({'error': 'Hardware support unavailable on this server.'}), 503

    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        qubits = data.get('qubits', 2)
        gates = data.get('gates', [])
        shots = data.get('shots', 1024)
        backend_name = data.get('backend')

        if not backend_name:
            return jsonify({'error': 'A target backend must be selected'}), 400
        if qubits < 1 or qubits > 10:
            return jsonify({'error': 'Qubits must be between 1 and 10'}), 400
        if not isinstance(gates, list):
            return jsonify({'error': 'Gates must be a list'}), 400
        if not gates:
            return jsonify({'error': 'Add at least one gate to the circuit first'}), 400

        qc = QuantumCircuitBuilder.build_circuit(qubits, gates)

        result = submit_job(qc, backend_name, shots=shots)
        return jsonify({'success': True, **result}), 200

    except HardwareError as e:
        return jsonify({'error': e.message}), e.status
    except ValueError as e:
        logger.error(f"Hardware run validation error: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected hardware/run error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/hardware/job/<job_id>', methods=['GET'])
@app.route('/hardware/job/<job_id>', methods=['GET'])
def hardware_job(job_id):
    """Poll a submitted hardware job: queue position, running, or final counts."""
    try:
        from hardware import job_status, HardwareError
    except Exception as e:
        logger.error(f"Hardware module import failed: {e}")
        return jsonify({'error': 'Hardware support unavailable on this server.'}), 503

    try:
        return jsonify({'success': True, **job_status(job_id)}), 200
    except HardwareError as e:
        return jsonify({'error': e.message}), e.status
    except Exception as e:
        logger.error(f"Unexpected hardware/job error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/hardware/telemetry/<backend_name>', methods=['GET'])
@app.route('/hardware/telemetry/<backend_name>', methods=['GET'])
def hardware_telemetry(backend_name):
    """Live calibration telemetry for one device: T1/T2 per qubit, readout
    error, single- and two-qubit gate errors, plus operational status and the
    last-calibration timestamp. Cached server-side for a couple of minutes."""
    try:
        from hardware import get_backend_telemetry, HardwareError
    except Exception as e:
        logger.error(f"Hardware module import failed: {e}")
        return jsonify({'error': 'Hardware support unavailable on this server.'}), 503

    try:
        return jsonify({'success': True, **get_backend_telemetry(backend_name)}), 200
    except HardwareError as e:
        return jsonify({'error': e.message}), e.status
    except Exception as e:
        logger.error(f"Unexpected hardware/telemetry error: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/api/gates', methods=['GET'])
@app.route('/gates', methods=['GET'])
def get_available_gates():
    """Return available gates"""
    gates = [
        {
            'type': 'H',
            'name': 'Hadamard',
            'description': 'Creates superposition',
            'qubits_required': 1
        },
        {
            'type': 'X',
            'name': 'Pauli X',
            'description': 'Quantum NOT gate',
            'qubits_required': 1
        },
        {
            'type': 'I',
            'name': 'Identity',
            'description': 'Identity gate',
            'qubits_required': 1
        },
        {
            'type': 'Y',
            'name': 'Pauli Y',
            'description': 'Rotation around Y-axis',
            'qubits_required': 1
        },
        {
            'type': 'Z',
            'name': 'Pauli Z',
            'description': 'Rotation around Z-axis',
            'qubits_required': 1
        },
        {
            'type': 'S',
            'name': 'S',
            'description': 'Phase gate S',
            'qubits_required': 1
        },
        {
            'type': 'Sdg',
            'name': 'S dagger',
            'description': 'S dagger gate',
            'qubits_required': 1
        },
        {
            'type': 'T',
            'name': 'T',
            'description': 'T gate',
            'qubits_required': 1
        },
        {
            'type': 'Tdg',
            'name': 'T dagger',
            'description': 'T dagger gate',
            'qubits_required': 1
        },
        {
            'type': 'SX',
            'name': 'Sqrt X',
            'description': 'Square-root X gate',
            'qubits_required': 1
        },
        {
            'type': 'SXdg',
            'name': 'Sqrt X dagger',
            'description': 'Square-root X dagger gate',
            'qubits_required': 1
        },
        {
            'type': 'RX',
            'name': 'RX(theta)',
            'description': 'X-axis rotation gate',
            'qubits_required': 1
        },
        {
            'type': 'RY',
            'name': 'RY(theta)',
            'description': 'Y-axis rotation gate',
            'qubits_required': 1
        },
        {
            'type': 'RZ',
            'name': 'RZ(theta)',
            'description': 'Z-axis rotation gate',
            'qubits_required': 1
        },
        {
            'type': 'P',
            'name': 'P(theta)',
            'description': 'Phase rotation gate',
            'qubits_required': 1
        },
        {
            'type': 'CNOT',
            'name': 'CNOT',
            'description': 'Controlled NOT gate',
            'qubits_required': 2
        },
        {
            'type': 'CCNOT',
            'name': 'CCNOT (Toffoli)',
            'description': 'Double-controlled NOT gate',
            'qubits_required': 3
        },
        {
            'type': 'SWAP',
            'name': 'SWAP',
            'description': 'Swap states of two qubits',
            'qubits_required': 2
        },
        {
            'type': 'QFT',
            'name': 'QFT',
            'description': 'Quantum Fourier Transform block (H, controlled-phase, swap) across the target qubits',
            'qubits_required': 2
        },
        {
            'type': 'IQFT',
            'name': 'Inverse QFT',
            'description': 'Inverse Quantum Fourier Transform block across the target qubits',
            'qubits_required': 2
        },
        {
            'type': 'BELL_PHI_PLUS',
            'name': 'Bell |Phi+>',
            'description': 'Bell-state block preparing (|00>+|11>)/sqrt(2) — H then CNOT',
            'qubits_required': 2
        },
        {
            'type': 'BELL_PHI_MINUS',
            'name': 'Bell |Phi->',
            'description': 'Bell-state block preparing (|00>-|11>)/sqrt(2) — X, H then CNOT',
            'qubits_required': 2
        },
        {
            'type': 'BELL_PSI_PLUS',
            'name': 'Bell |Psi+>',
            'description': 'Bell-state block preparing (|01>+|10>)/sqrt(2) — X on target, H then CNOT',
            'qubits_required': 2
        },
        {
            'type': 'BELL_PSI_MINUS',
            'name': 'Bell |Psi->',
            'description': 'Singlet Bell-state block preparing (|01>-|10>)/sqrt(2) — X on both, H then CNOT',
            'qubits_required': 2
        },
        {
            'type': 'Measure',
            'name': 'Measurement',
            'description': 'Measure qubit state',
            'qubits_required': 1
        },
        {
            'type': 'Reset',
            'name': 'Reset',
            'description': 'Reset qubit to |0>',
            'qubits_required': 1
        },
        {
            'type': 'Barrier',
            'name': 'Barrier |',
            'description': 'Circuit barrier separator',
            'qubits_required': 1
        },
    ]
    return jsonify(gates), 200


@app.route('/api/ai-explain', methods=['POST'])
def ai_explain():
    """
    AI explanation endpoint — proxies requests to OpenRouter API.
    Keeps the API key securely on the server.

    Expected JSON body:
    {
        "prompt": "User prompt text",
        "model": "openai/gpt-4o-mini"  (optional)
    }
    """
    try:
        data = request.get_json()
        if not data or not data.get('prompt'):
            return jsonify({'error': 'No prompt provided'}), 400

        api_key = os.environ.get('OPENROUTER_API_KEY', '')
        if not api_key:
            return jsonify({
                'error': 'OpenRouter API key not configured. '
                         'Set OPENROUTER_API_KEY in backend .env file.'
            }), 503

        model = data.get('model', 'openai/gpt-4o-mini')
        user_prompt = data['prompt']

        system_prompt = (
            'You are a quantum computing tutor designed for beginners. '
            'Follow these rules strictly:\n'
            '1. **Simple Explanation First**: Start with a plain-English analogy '
            'that a non-technical person can understand.\n'
            '2. **Technical Explanation**: Follow with a precise technical '
            'description using Dirac notation and matrix representations.\n'
            '3. **Step Insight**: If the user is asking about a specific step, '
            'explain what happens to the quantum state at that step.\n'
            '4. **Final Output Explanation**: Summarize what the circuit produces '
            'and what measurement outcomes mean.\n'
            '5. Keep answers concise but informative — 150-300 words.\n'
            '6. Use markdown formatting (bold, bullets) and USE LaTeX for math formulas using `$ ... $` (inline) and `$$ ... $$` (block).\n'
            '7. Be encouraging and supportive.'
        )

        logger.info(f'AI explain request — model={model}, prompt_len={len(user_prompt)}')

        response = http_requests.post(
            'https://openrouter.ai/api/v1/chat/completions',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
                'HTTP-Referer': 'http://localhost:5173',
                'X-Title': 'Quantum Logic Gate Simulator',
            },
            json={
                'model': model,
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt},
                ],
                'max_tokens': 1024,
                'temperature': 0.7,
            },
            timeout=30,
        )

        if response.status_code != 200:
            error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
            error_msg = error_data.get('error', {}).get('message', f'OpenRouter returned {response.status_code}')
            logger.error(f'OpenRouter error: {error_msg}')
            return jsonify({'error': error_msg}), response.status_code

        result = response.json()
        explanation = result.get('choices', [{}])[0].get('message', {}).get('content', '')

        if not explanation:
            return jsonify({'error': 'No explanation returned from AI'}), 502

        return jsonify({
            'explanation': explanation,
            'model': model,
        }), 200

    except http_requests.exceptions.Timeout:
        logger.error('OpenRouter request timed out')
        return jsonify({'error': 'AI request timed out. Please try again.'}), 504
    except http_requests.exceptions.ConnectionError:
        logger.error('Cannot connect to OpenRouter')
        return jsonify({'error': 'Cannot connect to AI service. Check your internet connection.'}), 503
    except Exception as e:
        logger.error(f'AI explain error: {e}')
        return jsonify({'error': f'AI service error: {str(e)}'}), 500


# =============================================================================
# MongoDB Atlas Persistence Endpoints
# =============================================================================

@app.route('/api/db/health', methods=['GET'])
@app.route('/db/health', methods=['GET'])
def db_health():
    if mongo_client:
        try:
            mongo_client.admin.command('ping')
            return jsonify({"status": "connected", "database": "tatva_db"}), 200
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    return jsonify({"status": "disconnected"}), 503


@app.route('/api/db/circuits', methods=['GET', 'POST'])
@app.route('/db/circuits', methods=['GET', 'POST'])
def handle_db_circuits():
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503

    if request.method == 'GET':
        try:
            circuits = list(mongo_db.circuits.find({}, {"_id": 0}).sort("updatedAt", -1).limit(100))
            return jsonify({"circuits": circuits}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.method == 'POST':
        try:
            data = request.get_json() or {}
            circuit_id = data.get("id") or str(int(time.time() * 1000))
            data["id"] = circuit_id
            data["updatedAt"] = data.get("updatedAt") or time.strftime("%Y-%m-%dT%H:%M:%SZ")
            mongo_db.circuits.update_one({"id": circuit_id}, {"$set": data}, upsert=True)
            return jsonify({"status": "success", "id": circuit_id, "circuit": data}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route('/api/db/circuits/<circuit_id>', methods=['DELETE'])
@app.route('/db/circuits/<circuit_id>', methods=['DELETE'])
def delete_db_circuit(circuit_id):
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503
    try:
        mongo_db.circuits.delete_one({"id": circuit_id})
        return jsonify({"status": "deleted", "id": circuit_id}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/db/history', methods=['GET', 'POST'])
@app.route('/db/history', methods=['GET', 'POST'])
def handle_db_history():
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503

    if request.method == 'GET':
        try:
            logs = list(mongo_db.history.find({}, {"_id": 0}).sort("timestamp", -1).limit(100))
            return jsonify({"history": logs}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    if request.method == 'POST':
        try:
            data = request.get_json() or {}
            data["timestamp"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            mongo_db.history.insert_one(data)
            return jsonify({"status": "logged"}), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500


# =============================================================================
# MongoDB Atlas User Authentication Endpoints
# =============================================================================

import hashlib

@app.route('/api/auth/register', methods=['POST'])
@app.route('/auth/register', methods=['POST'])
def auth_register():
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        name = data.get("name") or email.split("@")[0]

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        existing = mongo_db.users.find_one({"email": email})
        if existing:
            return jsonify({"error": "User already exists with this email"}), 409

        password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
        user_id = f"user-{int(time.time() * 1000)}"

        user_doc = {
            "id": user_id,
            "name": name,
            "email": email,
            "password_hash": password_hash,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "lastLogin": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }

        mongo_db.users.insert_one(user_doc)

        return jsonify({
            "status": "success",
            "user": {"id": user_id, "name": name, "email": email},
            "token": f"tatva-token-{user_id}"
        }), 201
    except Exception as e:
        logger.error(f"Register Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/auth/login', methods=['POST'])
@app.route('/auth/login', methods=['POST'])
def auth_login():
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        password_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
        user = mongo_db.users.find_one({"email": email})

        if not user or user.get("password_hash") != password_hash:
            return jsonify({"error": "Invalid email or password"}), 401

        mongo_db.users.update_one({"email": email}, {"$set": {"lastLogin": time.strftime("%Y-%m-%dT%H:%M:%SZ")}})

        return jsonify({
            "status": "success",
            "user": {"id": user.get("id"), "name": user.get("name"), "email": user.get("email")},
            "token": f"tatva-token-{user.get('id')}"
        }), 200
    except Exception as e:
        logger.error(f"Login Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/auth/google', methods=['POST'])
@app.route('/auth/google', methods=['POST'])
def auth_google():
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503
    try:
        data = request.get_json() or {}
        credential = data.get("credential")
        is_register = data.get("isRegister", False)
        
        email = None
        name = None
        google_id = None

        if credential and isinstance(credential, str):
            try:
                import base64, json
                parts = credential.split('.')
                if len(parts) >= 2:
                    payload_b64 = parts[1]
                    payload_b64 += '=' * (-len(payload_b64) % 4)
                    decoded = json.loads(base64.b64decode(payload_b64).decode('utf-8'))
                    email = decoded.get('email')
                    name = decoded.get('name')
                    google_id = decoded.get('sub')
            except Exception as parse_err:
                logger.warning(f"Could not parse Google JWT: {parse_err}")

        if not email:
            email = (data.get("email") or "").strip().lower()
            name = data.get("name") or (email.split("@")[0] if email else "Google User")
            google_id = data.get("googleId") or str(int(time.time()))

        if not email:
            return jsonify({"error": "Valid Google account email is required"}), 400

        existing = mongo_db.users.find_one({"email": email})

        # STRICT SIGN IN vs SIGN UP VALIDATION:
        if is_register:
            # SIGN UP FLOW: User must NOT exist yet
            if existing:
                return jsonify({
                    "error": "An account with this Google email already exists. Please Sign In instead."
                }), 409

            # Save NEW Google user to MongoDB Atlas
            user_id = f"google-user-{int(time.time() * 1000)}"
            user_doc = {
                "id": user_id,
                "name": name,
                "email": email,
                "googleId": google_id,
                "authProvider": "google",
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "lastLogin": time.strftime("%Y-%m-%dT%H:%M:%SZ")
            }
            mongo_db.users.insert_one(user_doc)
            user_info = {"id": user_id, "name": name, "email": email}

            logger.info(f"Registered new Google user in MongoDB Atlas: {email}")
            return jsonify({
                "status": "success",
                "message": "Account created successfully with Google",
                "user": user_info,
                "token": f"tatva-google-token-{user_id}"
            }), 201

        else:
            # SIGN IN FLOW: User MUST ALREADY EXIST
            if not existing:
                return jsonify({
                    "error": "No registered account found for this Google email. Please Sign Up first!"
                }), 404

            user_id = existing.get("id")
            mongo_db.users.update_one(
                {"email": email},
                {"$set": {"lastLogin": time.strftime("%Y-%m-%dT%H:%M:%SZ"), "googleId": google_id, "authProvider": "google"}}
            )
            user_info = {"id": user_id, "name": existing.get("name", name), "email": email}

            logger.info(f"User logged in with Google: {email}")
            return jsonify({
                "status": "success",
                "user": user_info,
                "token": f"tatva-google-token-{user_id}"
            }), 200

    except Exception as e:
        logger.error(f"Google Auth Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/auth/forgot-password', methods=['POST'])
@app.route('/auth/forgot-password', methods=['POST'])
def auth_forgot_password():
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()

        if not email:
            return jsonify({"error": "Email address is required"}), 400

        user = mongo_db.users.find_one({"email": email})
        if not user:
            return jsonify({"error": "No registered user found with this email"}), 444

        # Generate 6-digit OTP code
        otp = str(random.randint(100000, 999999))
        otp_expiry = time.time() + 600  # 10 minutes expiry

        mongo_db.users.update_one(
            {"email": email},
            {"$set": {"resetOtp": otp, "otpExpiry": otp_expiry}}
        )

        logger.info(f"[FORGOT PASSWORD] Verification OTP for {email} is: {otp}")

        return jsonify({
            "status": "otp_sent",
            "message": f"Verification code sent to {email}",
            "otp": otp  # Included in response for seamless UI verification demo
        }), 200
    except Exception as e:
        logger.error(f"Forgot Password Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/auth/reset-password', methods=['POST'])
@app.route('/auth/reset-password', methods=['POST'])
def auth_reset_password():
    if mongo_db is None:
        return jsonify({"error": "Database disconnected"}), 503
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        otp = (data.get("otp") or "").strip()
        new_password = data.get("newPassword") or ""

        if not email or not otp or not new_password:
            return jsonify({"error": "Email, verification OTP, and new password are required"}), 400

        user = mongo_db.users.find_one({"email": email})
        if not user:
            return jsonify({"error": "User not found"}), 404

        saved_otp = user.get("resetOtp")
        otp_expiry = user.get("otpExpiry", 0)

        if not saved_otp or saved_otp != otp:
            return jsonify({"error": "Invalid verification code"}), 400

        if time.time() > otp_expiry:
            return jsonify({"error": "Verification code has expired. Please request a new one."}), 400

        # Update password hash in MongoDB Atlas directly
        new_hash = hashlib.sha256(new_password.encode('utf-8')).hexdigest()
        mongo_db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "password_hash": new_hash,
                    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ")
                },
                "$unset": {"resetOtp": "", "otpExpiry": ""}
            }
        )

        return jsonify({
            "status": "success",
            "message": "Password updated successfully in database. You can now log in.",
            "user": {"id": user.get("id"), "name": user.get("name"), "email": user.get("email")}
        }), 200
    except Exception as e:
        logger.error(f"Reset Password Error: {e}")
        return jsonify({"error": str(e)}), 500




@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)