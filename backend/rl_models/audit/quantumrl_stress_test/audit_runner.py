"""
audit_runner.py
---------------
AUDIT-ONLY script for the TATVA QuantumRL 20-Vector Stress Test Audit.

SAFETY CONTRACT
===============
- This file is NEW and ISOLATED — it is NOT wired into the production application.
- It does NOT modify any existing application source file.
- It does NOT change the winner-selection algorithm, thresholds, rewards, training,
  circuit construction, fidelity calculation, APIs, database schema, UI, or deployment.
- It calls the existing tatva_synthesize.py workers (_worker_dqn, _worker_ppo,
  decide_winner) EXACTLY as they are, via import — no monkey-patching.
- All 20 test vectors are embedded verbatim from the audit specification file.

ENVIRONMENT USED:
  torch  : 2.6.0+cpu
  qiskit : 2.5.0
  numpy  : 2.2.6
  CUDA   : False (CPU only)
"""

import sys
import os
import json
import time
import math
import csv
import io
import warnings
import traceback
import datetime

import numpy as np

warnings.filterwarnings("ignore")
os.environ["PYTHONWARNINGS"] = "ignore"

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
RL_ROOT      = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
QUANTUMRL    = os.path.join(RL_ROOT, "quantumrl")
AUDIT_DIR    = SCRIPT_DIR

for p in [RL_ROOT, QUANTUMRL]:
    if p not in sys.path:
        sys.path.insert(0, p)

from tatva_synthesize import _worker_dqn, _worker_ppo, decide_winner
from concurrent.futures import ProcessPoolExecutor

