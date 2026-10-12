# Worker instance stopping — live simulation report

**Date:** 2026-08-07 (addendum 2026-08-08)
**Branch:** `sepal` — campaigns ran against `c9749986f` ("fix(worker): don't close live sessions on
transient failures"); the addendum covers `d00fdd724`, a fix this run prompted.
**Under test:** the two guards described in `docs/instance-stopping-parity.md` §1 — the
timed-out-session sweep's startup grace, and the tri-state instance probe with its confirmation
tracker — plus the whole stopping chain they feed: session close → instance release → idle-pool
termination.

**Verdict: both fixes confirmed working under live fault injection.** 8 campaigns, 46 assertions,
~2 h 40 min of wall clock. Every assertion that tested what it intended passed. Four harness bugs
were found and fixed (§ Harness quality); one real limitation of the chosen design was reproduced
and bounded (§4.5); the one test written to find a regression found none, with a mechanism (§4.7).
Not covered: the AWS hosting service — see § Scope and limitations. The run also surfaced a
separate latent cost leak that was fixed the next day — see § Addendum.

## Environment & method

- Live dev stack, `HOSTING_SERVICE=local`: real worker sessions, real sandbox containers on the
  shared daemon, real sweeps on their production 1-minute schedule, real MySQL.
- The worker container bind-mounts `modules/worker`, so the committed code is what ran. Confirmed
  by the new `Within the startup grace period — skipping the timed-out session sweep` log line
  appearing at startup — a line that does not exist in the pre-fix code.
- Driver scripts in the session scratchpad (`sim/`): bodiless keep-alive heartbeats every 20 s
  (never count as user activity), 10-second DB polling with transition logging, scripted
  assertions, and fault injection via `docker` against the sandbox containers and the `docker-api`
  socat sidecar the worker probes through.
- All sessions were `T3aSmall` ($0.0204/h), deliberately below `IDLE_MIN_HOURLY_COST` ($0.5), so
  the idle-detection machinery could not interfere. Verified: **0** idle-sweep actions and **0**
  sessions ever `WARNED` across the whole run.
- Faults were injected just after a sweep tick (sweeps land at a fixed offset past the minute,
  anchored on worker start) so each subsequent sweep could be attributed individually.

### Fault-injection vocabulary

| Injection | What the worker's probe sees | Expected verdict |
|---|---|---|
| `docker rm -f <sandbox>` | `404 No such container` | `MISSING` |
| `docker stop <sandbox>` | inspect returns `State.Running: false` | `MISSING` |
| `docker stop docker-api` | connection refused | `UNKNOWN` |
| `docker pause docker-api` | TCP connects, HTTP never answers → 10 s `AbortSignal` | `UNKNOWN` |
| backdating `update_time` in SQL | a worker outage of arbitrary length | (timeout sweep input) |

Backdating `update_time` is the only simulated input. It is exactly what a worker outage produces —
the sweep's entire input is `update_time` versus `now()` — and it let outages far longer than the
10-minute session timeout be tested without waiting them out. The worker process really was stopped
and restarted in every such test; only the *duration* of the outage was compressed.

Everything else ran undilated at production timings: the 1-minute sweep cadence, the 10-minute
heartbeat timeout (campaign 3), the 2-minute startup grace, the 2-sweep confirmation, and the
30-minute UNKNOWN backstop (campaign 5).

## Campaign 1 — the startup grace, after a 40-minute worker outage

Two identical live sessions, both backdated to 40 minutes stale while the worker was stopped —
i.e. an outage four times the session timeout. The **only** difference between them: on restart, A
received heartbeats (as the gateway would resume within 30 s), B did not.

| Time | Event |
|---|---|
| 16:33:11 | worker stopped; both sessions backdated to 40 min stale |
| 16:33:11 | worker started; heartbeat driver for A only |
| 16:33:13 | sweep → `skipping the timed-out session sweep` — **nothing closed** |
| 16:34:13 | sweep → skipped again |
| 16:35:13 | first sweep after the 120 s grace → **B closed**, A untouched |
| 16:38:16 | A still ACTIVE after 5 minutes |

| Assertion | Result |
|---|---|
| A (heartbeated during the grace) survived | PASS |
| B (abandoned) closed at the first post-grace sweep | PASS |

The grace boundary is exact: the first sweep at elapsed ≥ 120.000 s ran, the two before it did not.
**Pre-fix, both A and B would have been closed at 16:33:13** — the sweep's first run — and their
instances terminated 5 minutes later.

## Campaign 2 — the tri-state instance probe

### 2.1 Docker API outage, containers alive — the bug itself

`docker stop docker-api` for 5 minutes with two live sessions; both sandbox containers stayed up
throughout (verified every 10 s).

| Assertion | Result |
|---|---|
| Both sessions survived the 5-minute outage | PASS |
| Sessions closed during the outage: **0** | PASS |
| `UNKNOWN` probe verdicts logged: **10** (5 sweeps × 2 sessions) — the test bites | PASS |
| `MISSING` verdicts for a live container: **0** | PASS |
| Both recovered and stayed ACTIVE after `docker-api` returned | PASS |

Pre-fix this closed both sessions on the **first** sweep and terminated both machines 5 minutes
later. Five minutes of daemon unavailability is an ordinary event — a socat sidecar restart, a
deploy, a network blip.

### 2.2–2.4 Confirmed death, and recovery before confirmation

Three sessions, faults injected together just after a sweep:

| Session | Injection | Sweep 16:49:13 | Sweep 16:50:13 | Outcome |
|---|---|---|---|---|
| C | `docker rm -f` | `denied by Docker: 404 No such container` (miss 1) | denied again (miss 2) | **CLOSED** |
| D | `docker stop` | `container … is not running` (miss 1) | not running (miss 2) | **CLOSED** |
| A | `docker stop`, then restarted at 16:49:31 | not running (miss 1) | absent — probe confirmed | **stayed ACTIVE** |

| Assertion | Result |
|---|---|
| Both `MISSING` kinds (404 and not-running) close after confirmation | PASS |
| Neither closed on the first miss | PASS |
| A, whose container came back inside one sweep, was never closed | PASS |

The close log carries the deciding verdict: `Closed session … (admin) — instance MISSING`.

### 2.5 Counterfactual — what the pre-fix code does with the same faults

To keep "pre-fix this would have closed the session" from being a claim about code I had already
changed, the pre-fix `closeTimedOutSessions`, `closeSessionsWithoutInstance` and
`findMissingInstances` were extracted from `c9749986f^` and driven with the same inputs the live
faults produced:

```
A. daemon unreachable, container ALIVE -> pre-fix classified 1/1 as MISSING
A. pre-fix sweep closed [s-live] on the FIRST sweep
B. 40-min outage -> pre-fix closed [s-stale] on its immediate startup run
B. pre-fix closeTimedOutSessions signature has no startTime/grace:
   async ({repo, instanceManager, emitWorkerSessionClosed}) => {
```

Both regressions are therefore measured, not inferred.

## Campaign 3 — the stopping chain, per close path

The point of the sweeps is that unused instances actually stop. Each close path was followed all
the way to container removal and instance termination.

### 3.1 Explicit close (`DELETE /sessions/session/:id`)

| Assertion | Result |
|---|---|
| Session CLOSED immediately | PASS |
| Container undeployed by the close cascade (no waiting for a sweep) | PASS |
| Instance no longer reserved | PASS |

### 3.3 Close-without-release → reclaimed by the next sweep

Observed live during campaign 2.2–2.4, which is the path the tri-state fix feeds:

| Time | Event |
|---|---|
| 16:50:13 | `CloseSessionsWithoutInstance` closed C and D — **row only, no release**, as designed |
| 16:51:13 | `ReleaseUnusedInstances`: `releasing 2 of 2 reserved instances` → both undeployed and released |
| 16:52:13 | `SizeIdlePool`: `terminating 2 surplus idle instance(s) of type T3aSmall` → instance rows deleted |

Three sweeps, three responsibilities, no gaps: the session stops billing at the first, the machine
is un-reserved at the second, and the surplus is destroyed at the third. `SizeIdlePool` is the only
step that terminates — which is exactly why its conditional scheduling was a live cost-leak risk.
**This simulation is what prompted fixing it**: the sweep is now scheduled unconditionally
(fixed 2026-08-08, commit `d00fdd724`).

### Billing actually stops

`WorkerSessionClosed` propagation was checked against the budget module's `open_session_use`:

| Session | Close path | Closed at | `to_time` written |
|---|---|---|---|
| B | timeout after outage | 16:35:13 | 16:35:14 |
| C | confirmed MISSING (404) | 16:50:13 | 16:50:14 |
| D | confirmed MISSING (stopped) | 16:50:13 | 16:50:14 |
| E | explicit close | 16:53:14 | 16:53:15 |

**0** CLOSED sessions were left billing. The new confirmation path emits the same event as every
other close path, ~1 s end-to-end over RabbitMQ.

### 3.2 Heartbeat timeout (the ordinary "not used any more" trigger)

A session created and then never heartbeated again. Closed after **603 s** of silence (the 600 s
timeout plus sweep alignment), and the machine was gone one sweep later:

| Time | Event |
|---|---|
| 17:03:13 | timeout sweep → `Closed session …`, then inline `releaseInstance` → `Undeployed instance` |
| 17:04:13 | `SizeIdlePool: terminating 1 surplus idle instance(s) of type T3aSmall` |

Note this path is **one sweep faster** than 3.3: `closeSession` releases the instance itself
(step 2 of its two-transaction close), so only the terminate step waits for the next sweep. The
without-instance path deliberately skips the release, which is why it needs
`ReleaseUnusedInstances` in between.

| Assertion | Result |
|---|---|
| Closed by the timeout sweep after 603 s of silence | PASS |
| Container undeployed by the close cascade in the same sweep | PASS |
| Instance no longer reserved | PASS |

Campaign 3 total: **8 assertions, 8 passed.**

### Grace safety margin

Campaign 1's heartbeat landed 8 s after the worker returned. In production the gateway's loop is
30 s and `alive.sh` is 30 s, so the worst case is a beat at +30 s against a 120 s grace — a **4×
margin**. The grace is not tuned to the edge.

## Campaign 4 — edges and interactions

### 4.3 keepAlive immunity (valid on the first attempt)

Session G was made 40 minutes stale **and** given `earliest_timeout_time = now + 2 h`:

| Assertion | Result |
|---|---|
| G survived 40-min staleness, a worker restart, and 5 minutes of sweeps | PASS |
| G closed within ~75 s once `earliest_timeout_time` was cleared | PASS |

The `earliest_timeout_time` AND-guard in the timeout SQL still dominates, and the startup grace
did not disturb it. The second half matters: it proves G was alive *because of* the guard, not
because the sweep was broken.

### 4.1 / 4.4 — first attempt was an invalid test, redone

The first attempt reported 1 failure. Investigating it showed the fault was in the **test**, not the
product. The script backdated `update_time` by 40 minutes on a *running* worker whose grace had long
since expired, so the next timeout sweep closed both sessions at 17:07:13 — six seconds **before**
the restart the scenario depended on. Log attribution made it unambiguous: the closes came from
`sepal.worker.closeSession` (the timeout path), not `closeSessionsWithoutInstance`.

That is correct behaviour — a 40-minute-stale session with no heartbeats *should* be closed — but it
meant:

- the reported FAIL ("I not closed after a single miss") was an artifact;
- and, more importantly, the two PASSes in that section were **vacuous** — both sessions were
  already CLOSED before the scenario started, so nothing about the grace or the tracker was tested.

Both were re-run with all backdating performed while the worker was **stopped** (as campaign 1
correctly did), and with the tracker-reset session heartbeated throughout so only the
without-instance path could act on it. Results in the redo section below.

### 4.2 — first attempt also an invalid test, redone

Same story, different cause. The script derived the sweep anchor with
`cut -d: -f4` on a `T17:13:12`-shaped timestamp, which yields nothing and silently fell back to a
hard-coded `:13` — while the real anchor had moved to `:20` when campaign 4 restarted the worker.
The result: `docker-api` was stopped **1 second after** the container was removed, before any sweep
had run, so the intended `MISSING → UNKNOWN → MISSING` sequence never happened.

What actually happened was `UNKNOWN → MISSING` = one miss, and the session was correctly **not**
closed. A valid data point, just not the one being tested.

Both redone campaigns replaced anchor arithmetic with **log-driven sweep synchronisation** — block
until the worker logs another sweep, then act. That removes the entire class of timing bug and is
immune to restarts moving the anchor.

### 4.6 The 10-second probe bound (a hang, not a refusal)

`docker pause docker-api` freezes socat mid-flight: the TCP connect still succeeds (the kernel
accepts into the backlog) but no HTTP response ever comes. This is the failure mode the pre-fix
code could not survive — that path carried **no timeout at all**, so the sweep would block until
the OS gave up, while `setInterval` kept firing new sweeps behind it.

Measured from the worker log, sweep tick versus verdict:

| Sweep tick | Verdict logged | Latency | Injected fault |
|---|---|---|---|
| 17:14:20.868 | 17:14:20.867 | ~0 ms | connection **refused** (instant failure) |
| 17:16:20.866 | 17:16:30.865 | **9.999 s** | connection **hangs** → `AbortSignal` fires |
| 17:17:20.866 | 17:17:30.863 | **9.997 s** | same |

Three things this shows:

1. `PROBE_TIMEOUT_MS = 10_000` fires to the millisecond.
2. The next tick still landed **exactly 60.000 s** after the previous one — the schedule never
   stalled and no sweeps piled up, which is what an unbounded probe would have caused.
3. Two instances' verdicts resolved within **1 ms of each other**, confirming the probes run
   concurrently (`Promise.all` in `findMissingInstances`). N sessions cost ~10 s in total, not
   10 s × N — so the worst-case sweep duration stays well inside the 1-minute period regardless of
   session count.

### 4.2 (redo, valid) — `MISSING → UNKNOWN → MISSING` closes

Re-run with log-driven sweep synchronisation, one verdict per sweep, each confirmed in the log
before the next fault was injected:

| Time | Verdict | Miss count | Session |
|---|---|---|---|
| 19:02:21 | **MISSING** (404) | 1 | ACTIVE — not closed |
| 19:03:21 | UNKNOWN (daemon stopped) | 1 — not reset | ACTIVE — not closed |
| 19:04:21 | **MISSING** (404) | 2 | **CLOSED** |

| Assertion | Result |
|---|---|
| Not closed after the first MISSING | PASS |
| That verdict really was MISSING (not a coincidence) | PASS |
| Not closed after the UNKNOWN | PASS |
| That verdict really was UNKNOWN | PASS |
| Closed on the second MISSING despite the UNKNOWN in between | PASS |

### 4.2 (also observed earlier) — `MISSING → UNKNOWN×3 → MISSING` closes

The re-run of 4.2 was still queued when campaign 4.6's `docker pause` produced the sequence
by accident, on the session left over from the invalid run (J, whose container really had been
removed). The tracker's behaviour over four minutes:

| Time | Verdict | Miss count |
|---|---|---|
| 17:14:20 | UNKNOWN | 0 |
| 17:15:20 | **MISSING** | 1 |
| 17:16:30 | UNKNOWN | 1 — not reset |
| 17:17:30 | UNKNOWN | 1 — not reset |
| 17:18:30 | UNKNOWN | 1 — not reset |
| 17:19:20 | **MISSING** | 2 → **CLOSED** |

Three consecutive inconclusive probes spanning four minutes did not launder away the first
denial, and the second denial closed it immediately. That is `missingInstanceTracker`'s
"an inconclusive probe is not evidence of life" rule, verified live over a longer and messier gap
than the designed test would have used.

### 4.6 assertion scoping — a third harness bug

4.6 reported 1 failure: "no MISSING verdict from a hang (got 2, want 0)". Both MISSING verdicts
belonged to **J** — a leftover session from the invalid 4.2 run whose container genuinely was
removed, so those verdicts were correct. Scoped to the session actually under test:

```
MISSING verdicts for L (the session under test): 0
```

The assertion was globally scoped instead of instance-scoped — my error, in a run where a previous
campaign left a dead-container session open. Correctly scoped, **4.6 is 3/3**. Every campaign
queued after this point was given a clean-slate preamble that closes leftover sessions first.

### 4.5 Crash-loop starvation — the fixed grace's known trade-off, measured

A worker restarting faster than `STARTUP_GRACE_MS` can never reach its first real timeout sweep.
This was flagged as the cost of choosing a fixed grace (Option A) over persisted-liveness downtime
accounting (Option B); it is recorded here as measured behaviour rather than a pass/fail of the fix.

An abandoned, 40-minutes-stale, never-heartbeated session against a worker restarted every 90 s:

| Time | Event | Session |
|---|---|---|
| 17:20:25 | restart #1 | ACTIVE |
| 17:21:55 | restart #2 | ACTIVE |
| 17:23:26 | restart #3 | ACTIVE |
| 17:25:42 | — worker left up — | **CLOSED**, 136 s after the last restart |

So: **starvation is real and reproducible.** A worker crash-looping with a period under 2 minutes
will not time out abandoned sessions, and their instances keep billing until the crash loop is
resolved. The close came 136 s after the last restart — the 120 s grace plus sweep alignment —
confirming nothing else was holding it.

Two things bound the severity. A crash-looping worker is an alarm-worthy condition in its own
right, and the same crash loop equally prevents the *pre-fix* code from doing anything useful
(it would close every live session on each restart instead — a worse failure in the same
circumstance). If this ever becomes a real operational concern, the remedy is recorded in
`instance-stopping-parity.md` §5.1: persist `last_seen` and set the grace to
`max(0, downtime − uptime)`, which decays to zero and cannot be starved.

## Incidental observations (pre-existing, local hosting only — not caused by these fixes)

**Container leak after a worker restart, and its self-healing.** Observed end-to-end:

1. A worker restart wipes the local provider's in-memory instance map.
2. When such a session later closes, `releaseInstance` logs
   `instance … not found in provider — nothing to release` and the container is never undeployed.
3. `RemoveOrphanedContainers` (12-minute sweep) reclaims it — no open session claims it, the
   provider does not track it, and it is older than the 10-minute orphan grace. Confirmed twice
   during the run, at 17:07:21 and 17:19:21.

This is exactly what `removeOrphanedContainers.js` documents, and it is local-only: on AWS the
containers die with the instance. Worth noting only because the simulation restarted the worker far
more often than production would, which made the path easy to observe.

**`worker.instance` row growth in local dev.** 1358 rows against 1 live container, 1229 of which
were never referenced by any session. `SizeIdlePool` launches an idle instance whenever the
in-memory pool is below target — which it always is after a restart — and `repo.launched()` inserts
a row per launch, while the only DELETE (`terminated()`) is driven from that same forgetful
in-memory view. The rows are inert for correctness (`requestInstance` intersects repo-idle with
*provider*-idle, and the provider's set is empty after a restart, so stale rows can never be
handed out), but the table grows without bound in a long-lived dev environment. Pre-existing and
untouched by these fixes; noted because it was discovered while verifying the terminate step.

## Campaign 5 — the 30-minute UNKNOWN backstop, at full duration

The cost-leak guard: if the probe can never reach a verdict, the session must still eventually be
closed, or an unreachable host bills forever. Run undilated — `docker-api` stopped for the whole
run, session heartbeated every 15 s throughout so the **timeout sweep could never be the cause**.

| Time | State | Cumulative UNKNOWN probes |
|---|---|---|
| t+20 min | ACTIVE | 32 |
| t+25 min | ACTIVE | 37 |
| t+29 min | ACTIVE | 40 |
| t+30 min | ACTIVE | 41 |
| **t+31 min** | **CLOSED** | — |

| Assertion | Result |
|---|---|
| Closed by the backstop, not by anything else | PASS |
| Fired inside the 29–33 min window (measured: 31 min = 30 min + sweep alignment) | PASS |
| The loud WARN was logged | PASS |

```
[WARN] sepal.worker.closeSessionsWithoutInstance - Session 715e40c2-… (admin) has gone
unprobeable for the whole backstop window
```

Forty-one consecutive inconclusive probes over half an hour did not close the session; the
thirty-minute threshold did. Both halves of the design hold: UNKNOWN is never treated as evidence
of death, and it is never allowed to become an indefinite free pass either.

## Log hygiene across the whole run

95 minutes of deliberate fault injection — daemon stopped, daemon paused, containers removed and
stopped, worker restarted ~12 times, sessions backdated — produced exactly **two** `[ERROR]` lines
in the worker, both the same expected one:

```
Scheduled job RemoveOrphanedContainers failed [TypeError: fetch failed]
```

That is the 12-minute orphan sweep hitting the stopped `docker-api`, caught by
`scheduleFixedDelay`'s wrapper so the schedule survives — the intended behaviour.

**Zero** errors came from the code under test. The tri-state probe converts its failures into
verdicts rather than exceptions, so a daemon outage is now a `WARN` per instance and an `INFO`
close decision, never an unhandled rejection or a stuck sweep. No crashes, no restarts that were
not deliberate, no wedged state.

### 4.7 Adversarial — can the confirmation requirement leak a dead instance?

The one test written hoping to **find** a regression. Hypothesis: since the tracker is in-memory,
a worker restarting faster than two sweeps would wipe the miss count every time, so a session whose
container is genuinely dead would never be confirmed, never closed, and its instance never
reclaimed — where the pre-fix code closed it on the first sweep.

**Hypothesis disproven**, for a specific reason worth recording. Four restarts spaced 75 s apart;
the session was closed during the *first* window, 61 s after restart #1:

| Time | Event |
|---|---|
| 17:58:28.551 | last sweep before the restart (container still alive) |
| 17:58:31.232 | worker starts |
| **17:58:31.265** | sweep runs **immediately at startup** → MISSING = miss 1 |
| 17:59:31.235 | next tick → MISSING = miss 2 → **CLOSED** |

`CloseSessionsWithoutInstance` keeps `scheduleFixedDelay`'s immediate first run — the startup grace
was added only to the *timeout* sweep. So a restart **contributes a miss immediately** rather than
starving confirmation: two misses accumulate in ~60 s across a restart, versus ~120 s in steady
state. A crash loop therefore makes dead-instance cleanup *faster*, not slower.

This is the asymmetry between the two fixes, and it is the right one. The timeout sweep needs a
grace because its evidence (`update_time`) is **destroyed** by the outage. The without-instance
sweep needs none because its evidence (the live Docker probe) is **regenerated** on every run,
including the first one after a restart.

## Campaign 6 — event-driven close triggers

The remaining two stopping triggers from `instance-stopping-parity.md` §1, driven by publishing
real messages to the `sepal.topic` exchange:

| Trigger | Result |
|---|---|
| `budget.UserBudgetExceeded` → `lockedUsers.onExceeded` → `closeUserSessions` | PASS — closed within 12 s |
| `user.UserLocked` → `closeUserSessions` | PASS — closed within 12 s |

A third check was informational rather than an assertion: requesting a session **while the
event-fed locked set holds the user** returned **HTTP 201**, not 403. That is correct and confirms
the documented precedence — `requestSession` asks the budget module for a *live* verdict first, and
the live answer ("under budget", which admin genuinely is) wins. The `lockedUsers` set is only the
fallback for when budget is unreachable, exactly as `modules/worker/CLAUDE.md` specifies. Had the
set been treated as authoritative, this would have been a 403.

### 4.1 (redo, valid) — the tracker really is empty after a restart

Third attempt, with the container removed **while the worker was down** so that no pre-restart miss
could exist. If tracker state had somehow survived a restart, the immediate startup sweep would
have closed the session at once.

| Time | Event |
|---|---|
| 19:04:55 | worker stopped; container removed with nothing running |
| 19:04:56 | worker restarted |
| 19:04:57 | immediate startup sweep → MISSING = miss 1 → **not closed** |
| 19:05:57 | next tick → MISSING = miss 2 → **CLOSED** (67 s after restart) |

| Assertion | Result |
|---|---|
| I survived the FIRST post-restart sweep — the tracker was empty | PASS |
| I closed on the SECOND post-restart sweep | PASS |
| Exactly two post-restart misses were required | PASS |

### 4.4 (redo, valid) — a stale PENDING session is protected by the grace, then closed

A `PENDING` session that never activated, inserted 40 minutes stale **while the worker was
stopped** so no running sweep could act on it first:

| Time | Event |
|---|---|
| 18:10:20 | worker restarted (the stale PENDING row was inserted while it was down) |
| 18:10:21 | sweep → `skipping the timed-out session sweep` — H stays PENDING |
| 18:11:21 | sweep → skipped again |
| 18:12:21 | first sweep past the grace → **H closed** by `sepal.worker.closeSession` |

| Assertion | Result |
|---|---|
| H closed after the grace, by the timeout sweep | PASS |
| H was **not** closed during the grace | PASS |
| The close came from the timeout path, not the without-instance path | PASS |

This matters because `PENDING` sessions never refresh `update_time` — they time out on their
original creation time — so they are the case most exposed to a spurious startup sweep. The grace
covers them identically.

## Scope and limitations

Stated plainly, because they bound what this run proves:

1. **AWS is not exercised.** The stack ran `HOSTING_SERVICE=local`. The probe under test lives in
   `dockerInstanceProvisioner.js`, which *is* the shared code path both hosting services use, so
   the verdict logic and the tracker are genuinely covered. What is **not** covered is
   `awsInstanceProvider.js` — EC2 tagging, `TerminateInstances`, and the `Starting=true` poller.
   That gap is pre-existing and already recorded (`sepal-server-parity-audit.md`: AWS-only paths
   are exercised by neither the test suite nor dev-env).
2. **One shared daemon.** Locally every instance is a container on one Docker daemon, so
   `docker stop docker-api` produces a *fleet-wide* UNKNOWN. On AWS each instance runs its own
   daemon, so the common case is one instance going UNKNOWN alone. The fleet-wide case is the
   harsher one for the backstop, so testing it here is conservative, but the per-instance case was
   not separately observed.
3. **Small scale.** At most three concurrent sessions. Nothing here speaks to sweep behaviour with
   hundreds of sessions, beyond the observation that probes run concurrently (`Promise.all`) and
   completed within one millisecond of log-timestamp spread when healthy.
4. **Idle detection was deliberately excluded**, not overlooked: `IDLE_AUTO_SHUTDOWN=false` in this
   environment and every session was below the cost floor, so that machinery could not act. It is
   not part of these fixes and was covered end-to-end by `docs/instance-resource-monitoring-simulation.md`
   (2026-08-02). Isolation was verified rather than assumed: 0 idle actions, 0 sessions WARNED.

## Findings

**1. Both fixes do what they were designed to do, under live faults.**
The startup grace held two sessions through a simulated 40-minute outage and released them to the
sweep at exactly the 120-second boundary; the tri-state probe carried two live sessions through
five minutes of total daemon unavailability without a single close, then closed genuinely dead
containers on confirmation. The pre-fix code, given the identical faults, closed on the first sweep
in both cases — measured, not assumed.

**2. The stopping chain is complete, and the meter really stops.**
All four close paths were followed to termination. Three sweeps carry three distinct
responsibilities — close, release, terminate — one minute apart, with no gap and no overlap. Every
CLOSED session had its budget `to_time` written within about a second, over RabbitMQ; none were
left billing.

**3. The probe's new timeout is real and the schedule is immune to it.**
A hung daemon resolved at 9.999 s (`AbortSignal`), the next sweep still ticked exactly 60.000 s
later, and concurrent probes resolved within 1 ms of each other. The pre-fix path had no timeout at
all on this call, so a hung daemon would have blocked the sweep while `setInterval` queued more
behind it.

**4. The asymmetry between the two fixes is correct, and the simulation explains why.**
The timeout sweep got a startup grace; the without-instance sweep did not. That looked arbitrary
until campaign 4.7 made the reason concrete: the timeout sweep's evidence (`update_time`) is
*destroyed* by an outage and needs time to be rebuilt, while the without-instance sweep's evidence
(a live Docker probe) is *regenerated* on every run, including the immediate one at startup. Adding
a grace to the second sweep would delay cleanup for no gain.

**5. One real limitation, confirmed and bounded: crash-loop starvation.**
A worker restarting faster than 2 minutes never reaches its first timeout sweep, so abandoned
sessions are not closed and keep billing until the crash loop is fixed. Reproduced deliberately.
It affects only the timeout sweep — dead-container cleanup actually speeds up under a crash loop —
and the pre-fix code fails worse in the same circumstance (it closes every *live* session on each
restart). The exact remedy is already documented as the road not taken.

**6. No regression found by the test written to find one.**
The adversarial hypothesis — that in-memory confirmation state could leak a dead instance across
restarts — was disproven with a mechanism, not a shrug.

## Harness quality — four invalid tests, and what they cost

Four of my own tests were wrong. None of them found a product defect; all four risked *hiding* one,
which is the part worth recording.

| # | Bug | Symptom | Consequence |
|---|---|---|---|
| 1 | Backdated `update_time` on a **running** worker | Sessions closed by the timeout sweep 6 s before the scenario began | 1 spurious FAIL and **2 vacuous PASSes** |
| 2 | Sweep anchor parsed with `cut -f4` on `T17:13:12` → silently defaulted to `:13` while the real anchor had moved to `:20` | The intended MISSING→UNKNOWN→MISSING order never occurred | 1 spurious FAIL |
| 3 | Assertion counted MISSING verdicts **globally** instead of per-instance | A leftover session's genuine verdicts were attributed to the session under test | 1 spurious FAIL |
| 4 | `wait_sweep` compared a count of log lines inside a `--since 15m` window — pinned at 15 with one sweep per minute, so it never increased | Campaign hung for 42 minutes | run lost, re-run needed |

The dangerous ones are #1 and #3, because they produce **passes**. A test that fails gets
investigated; a test that passes for the wrong reason is filed as evidence. In this run every
failure was traced to its cause before being dismissed, which is the only reason the two vacuous
passes surfaced at all — they were found while investigating the spurious failure sitting next to
them.

Two habits did the work: attributing every close to its **logger name**
(`closeSession` vs `closeSessionsWithoutInstance` — different sweeps, indistinguishable from the
session state alone), and reading the worker's own timeline rather than the test's assertions.
The fixes were structural, not cosmetic: sweep synchronisation now waits for the worker to *log*
a sweep instead of computing when one should occur, all state mutation happens while the worker is
stopped, and every later campaign starts from a clean slate.

## Scorecard

| Campaign | Assertions | Result |
|---|---|---|
| 1 — startup grace, 40-min outage | 2 | all PASS |
| 2.1 — Docker API outage, containers alive | 5 | all PASS |
| 2.2–2.4 — confirmed death + recovery before confirmation | 3 | all PASS |
| 2.5 — pre-fix counterfactual | — | both regressions reproduced |
| 3 — stopping chain, all close paths + billing | 8 | all PASS |
| 4.1 — tracker empty after restart (3rd attempt) | 3 | all PASS |
| 4.2 — MISSING → UNKNOWN → MISSING (2nd attempt) | 5 | all PASS |
| 4.3 — keepAlive immunity | 2 | all PASS |
| 4.4 — stale PENDING under the grace (2nd attempt) | 3 | all PASS |
| 4.5 — crash-loop starvation | 2 | all PASS (limitation reproduced) |
| 4.6 — probe hang / 10 s bound | 3 | all PASS (once instance-scoped) |
| 4.7 — adversarial leak hunt | 1 | no regression found |
| 5 — 30-min UNKNOWN backstop | 3 | all PASS |
| 6 — budget / user-locked events | 2 | all PASS |
| Gateway cache retention | 4 | PASS (characterization, passed first run) |

Unit suites after the run: worker **695 passed**, gateway **111 passed**, ESLint clean.

## Final state

Stack left clean: 0 open sessions, 0 synthetic rows, 0 sandbox containers, `docker-api` running and
unpaused, worker healthy. No worker configuration was changed at any point, so nothing needed
restoring — every fault was injected from outside the module under test.

## Artifacts

Driver scripts, per-campaign logs and the pre-fix counterfactual harness live in the session
scratchpad (`sim/`, `counterfactual/`). They are throwaway: the durable outputs are this report,
the unit tests committed in `c9749986f`, and the gateway cache-retention test.

## Addendum — 2026-08-08: SizeIdlePool scheduling (`d00fdd724`)

This run did not test a fix; it *found the need for one*. Campaign 3.3 showed
`sizeIdlePool: terminating N surplus idle instance(s)` to be the only step in the entire
simulation that destroyed anything — everything upstream just closes rows and un-reserves. That
made its scheduling guard worth a second look, and the guard turned out to be load-bearing:
`workerInstance/index.js` ran the sweep only when some instance type declared `idleCount > 0`, and
exactly one catalog entry did. Zeroing that one entry would have left every released instance
billing indefinitely, because `releaseInstance` only re-tags `State=idle` on AWS and
`terminateOldIdle` sweeps only *older-version* idle instances.

Fixed by scheduling it unconditionally, as Groovy did — `sizeIdlePool` already treats an empty
target map as "every idle instance is surplus", so only the guard was wrong.

Verified live on the same stack by forcing the bug condition (local catalog `T3aSmall` temporarily
set to `idleCount: 0`, then reverted with `git checkout`):

| | Log line | Sweep ticks |
|---|---|---|
| Before | `no instance types with idleCount > 0 — SizeIdlePool not scheduled` | 0, ever |
| After | `scheduling SizeIdlePool every 60000ms for types: none (all idle instances are surplus)` | 1/min, observed over 2 min |

Also covered by three new unit tests in `workerInstance/index.test.js` — the component's
*scheduling* had no coverage at all before this (the `sizeIdlePool` command itself was well
tested). The key one failed red with `Number of calls: 0`, which is precisely the bug.
