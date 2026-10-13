# Stopping unused worker instances: Groovy vs Node

**Date:** 2026-08-08 — describes the **current** state of the code, not the history of how it got
there. Fixes and the reasoning behind them are recorded in `docs/instance-stopping-simulation.md`,
`docs/sepal-server-parity-audit.md` §3, and the commits themselves.
**Branches compared:** `sepal` (Node `worker` + `budget` + `gateway`) vs `master`
(`modules/sepal-server/…/component/workersession` and `…/component/workerinstance`)
**Scope:** every trigger that closes a worker session or releases/terminates a worker instance, the
keep-alive signals that prevent it, and how each mechanism behaves across restarts and outages.

Stopping happens in two stages, and the triggers differ per stage:

1. **Session closed** — the `worker_session` row goes `CLOSED`, `workerSession.WorkerSessionClosed` is
   published. The api key stays valid only while the instance release is in progress (its claim exists)
   and is nulled when the release ends.
2. **Instance released, then terminated** — `releaseInstance` un-reserves the machine; on AWS that
   only re-tags it `State=idle`. Actual termination happens later, in the idle-pool sweep.

A session close normally cascades into a release, but both stages also have independent sweeps that
catch each other's leftovers.

## 1. Triggers

| Trigger | Groovy sepal-server | Current Node worker |
|---|---|---|
| Heartbeat timeout | CloseTimedOutSessions @1 min; PENDING/ACTIVE both 10 min; `earliest_timeout_time` AND-guard | **Diverged** — see §7. CloseTimedOutSessions is now PENDING-only (same 10 min; runs after ReconcilePendingSessions in the same job, no startup grace since 2026-09-17); an ACTIVE session's lifetime is a stored `timeout_time` swept by ExpireSessions |
| Instance vanished | CloseSessionsWithoutInstance @1 min; closes row only, no release | Same schedule and same no-release rule, but the probe is **tri-state** and a close needs a confirmed denial — `MISSING` twice running, with `UNKNOWN` never closing on its own and a 30-min backstop (`closeSessionsWithoutInstance.js`, `instanceStatus.js`, `missingInstanceTracker.js`) |
| Unused instance reclaim | ReleaseUnusedInstances(5, MINUTES) @1 min; reserved-but-unbound, strictly older than minAge | **Identical** — `workerInstance/command/releaseUnusedInstances.js` |
| Idle pool trim | SizeIdlePool @1 min; surplus idle terminated, unknown type ⇒ target 0 | **Identical** — `sizeIdlePool.js`, scheduled unconditionally as in Groovy |
| Over budget | **Polled**: CloseSessionsForUsersExceedingBudget @11 min, calling the in-process budget component's `usersExceedingBudget()` | **Event-driven**: `budget.UserBudgetExceeded` over RabbitMQ → `lockedUsers.js` → closeUserSessions; budget re-publishes verdicts hourly (level-triggered) |
| Budget gate on session request | In-process `budgetManager.check(username)`, always authoritative | HTTP `GET /budget/check/:username` with a **degrading fallback** to the event-fed locked set when budget is unreachable (`requestSession.js`) |
| User locked | `user.UserLocked` → CloseUserSessions | **Identical** |
| Last task finished / task timeout | UpdateTaskProgress, ExecuteTasksInSession, CancelTimedOutTasks → CloseSession | **Identical** |
| Explicit close | REST DELETE | **Identical** |
| **Deadline expiry** | **did not exist** | ExpireSessions @1 min — stored deadline → notify → email at +5 min → close at +60 min; gated off by default (`SESSION_EXPIRY_MODE`, `expireSessions.js`). Replaced the idle FSM, which is deleted |
| **Orphaned container sweep** | **did not exist** | RemoveOrphanedContainers @12 min (local/shared-daemon only) |

## 2. Keep-alive mechanics

| | Groovy | Current |
|---|---|---|
| Web heartbeat source | SandboxWebProxy, **in the same JVM** as the session manager, 30 s, keyed on the Undertow HTTP session map | gateway module, **separate process**, 30 s, keyed on its own cache (`sandboxSessionManager.js`) |
| SSH heartbeat | alive.sh, 30 s, via `http://sepal/api/sessions/…`, for as long as an `ssh` process existed — **no idle bound at all** | **Deleted.** ssh-gateway fires a one-shot "terminal opened" extension on connect; from there the terminal's liveness is pty atime sampled inside the container |
| User-activity signal | **none** — a heartbeat was the only liveness signal | `last_interaction_time`, stamped only by a REAL interaction: input events observed in an app iframe, or pty atime advancing inside the container. A proxied request no longer counts |
| Heartbeat on a closed session | returned the session normally | **404**, so the gateway prunes its cache instead of keeping ghost entries |

## 3. Resilience