TEST_VECTORS = [
    {"id":"T1-A","qubits":1,"desc":"Unequal complex amplitudes","sv":[-0.668485603970+0.066433218476j,0.625097985526-0.397449535488j]},
    {"id":"T1-B","qubits":1,"desc":"Balanced phase-only state","sv":[0.260597391013-0.657334769959j,0.421100224475+0.568044541341j]},
    {"id":"T1-C","qubits":1,"desc":"Near-basis perturbation","sv":[0.089758539294+0.092003298907j,-0.985286908057-0.112643270665j]},
    {"id":"T1-D","qubits":1,"desc":"Sparse superposition","sv":[0.381954490176-0.410319070642j,-0.591474694069+0.579574597423j]},
    {"id":"T1-E","qubits":1,"desc":"Arbitrary complex state","sv":[-0.546497074313-0.641342628193j,-0.420562070352+0.336374978276j]},
    {"id":"T2-A","qubits":2,"desc":"Sparse amplitudes","sv":[-0.233158029118-0.479703961438j,0.408182212335-0.298373076710j,0.220089046733-0.319974132356j,-0.427019025124+0.355969591088j]},
    {"id":"T2-B","qubits":2,"desc":"Balanced complex phases","sv":[-0.460511415821-0.194754296225j,-0.398015353577-0.302628118847j,-0.462799446002-0.189252933347j,-0.459169712058+0.197896881049j]},
    {"id":"T2-C","qubits":2,"desc":"Highly skewed amplitudes","sv":[-0.127301088163+0.238867120951j,-0.101101442832-0.512721825337j,-0.115502322037-0.683604537467j,0.037251400023-0.414231991420j]},
    {"id":"T2-D","qubits":2,"desc":"Near-basis perturbation","sv":[-0.034919631410-0.106183513090j,0.248704325480+0.956505469310j,-0.084465067134-0.027302080277j,-0.026585978999+0.046503345315j]},
    {"id":"T2-E","qubits":2,"desc":"Arbitrary complex state","sv":[0.118031361505+0.051637796046j,0.171426179128-0.860215376222j,0.364200389947+0.016733638822j,-0.082632247260-0.272570505280j]},
    {"id":"T3-A","qubits":3,"desc":"Sparse amplitudes","sv":[0+0j,0+0j,-0.435078543721+0.709027482506j,0.495572158975+0.182963106584j,0+0j,0+0j,0.096596528001+0.027840740618j,-0.116959543524-0.071651209621j]},
    {"id":"T3-B","qubits":3,"desc":"Balanced complex phases","sv":[0.112377749744+0.335218199629j,-0.248700749162-0.251292533447j,-0.077767301213+0.344894544553j,-0.318666565199-0.153139218440j,-0.353540711925+0.002994162897j,-0.165372034092+0.312493344474j,0.217113814341+0.279036900109j,0.353463619979+0.007966765431j]},
    {"id":"T3-C","qubits":3,"desc":"Phase-structured state","sv":[-0.003886181653+0.156565572037j,0.007197738410+0.441942485796j,-0.021777186457+0.314861748926j,0.459644956901+0.009545883264j,-0.255463108228+0.008345554231j,0.330582742999+0.031062233791j,-0.380939060763+0.029447277869j,-0.029501924421-0.383011018072j]},
    {"id":"T3-D","qubits":3,"desc":"Highly skewed amplitudes","sv":[-0.002560409057+0.001410367213j,-0.382296276014+0.057512215336j,0.014646400572+0.091939762661j,-0.034450941388-0.572684723557j,-0.056947204480-0.340915311209j,0.145108531511+0.386559992126j,0.035927499131+0.041490940120j,0.273452273288-0.380751210925j]},
    {"id":"T3-E","qubits":3,"desc":"Arbitrary complex state","sv":[0.011254040403-0.066069554650j,0.024099480908+0.125571290318j,0.342274321675-0.028999982364j,0.032074531070+0.128203499692j,-0.168670458872+0.262302066903j,0.634950466900+0.093330820974j,0.500020477306+0.052718731051j,-0.210751001933-0.193290043086j]},
    {"id":"T4-A","qubits":4,"desc":"Sparse amplitudes","sv":[0.499530819760+0.091528130359j,0+0j,0.162122212545+0.222919447588j,0+0j,0+0j,0+0j,0+0j,0+0j,0+0j,0+0j,0.268521734751-0.363362614642j,0+0j,0+0j,0.604952935500-0.309855617386j,0+0j,0+0j]},
    {"id":"T4-B","qubits":4,"desc":"Balanced complex phases","sv":[0.159328143434+0.192651350138j,0.180648447834-0.172818223273j,-0.093686422774+0.231781910830j,0.064150049278+0.241629408760j,0.099835534121-0.229200493295j,-0.161455608179+0.190871911468j,0.179637257787-0.173869076074j,0.209533937963-0.136365423923j,-0.152239427689+0.198300672356j,-0.039108826739+0.246922051812j,0.156359867095+0.195068172601j,-0.077593684580+0.237653571640j,0.073087344059-0.239077895545j,-0.084499736430-0.235286622108j,0.159904363483+0.192173345028j,-0.157160275083+0.194423887256j]},
    {"id":"T4-C","qubits":4,"desc":"Phase-structured state","sv":[0.043527414696-0.409580182025j,0.319463112667-0.061422610718j,-0.028760399003-0.286369260771j,-0.010325870144+0.142151501372j,-0.036615766011+0.396961421434j,-0.001124373793-0.148568106055j,0.176535834186-0.011585115266j,0.001490893079+0.122694387778j,0.003931848288-0.086837463280j,-0.014303354036+0.144430795664j,-0.007843036354+0.304863026242j,0.416240933134-0.005045710419j,-0.185236248788+0.019027806261j,0.110295593052+0.001025692730j,0.187942478954-0.007987845165j,-0.008523743863-0.129685099535j]},
    {"id":"T4-D","qubits":4,"desc":"Highly skewed amplitudes","sv":[-0.163333324919-0.241533282224j,-0.073286712478+0.123554832161j,0.110292011918+0.035037360558j,-0.067018798349+0.192235194336j,-0.035786316192-0.043567010944j,-0.019032928146-0.013016374369j,-0.230391998193+0.059002367390j,-0.152147447473+0.110996377122j,0.021351473971+0.191478897323j,0.002251897253-0.167688109230j,0.245444916100+0.147415859497j,0.247799122130+0.060581663659j,-0.114317243461-0.058919052044j,0.222723531012+0.042785016109j,0.500440597875-0.449064925206j,0.075774096549+0.075209498240j]},
    {"id":"T4-E","qubits":4,"desc":"Arbitrary complex state","sv":[0.037179252746-0.075350126382j,0.479609031187-0.133993222611j,0.193030615804+0.131204903672j,0.093726958236+0.116126885375j,-0.483049955892-0.091118466202j,-0.221806855810-0.069905442854j,0.115432881064+0.084525010580j,0.046975255986-0.018255702677j,-0.120404153838+0.206944333614j,-0.068914211945+0.060556392052j,0.027624341653+0.116405699763j,-0.357816842172-0.062178026489j,0.102217905674-0.082570609983j,-0.071775885277-0.199955520808j,-0.108679287433-0.000113985612j,-0.201474831758-0.150750781408j]},
]

