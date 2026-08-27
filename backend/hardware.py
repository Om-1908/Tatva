"""
Real IBM Quantum hardware execution — isolated from the local Aer simulation
path in app.py.

Everything the app already does (/simulate, /encode, /kernel) keeps running on
the local qiskit-aer simulator and does NOT depend on anything here. This module
is imported lazily and every entry point degrades gracefully: if
`qiskit-ibm-runtime` is not installed or no IBM Quantum token is configured, the
functions raise `HardwareError` with a human-readable message that the Flask
routes turn into a clean 4xx/5xx response — the rest of the app is unaffected.

Modern IBM stack (the only one that still reaches real hardware):
    qiskit-ibm-runtime : QiskitRuntimeService + SamplerV2
    qiskit             : generate_preset_pass_manager (transpile to the ISA /
                         "hardware-compatible" circuit)

Configuration (backend/.env):
    IBM_QUANTUM_TOKEN    — your API token from https://quantum.cloud.ibm.com
    IBM_QUANTUM_INSTANCE — (optional) instance CRN, if your account needs one
    IBM_QUANTUM_CHANNEL  — (optional) defaults to "ibm_quantum_platform"
"""

import logging
import os
import statistics
import time

logger = logging.getLogger(__name__)

# Default optimization level for the preset transpiler pass manager. Level 1 is
# a good balance: it maps the circuit onto the device coupling map and basis
# gates (making it "compatible") without the long compile times of level 3.
DEFAULT_OPT_LEVEL = 1


class HardwareError(Exception):
    """Raised for any expected, user-facing hardware problem.

    Carries an HTTP status hint so the Flask layer can pick an appropriate code
    (503 for "not configured / can't connect", 400 for bad input, 404 for an
    unknown job, 500 otherwise).
    """

    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


# --------------------------------------------------------------------------- #
# Service acquisition
# --------------------------------------------------------------------------- #

# Cache the authenticated service on a warm process so we don't re-authenticate
# on every poll. On a cold start (e.g. a fresh Cloud Run instance) this is None
# and gets rebuilt once.
_service = None


def _import_runtime():
    """Import qiskit-ibm-runtime, or raise a friendly HardwareError."""
    try:
        from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2
        return QiskitRuntimeService, SamplerV2
    except ImportError as exc:  # library not installed
        raise HardwareError(
            'IBM Quantum support is not installed on the server. '
            'Add "qiskit-ibm-runtime" to requirements.txt and reinstall.',
            status=503,
        ) from exc


def get_service(force_new=False):
    """Return an authenticated QiskitRuntimeService (cached).

    Reads the token/instance/channel from the environment. Raises HardwareError
    with status 503 if no token is configured or authentication fails.
    """
    global _service
    if _service is not None and not force_new:
        return _service

    QiskitRuntimeService, _ = _import_runtime()

    token = os.environ.get('IBM_QUANTUM_TOKEN', '').strip()
    if not token:
        raise HardwareError(
            'No IBM Quantum token configured. Set IBM_QUANTUM_TOKEN in the '
            'backend .env file (get one at https://quantum.cloud.ibm.com).',
            status=503,
        )

    channel = os.environ.get('IBM_QUANTUM_CHANNEL', 'ibm_quantum_platform').strip()
    instance = os.environ.get('IBM_QUANTUM_INSTANCE', '').strip() or None

    kwargs = {'channel': channel, 'token': token}
    if instance:
        kwargs['instance'] = instance

    try:
        _service = QiskitRuntimeService(**kwargs)
    except Exception as exc:  # bad token, network, wrong channel, etc.
        logger.error('Failed to init QiskitRuntimeService: %s', exc)
        raise HardwareError(
            f'Could not connect to IBM Quantum: {exc}', status=503
        ) from exc
    return _service


# --------------------------------------------------------------------------- #
# Backend listing
# --------------------------------------------------------------------------- #