| Property | Groovy | Current |
|---|---|---|
| Process boundary | Monolith: sessions, instances, budget, proxy in one JVM. In-proc events, shared transaction manager — no partial-failure modes between them | Three processes (worker / budget / gateway) + RabbitMQ + HTTP. More failure modes, each explicitly handled |
| Scheduler restart semantics | `scheduleWithFixedDelay(job, 0, delay)` — immediate first run | Same (`scheduleFixedDelay` runs once before the interval). CloseTimedOutSessions stayed inert for its first 2 minutes until 2026-09-17; it now runs immediately, sequenced after ReconcilePendingSessions |
| Worker outage longer than the session timeout | Every open session looks timed out on restart and the immediate first sweep closes them all | Was: the startup grace holds the sweep until the heartbeat senders have had four cycles to re-assert liveness. Since the stored deadline (§7) a passed deadline is met with a notification and an hour of grace, so the startup grace was removed on 2026-09-17 |
| Per-item failure isolation | CloseTimedOutSessions, CloseUserSessions, SizeIdlePool's terminate loop had **no per-item try/catch** — one failure aborted the rest of the sweep | Every sweep isolates each session/instance in its own try/catch and logs |
| Close ordering | Row closed, then instance released, in two separate transactions | **Identical, deliberately preserved** (`closeSession.js`) |
| Release failure path | `FailedToReleaseInstance` → terminate → mark terminated | **Identical** |
| Reserve/release races | Single compare-and-swap UPDATE (`WHERE worker_type IS NULL`) | **Identical** |
| Budget enforcement after an outage | Poll every 11 min — self-healing by construction, and immune to broker loss (no broker involved) | Durable queues + persistent messages + hourly level-triggered re-publish; a dropped event or a failed close heals on the next cycle rather than the next 11 minutes |
| Budget module down | Impossible as a separate failure | Session requests **degrade open** for unknown users, refuse known-locked ones |
| Worker restart | Session + instance state in MySQL and EC2 tags; recovered on restart | **Same**, plus the AWS `Starting=true` poller re-drives provisioning of instances launched before the crash |
| In-memory state lost on restart | Proxy's HTTP-session→sandbox-session map (heartbeats stop until users reconnect) | Same exposure, now split: gateway cache **and** the worker's `lockedUsers` set — the latter is explicitly demoted to a fallback so it cannot mis-gate after a restart |
| Local-dev container leak | Leaked silently | Swept by RemoveOrphanedContainers |

## 4. Net assessment

**Improvements over Groovy:** per-item failure isolation in every sweep; a stored deadline that
survives a restart, moved only by a monotonic ratchet (§7); a real interaction signal that
distinguishes a human from a polling tab, which Groovy had no way to do; heartbeat 404
preventing ghost cache entries; budget enforcement latency down from ≤11 min to event-time; the
timed-out-session sweep no longer punishing sessions for an outage of the process meant to be
watching them; and an instance-liveness probe that no longer reads "I could not ask" as "it is
gone", at a fraction of the cost of the exec-based check it replaced.

**Still worse than the monolith:** the budget check is now a network call rather than an in-process
one, so it needs a fallback path Groovy never needed; and the gateway's heartbeat loop now runs
across a process boundary, so a gateway restart silently stops heartbeats for sessions nobody
touches (see §5.2).

**Unchanged by design:** every timeout constant, the timeout SQL, the two-transaction close, the
5-minute unused-instance min-age, the CAS-based reservation, and the release/terminate error path
are deliberate ports rather than rewrites. The two guards in §1 (startup grace, confirmation
tracker) are the only intentional divergences: both constrain *when* a sweep may act, neither
changes the rule it enforces.

### Why the two guards are asymmetric

The timeout sweep waits 2 minutes after startup; the without-instance sweep does not wait at all.
That is deliberate, and the distinction is the evidence each one reads:

- `update_time` is **destroyed** by a worker outage — nothing can refresh it while the worker is
  down — so after a restart it needs wall-clock time to be rebuilt before it means anything.
- The Docker probe is **regenerated** on every run, including the immediate one at startup, so it
  is trustworthy the instant the worker is back. A grace there would only delay cleanup.

For the same reason the grace *suppresses* the sweep rather than shifting its deadline: suppression
gives every session a fixed amount of wall time to re-heartbeat regardless of how long the outage
lasted, where a shifted deadline still closes everything after a long enough one.

## 5. Current limitations

### 5.1 A crash-looping worker never times out abandoned sessions