def threshold_for(n):
    return 0.999 if n == 1 else 0.999999

def verify_fidelity_independent(target_sv, display_lines, qubits):
    try:
        from qiskit import QuantumCircuit
        from qiskit.quantum_info import Statevector
        qc = QuantumCircuit(qubits)
        for line in display_lines:
            line = line.strip()
            if not line: continue
            dot = line.find('. ')
            if dot != -1: line = line[dot+2:].strip()
            paren = line.find('(')
            if paren == -1: continue
            gname = line[:paren].upper().strip()
            inner = line[paren+1:].rstrip(')')
            parts = [p.strip() for p in inner.split(',')]
            qubits_in_gate, angle = [], None
            for p in parts:
                if p.startswith('q'):
                    try: qubits_in_gate.append(int(p[1:]))
                    except: pass
                elif p.startswith('angle='):
                    try: angle = float(p.split('=')[1])
                    except: pass
            if not qubits_in_gate: continue
            q0 = qubits_in_gate[0]
            q1 = qubits_in_gate[1] if len(qubits_in_gate) > 1 else None
            if gname == 'H': qc.h(q0)
            elif gname == 'X': qc.x(q0)
            elif gname == 'Y': qc.y(q0)
            elif gname == 'Z': qc.z(q0)
            elif gname == 'S': qc.s(q0)
            elif gname in ('SDG','SG'): qc.sdg(q0)
            elif gname == 'T': qc.t(q0)
            elif gname in ('TDG','TG'): qc.tdg(q0)
            elif gname in ('RX','RY','RZ'):
                a = angle if angle is not None else 0.0
                getattr(qc, gname.lower())(a, q0)
            elif gname in ('CNOT','CX'):
                if q1 is not None: qc.cx(q0, q1)
            elif gname == 'CZ':
                if q1 is not None: qc.cz(q0, q1)
            elif gname == 'SWAP':
                if q1 is not None: qc.swap(q0, q1)
            else:
                return None, f"UNVERIFIED: unknown gate '{gname}'"
        sv_out = Statevector.from_instruction(qc).data
        tn = np.linalg.norm(target_sv)
        on = np.linalg.norm(sv_out)
        fid = float(abs(np.vdot(target_sv/tn, sv_out/on))**2)
        return fid, f"OK (tnorm={tn:.8f} onorm={on:.8f})"
    except Exception as e:
        return None, f"UNVERIFIED: {e}"

def derive_cascade_winner(dqn_res, ppo_res, thr):
    df = dqn_res.get("final_fidelity",0.0); pf = ppo_res.get("final_fidelity",0.0)
    dg = dqn_res.get("final_gate_count",999); pg = ppo_res.get("final_gate_count",999)
    dd = dqn_res.get("circuit_depth",999); pd = ppo_res.get("circuit_depth",999)
    dt = dqn_res.get("search_time_seconds",999.0); pt = ppo_res.get("search_time_seconds",999.0)
    dp = df >= thr; pp = pf >= thr
    detail = {"dqn_fid":df,"ppo_fid":pf,"dqn_pass":dp,"ppo_pass":pp,"dqn_gc":dg,"ppo_gc":pg,"dqn_dep":dd,"ppo_dep":pd,"dqn_time":dt,"ppo_time":pt,"threshold":thr}
    if dp and not pp: return "DQN Agent","P1-Eligibility",detail
    if pp and not dp: return "PPO Agent","P1-Eligibility",detail
    if dg < pg: return "DQN Agent","P2-GateCount",detail
    if pg < dg: return "PPO Agent","P2-GateCount",detail
    if dd < pd: return "DQN Agent","P3-Depth",detail
    if pd < dd: return "PPO Agent","P3-Depth",detail
    fdiff = abs(df-pf); detail["fid_diff"] = fdiff
    if fdiff > 1e-8:
        return ("DQN Agent","P4-FidelityPrecision",detail) if df > pf else ("PPO Agent","P4-FidelityPrecision",detail)
    if dt < pt: return "DQN Agent","P5-Time",detail
    if pt < dt: return "PPO Agent","P5-Time",detail
    return "TIE (DQN & PPO)","P6-Tie",detail

