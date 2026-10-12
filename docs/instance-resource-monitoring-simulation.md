# Instance resource monitoring — live simulation report

**Date:** 2026-08-02 → 2026-08-03
**Branch:** `sepal-node` (feature commits `dd69df9c6..14b8b909c`)
**Spec:** `docs/instance-resource-monitoring.md` (all four phases implemented; 2+3 config-gated)
**Verdict: all scenarios PASSED** — 10 sandbox sessions across three campaigns (~10 h total),
exercising every state transition, every recovery trigger, both config gates, both close
paths, and long-horizon stability at production parameters.

## Environment & method

- Live dev stack (`HOSTING_SERVICE=local`): real worker sessions, real sandbox containers
  on the shared daemon, real sampling over the Docker API, real RabbitMQ/ws event flow.
- Driver scripts (session scratchpad `sim/`): per-session **bodiless** keep-alive heartbeats
  every ~60 s (must never count as activity), DB polling every 10–15 s with transition
  logging, load injection via `docker exec` into the sandbox containers, scripted PASS/FAIL
  assertions. Worker reconfigured per campaign via compose env overrides; a runner `trap`
  guaranteed config restoration even on failure.
- Two policy profiles:
  - **Compressed** (campaigns 1–2, phase A): detection 10 min, recovery 5 min, grace 6 min,
    min cost $0.1/h, net threshold 5 KB/s.
  - **Production** (phases B–C): the defaults — detection 30, recovery 10, grace 60,
    min cost $0.5/h, net 50 KB/s (auto-shutdown enabled for B only where stated).

## Campaign 1 — core lifecycle (compressed, 4 concurrent sessions, ~65 min)

| # | Scenario | Observed | Verdict |
|---|---|---|---|
| A | Plain idle (R5Large) | WARNED T+8 (13:23:11); DTO `idle.shutdownTime` exactly warnedTime+6 min; CLOSED T+15 (13:30, first sweep after grace) | PASS |
| B | keepAlive set before warning | WARNED T+8; grace expired T+14; held ACTIVE/WARNED for **46 min of expired grace**; keepAlive released (hours=0) at T+55 → CLOSED one sweep later (14:10) | PASS |
| E | Cheap exemption (T3aSmall, $0.0204 < $0.1) | 64 samples, fully idle 65 min, never warned | PASS |
| F | GPU fail-safe (G5Xlarge, no GPU locally → GPU unmeasured) | fully idle 65 min, never warned | PASS |

`last_user_activity_time` stayed NULL on all four — bodiless keep-alive heartbeats are
never activity. Prometheus `sepal_instance_*` gauges live for open sessions throughout.

## Campaign 2 — recovery triggers (compressed, 3 concurrent sessions, ~30 min)

All three warned simultaneously at T+8 (19:02:11); interventions auto-fired at first WARNED.

| # | Recovery trigger | Clear latency | Signal isolation (max cpu / max net) | Re-warn | Close |
|---|---|---|---|---|---|
| C | One flagged heartbeat `{userActivity: true}` | **1 sweep** (19:03:21); `last_user_activity_time` stamped at heartbeat second | 0.12 % / 3 B/s | T+19 (fresh `warned_time`) | T+26 |
| D | CPU load (`yes` busy-loop in the container) | 2 sweeps (19:04:21) | **50.57 %** / 2 B/s | T+22 | T+29 |
| G | Network loop (python urllib, low CPU) | 2 sweeps (19:04:21) | 0.30 % / **148 KB/s** | T+22 | T+29 |

Warn-log count exactly **2 per session** — every recovery produced a genuinely fresh cycle
(new warning, new email, full new grace), never a resumed one. The load evidence shows each
trigger fired on its own signal alone.

## Campaign 3 — edges, production fidelity, soak (~7 h)

### Phase A — adversarial edges (compressed)

| Case | Observed | Verdict |
|---|---|---|
| Activity 40 s before grace expiry | Cleared, not closed — the verdict re-check precedes the shutdown branch even at the boundary | PASS |
| Worker restarted mid-WARNED (fast `docker restart`, ~15 s) | Session **stayed WARNED through the restart** (recovery window retained coverage), grace clock kept running, closed on schedule (22:05:33, one sweep after the pre-restart grace expired) | PASS¹ |
| Heartbeats stopped while WARNED (auto-shutdown OFF) | Closed by the ordinary 10-min timeout; **0** idle-close log lines/events — close paths fully separated | PASS |
| Warnings disabled mid-WARNED (freeze edge) | State frozen at WARNED for 5 min **despite a flagged activity heartbeat** (recorded in DB, ignored — no sweep); after re-enable, cleared one sweep later | PASS |