def list_backends(min_qubits=1):
    """List operational real devices, with live queue sizes.

    Returns a dict:
        {
          "backends": [
            {"name", "num_qubits", "pending_jobs", "operational", "simulator"},
            ...   # sorted least-busy first
          ],
          "least_busy": "<name or None>"
        }
    """
    service = get_service()

    try:
        # simulator=False -> real QPUs only; operational=True -> currently up.
        backends = service.backends(operational=True, simulator=False,
                                    min_num_qubits=min_qubits)
    except TypeError:
        # Older signatures may not accept every kwarg; fall back to a plain call.
        backends = service.backends()
    except Exception as exc:
        raise HardwareError(f'Could not list backends: {exc}', status=502) from exc

    out = []
    for b in backends:
        try:
            status = b.status()
            out.append({
                'name': getattr(b, 'name', str(b)),
                'num_qubits': getattr(b, 'num_qubits', None),
                'pending_jobs': getattr(status, 'pending_jobs', None),
                'operational': getattr(status, 'operational', True),
                'simulator': False,
            })
        except Exception as exc:
            # A single flaky backend shouldn't sink the whole list.
            logger.warning('Skipping backend %s: %s', b, exc)

    # Least-busy first so the UI can highlight / default sensibly, even though
    # the user picks explicitly.
    out.sort(key=lambda d: (d['pending_jobs'] is None, d['pending_jobs'] or 0))
    least_busy = out[0]['name'] if out else None

    if not out:
        raise HardwareError('No operational real backends are available right now.',
                            status=503)

    return {'backends': out, 'least_busy': least_busy}


# --------------------------------------------------------------------------- #
# Backend telemetry (calibration data)
# --------------------------------------------------------------------------- #

# Calibration data only changes ~1-2x/day and pulling per-qubit properties for
# a 127-qubit device is slow, so cache the assembled payload per backend for a
# couple of minutes. Live-ish fields (pending_jobs, operational) ride along at
# the same TTL, which is fine for a status readout.
TELEMETRY_TTL = 120  # seconds
_telemetry_cache = {}  # backend_name -> (monotonic_timestamp, payload)


def _median_or_none(values):
    """Median of the non-null entries, or None if there are none."""
    vals = [v for v in values if v is not None]
    return statistics.median(vals) if vals else None


def _first_supported(names, candidates):
    """First candidate gate name the backend actually supports, else None."""
    for gate in candidates:
        if gate in names:
            return gate
    return None


def _telemetry_from_properties(props, num_qubits, gate_1q, gate_2q):
    """Read T1/T2/readout/gate errors from a BackendProperties object.

    Every individual read is best-effort: a missing datum becomes None rather
    than sinking the whole payload.
    """
    qubits = []
    for q in range(num_qubits):
        entry = {'index': q, 't1_us': None, 't2_us': None, 'readout_error': None}
        try:
            entry['t1_us'] = round(props.t1(q) * 1e6, 2)
        except Exception:
            pass
        try:
            entry['t2_us'] = round(props.t2(q) * 1e6, 2)
        except Exception:
            pass
        try:
            entry['readout_error'] = float(props.readout_error(q))
        except Exception:
            pass
        qubits.append(entry)

    errors_1q = []
    if gate_1q:
        for q in range(num_qubits):
            err = None
            try:
                err = float(props.gate_error(gate_1q, q))
            except Exception:
                pass
            errors_1q.append({'qubit': q, 'error': err})

    pairs_2q = []
    if gate_2q:
        try:
            for gate in props.gates:
                if gate.gate == gate_2q and len(gate.qubits) == 2:
                    err = None
                    for param in gate.parameters:
                        if param.name == 'gate_error':
                            err = float(param.value)
                            break
                    pairs_2q.append({'qubits': list(gate.qubits), 'error': err})
        except Exception as exc:
            logger.warning('Could not read 2q gate errors from properties: %s', exc)

    return qubits, errors_1q, pairs_2q