def run_single_test(tv, budget=30):
    tid=tv["id"]; nq=tv["qubits"]; sv_list=tv["sv"]
    target_sv=np.array(sv_list,dtype=np.complex128)
    thr=threshold_for(nq)
    input_norm=float(np.linalg.norm(target_sv))
    rec={"test_id":tid,"qubits":nq,"description":tv["desc"],"threshold":thr,
         "input_vector":[str(c) for c in sv_list],"input_norm":input_norm,"budget":budget,
         "timestamp":datetime.datetime.utcnow().isoformat()+"Z",
         "dqn_result":None,"ppo_result":None,"dqn_log":None,"ppo_log":None,
         "dqn_error":None,"ppo_error":None,"app_winner":None,"win_reason":None,
         "dqn_verified_fidelity":None,"ppo_verified_fidelity":None,
         "dqn_verified_note":None,"ppo_verified_note":None,
         "status":"NOT_RUN","issues":[]}
    print(f"\n{'='*70}\n  RUNNING {tid} | {nq}-qubit | {tv['desc']}")
    print(f"  Input norm: {input_norm:.10f}  |  Threshold: {thr}\n{'='*70}")
    t0=time.time()
    try:
        with ProcessPoolExecutor(max_workers=2) as ex:
            fd=ex.submit(_worker_dqn,target_sv,nq,budget,thr)
            fp=ex.submit(_worker_ppo,target_sv,nq,budget,thr)
            dqn_res,dqn_log=fd.result(timeout=600)
            ppo_res,ppo_log=fp.result(timeout=600)
        rec["dqn_result"]=dqn_res; rec["ppo_result"]=ppo_res
        rec["dqn_log"]=dqn_log; rec["ppo_log"]=ppo_log
    except Exception as exc:
        rec["dqn_error"]=str(exc); rec["status"]="ERROR"
        print(f"  [ERROR] {exc}"); traceback.print_exc(); return rec
    ttot=time.time()-t0
    try:
        winner_name,win_reason,winner_res=decide_winner(dqn_res,ppo_res,thr)
        rec["app_winner"]=winner_name; rec["win_reason"]=win_reason
    except Exception as exc:
        rec["dqn_error"]=f"decide_winner failed: {exc}"; rec["status"]="ERROR"; return rec
    df=dqn_res.get("final_fidelity",0.0); pf=ppo_res.get("final_fidelity",0.0)
    dg=dqn_res.get("final_gate_count",0); pg=ppo_res.get("final_gate_count",0)
    dd=dqn_res.get("circuit_depth",0); pd=ppo_res.get("circuit_depth",0)
    dt=dqn_res.get("search_time_seconds",0.0); pt=ppo_res.get("search_time_seconds",0.0)
    print(f"  DQN: fid={df:.10f} gates={dg} depth={dd} time={dt:.2f}s")
    print(f"  PPO: fid={pf:.10f} gates={pg} depth={pd} time={pt:.2f}s")
    print(f"  APP WINNER: {winner_name}  |  {win_reason}")
    print(f"  Total time: {ttot:.2f}s")
    dqn_disp=dqn_res.get("display_lines",[]) or []; ppo_disp=ppo_res.get("display_lines",[]) or []
    if dqn_disp:
        dvf,dvn=verify_fidelity_independent(target_sv,dqn_disp,nq)
        rec["dqn_verified_fidelity"]=dvf; rec["dqn_verified_note"]=dvn
    else:
        rec["dqn_verified_note"]="UNVERIFIED: no display_lines"
    if ppo_disp:
        pvf,pvn=verify_fidelity_independent(target_sv,ppo_disp,nq)
        rec["ppo_verified_fidelity"]=pvf; rec["ppo_verified_note"]=pvn
    else:
        rec["ppo_verified_note"]="UNVERIFIED: no display_lines"
    print(f"  DQN verified: {rec['dqn_verified_fidelity']}  ({rec['dqn_verified_note']})")
    print(f"  PPO verified: {rec['ppo_verified_fidelity']}  ({rec['ppo_verified_note']})")
    rec["status"]="COMPLETE"
    issues=[]
    issues.append("WARN-BUG10: Stochastic rollout, no random seed captured")
    if df < thr and pf < thr:
        issues.append(f"WARN-01: BOTH_BELOW_THRESHOLD dqn={df:.10f} ppo={pf:.10f} thr={thr}")
    if not dqn_disp: issues.append("WARN-04: DQN display_lines empty")
    if not ppo_disp: issues.append("WARN-04: PPO display_lines empty")
    TOL=1e-4
    if rec["dqn_verified_fidelity"] is not None and abs(df-rec["dqn_verified_fidelity"])>TOL:
        issues.append(f"BUG-02 HIGH: DQN FIDELITY_MISMATCH rep={df:.10f} ver={rec['dqn_verified_fidelity']:.10f}")
    if rec["ppo_verified_fidelity"] is not None and abs(pf-rec["ppo_verified_fidelity"])>TOL:
        issues.append(f"BUG-02 HIGH: PPO FIDELITY_MISMATCH rep={pf:.10f} ver={rec['ppo_verified_fidelity']:.10f}")
    if rec["dqn_verified_fidelity"] is None: issues.append("WARN-02: DQN verification unavailable")
    if rec["ppo_verified_fidelity"] is None: issues.append("WARN-02: PPO verification unavailable")
    rec["issues"]=issues
    return rec

