
# Worker instance resource monitoring — design

**Status:** phases 1–4 implemented — 1 (always on), 2 + 3 (config-gated, default off),
4 (user-details half); phase 5 (busy-based timeout extension, §7) proposed 2026-08-11, not
implemented
**Validation:** full live simulation passed 2026-08-02/03 — see
`docs/instance-resource-monitoring-simulation.md`
**Date:** 2026-07-31
**Branch:** sepal-node

## Goal

Instrument worker instances (CPU load, GPU load, RAM usage) so SEPAL can:

1. Detect big/expensive instances sitting idle, notify their user, and auto-shut them
   down after a grace period.
2. Keep enough usage history to answer resource-upgrade requests with data
   ("over the last 30 days your peak CPU was 35%, you never used the GPU").

Non-goals (for now): per-process breakdowns, network/disk I/O accounting,
utilization-based billing, Grafana dashboards.

## Current state (from codebase survey)

- **No usage data exists anywhere.** Cost is `hourlyCost × wall-clock`
  (`modules/budget/src/instanceSpendingCalculator.js`). A user saturating 4 GPUs on a
  `G512xlarge` and one idling at 0% are billed and treated identically.
- **The existing "idle" signal is fake.** Session timeout closes sessions whose
  `update_time` is >10 min old, but the gateway heartbeats every *cached* session
  unconditionally every 30 s (`modules/gateway/src/sandbox/sandboxSessionManager.js`),
  so a session stays "alive" as long as the gateway remembers it — regardless of user
  activity.
- **Server → instance channel:** the Docker Engine REST API on `tcp://:2375`
  (SG-restricted to the SEPAL server; `dockerFetch` in
  `modules/worker/src/workerInstance/dockerInstanceProvisioner.js`). No SSH, no agent,
  no cloud-init/user-data — everything on the instance is baked into the AMI
  (`hosting-services/aws/sepal/worker-ami.yml`).
- **One container per instance** (sandbox or task executor), with **no CPU/RAM limits**
  — container stats effectively are instance stats.
- **GPU:** NVIDIA drivers + container toolkit are in the AMI and
  `nvidia-container-runtime` is the *default* Docker runtime on workers
  (`worker-runtime.sh` shims to `runc` on non-GPU instances). `NVIDIA_VISIBLE_DEVICES=all`
  is set in every worker container, so `nvidia-smi` works inside the container via the
  runtime injection. Nothing invokes it programmatically today.
- **Prometheus/cAdvisor scrape the main server only**, static targets, no service
  discovery — worker instances (ephemeral, dynamic IPs) can't currently be targets.
- **Ready-made plumbing to reuse:**
  - Instance type catalog with `cpuCount`, `ramGiB` (`ramBytes` getter), `gpuCount`,
    `hourlyCost` (`modules/worker/src/hostingService/instanceTypes.js`).
  - Per-user snapshot WebSocket push (`modules/worker/src/workerSession/ws.js` →
    `sessionMonitor.jsx` → `user.currentUserReport.sessions`), plus the Usage panel's
    10 s refresh tick while open.
  - Scheduler pattern (`modules/worker/src/workerSession/index.js` — 1 min sweeps) and
    the existing session close path (`CloseTimedOutSessions`).
  - `email.sendToUser` RabbitMQ key; the `user-storage` inactivity check
    (`modules/user-storage/src/inactivityCheck.js`) is the structural analogue for
    "detect idle → delayed warning → delayed destructive action → cancel on activity".
  - The keepAlive slider (`earliest_timeout_time`) as an existing user-facing
    "don't kill my instance" control.

## Approaches considered

### A. Server-side pull through the Docker API (recommended)

The worker module samples each active instance on a schedule, using the channel it
already owns: `GET /containers/{id}/stats?stream=false` for CPU/RAM, and
`POST /containers/{id}/exec` running `nvidia-smi --query-gpu=…` for GPU (only when
`instanceType.gpuCount > 0`). Samples are stored in the `worker` schema, next to the
sessions the decisions act on.

- **Pros:** zero instance-side changes (no AMI rebuild, no new image, no SG change);
  reuses `dockerFetch` and the exec plumbing; works identically with the local dev
  provider (per-container stats work on the shared daemon); the data lands where the
  idle/shutdown logic and the session report already live.
- **Cons:** O(instances) HTTP calls per tick from the worker module (trivial at SEPAL
  scale — tens of instances); no host-level view outside the container (acceptable:
  one unbounded container per instance); GPU via exec is slightly inelegant.

### B. Metrics agent on each instance + Prometheus service discovery

Bake (or provision as an extra container) node_exporter + a GPU exporter on each
instance; let Prometheus discover workers (`ec2_sd_configs` or `http_sd_configs`);
Prometheus becomes the store; the worker queries PromQL for idle decisions.

- **Pros:** industry-standard collection (true host-level metrics incl. load, disk,
  network), storage/rollup for free, Grafana-ready, big ops dividend beyond this
  feature.
- **Cons:** Prometheus goes from optional ops add-on to load-bearing business
  dependency (idle detection *and* the 1-year decision history would live in an
  unbacked-up single-node TSDB); it only replaces the small part of the feature
  (~a 200-line sampler + two tables) while the FSM/notifications/GUI/activity signal
  are identical; no local-dev story; two sources of truth for "which instances
  exist".

See the appendix for the detailed analysis and deployment variants.

### C. Push agent inside the sandbox image