def _telemetry_from_target(target, num_qubits, gate_1q, gate_2q):
    """Fallback: read the same data from backend.target (always present)."""
    qubit_props = getattr(target, 'qubit_properties', None) or []

    qubits = []
    for q in range(num_qubits):
        entry = {'index': q, 't1_us': None, 't2_us': None, 'readout_error': None}
        if q < len(qubit_props) and qubit_props[q] is not None:
            t1 = getattr(qubit_props[q], 't1', None)
            t2 = getattr(qubit_props[q], 't2', None)
            if t1 is not None:
                entry['t1_us'] = round(t1 * 1e6, 2)
            if t2 is not None:
                entry['t2_us'] = round(t2 * 1e6, 2)
        try:
            meas = target['measure'].get((q,))
            if meas is not None and meas.error is not None:
                entry['readout_error'] = float(meas.error)
        except Exception:
            pass
        qubits.append(entry)

    errors_1q = []
    if gate_1q:
        try:
            inst_map = target[gate_1q]
        except Exception:
            inst_map = {}
        for q in range(num_qubits):
            err = None
            inst = inst_map.get((q,)) if inst_map else None
            if inst is not None and getattr(inst, 'error', None) is not None:
                err = float(inst.error)
            errors_1q.append({'qubit': q, 'error': err})

    pairs_2q = []
    if gate_2q:
        try:
            for qargs, inst in target[gate_2q].items():
                if qargs is None or len(qargs) != 2:
                    continue
                err = getattr(inst, 'error', None)
                pairs_2q.append({
                    'qubits': [int(qargs[0]), int(qargs[1])],
                    'error': float(err) if err is not None else None,
                })
        except Exception as exc:
            logger.warning('Could not read 2q gate errors from target: %s', exc)

    return qubits, errors_1q, pairs_2q


def get_backend_telemetry(backend_name):
    """Live calibration snapshot for one device: T1/T2, readout & gate errors.

    Tries backend.properties() first (richest source, includes the calibration
    timestamp) and falls back to backend.target where properties are missing.
    Cached in-process for TELEMETRY_TTL seconds per backend.

    Returns:
        {
          "backend":  {name, num_qubits, operational, pending_jobs,
                       status_msg, last_calibration},
          "qubits":   [{index, t1_us, t2_us, readout_error}, ...],
          "gate_1q":  {gate, errors: [{qubit, error}, ...]},
          "gate_2q":  {gate, pairs: [{qubits: [a, b], error}, ...]},
          "medians":  {t1_us, t2_us, readout_error,
                       gate_1q_error, gate_2q_error}
        }
    Times in microseconds; errors as fractions (0-1); missing data is null.
    """
    cached = _telemetry_cache.get(backend_name)
    if cached and time.monotonic() - cached[0] < TELEMETRY_TTL:
        return cached[1]

    service = get_service()

    try:
        backend = service.backend(backend_name)
    except Exception as exc:
        raise HardwareError(
            f'Backend "{backend_name}" is not available: {exc}', status=400
        ) from exc

    num_qubits = int(getattr(backend, 'num_qubits', 0) or 0)

    # Live status (cheap call).
    operational, pending_jobs, status_msg = True, None, None
    try:
        status = backend.status()
        operational = bool(getattr(status, 'operational', True))
        pending_jobs = getattr(status, 'pending_jobs', None)
        status_msg = getattr(status, 'status_msg', None)
    except Exception as exc:
        logger.warning('Could not read status for %s: %s', backend_name, exc)

    # Which native gates to report errors for — devices differ (ecr vs cz...).
    op_names = set(getattr(backend, 'operation_names', None) or [])
    gate_1q = _first_supported(op_names, ('sx', 'x', 'rz'))
    gate_2q = _first_supported(op_names, ('ecr', 'cz', 'cx'))

    # Calibration data: properties() is the richest source but may be absent;
    # target always exists on IBMBackend.
    props = None
    try:
        props = backend.properties()
    except Exception as exc:
        logger.warning('backend.properties() failed for %s: %s', backend_name, exc)

    last_calibration = None
    if props is not None:
        try:
            last_calibration = props.last_update_date.isoformat()
        except Exception:
            pass
        qubits, errors_1q, pairs_2q = _telemetry_from_properties(
            props, num_qubits, gate_1q, gate_2q)
    else:
        try:
            target = backend.target
        except Exception as exc:
            raise HardwareError(
                f'No calibration data available for "{backend_name}": {exc}',
                status=502) from exc
        qubits, errors_1q, pairs_2q = _telemetry_from_target(
            target, num_qubits, gate_1q, gate_2q)

    payload = {
        'backend': {
            'name': backend_name,
            'num_qubits': num_qubits,
            'operational': operational,
            'pending_jobs': pending_jobs,
            'status_msg': status_msg,
            'last_calibration': last_calibration,
        },
        'qubits': qubits,
        'gate_1q': {'gate': gate_1q, 'errors': errors_1q},
        'gate_2q': {'gate': gate_2q, 'pairs': pairs_2q},
        'medians': {
            't1_us': _median_or_none([q['t1_us'] for q in qubits]),
            't2_us': _median_or_none([q['t2_us'] for q in qubits]),
            'readout_error': _median_or_none([q['readout_error'] for q in qubits]),
            'gate_1q_error': _median_or_none([e['error'] for e in errors_1q]),
            'gate_2q_error': _median_or_none([p['error'] for p in pairs_2q]),
        },
    }

    _telemetry_cache[backend_name] = (time.monotonic(), payload)
    return payload