def write_outputs(records):
    def _s(o):
        if isinstance(o,(np.complexfloating,complex)): return {"re":float(o.real),"im":float(o.imag)}
        if isinstance(o,(np.floating,float)): return float(o)
        if isinstance(o,(np.integer,int)): return int(o)
        if isinstance(o,np.ndarray): return o.tolist()
        raise TypeError(type(o))

    jpath=os.path.join(AUDIT_DIR,"raw_results.jsonl")
    with open(jpath,"w",encoding="utf-8") as f:
        for r in records: f.write(json.dumps(r,default=_s)+"\n")
    print(f"[AUDIT] {jpath}")

    cpath=os.path.join(AUDIT_DIR,"test_results.csv")
    fields=["test_id","qubits","desc","threshold","status",
            "dqn_rep_fid","dqn_ver_fid","ppo_rep_fid","ppo_ver_fid",
            "dqn_gates","dqn_depth","dqn_time_s","ppo_gates","ppo_depth","ppo_time_s",
            "dqn_thr_pass","ppo_thr_pass","app_winner","cascade_winner","first_prio","match","issues"]
    rows=[]
    for r in records:
        thr=r["threshold"]
        dr=r.get("dqn_result") or {}; pr=r.get("ppo_result") or {}
        df=dr.get("final_fidelity","NC"); pf=pr.get("final_fidelity","NC")
        dg=dr.get("final_gate_count","NC"); pg=pr.get("final_gate_count","NC")
        dd=dr.get("circuit_depth","NC"); pd=pr.get("circuit_depth","NC")
        dt=dr.get("search_time_seconds","NC"); pt=pr.get("search_time_seconds","NC")
        dp="PASS" if isinstance(df,float) and df>=thr else ("FAIL" if isinstance(df,float) else "NC")
        pp="PASS" if isinstance(pf,float) and pf>=thr else ("FAIL" if isinstance(pf,float) else "NC")
        app=r.get("app_winner","N/A"); exp="N/A"; prio="N/A"; match="N/A"
        if r["status"]=="COMPLETE":
            exp,prio,_=derive_cascade_winner(dr,pr,thr)
            match="YES" if app==exp else "NO(BUG-01)"
        rows.append({"test_id":r["test_id"],"qubits":r["qubits"],"desc":r["description"],"threshold":thr,"status":r["status"],
            "dqn_rep_fid":f"{df:.10f}" if isinstance(df,float) else df,
            "dqn_ver_fid":f"{r.get('dqn_verified_fidelity'):.10f}" if isinstance(r.get("dqn_verified_fidelity"),float) else r.get("dqn_verified_fidelity","NC"),
            "ppo_rep_fid":f"{pf:.10f}" if isinstance(pf,float) else pf,
            "ppo_ver_fid":f"{r.get('ppo_verified_fidelity'):.10f}" if isinstance(r.get("ppo_verified_fidelity"),float) else r.get("ppo_verified_fidelity","NC"),
            "dqn_gates":dg,"dqn_depth":dd,"dqn_time_s":f"{dt:.3f}" if isinstance(dt,float) else dt,
            "ppo_gates":pg,"ppo_depth":pd,"ppo_time_s":f"{pt:.3f}" if isinstance(pt,float) else pt,
            "dqn_thr_pass":dp,"ppo_thr_pass":pp,"app_winner":app,"cascade_winner":exp,"first_prio":prio,"match":match,
            "issues":" | ".join(r.get("issues",[]))})
    with open(cpath,"w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)
    print(f"[AUDIT] {cpath}")

    tpath=os.path.join(AUDIT_DIR,"winner_decision_traces.md")
    with open(tpath,"w",encoding="utf-8") as f:
        f.write("# Winner Decision Traces\n\n")
        f.write(f"_Generated: {datetime.datetime.utcnow().isoformat()}Z_\n\n---\n\n")
        for r in records:
            f.write(f"## {r['test_id']} | {r['qubits']}-qubit | {r['description']}\n\n")
            f.write(f"**Threshold:** {r['threshold']}  **Status:** {r['status']}\n\n")
            if r["status"]!="COMPLETE":
                f.write(f"> ERROR: {r.get('dqn_error','')}\n\n---\n\n"); continue
            dr=r.get("dqn_result") or {}; pr=r.get("ppo_result") or {}
            df=dr.get("final_fidelity",0); pf=pr.get("final_fidelity",0)
            dg=dr.get("final_gate_count",999); pg=pr.get("final_gate_count",999)
            dd=dr.get("circuit_depth",999); pd=pr.get("circuit_depth",999)
            dt=dr.get("search_time_seconds",999); pt=pr.get("search_time_seconds",999)
            dp=df>=r["threshold"]; pp=pf>=r["threshold"]
            dvf=r.get("dqn_verified_fidelity"); pvf=r.get("ppo_verified_fidelity")
            f.write(f"| Metric | DQN | PPO |\n|---|---|---|\n")
            f.write(f"| Reported Fidelity | {df:.10f} | {pf:.10f} |\n")
            f.write(f"| Verified Fidelity | {dvf if dvf is not None else 'UNVERIFIED'} | {pvf if pvf is not None else 'UNVERIFIED'} |\n")
            f.write(f"| Gate Count | {dg} | {pg} |\n")
            f.write(f"| Circuit Depth | {dd} | {pd} |\n")
            f.write(f"| Time (s) | {dt:.3f} | {pt:.3f} |\n")
            f.write(f"| Threshold Pass | {'PASS' if dp else 'FAIL'} | {'PASS' if pp else 'FAIL'} |\n\n")
            exp,prio,det=derive_cascade_winner(dr,pr,r["threshold"])
            app=r.get("app_winner","N/A")
            match=app==exp
            f.write(f"**P1 Eligibility:** DQN={'PASS' if dp else 'FAIL'} PPO={'PASS' if pp else 'FAIL'}\n\n")
            f.write(f"**P2 Gates:** DQN={dg} vs PPO={pg}\n\n")
            f.write(f"**P3 Depth:** DQN={dd} vs PPO={pd}\n\n")
            f.write(f"**P4 Fidelity diff:** |{df:.10f}-{pf:.10f}| = {abs(df-pf):.2e}\n\n")
            f.write(f"**P5 Time:** DQN={dt:.3f}s vs PPO={pt:.3f}s\n\n")
            f.write(f"**First decisive priority:** {prio}\n\n")
            f.write(f"**App winner:** {app}  **Expected:** {exp}  **Match:** {'YES ✅' if match else 'NO ❌ BUG-01'}\n\n")
            if r.get("issues"):
                f.write("**Issues:**\n"); [f.write(f"- {i}\n") for i in r["issues"]]
            f.write("\n---\n\n")
    print(f"[AUDIT] {tpath}")

    ipath=os.path.join(AUDIT_DIR,"issue_register.md")
    with open(ipath,"w",encoding="utf-8") as f:
        f.write("# Issue Register\n\n")
        f.write(f"_Generated: {datetime.datetime.utcnow().isoformat()}Z_\n\n---\n\n")
        bug01=[(r["test_id"],r.get("app_winner"),derive_cascade_winner(r.get("dqn_result") or {},r.get("ppo_result") or {},r["threshold"])[0])
               for r in records if r["status"]=="COMPLETE"
               and r.get("app_winner")!=derive_cascade_winner(r.get("dqn_result") or {},r.get("ppo_result") or {},r["threshold"])[0]]
        f.write("## BUG-01 WINNER_CASCADE_MISMATCH\n\n")
        if bug01:
            for t,a,e in bug01: f.write(f"- **{t}**: app={a} expected={e}\n")
        else:
            f.write("No mismatch detected.\n")
        f.write("\n## BUG-02 FIDELITY_MISMATCH\n\n")
        bug02=[(r["test_id"],i) for r in records for i in r.get("issues",[]) if "BUG-02" in i]
        if bug02:
            for t,i in bug02: f.write(f"- **{t}**: {i}\n")
        else:
            f.write("No mismatch beyond tolerance 1e-4.\n")
        f.write("\n## WARN-01 BOTH_BELOW_THRESHOLD\n\n")
        w01=[(r["test_id"],i) for r in records for i in r.get("issues",[]) if "WARN-01" in i]
        if w01:
            for t,i in w01: f.write(f"- **{t}**: {i}\n")
        else:
            f.write("None.\n")
        f.write("\n## WARN-02 VERIFICATION_UNAVAILABLE\n\n")
        w02=[(r["test_id"],i) for r in records for i in r.get("issues",[]) if "WARN-02" in i]
        if w02:
            for t,i in w02: f.write(f"- **{t}**: {i}\n")
        else:
            f.write("None.\n")
        f.write("\n---\n_Coverage limitation: only covers completed tests._\n")
    print(f"[AUDIT] {ipath}")

    rpath=os.path.join(AUDIT_DIR,"final_audit_report.md")
    run_c=sum(1 for r in records if r["status"]=="COMPLETE")
    err_c=sum(1 for r in records if r["status"]=="ERROR")
    dvf_c=sum(1 for r in records if isinstance(r.get("dqn_verified_fidelity"),float))
    pvf_c=sum(1 for r in records if isinstance(r.get("ppo_verified_fidelity"),float))
    bug01c=len([(r["test_id"],r.get("app_winner"),derive_cascade_winner(r.get("dqn_result") or {},r.get("ppo_result") or {},r["threshold"])[0])
               for r in records if r["status"]=="COMPLETE"
               and r.get("app_winner")!=derive_cascade_winner(r.get("dqn_result") or {},r.get("ppo_result") or {},r["threshold"])[0]])
    w01c=sum(1 for r in records for i in r.get("issues",[]) if "WARN-01" in i)
    with open(rpath,"w",encoding="utf-8") as f:
        f.write("# TATVA QuantumRL — Final Audit Report\n\n")
        f.write(f"_Generated: {datetime.datetime.utcnow().isoformat()}Z_\n\n---\n\n")
        f.write(f"## Executive Summary\n\n")
        f.write(f"| Item | Value |\n|---|---|\n")
        f.write(f"| Tests planned | 20 |\n| Tests completed | {run_c} |\n| Tests errored | {err_c} |\n| Tests not run | {20-run_c-err_c} |\n")
        f.write(f"| DQN circuits independently verified | {dvf_c}/{run_c} |\n")
        f.write(f"| PPO circuits independently verified | {pvf_c}/{run_c} |\n")
        f.write(f"| BUG-01 (cascade mismatch) | {bug01c} |\n")
        f.write(f"| WARN-01 (both below threshold) | {w01c} |\n\n")
        f.write(f"## Environment\n\n")
        f.write(f"- **torch:** 2.6.0+cpu | **qiskit:** 2.5.0 | **numpy:** 2.2.6 | CUDA: False\n")
        f.write(f"- **RL root:** {RL_ROOT}\n")
        f.write(f"- **Synthesis entry:** 	atva_synthesize.py::_worker_dqn / _worker_ppo / decide_winner\n")
        f.write(f"- **Winner cascade:** 	atva_synthesize.py::decide_winner lines 88-143\n")
        f.write(f"- **No application source was modified during this audit.**\n\n")
        f.write(f"## Overall Results Table\n\n")
        f.write(f"| ID | Q | Status | DQN Fid | PPO Fid | DQN Gates | PPO Gates | DQN Depth | PPO Depth | DQN✓ | PPO✓ | App Winner | Expected | Match |\n")
        f.write(f"|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n")
        for r in records:
            dr=r.get("dqn_result") or {}; pr=r.get("ppo_result") or {}
            df=dr.get("final_fidelity","NC"); pf=pr.get("final_fidelity","NC")
            dg=dr.get("final_gate_count","NC"); pg=pr.get("final_gate_count","NC")
            dd=dr.get("circuit_depth","NC"); pd=pr.get("circuit_depth","NC")
            thr=r["threshold"]
            dp="✅" if isinstance(df,float) and df>=thr else "❌"
            pp="✅" if isinstance(pf,float) and pf>=thr else "❌"
            app=r.get("app_winner","N/A"); exp="N/A"; mt="N/A"
            if r["status"]=="COMPLETE":
                exp,_,_=derive_cascade_winner(dr,pr,thr)
                mt="✅" if app==exp else "❌BUG-01"
            f.write(f"| {r['test_id']} | {r['qubits']} | {r['status']} | {f'{df:.8f}' if isinstance(df,float) else df} | {f'{pf:.8f}' if isinstance(pf,float) else pf} | {dg} | {pg} | {dd} | {pd} | {dp} | {pp} | {app} | {exp} | {mt} |\n")
        f.write(f"\n## Winner-Cascade Analysis\n\n")
        f.write("No BUG-01 detected.\n\n" if bug01c==0 else f"**{bug01c} BUG-01 instances detected.** See issue_register.md.\n\n")
        f.write(f"## Reproducibility\n\nBUG-10/WARN-10: No random seed exposed in result dict. Results are stochastic per run.\n\n")
        f.write(f"## Limitations\n\n1. Independent verification parses display_lines text only.\n2. No seed captured.\n3. 3Q PPO may use analytical baseline fallback.\n4. No application code was modified.\n\n")
        f.write("---\n_Generated by audit/quantumrl_stress_test/audit_runner.py — no application source modified._\n")
    print(f"[AUDIT] {rpath}")
    return {"jsonl":jpath,"csv":cpath,"traces":tpath,"issues":ipath,"report":rpath}

if __name__=="__main__":
    BUDGET=30
    print("="*70)
    print("  TATVA QuantumRL 20-Vector Stress Test Audit")
    print(f"  Budget: {BUDGET}  Tests: {len(TEST_VECTORS)}  Dir: {AUDIT_DIR}")
    print("="*70)
    all_records=[]
    for tv in TEST_VECTORS:
        rec=run_single_test(tv,BUDGET)
        all_records.append(rec)
        chk=os.path.join(AUDIT_DIR,"raw_results_checkpoint.jsonl")
        def _s(o):
            if isinstance(o,(np.complexfloating,complex)): return {"re":float(o.real),"im":float(o.imag)}
            if isinstance(o,(np.floating,float)): return float(o)
            if isinstance(o,(np.integer,int)): return int(o)
            if isinstance(o,np.ndarray): return o.tolist()
            raise TypeError(type(o))
        with open(chk,"a",encoding="utf-8") as f: f.write(json.dumps(rec,default=_s)+"\n")
    paths=write_outputs(all_records)
    print("\n"+"="*70+"\n  AUDIT COMPLETE\n"+"="*70)
    for k,v in paths.items(): print(f"  {k:10s}: {v}")