Add a supervisord program to the sandbox image that samples `/proc` + `nvidia-smi`
and POSTs to the worker module (authenticated with the session API key).

- **Pros:** no polling, in-container perspective, works wherever the sandbox runs.
- **Cons:** couples monitoring to the sandbox image version (stale-image problems are
  a known dev-env pain); the task image needs the same treatment; requires a new
  authenticated inbound path; harder to patch/trust than server-side code.

**Decision: A**, including (in phase 1) the **hybrid** described in the appendix: A's
collector also publishes its latest samples as prom-client gauges on the worker
module's `/metrics`, making the worker a single static Prometheus scrape target —
Grafana/PromQL visibility with no exporters, no service discovery, and no Prometheus
dependency in the decision path. C is rejected. Full B remains a later, purely-ops
add-on if worker host-level monitoring (disk, network, load) becomes a requirement.

## Design

Four phases, each independently shippable:

1. **Collect & show** — sampling, storage, usage in the session report and GUI,
   plus Prometheus gauges on the worker's `/metrics` (the hybrid — see appendix).
2. **Warn** — idle detection + user notification (no enforcement).
3. **Enforce** — auto-shutdown after grace period (config-gated).
4. **Decide** — aggregated per-user usage reports for admins (upgrade requests).

### 1. Collection (worker module)

A new `usageMonitor` in `modules/worker/src/workerInstance/`, scheduled at a fixed
delay (default **60 s**, `USAGE_SAMPLING_INTERVAL_SECONDS`), alongside the existing
schedulers. Each tick, for every ACTIVE session (PENDING instances and the idle pool
are skipped — nothing to attribute):

*Why 60 s is enough:* CPU and network are computed as interval averages from
cumulative counters (below), so nothing between ticks is missed regardless of the
interval; the idle verdict averages a 30-min window (30 samples) and the admin
reports use hourly aggregates, so neither gains from finer granularity. The interval
is a config knob; lowering it costs only DB rows (1 min ≈ 1 440 rows/day/instance)
and one Docker call per instance per tick.