# --------------------------------------------------------------------------- #
# Job submission
# --------------------------------------------------------------------------- #

def _transpile_summary(isa_circuit, original):
    """Build a small, JSON-serializable description of the compiled circuit.

    This is the "hardware-compatible transcript": the circuit after it has been
    mapped onto the device's basis gates and connectivity. We surface depth,
    gate counts and (best-effort) OpenQASM 3 so the UI can show the user exactly
    what will run on the QPU.
    """
    def op_counts(circ):
        try:
            return {str(k): int(v) for k, v in circ.count_ops().items()}
        except Exception:
            return {}

    qasm = None
    try:
        from qiskit import qasm3
        qasm = qasm3.dumps(isa_circuit)
    except Exception as exc:  # some ISA circuits/gates don't round-trip cleanly
        logger.warning('QASM3 export of ISA circuit failed: %s', exc)

    return {
        'original': {
            'num_qubits': original.num_qubits,
            'depth': int(original.depth()),
            'size': int(original.size()),
            'ops': op_counts(original),
        },
        'compiled': {
            'num_qubits': isa_circuit.num_qubits,
            'depth': int(isa_circuit.depth()),
            'size': int(isa_circuit.size()),
            'ops': op_counts(isa_circuit),
        },
        'qasm3': qasm,
    }


def submit_job(qc, backend_name, shots=1024):
    """Transpile `qc` for `backend_name` and submit it via SamplerV2.

    Non-blocking: returns as soon as the job is accepted onto the queue.

    Returns:
        {
          "job_id": "...",
          "backend": "<name>",
          "shots": <int>,
          "transpiled": {... see _transpile_summary ...}
        }
    """
    _, SamplerV2 = _import_runtime()
    service = get_service()

    try:
        backend = service.backend(backend_name)
    except Exception as exc:
        raise HardwareError(
            f'Backend "{backend_name}" is not available: {exc}', status=400
        ) from exc

    # Fail early with a clear message if the circuit is too wide for the device.
    dev_qubits = getattr(backend, 'num_qubits', None)
    if dev_qubits is not None and qc.num_qubits > dev_qubits:
        raise HardwareError(
            f'Circuit needs {qc.num_qubits} qubits but "{backend_name}" has '
            f'only {dev_qubits}.', status=400)

    # Transpile to the device ISA (basis gates + coupling map) — this is what
    # makes the circuit "compatible" with the hardware.
    try:
        from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
        pm = generate_preset_pass_manager(
            optimization_level=DEFAULT_OPT_LEVEL, backend=backend)
        isa_circuit = pm.run(qc)
    except Exception as exc:
        logger.error('Transpilation failed: %s', exc)
        raise HardwareError(f'Could not compile circuit for hardware: {exc}',
                            status=400) from exc

    transpiled = _transpile_summary(isa_circuit, qc)

    # Submit through SamplerV2 bound to the chosen backend.
    try:
        try:
            sampler = SamplerV2(mode=backend)      # newer runtime signature
        except TypeError:
            sampler = SamplerV2(backend=backend)   # older positional/kw signature
        job = sampler.run([isa_circuit], shots=int(shots))
    except Exception as exc:
        logger.error('Job submission failed: %s', exc)
        raise HardwareError(f'Could not submit job to IBM Quantum: {exc}',
                            status=502) from exc

    job_id = job.job_id() if callable(getattr(job, 'job_id', None)) else str(job.job_id)
    logger.info('Submitted job %s to %s (%d shots)', job_id, backend_name, shots)

    return {
        'job_id': job_id,
        'backend': backend_name,
        'shots': int(shots),
        'transpiled': transpiled,
    }