**Resolved 2026-09-17** — `STARTUP_GRACE_MS` was removed (see §7's *Effect on §5*). The original
finding is kept below.

`STARTUP_GRACE_MS` is a fixed 2 minutes measured from `start()`, so a worker restarting faster than
that never reaches its first timeout sweep. Abandoned sessions are not closed and keep billing
until the crash loop is resolved. Reproduced deliberately: three restarts 90 s apart left a
40-minute-stale session ACTIVE throughout, and it closed 136 s after the last one.

Bounded by two things: a crash-looping worker is an alarm-worthy condition in its own right, and
the pre-fix code fails *worse* in the same circumstance (it closed every **live** session on each
restart). Only the timeout sweep is affected — dead-instance cleanup actually speeds up under a
crash loop, because each restart's immediate sweep contributes a confirmation.

The remedy, if it ever matters: persist worker liveness (`last_seen`) and set the grace to
`max(0, downtime − uptime)`, which decays to zero as uptime accrues and so cannot be starved. It
costs a migration and a write per minute, which is why it was not taken up front.

### 5.2 A gateway restart stops heartbeats for sessions nobody touches

The gateway's heartbeat loop keys off an in-memory cache rebuilt only when a user request arrives.
After a gateway restart, a session whose owner has no open tab and no SSH connection receives no
heartbeats and times out in 10 minutes. Groovy had the same exposure in a different shape (the
proxy's HTTP-session map lived in the same JVM). Arguably correct — no tab, no SSH, no activity —
but it is a behaviour change users can notice, and it is not guarded.

### 5.3 The AWS hosting service is unverified

`awsInstanceProvider.js` — EC2 tagging, `RunInstances`, `TerminateInstances`, the `Starting=true`
poller — is exercised by neither the test suite (only `aws-sdk-client-mock`) nor dev-env, which
runs `HOSTING_SERVICE=local`. The shared code path (probe, tracker, sweeps) is covered; the
provider beneath it is not. Pre-existing and recorded in `sepal-server-parity-audit.md`.

## 6. Live verification

Everything above was exercised against a running stack on 2026-08-07 — real sessions, real
containers, real sweeps on their production schedule, faults injected by stopping and pausing the
Docker API and by removing containers. 8 campaigns, 46 assertions, all passing. The pre-fix code
was extracted from git and driven with the same faults, so the behaviour changes are measured
rather than asserted.

See **`docs/instance-stopping-simulation.md`**.

## 7. Session expiration — a deliberate divergence (2026-08-13)

`docs/session-expiration-model.md`, implemented on branch `sepal-worker`. This is **not** a port:
it changes behaviour users have relied on for years, and the parity table above should be read with
that in mind.

**What Groovy did.** Lifetime was derived, never stored: `update_time` freshness within 10 minutes,
refreshed by any heartbeat. Two consequences, both long-standing production behaviour:

- **An open app tab kept an instance alive indefinitely.** `SandboxWebProxy` heartbeat every
  sandbox session in its map unconditionally; entries left the map only on Undertow HTTP-session
  destroy, whose 15-minute idle timer was reset by any proxied request — and JupyterLab and RStudio
  poll their backends continuously. The bound was the tab, not the visit: closing it produced a
  close roughly 25 minutes later.
- **An open SSH window kept an instance alive indefinitely, with no bound at all.** `alive.sh`
  looped on the existence of an `ssh` process; there was no analogue of the web path's 15 minutes.

**What replaces it.** A stored `timeout_time`, moved only by a monotonic ratchet, and expiry that
is warned before it is enforced:

| | Groovy | Now |
|---|---|---|
| Lifetime | derived from `update_time` freshness | stored `timeout_time`, ratcheted by `GREATEST` |
| What extends it | any heartbeat from any sender | a human interaction, a busy verdict from the sampler, task progress, or an explicit extend |
| What a forgotten tab buys | forever | one interaction extension, then nothing |
| Unattended compute | ~25 min (tab) / 10 min (disconnected SSH) | up to `MAX_UNATTENDED_HOURS` (12) of load-only extension |
| Warning before close | none | in-app notification → email at +5 min → close at +60 min |
| Runaway protection | none needed — nothing read load | busy extensions are clamped to the cap, so load alone cannot extend past it |

**The trade, stated plainly.** Most unattended compute gains substantially: 12 hours instead of the
~25 minutes an abandoned tab got, or the 10 minutes a disconnected SSH job got. What loses is long
jobs whose owners must now interact once every twelve hours instead of never — a 20-hour training
run guarded by an open tab is a real workflow, and it stops working. Three things blunt that
without erasing it: any interaction re-anchors the twelve hours, the expiry is warned and any use
during the grace rescues it silently, and `MAX_UNATTENDED_HOURS` is per-deployment. It is a trade
worth making, but a trade — and the rollout announcement must say so rather than paper over it.

**Effect on §5.**

- **§5.2 dissolves.** Liveness no longer depends on any process's in-memory cache. If the gateway
  forgot a session, the user has no tab open, and the deadline is the correct arbiter. A restart
  costs at most one interaction report, re-asserted on the next event.
- **§5.1 does NOT.** Storing the deadline removes the *loss* of timing state across a restart,
  which is a different problem from the sweep never running. Closing still requires
  `ExpireSessions`, and `STARTUP_GRACE_MS` still suppresses it for two minutes after every process
  start. A worker crash-looping faster than that reaches no sweep and closes nothing, exactly as
  before. **§5.1 must not be marked resolved on the strength of this work.**
- **§5.1 resolved separately, 2026-09-17.** The stored deadline made the grace redundant rather
  than fixing the gap: a passed deadline now earns a notification and `graceMinutes` before any
  close, so extension senders have an hour to re-assert and the 2-minute suppression protected
  nothing. `STARTUP_GRACE_MS` was deleted. `CloseTimedOutSessions` (PENDING-only) runs in the same
  job as `ReconcilePendingSessions`, after it — sequencing, not wall-clock, is what lets a missed
  activation land first. Every closing sweep now runs on the first tick after start.