¹ The driver initially expected a restart flap-clear (as seen once during phase-2 smoke with
a degenerate 3-min window and a slow compose recreate) and logged a `TIMEOUT` — a test-harness
artifact. The observed behavior is stronger and correct: with the trim-adjusted floor, only an
outage longer than ~the recovery window breaks coverage, and then it flaps in the fail-safe
(clear) direction.

### Phase B — first full cycle at production parameters (30/10/60, $0.5)

- Idle session (cheapest non-GPU type ≥ $0.5): **WARNED T+24** (young-session early-warn, see
  findings), DTO `shutdownTime` exactly warnedTime + 60 min (23:05:02 → 00:05:02),
  **CLOSED 00:05:07 — 5 seconds after grace expiry** (first sweep). Total cycle T+84 min.
- Control 1 — realistic user (one flagged heartbeat / 15 min): never warned in ~100 min. ✔
- Control 2 — cheap idle instance (T3aSmall < $0.5 floor): never warned. ✔
- Warn-log count for both controls: 0.

### Phase C — 4-hour stability soak (production parameters)

Session S: idle, keepAlive +8 h → WARNED at 00:30:02 and **held ACTIVE/WARNED for the entire
4 hours** — same `warned_time` at every hourly snapshot, warn count exactly **1** across
~240 sweeps (zero flapping, zero repeat emails). Session T: activity every 20 min — never
warned.

| Hour | S | T | samples/h | hourly rollup rows | gauges | worker RSS |
|---|---|---|---|---|---|---|
| 1 | ACTIVE/WARNED (00:30:02) | ACTIVE/OK | 120 | 0 | 2 | 96.79 MiB |
| 2 | ACTIVE/WARNED (00:30:02) | ACTIVE/OK | 120 | 2 | 2 | 96.90 MiB |
| 3 | ACTIVE/WARNED (00:30:02) | ACTIVE/OK | 120 | 4 | 2 | 97.94 MiB |
| 4 | ACTIVE/WARNED (00:30:02) | ACTIVE/OK | 120 | 6 | 2 | 97.52 MiB |

Sampler continuity perfect (2 sessions × 60 samples/h), rollup job on schedule, gauge set
stable, no memory growth.

## Findings

1. **Young sessions warn early** (quantified; accepted; documented in the spec's operational
   note). The trim-adjusted coverage floor `0.8 × (expected − 2)` is satisfiable ≈ 6 min
   before a full detection window on a freshly-started session: warn at T+8 with a 10-min
   window, T+24 with the 30-min window. Long-running sessions are judged over the true
   window. The coverage floor — not the window length — is the evidence bar.
2. **Warnings and grace clocks survive fast worker restarts** (documented in the spec).
   DB-backed state + retained recovery-window samples mean a ~15 s restart neither clears a
   warning nor delays its close. Only an outage longer than ~the recovery window flap-clears,
   in the fail-safe direction.
3. **Signal attribution is clean.** Each recovery trigger (activity / CPU / network) cleared
   on its own signal with the others near zero — no cross-talk between conditions.
4. **The two close paths never mix.** Timeout-closed WARNED sessions emit no idle events;
   idle-closed sessions ride the ordinary close cascade plus `SessionIdleClosed`.
5. **No churn at any horizon**: exactly-once warnings per idle episode in every scenario,
   including 4 h under keepAlive at production settings.

## Final state after cleanup (verified 04:30)

Worker recreated from the env-file alone — boot: "Idle-session warnings ENABLED,
auto-shutdown disabled"; env = `IDLE_WARNINGS_ENABLED=true` + all defaults (detection 30,
recovery 10, grace 60, min $0.5, net 50, shutdown off). Open sessions: **0**. Residual
WARNED rows: **0**. All simulation sessions closed; user files untouched (sessions only).

## Artifacts

- Driver scripts + full logs: session scratchpad `sim/` (`wave1.sh/.log`, `wave2.sh/.log`,
  `phaseA/B/C.sh`, `runner.sh`, `soak.log`, `cleanup.sh/.log`).
- Worker-side evidence: `evaluateIdleSessions` INFO lines (warn / clear / close per session),
  `worker.worker_session` idle columns, `worker.instance_usage_sample` /
  `instance_usage_hourly` rows for the sim sessions (subject to 30-day / 1-year retention).