# --------------------------------------------------------------------------- #
# Job status / results
# --------------------------------------------------------------------------- #

# Map the various status spellings the runtime has used across versions onto a
# small, stable vocabulary the frontend switches on.
_STATUS_ALIASES = {
    'INITIALIZING': 'QUEUED',
    'QUEUED': 'QUEUED',
    'VALIDATING': 'QUEUED',
    'RUNNING': 'RUNNING',
    'DONE': 'DONE',
    'COMPLETED': 'DONE',
    'CANCELLED': 'CANCELLED',
    'CANCELED': 'CANCELLED',
    'ERROR': 'ERROR',
    'FAILED': 'ERROR',
}


def _normalize_status(raw):
    """Coerce a JobStatus enum / string into one of QUEUED/RUNNING/DONE/…"""
    name = getattr(raw, 'name', None) or str(raw)
    name = str(name).upper().strip()
    return _STATUS_ALIASES.get(name, name)


def _queue_position(job):
    """Best-effort queue position — the runtime API for this has moved around."""
    # Direct method (older RuntimeJob).
    fn = getattr(job, 'queue_position', None)
    if callable(fn):
        try:
            pos = fn(refresh=True)
            if pos is not None:
                return int(pos)
        except Exception:
            pass
    # Newer builds expose it inside metrics().
    metrics = getattr(job, 'metrics', None)
    if callable(metrics):
        try:
            m = metrics() or {}
            pos = m.get('position_in_queue') or m.get('usage', {}).get('position')
            if pos is not None:
                return int(pos)
        except Exception:
            pass
    return None


def _extract_counts(job):
    """Pull measurement counts out of a finished SamplerV2 result.

    SamplerV2 returns one PubResult per submitted circuit; the measured bits
    live in a DataBin whose field is named after the circuit's classical
    register (default "c" for QuantumCircuit(n, n)). Register naming has varied,
    so we try the common names and then fall back to scanning every field for
    one that can produce counts.
    """
    result = job.result()
    pub = result[0]
    data = pub.data

    for name in ('c', 'meas', 'cr', 'c0', 'classical'):
        field = getattr(data, name, None)
        if field is not None and hasattr(field, 'get_counts'):
            return dict(field.get_counts())

    # Fallback: introspect whatever fields the DataBin carries.
    candidates = {}
    try:
        candidates = vars(data)
    except TypeError:
        for key in getattr(data, 'keys', lambda: [])():
            candidates[key] = getattr(data, key, None)

    for value in candidates.values():
        if hasattr(value, 'get_counts'):
            return dict(value.get_counts())

    raise HardwareError('Job finished but no measurement data was returned.',
                        status=502)


def job_status(job_id):
    """Return the live status (and results, once DONE) for a job id.

    Stateless-friendly: rebuilds the job handle from its id, so it works even if
    a different/cold server process handles the poll than the one that submitted.

    Returns:
        {
          "job_id", "status": QUEUED|RUNNING|DONE|CANCELLED|ERROR,
          "queue_position": <int|null>,     # when QUEUED
          "backend": "<name|null>",
          "counts": {...},                  # when DONE
          "shots": <int|null>,              # when DONE
          "error": "<message>"              # when ERROR
        }
    """
    service = get_service()

    try:
        job = service.job(job_id)
    except Exception as exc:
        raise HardwareError(f'Job "{job_id}" was not found: {exc}', status=404) from exc

    status = _normalize_status(job.status())

    backend_name = None
    try:
        b = job.backend()
        backend_name = getattr(b, 'name', None) or (b if isinstance(b, str) else None)
    except Exception:
        pass

    payload = {
        'job_id': job_id,
        'status': status,
        'backend': backend_name,
        'queue_position': None,
    }

    if status == 'QUEUED':
        payload['queue_position'] = _queue_position(job)

    elif status == 'DONE':
        counts = _extract_counts(job)
        total = sum(counts.values()) or 1
        payload['counts'] = counts
        payload['shots'] = total
        payload['probabilities'] = {
            state: c / total for state, c in counts.items()
        }

    elif status == 'ERROR':
        try:
            payload['error'] = str(job.error_message() or 'Job failed on hardware.')
        except Exception:
            payload['error'] = 'Job failed on hardware.'

    return payload