- **CPU / RAM / network:** `GET /containers/{name}/stats?stream=false&one-shot=true`
  (returns immediately, no 1 s wait). CPU and network are **cumulative counters**,
  so the sampler keeps the previous tick's totals in memory and computes deltas over
  the real elapsed time between ticks:
  - `cpuPct = Δtotal_usage / Δsystem_usage × online_cpus / instanceType.cpuCount ×
    100` → *average over the whole 60 s interval*, 0–100 of the instance. This
    avoids the aliasing of point snapshots (a 1 s probe every 60 s observes 1/60 of
    the time); with interval-average counters, no burst between ticks can be missed.
    First tick after a sampler restart yields no CPU/network sample (no baseline) —
    harmless, the coverage rule absorbs it.
  - `ramBytes = memory_stats.usage − inactive_file` (the standard cAdvisor-style
    correction so page cache doesn't count as load); `ramPct` vs
    `instanceType.ramBytes`. Note the `/ram` tmpfs and `ShmSize` count toward this —
    correct, tmpfs is real RAM. RAM is a level, not a rate — point sampling is fine.
  - `netRxBytesPerS` / `netTxBytesPerS` from `networks.*.rx_bytes/tx_bytes` deltas,
    summed over interfaces. Network is the cheapest "not actually idle"
    discriminator: a session downloading imagery to EFS at 2% CPU is not idle.
- **GPU** (only if `instanceType.gpuCount > 0`): container exec
  `nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader,nounits`,
  averaged across GPUs → `gpuPct`, `gpuRamBytes`. Exec failure → nulls, logged once.
  Unlike CPU, this is a point sample (~1 s of GPU activity); acceptable because GPU
  workloads are sustained and the verdict averages 30 samples — if that ever proves
  too coarse, dcgm-exporter is the upgrade path, not a shorter interval.

**Considered and deliberately not collected (v1):**

- *Disk I/O (`blkio_stats`)* — EFS/FSx traffic shows up as network, not blkio; local
  blkio adds little to the idle verdict. Available in the same payload if ever
  wanted.
- *Process count (`pids_stats`)* — no consumer.
- *Disk free on the instance's 75 GB docker volume* — real operational concern
  (full disk breaks the sandbox) but an ops alert, not usage data: belongs with the
  full-B exporter path, or a trivial `df` container-exec later.
- *OOM kills* — the single best piece of evidence for a RAM-upgrade request (a
  kernel/notebook killed by the OOM killer at <60 s spike is invisible to sampling).
  Not sampled data though: candidate for phase 4 via container `State.OOMKilled` /
  Docker events, recorded as a per-session counter.
- *Per-GPU max* — avg across GPUs suffices ("1 of 4 GPUs busy" still reads 25%);
  trivial to add later since `nvidia-smi` already returns per-GPU lines.

Failure isolation per instance (same try/catch-per-item style as
`closeTimedOutSessions`). Sampling errors never affect session health. Sampling
uses the container-name convention `{image}.{username}.{instanceId}` already used by
the provisioner.

Both worker types are sampled — task-executor usage is valuable sizing data — but the
idle policy (below) applies to SANDBOX sessions only.

The sampler also publishes the latest values as prom-client gauges
(`sepal_instance_cpu_pct`, `sepal_instance_ram_pct`, `sepal_instance_gpu_pct`, …;
labels `username`, `instance_type`, `instance_id`) via the shared `metrics.js`
wrapper, with a gateway `endpoints.js` entry and a `prometheus.yml` job so the worker
module becomes a scrape target (it isn't one today). Gauges for terminated instances
are removed on session close. Prometheus is a passive mirror — never read by any
decision logic.

### 2. Storage (`worker` schema, migration 003)

```sql
CREATE TABLE instance_usage_sample (
    session_id    VARCHAR(255) NOT NULL,
    username      VARCHAR(255) NOT NULL,
    instance_type VARCHAR(255) NOT NULL,
    sample_time   TIMESTAMP    NOT NULL,
    cpu_pct       DECIMAL(5,2),
    ram_bytes     BIGINT,
    ram_pct       DECIMAL(5,2),
    gpu_pct       DECIMAL(5,2),
    gpu_ram_bytes BIGINT,
    net_rx_bytes_per_s BIGINT,
    net_tx_bytes_per_s BIGINT,
    PRIMARY KEY (session_id, sample_time),
    KEY idx_username_time (username, sample_time)
);

CREATE TABLE instance_usage_hourly (
    session_id    VARCHAR(255) NOT NULL,
    username      VARCHAR(255) NOT NULL,
    instance_type VARCHAR(255) NOT NULL,
    hour          TIMESTAMP    NOT NULL,
    sample_count  INT          NOT NULL,
    cpu_avg  DECIMAL(5,2), cpu_max  DECIMAL(5,2),
    ram_avg  DECIMAL(5,2), ram_max  DECIMAL(5,2),   -- percentages
    gpu_avg  DECIMAL(5,2), gpu_max  DECIMAL(5,2),
    gpu_ram_max BIGINT,
    net_avg_bytes_per_s BIGINT,
    PRIMARY KEY (session_id, hour),
    KEY idx_username_hour (username, hour)
);
```

- Raw samples: retained **30 days**, pruned by a daily job. Idle detection and the
  live GUI read only these.
- Hourly rollups: computed by an hourly job (upsert for the previous hour), retained
  **1 year**. Upgrade-decision reports read only these. ~50 open instances × 1440
  samples/day is trivial for MySQL; no partitioning needed.
- New session columns (same migration): `idle_state ENUM('OK','WARNED') DEFAULT 'OK'`,
  `warned_time TIMESTAMP NULL`, `last_user_activity_time TIMESTAMP NULL` on
  `worker_session`.

### 3. Real user-activity signal (gateway + ssh-gateway) — implemented (phase 2)

Low CPU alone can't distinguish "abandoned" from "user reading a notebook". The
existing 30 s heartbeat body (`POST /sessions/session/{id}`) gains an optional
`{userActivity: true}` flag — a **flag, not a client timestamp**: the worker stamps
`worker_session.last_user_activity_time` with its own clock, so gateway/ssh-gateway
container clocks are never trusted.

Exactly two senders set the flag:

- **gateway** — only when it *actually proxied a user request* attributed to that
  session (any `resolveTarget` branch: kernel probe, app-path, referer, single-host,
  legacy) since the previous heartbeat. The marker is consumed per beat, so one
  request flags exactly one heartbeat.
- **ssh-gateway** — `alive.sh` sends it on every 30 s beat while an SSH connection is
  open: an open SSH connection (including the web terminal, which tunnels through
  ssh-gateway) is activity by definition. The `ssh-bootstrap` reconnect probe stays
  bodiless on purpose — it fires while the user is *disconnected*.

A **bare heartbeat is never activity**. This is the load-bearing rule: the gateway
heartbeats every cached session unconditionally as a keep-alive, and before phase 2
that was indistinguishable from real use. Heartbeat keep-alive semantics and the
existing 10-min timeout are unchanged — the flag is purely additive.

### 4. Idle detection & response (worker module) — implemented (phase 2, config-gated)

Evaluated by `EvaluateIdleSessions` on the 1-minute sweep cadence — scheduled **only**
when `IDLE_WARNINGS_ENABLED=true` (default false; with the flag off the sweep does not
exist at runtime). Config (env-provided, with these defaults):

| Setting | Default | Meaning |
|---|---|---|
| `idleMinHourlyCost` | 0.5 USD/h | sessions on cheaper types are sampled but exempt from the policy |
| `idleDetectionWindowMinutes` | 30 | rolling window for ENTERING idleness (OK sessions) |
| `idleRecoveryWindowMinutes` | 10 | shorter window for WARNED sessions (recovery + still-idle shutdown check) — asymmetric: slow to warn, quick to forgive |
| `idleCpuThresholdPct` | 5 | avg CPU (of instance) below this counts as idle |
| `idleGpuThresholdPct` | 5 | avg GPU below this counts as idle |
| `idleNetworkThresholdKBps` | 50 | avg network (rx+tx) below this counts as idle — keeps large low-CPU transfers alive; calibrate against jupyter/rstudio background chatter with phase-1 data |
| `idleGraceMinutes` | 60 | time between warning and shutdown |
| `idleAutoShutdown` | false | master switch for phase 3 enforcement |

**The idle verdict, in the order the code applies it** (`command/evaluateIdleSessions.js`):

1. **Policy scope.** Only sessions that are ACTIVE, workerType `sandbox`
   (task-executor sessions are exempt — batch jobs have their own lifecycle), on an
   instance type with `hourlyCost ≥ idleMinHourlyCost`. Cheaper instances are sampled
   but never warned.
2. **Evidence (coverage fail-safe).** Over the session's evaluation window — the full
   `idleDetectionWindowMinutes` for OK sessions, the shorter `idleRecoveryWindowMinutes` for
   WARNED sessions — at least **80 % of the effectively visible samples** must exist
   with CPU measured. "Effectively visible" = expected − 2 (see the operational note:
   the sweep/sampler cadence alignment structurally hides ~2 samples per window), so
   at defaults: ≥ 22.4 of 30 to enter, ≥ 6.4 of 10 for the still-idle check. Broken
   sampling, an unreachable instance, or a session younger than the window all fail
   coverage → **not idle**. Missing data can only ever prevent a warning, never cause
   one — and can never keep a WARNED session warned either.
3. **All resource signals quiet, simultaneously:**
   - avg `cpu_pct` < `idleCpuThresholdPct` (interval averages from cumulative
     counters — bursts between samples can't hide);
   - on GPU types only: GPU meets the same 80 % coverage AND avg `gpu_pct` <
     `idleGpuThresholdPct` (an unmeasured GPU on a GPU type → not idle, same
     fail-safe); non-GPU types skip this check;
   - avg network rate (rx+tx) < `idleNetworkThresholdKBps` × 1024 B/s — keeps
     low-CPU bulk transfers alive.
   RAM is deliberately **not** part of the verdict: allocated-but-untouched memory is
   exactly what an abandoned instance looks like.
4. **User really away.** `last_user_activity_time` is null or older than the
   evaluation window's start (see §3 — fed only by flagged heartbeats; an open SSH
   connection re-flags it every 30 s, so it suppresses idleness by definition).

**Asymmetric windows (why):** recovery must be quicker than entry. User activity
already clears within ~90 s, but resumed *unattended* load moves a 30-minute average
slowly — a job restarted at 8 % CPU would take ~19 minutes to lift it past 5 %, and
under enforcement a genuinely-computing session could be closed meanwhile. Judging
WARNED sessions over the 10-minute recovery window clears sustained resumed load in
~5–7 minutes and guarantees shutdown can never hit a session that did real work in
the last `idleRecoveryWindowMinutes`; 10 minutes (not 5) keeps a lone background
spike from clearing the warning and causing re-warn email churn.

The verdict is per session; a session maps 1:1 to an instance, so "idle session" and
"idle instance" are interchangeable.

**Operational note — window vs sampling interval:** the sweep and sampler share the
1-minute cadence with the sweep firing first, and the window-edge sample can fall out
on second-precision boundaries, so a window of W minutes reliably exposes only about
W−2 samples (observed live during phase-2 smoke testing with a degenerate 3-minute
window, where the raw 80%-of-expected floor could never be met). The coverage floor
is therefore computed as 0.8 × (expected − 2). Even so, keep both windows well above
the sampling interval — recommended ≥ 5× for `idleRecoveryWindowMinutes` (default
10×) and ≥ 10× for `idleDetectionWindowMinutes` (default 30×) — so single-sample noise can't
dominate a verdict.

Two behaviors quantified by the 2026-08-02/03 live simulation (10 sessions, compressed
and production parameters):

- **Young sessions warn early.** A freshly-started session can meet the trim-adjusted
  floor before a full detection window has elapsed: observed warn at T+8 with a 10-min
  window and T+24 with the 30-min window (≈ window − 6 min). Long-running sessions are
  judged over the true window. Accepted: the coverage floor, not the window length, is
  the evidence bar.
- **Warnings survive worker restarts.** A fast worker restart (~15 s) leaves enough
  samples in the recovery window that a WARNED session stays WARNED and its grace
  clock keeps running (observed: closed on schedule through a mid-grace restart). Only
  a restart long enough to break coverage (> ~ recovery window) flap-clears — in the
  fail-safe direction.

Per-session state machine (persisted in `idle_state`/`warned_time`; all transitions are
driven exclusively by the 1-minute `EvaluateIdleSessions` sweep — nothing else writes
`idle_state`):

```
OK ──verdict true──▶ WARNED ──verdict STILL true ∧ grace expired ∧ no keepAlive ∧ autoShutdown──▶ closed
 ▲                      │                                                              (existing
 └──verdict false───────┘                                                       close-session path)
```

**Transition triggers at a glance** (evaluated in this order each sweep, per session):

| From → To | Trigger (ALL must hold) | Side effects |
|---|---|---|
| OK → WARNED | idle verdict true over `idleDetectionWindowMinutes` (§4 steps 1–4) ∧ race-safe DB guard won | `warned_time` set; ws snapshot push (IDLE badge / countdown); `workerSession.SessionIdleWarned` → gateway → toast + Usage-button pulse; warning email |
| WARNED → closed | `idleAutoShutdown` on ∧ idle verdict STILL true over `idleRecoveryWindowMinutes` ∧ `now − warned_time ≥ idleGraceMinutes` ∧ `earliest_timeout_time` not in the future | existing close cascade (tabs close, apps dissociate, `WorkerSessionClosed` consumers react); `workerSession.SessionIdleClosed` → gateway → toast; shutdown email |
| WARNED → OK | idle verdict false over `idleRecoveryWindowMinutes` (asymmetric — quicker than entry) — i.e. ANY of: (a) `last_user_activity_time` inside the recovery window (flagged heartbeat: proxied user request via gateway, or open SSH via alive.sh); (b) recovery-window-avg CPU ≥ threshold; (c) recovery-window-avg GPU ≥ threshold (GPU types); (d) recovery-window-avg network ≥ threshold; (e) recovery-window coverage below floor (fail-safe: uncertainty exits, never escalates) | `warned_time` cleared; ws snapshot push (badge/countdown disappear); SILENT — no event, no email; phase-3 clock cancelled (re-entering idleness later starts a fresh warning + full grace) |

**Explicit non-transitions:**

- *keepAlive hold:* a future `earliest_timeout_time` blocks WARNED → closed but is NOT a
  WARNED → OK trigger — the session stays WARNED (it is still idle; the badge stays as
  honest information) and simply cannot be closed until the slider expires.
- *Leaving policy scope freezes the state:* if the sweep stops evaluating a session
  (warnings disabled, or its type drops below `idleMinHourlyCost` by config change),
  `idle_state` freezes as-is — a stale WARNED badge is possible, but nothing unevaluated
  can ever be closed. Safe direction; cosmetic only.
- *Other closes are not FSM transitions:* the user stopping the session, or the ordinary
  10-min no-heartbeat timeout, close a session regardless of `idle_state`; CLOSED is
  terminal either way and no idle event is published for those.

**Per-transition implementation notes:**

- **OK → WARNED:** set `warned_time`, push updated session snapshot over ws, publish
  `workerSession.SessionIdleWarned {username, sessionId, session}` on the bus, and
  send an email via `email.sendToUser` ("Your G5.2xlarge ($1.35/h) has been idle for
  30 minutes" — plus, when `idleAutoShutdown` is on, "it will be automatically stopped
  in about {grace} minutes unless activity resumes or you extend its keep-alive").
- **WARNED → closed (phase 3 — implemented, gated by `idleAutoShutdown`):** only when
  the session is STILL idle by the full verdict (coverage fail-safe re-applies at
  shutdown time), `warnedTime + idleGraceMinutes` has passed, AND
  `earliest_timeout_time` (the keepAlive slider) is not in the future — the slider is
  the explicit user opt-out and is honored absolutely (the session stays WARNED but is
  never closed while it holds). Close via the existing session close path (which
  already cascades: tabs close on all browsers, apps dissociate,
  budget/ssh-gateway/gateway react to `WorkerSessionClosed`). Additionally publishes
  `workerSession.SessionIdleClosed {username, sessionId}` (gateway relays it as a
  browser toast explaining why) + a follow-up email. When enforcement is on, the
  warning email announces the pending shutdown and the DTO carries
  `idle.shutdownTime = warnedTime + grace` (the GUI shows "IDLE — stops at {time}").
- **WARNED → OK:** any tick where the idle verdict no longer holds clears
  `warned_time` (silently — no notification). No BullMQ/Redis needed — the DB-backed
  sweep is idempotent and restart-safe, unlike delayed jobs. The OK → WARNED
  transition is race-safe via the `idle_state` guard on the UPDATE: exactly one sweep
  observes it, so event/email/toast fire once.
- **Gating:** `IDLE_AUTO_SHUTDOWN` (default false) sits on top of
  `IDLE_WARNINGS_ENABLED` (default false) — enforcement without warnings is impossible
  (the sweep isn't scheduled; main.js logs a warning if only the shutdown flag is set).

### 5. Surfacing to the user (GUI)

- **Session DTO** (`sessionsApi.js` serializer + `generateUserSessionReport`) gains:
  `usage: {cpuPct, ramPct, gpuPct, sampleTime}` (latest sample) and
  `idle: {state, warnedTime, shutdownTime}` (shutdownTime = warnedTime + grace, when
  enforcement is on).
- **Push:** idle-state *transitions* push a fresh snapshot through the existing
  `sessionChanged$` → ws path (rare events, no throttling concern). Routine usage
  numbers are deliberately **not** pushed every 60 s — the Usage panel already ticks
  `refresh` every 10 s while open, which picks up the latest sample; this mirrors the
  existing decision to keep high-frequency signals out of `sessionChanged$`.
- **Usage panel** (`userSessions.jsx` rows): compact CPU / RAM / GPU bars or
  percentages per session, an "idle" badge, and a highlighted warning state with the
  shutdown countdown. The `usageHint`/`hint$` channel on the Usage toolbar button
  (currently unused) pulses the button while any session is WARNED.
- On `SessionIdleWarned`, the gateway also broadcasts a websocket event
  (existing `event$` mechanism) so the GUI can show a toast immediately even with the
  panel closed.

### 6. Admin reports for upgrade decisions (phase 4 — user-details half decided 2026-08-01)

- New admin-only endpoint on the worker module: `GET /sessions/:username/usage?days=30`
  (days clamped 1–365), aggregating `instance_usage_hourly` (1-year retention):
  - `usageRepository.userUsageRollup(username, fromTime)` — one `GROUP BY instance_type`
    query returning hour-bucket counts and, per metric, **sample-count-weighted sums with
    per-metric denominators** (`SUM(CASE WHEN metric IS NOT NULL THEN sample_count END)`),
    plus `MAX` of the hourly maxima. Per-metric denominators are what make "GPU only when
    present" correct: GPU averages weight over GPU-instance hours only.
  - `generateUserUsageReport` query handler computes per-type averages, derives the
    overall row by re-weighting across types, attaches instance-type display names.
  - Response: `{days, overall: {hours, cpu: {avg, max}, ram: {avg, max},
    gpu: {avg, max} | null, netBytesPerS}, byInstanceType: [...same + instanceType, name]}`;
    `overall: null` when no data in the window.
- GUI: `userUsage.jsx` in the Users section — read-only framed fieldset
  ("Resource usage — last 30 days") in `userDetails.jsx`, directly above the
  monthly-limits fieldset. Lazy-loads on panel open (`api.sessions.userUsage$`), table:
  one row per instance type + totals row when more than one type; columns
  Hours · CPU avg/max · RAM avg/max · GPU avg/max (column only when GPU hours exist) ·
  Network (humanized rate). "No usage data" when empty; fetch errors show a note and
  never block the form.
- Known limitation: "hours" counts hour-buckets with any data — a partial hour counts
  as one. Acceptable for decision support.
- (The Prometheus gauges originally considered here moved to phase 1 — see Collection.
  The budget-update-request review can reuse the same endpoint later.)

### 7. Busy-based timeout extension (phase 5 — proposed 2026-08-11, not implemented)

Phases 1–4 let usage data *close* a session. This phase lets it *keep one open*. It is the
missing half: the timeout and the idle sweep currently answer two different questions and
only one of them can save a session.

| Signal | What it actually proves | What it can do today |
|---|---|---|
| Heartbeat → `update_time` | a **client is attached** (browser tab via gateway, `ssh` process via `alive.sh`) | the only thing that prevents expiry |
| Resource samples | **work is happening** | close an idle session (§4); never keep one alive |

**The gap.** Attachment is a proxy for work, and the proxy fails exactly where it costs
most. Start a session over SSH, launch a long job, disconnect: `alive.sh` loops on
`ps -u $USER | grep " ssh$"` and exits with the ssh client, so heartbeats stop,
`CloseTimedOutSessions` closes the session 10 minutes later, and `SizeIdlePool` terminates
the instance under the running job. Nothing in the worker reads load to *extend* a
timeout — a saturated 4-GPU instance and an abandoned one expire identically. See
`docs/instance-stopping-parity.md` §5.2.

**The rule.** Close a session when *neither* a client nor real work is present — bounded, so
an unattended instance still cannot live forever.

#### The busy verdict — positive evidence, never `!isIdle`

`isIdle` is fail-safe in one direction only: missing samples → not idle → never warn, never
close (§4 step 2). Feeding `!isIdle` into the timeout inverts that fail-safe — a session the
sampler cannot reach (unreachable Docker API, dead instance, broken exec) would become
immortal, and the AWS bill with it. `isBusy` must therefore be its own predicate over the
same evidence:

- coverage ≥ the same 80 %-of-visible floor (`requiredSamplesFor`), and
- **any** of avg CPU / avg GPU / avg network **at or above** its busy threshold.

With the busy thresholds defaulted to the idle ones, the two verdicts are exact complements
when coverage holds, and **both false when it does not** — no data means no extension *and*
no warning. Uncertainty always favours the existing behaviour.

#### Where the state lives

New nullable column on `worker_session` (next migration): `last_busy_time TIMESTAMP NULL`.

Written by the **sampler component** (`instanceUsage/index.js`, phase 1 — always on), not by
`EvaluateIdleSessions`: the extension must not depend on `IDLE_WARNINGS_ENABLED`, and the
sampler already runs on the same 1-minute cadence. One extra batched `idleWindowStats` call
per tick plus a narrow UPDATE per busy session.

Two alternatives, rejected:

- **Bump `update_time` from the sampler.** Tempting (composes with everything downstream for
  free) but it erases the attached-vs-busy distinction §3 was built to create, makes the
  unattended cap below uncomputable, and makes every consumer of `update_time` see a client
  that is not there.
- **Auto-set `earliest_timeout_time`.** That column is the user's explicit opt-out *and* the
  absolute block on idle auto-shutdown (§4). Writing it automatically would silently disable
  a policy the operator turned on.

#### The sweep change

`timedOutSessions()` gains one clause, for ACTIVE sessions only (PENDING has no container and
no samples, and still times out on `creation_time`):

```sql
AND (last_busy_time IS NULL
     OR last_busy_time < now - INTERVAL 10 MINUTE            -- work stopped too
     OR COALESCE(last_user_activity_time, creation_time)
        < now - INTERVAL <busyMaxUnattendedHours> HOUR)      -- unattended cap
```

The same 10 minutes as the heartbeat timeout, deliberately: a session dies 10 minutes after
*both* the last heartbeat and the last busy sample. One constant, one sentence to explain.

**The unattended cap is not optional.** Today the 10-minute timeout is the hard backstop
guaranteeing that an instance nobody is attached to eventually dies. Busy-keep-alive removes
that guarantee, so it must supply a new one: a runaway loop, a crashed job spinning a core,
or a wedged GPU process otherwise keeps an expensive instance alive until the budget module
notices. `busyMaxUnattendedHours` (default 12) measured from `last_user_activity_time` covers
"my overnight job" without covering "at 100 % for four days and I forgot".

#### Config

| Setting | Default | Meaning |
|---|---|---|
| `BUSY_KEEP_ALIVE_ENABLED` | false | master switch for the sweep clause; `last_busy_time` is stamped regardless |
| `busyWindowMinutes` | 10 (= `idleRecoveryWindowMinutes`) | rolling window for the busy verdict — short, so a resumed job earns the extension quickly |
| `busyCpuThresholdPct` | 5 (= idle) | separate key so ops can raise the busy bar without loosening idle detection |
| `busyGpuThresholdPct` | 5 (= idle) | GPU types only, same coverage rule |
| `busyNetworkThresholdKBps` | 50 (= idle) | keeps low-CPU bulk transfers alive |
| `busyMaxUnattendedHours` | 12 | cap since `last_user_activity_time` (or `creation_time` when null) |

Scope: ACTIVE, `workerType = sandbox`. `idleMinHourlyCost` does **not** apply — a cheap
instance's long job deserves the same protection; the cost filter exists to decide who gets
*nagged*, not who gets killed.

#### Interactions

- **With idle detection:** they cannot fight. A busy session is by construction not idle when
  coverage holds, so no session is simultaneously extended and shut down. Under partial
  coverage both verdicts are false: no extension, no warning, ordinary timeout applies.
- **With §9.1 / §9.2 of the parity docs:** both are fixed as a side effect. A computing
  session survives a worker restart storm and a gateway restart alike, because its liveness
  no longer depends on any process's in-memory state.
- **With the GUI (§5):** the extension is invisible unless surfaced. Worth a "kept alive by
  activity" hint in the Usage panel, so a user is not surprised that a session outlived its
  tab — and not surprised when the cap finally expires.

#### Limits

Threshold-based busy detection cannot cover a job that is neither computing nor transferring
— blocked on a remote GEE export, waiting on a slow external API. Those still read as
not-busy and still expire. The keepAlive slider and submitting real tasks (which heartbeat
through `UpdateTaskProgress`) remain the *guaranteed* answers for unattended work; this phase
makes the common case behave sensibly, it is not a promise.

This is a genuine divergence from the Groovy monolith — unlike almost everything else in the
stopping path, which is a deliberate port. It needs its own entry in
`docs/instance-stopping-parity.md` as an intentional improvement.

#### Rollout

Observe first, exactly like phase 1: ship the stamp unconditionally (writing `last_busy_time`
changes no behaviour) and leave `BUSY_KEEP_ALIVE_ENABLED=false`. After a few weeks, query how
many sessions *would* have been extended, and for how long, before flipping the sweep clause
on.

## Error handling summary

- Per-instance sampling failures are logged and skipped; a session with no samples is
  simply not evaluated (fail-safe sample-coverage rule).
- `nvidia-smi` exec failure on a GPU type → GPU fields null, warn-log once per
  session, CPU-only idle evaluation still applies.
- Local hosting service: identical code path (per-container stats on the shared
  daemon work); GPU sampling naturally absent.
- Clock skew is irrelevant — all times are worker-DB times.

## Testing

- Unit: CPU% math from canned Docker stats payloads; `nvidia-smi` CSV parsing; idle
  verdict (window aggregation, coverage rule, keepAlive suppression); state-machine
  transitions including warning-clear on activity.
- Repository tests for the two new tables + pruning/rollup jobs (existing injectable-
  pool pattern).
- Integration (local provider in dev-env): start a session, generate load in the
  container, observe samples; force idleness by stubbing thresholds, observe
  WARNED → closed with `idleAutoShutdown=true`.
- Note: worker test baseline is 560 pass + 1 known unrelated failure
  (`waitUntilDockerIsAvailable` fake-timer leak).

## Rollout

1. Phase 1 ships silently (collect + display). Lets thresholds be calibrated against
   real data before any policy exists.
2. Phase 2 (warnings) after a few weeks of observed distributions.
3. Phase 3 (`idleAutoShutdown=true`) once warnings prove trustworthy; announce via a
   normal-priority admin message.
4. Phase 4 whenever convenient; it's read-only reporting.
5. Phase 5 (§7) stamps `last_busy_time` silently first; `BUSY_KEEP_ALIVE_ENABLED=true` only
   after the stamps show how much lifetime it would actually grant.

## Open questions

1. **Thresholds/defaults** (`0.5 $/h`, 5%, 30 min window, 60 min grace) are educated
   guesses — calibrate with phase-1 data. Should cheap instances get warnings too
   (just never auto-shutdown)?
2. Should the WARNED email include a one-click "keep alive" link (sets
   `earliest_timeout_time` via the existing endpoint), or is pointing at the Usage
   panel enough for v1?
3. In-app persistent notification: the `message` module is admin-authored-broadcast
   only; adding a system-notification path there is real work. v1 uses email + toast
   + Usage-panel state; is a persistent inbox entry needed later?
4. Should task-executor sessions ever fall under a (much more conservative) idle
   policy, e.g. a stuck task at 0% CPU for hours?
5. Phase 5 (§7): should `busyMaxUnattendedHours` count from `last_user_activity_time`, or
   from the last *heartbeat* of any kind? The former is stricter (a browser tab left open
   overnight stops extending once the user stops touching it); the latter matches what users
   would call "in use". Also unresolved: whether an approaching cap deserves the same
   warning email as an idle shutdown — silently killing a still-computing job is the one
   outcome worse than the status quo.

Resolved:

- ~~Hybrid scheduling~~ — **phase 1** (decided 2026-08-01): gauges + scrape job ship
  with the collector, so thresholds are calibrated by charting real distributions in
  Prometheus during the observe-only period.

## Appendix — solution B in depth

What full Prometheus-based monitoring would concretely require in SEPAL, and why it
was not chosen for v1.

### Components

1. **Exporters on every instance** — node_exporter (host CPU/RAM/disk/network/load)
   plus a GPU exporter: NVIDIA's official `dcgm-exporter` (heavier, needs the
   container toolkit — present on workers) or `nvidia_gpu_exporter` (thin `nvidia-smi`
   wrapper). Deployment routes:
   - *AMI-baked systemd units.* Rides the existing per-release Packer build
     (`worker-ami.yml`), so version management is aligned with the current process.
     GPU-exporter startup gated like the existing `worker-runtime.sh` shim
     (`lspci | grep -q NVIDIA`).
   - *Provisioner-launched containers.* `workerTypes.js` images are already a list the
     provisioner iterates; it knows `gpuCount`, so the GPU exporter is launched
     conditionally. No AMI change, but images must be pre-pulled into the AMI anyway
     to avoid provision-time latency, and the exporter names must join
     `WORKER_IMAGE_NAMES` (orphan-cleanup gate).
   - Networking is free either way: the `Sandbox` security group already opens all
     ports to the SEPAL server IP only (exporter ports 9100/9400 included).
2. **Service discovery** — today's `prometheus.yml` is static + `sed`-substitution.
   - `ec2_sd_configs`: workers are already tagged `Type=Worker`, `Username`,
     `Environment`; relabeling yields `username`/`instance_id` labels for free.
     Requires AWS credentials in the Prometheus container (none today); no local-dev
     equivalent.
   - `http_sd_configs` (preferred if B is ever done): a small worker-module endpoint
     serving the authoritative live-instance list as targets. No AWS creds in
     Prometheus, works with the local provider, and Prometheus is already on the
     `sepal` docker network (it reaches `cadvisor:8080` directly).
3. **Decision plumbing** — the worker queries the Prometheus HTTP API each sweep,
   e.g. `(1 - avg by(instance_id)(rate(node_cpu_seconds_total{mode="idle"}[30m])))
   * 100 < 5` and `avg_over_time(DCGM_FI_DEV_GPU_UTIL[30m]) < 5`;
   `count_over_time(up[30m])` provides the sample-coverage fail-safe. The alternative
   (alerting rules + Alertmanager webhook) is worse here: neither exists yet, and the
   verdict depends on per-session state PromQL cannot see (keepAlive slider, last
   proxied user request, SSH connections) — the worker would have to re-filter every
   alert anyway.
4. **Retention** — default is 15 days; upgrade decisions need ~1 year
   (`--storage.tsdb.retention.time`). Cardinality is tiny so size is a non-issue, but
   Prometheus has no downsampling: long-range queries want recording rules, i.e. the
   hourly-rollup job again, just in YAML.

### Detailed pros

- Collection is off-the-shelf and *better than A's*: true host-level metrics
  (including load average, disk pressure, network — invisible to Docker container
  stats), battle-tested edge cases, no sampler code to own; dcgm-exporter beats
  parsing `nvidia-smi` CSV.
- Storage, retention, and (via recording rules) rollups come with the platform,
  replacing the two MySQL tables and two maintenance jobs.
- **Ops dividend** — the strongest argument, and it extends beyond this feature:
  worker disk-full/EFS-throughput/load visibility for admins, Grafana dashboards,
  and an eventual Alertmanager→Pushover path that could replace the log-tailing
  `sys-monitor`. If worker ops observability is wanted anyway, B's fixed costs are
  amortized across two goals.
- Instrument once, consume twice: the same series feed the idle policy and any
  future dashboards without schema changes.

### Detailed cons

- **Prometheus changes role: optional ops add-on → load-bearing business
  dependency.** Today nothing user-facing breaks if Prometheus is down or its data
  dir is lost. Under B, idle detection silently stops (the fail-safe correctly
  degrades to "never shut down" — i.e. it fails quiet), and the 1-year usage history
  behind upgrade decisions lives in a single-node TSDB with no backup story, versus
  MySQL which has one. The history is the asset least affordable to lose.
- **It only replaces the small part.** The gateway activity signal, the
  OK→WARNED→closed state machine, keepAlive interplay, ws push, emails, GUI, and the
  admin-report semantics are identical in A and B — roughly 70% of the feature. B
  saves a ~200-line sampler and two tables; it costs exporter deployment and
  versioning, a discovery mechanism, retention/recording-rule config, a PromQL
  client, and an instance→session join at query time (Prometheus knows instances,
  not sessions).
- **Local dev degrades.** With `HOSTING_SERVICE=local`, "instances" are containers on
  one shared daemon: per-instance node_exporter is meaningless and EC2 SD does not
  exist, so the idle FSM becomes untestable in dev-env without a fake metrics
  source. A works natively there.
- **Two sources of truth for "which instances exist"** (worker DB vs. scrape
  targets), with target lag on launch/terminate — mostly cosmetic, but a class of
  confusion A doesn't have.

### The hybrid (adopted — ships in phase 1)

A's collector additionally registers per-instance gauges (labels: `username`,
`instance_type`, `instance_id`) via the shared `metrics.js` wrapper on the worker's
`/metrics`, plus the two missing config entries (gateway `endpoints.js` route,
`prometheus.yml` job — worker is not scraped at all today). One static scrape
target; no exporters, no SD, no new dependency in the decision path. Prometheus
passively mirrors what the sampler already collected — full live time series for
dashboards and threshold calibration. If host-level worker monitoring later becomes
a requirement, full B's exporters can be added then as a purely ops concern, without
touching the idle-policy code.
