
# Worker session expiration — design

**Status:** design approved 2026-08-12, revised after review 2026-08-13, not implemented
**Date:** 2026-08-12 (revised 2026-08-13)
**Branch:** sepal
**Supersedes:** the heartbeat-based session timeout, and phases 2, 3 and 5 of
`docs/instance-resource-monitoring.md` (phases 1 and 4 — sampling and admin reporting — are
untouched)

## Goal

Replace the heartbeat-derived session timeout with an explicit, stored deadline that events
ratchet forward, so that SEPAL:

1. does not leave unused instances running for too long, and
2. does not close instances that are being used.

The current mechanism satisfies neither well: a session lives as long as *some process*
remembers to heartbeat it, regardless of whether anyone is using the machine, and dies ten
minutes after that process forgets, regardless of what the machine is doing.

Non-goals: changing instance provisioning, the idle-pool sweep, budget enforcement, or the
usage-sampling and admin-reporting work already shipped.

> **Revision note (2026-08-13).** Review found several safety properties stated as prose that the
> mechanism did not enforce, and three overstated guarantees. This revision defines the cap's anchor
> and changes it from a refusal to a clamp (§2), pins the busy metrics to their denominators (§3),
> specifies the cross-origin detection protocol (§4c), adds the transactional rules the "any
> extension cancels" property depends on (§5b), and withdraws the claims about crash-loop recovery
> (§8), guaranteed warning delivery (§5) and nobody losing anything (`master` section).

## Current state

Lifetime today is *derived*, not stored. `timedOutSessions()` closes ACTIVE and PENDING rows
whose `update_time` is more than ten minutes old, AND-guarded by `earliest_timeout_time` (the
keepAlive slider). `update_time` is refreshed by any heartbeat, and there are three senders:

- **gateway** — every session in its in-memory cache, unconditionally, every 30 s
  (`sandboxSessionManager.js`);
- **ssh-gateway `alive.sh`** — every 30 s while an `ssh` client process exists;
- **`updateTaskProgress`** — on every non-terminal task progress report
  (`task/command/updateTaskProgress.js:51`), which is what keeps task-executor sessions alive.

On top of that, phase 2 of the resource-monitoring work added `last_user_activity_time`, stamped
by the worker's clock when a heartbeat carries `{userActivity: true}`. The gateway sets that flag
whenever it proxied *any* request attributed to the session, and `alive.sh` sets it on every beat.

`EvaluateIdleSessions` implements an `OK → WARNED → closed` state machine over the sampled
CPU/GPU/network data, gated behind `IDLE_WARNINGS_ENABLED` and `IDLE_AUTO_SHUTDOWN`, both
defaulting to false. Since `master` is production and the Node `worker` has not shipped, that
machine has never run outside dev-env.

Three problems follow from this shape:

- **A heartbeat proves attachment, not use.** A forgotten browser tab keeps an expensive
  instance alive indefinitely; the gateway heartbeats it forever.
- **Attachment is the *only* thing that can save a session.** A saturated four-GPU instance whose
  owner disconnected from SSH expires exactly like an abandoned one — nothing reads load to
  *extend* a timeout. `docs/instance-stopping-parity.md` §5.2.
- **`last_user_activity_time` does not mean what its name says.** JupyterLab and RStudio poll
  their servers continuously, and every poll is a proxied request, so the flag is closer to "a tab
  is open on a polling app" than to "a human did something".

## Prior behaviour on `master` (the Groovy monolith)

Verified against `master` source on 2026-08-12. This matters because it establishes that the
behaviour being replaced is **long-standing production behaviour faithfully ported**, not a defect
the Node rewrite introduced — and therefore that this design is a deliberate, user-visible
tightening rather than a bug fix.

The Groovy `sepal-server` was heartbeat-based on identical constants: `Timeout.ACTIVE` and
`Timeout.PENDING` are both 10 minutes (`workersession/api/Timeout.groovy`), swept by
`CloseTimedOutSessions`, refreshed by `Heartbeat`. No resource signal of any kind existed —
nothing on `master` ever read CPU, GPU or network.

**An open app tab kept an instance alive indefinitely.** `SandboxWebProxy` scheduled
`endpointProvider.heartbeatSender()` every 30 s. That runnable iterates
`sandboxSessionIdByhttpSessionId` and heartbeats every sandbox session in it *unconditionally* —
it never asks whether a request occurred:

```groovy
def sandboxSessionIds = sandboxSessionIdByhttpSessionId.values().toSet() as Set<String>
sandboxSessionIds.each { sandboxSessionId -> sendHeartbeat(sandboxSessionId) }
```

Entries leave that map in exactly one place, the `sessionDestroyed` listener. So a sandbox session
lived exactly as long as the Undertow HTTP session, which had a **15-minute idle timeout**
(`sandbox.webproxy_session_timeout=900`, `config/sepal.properties`). That idle timer is reset by
any proxied request — `endpointFor` → `username(exchange)` → `getOrCreateHttpSession`, plus
`httpSession.getAttribute(...)`, both of which bump Undertow's session timeout. Because JupyterLab
and RStudio poll their backends continuously, an open tab refreshed the HTTP session forever, and
the heartbeat loop ran forever.

The bound was the tab, not the visit: close it, and polling stops, the HTTP session expires after
15 minutes, heartbeats stop, and the session closes 10 minutes later — roughly 25 minutes from the
last request.

**An open terminal kept an instance alive indefinitely, with no bound at all.** `alive.sh` on
`master` loops on nothing but the existence of an `ssh` client process:

```bash
while ps -u $USER | grep -q " ssh$"
do
    curl -X POST -s "http://sepal/api/sessions/$USER/session/$1"
    /bin/sleep 30
done
```

There is no idle timeout in this path — no analogue of the web path's 15 minutes. A terminal left
open on a laptop, a forgotten tmux pane, or a connection nobody has typed into for days
heartbeated every 30 seconds forever. (The `{userActivity: true}` body in the current `alive.sh`
is a `sepal`-branch addition and never existed on `master`.)

**Consequence for this design.** Two habits that have always worked will stop working: *"leave the
notebook tab open overnight"* and *"leave the SSH window open."* Both are common, and both will now
produce an expiry notification. That is the intent — it is objective 1 — but users experience this
class of change as a regression unless it is announced. This is the main argument for
`SESSION_EXPIRY_MODE=notify` being more than a testing convenience, and for announcing the change
via a normal-priority admin message before enforcing.

It also sets the scale for `maxUnattendedHours`, and the accounting has to run in both directions.
Every workflow that computes *without* an attached client gains enormously: 12 hours instead of the
~25 minutes an abandoned tab gets, or the 10 minutes a disconnected SSH job gets. But a job longer
than 12 hours that is today protected by an open tab or SSH window does lose — on `master` that
works indefinitely, and here the session dies 12 hours after the last actual interaction. A 20-hour
training run guarded by an open tab is a real workflow and it stops working.

Three things blunt that without erasing it: any interaction re-anchors the 12 hours, so checking in
once a day suffices; the expiry is warned and any use during the grace rescues it; and
`maxUnattendedHours` is per-deployment. The defensible claim is **most unattended compute gains
substantially, and what loses is long jobs whose owners must now interact once every twelve hours
instead of never** — a trade worth making, but a trade, and one the rollout announcement must state
rather than paper over.

## Decisions

| Question | Decision |
|---|---|
| Does an attached-but-quiet client keep a session alive? | Only if the user actually interacts. Each attributed interaction ratchets the deadline. |
| How is polling filtered out? | Real input events observed by the GUI, plus pty atime sampled inside the container. Not a URL deny-list. |
| What happens to the idle FSM? | Deleted. The sampler survives and feeds a positive `isBusy` predicate that extends the deadline. "Idle" stops being a state and becomes "nothing extended the deadline". |
| Expiry flow | Notify at expiry → email at +5 min if unacknowledged → close at +grace. Dismiss suppresses the email only. |
| Interaction attribution | Per session. Input in the SEPAL shell — including anything on the expiry notification — extends nothing. |
| Terminals | pty atime sampled by the existing sampler; `alive.sh` deleted. |
| Runaway protection | Hard cap measured from the last human interaction, falling back to activation; the busy ratchet is clamped to it, so load alone can never extend past it. |
| Deadline representation | A stored `timeout_time` ratcheted by `GREATEST`, not a value derived at sweep time. |
| Rollout | Validated on a test instance before production; `SESSION_EXPIRY_MODE` allows running the full UX with enforcement off. |

## Design

### 1. Data model

One migration on the `worker` schema.

**Added to `worker_session`:**

| Column | Type | Meaning |
|---|---|---|
| `timeout_time` | `TIMESTAMP NULL` | the deadline; the only thing that decides lifetime |
| `last_interaction_time` | `TIMESTAMP NULL` | last *human* interaction; anchors the unattended cap |
| `active_time` | `TIMESTAMP NULL` | PENDING → ACTIVE transition; fallback anchor for the cap, and the base for the startup lease |
| `notification_state` | `ENUM('NONE','NOTIFIED','DISMISSED','EMAILED') NOT NULL DEFAULT 'NONE'` | expiry-notification state |
| `notified_time` | `TIMESTAMP NULL` | anchors both the email escalation and the grace clock |

`active_time` exists because `last_interaction_time` is NULL until the first human event, and two
paths reach a busy verdict without one — a task-executor session, and a sandbox session whose job
starts before any app or terminal is opened. Without a fallback anchor the cap has no defined
behaviour in exactly the cases it exists for (§2). It also gives the startup lease a base that is
not distorted by provisioning time.

**Dropped from `worker_session`:**

| Column | Why |
|---|---|
| `earliest_timeout_time` | subsumed — the keepAlive slider becomes an ordinary ratchet |
| `last_user_activity_time` | its definition ("any proxied request") is precisely what is being replaced; renamed rather than redefined so no code silently keeps the old assumption |
| `idle_state`, `warned_time` | deleted with the FSM |

`update_time` is **kept but demoted**: still written on session mutations for audit, and still the
column the PENDING timeout reads, but it no longer decides an ACTIVE session's lifetime. (A
PENDING session's `update_time` is never refreshed — `heartbeat` is a no-op until the session is
ACTIVE — so for PENDING it is effectively the creation time, which is why the PENDING rule can be
left alone.)

The migration is destructive, and is safe only because the Node worker is not in production. The
migration file should say so.

### 2. The ratchet

Every extension is the same operation, and there is no other way to move a deadline:

```sql
UPDATE worker_session
   SET timeout_time          = GREATEST(COALESCE(timeout_time, NOW()), NOW() + INTERVAL ? MINUTE),
       last_interaction_time = IF(?, NOW(), last_interaction_time),   -- human events only
       notification_state    = 'NONE',
       notified_time         = NULL
 WHERE id = ? AND state = 'ACTIVE'
```

Three properties are load-bearing, and all three are properties of this one statement:

- **Monotonic.** `COALESCE` handles the first write; `GREATEST` means events arriving out of order,
  or a small extension landing after a large one, can never shorten a session.
- **Single clock.** Every timestamp is derived from the database's `NOW()`, never from a value the
  caller computed — which is what makes the "clock skew is irrelevant" claim under *Error handling*
  true rather than aspirational, and why extensions are expressed as a duration parameter rather
  than a timestamp.
- **Atomic with the notification reset.** Clearing the notification state in the same statement is
  what makes "any extension cancels the expiry cycle" (§5) a guarantee rather than a race (§5b).
  **The reset is conditional on the deadline actually moving** — see the implementation note below.

> **Implementation note (2026-08-14, from live simulation).** As written above the reset is
> unconditional, and that is wrong for exactly one case: a busy ratchet whose candidate the cap has
> clamped into the past moves the deadline *not at all*, and cancelling the cycle on the strength of
> that no-op means a session past its cap under continuous load re-notifies on every sweep and never
> reaches the end of its grace. Measured: eleven notifications in eleven minutes, and the close only
> landed once the load stopped — the runaway the cap exists to prevent, arriving through the reset.
> The shipped statement therefore guards both notification columns on
> `candidate > COALESCE(timeout_time, NOW())`. Human events are unaffected, because a notified
> session's deadline is by definition in the past and any real extension moves it.
>
> Two further corrections from the same run: the cap reaches SQL in **minutes**, since MySQL rounds
> a fractional `INTERVAL n HOUR` instead of rejecting it (`0.1 HOUR` is zero, `0.5 HOUR` is a full
> hour) and `maxUnattendedHours` is a float; and in `notify` mode the cycle reset also ratchets the
> deadline by one grace period, or a still-expired session would re-notify every minute.

| Event | Ratchet by | Stamps `last_interaction_time` | Capped |
|---|---|---|---|
| Session requested (PENDING) | `startupLease` (30 min) | — | — |
| Session activated | re-ratchet to `active_time + startupLease` | — | — |
| App opened / terminal opened | `openExtension` (15 min) | yes | no |
| Association replayed after a ws reconnect | **nothing** | no | — |
| Real user interaction (GUI input or pty input) | `interactionExtension` (15 min) | yes | no |
| Busy verdict from the sampler | `busyExtension` (15 min) | **no** | **yes** |
| Manual extend (slider, notification button, email link) | requested amount | yes | no |
| Task progress | `taskExtension` (15 min) | — | no |

**Activation re-ratchets the lease.** The lease is stamped at request time, but provisioning can
take many minutes, so a session that took eight minutes to come up would otherwise reach ACTIVE
with 22 minutes left. On the PENDING → ACTIVE transition the session stamps `active_time` and
ratchets to `active_time + startupLease`, giving every session the same full lease from the moment
it is usable. Monotonicity means this can only ever help.

**A ws reconnect is not an open.** When the browser's websocket drops, the GUI replays every open
tab's app association to recover ownership from the old `clientId`'s `clientDown`. That reaches the
same `associateApp` a real open does, so it used to ratchet — re-anchoring the unattended cap on a
browser event no human caused, and re-arming every forgotten tab on each reconnect. The replay now
carries a `reassert` flag (GUI → `POST /api/sandbox/start?reassert=true` → gateway → the worker's
associate body) and refreshes ownership only. It is the same judgement §4c makes about proxied
requests: continuous machine traffic from an open tab proves nothing about a user being there. The
flag fails toward "real open" — only a literal `true` suppresses the ratchet — so a garbled report
costs a session nothing.

That the busy verdict does *not* stamp `last_interaction_time` is the entire mechanism of the cap.
Two details decide whether it is a cap at all.

**The anchor must be defined when nobody has ever interacted.** `now − NULL` is not a number, and
in SQL it evaluates to NULL, making the comparison false and the busy ratchet **unbounded** — the
opposite of the intent, in precisely the cases the cap exists for. So:

```
unattended_anchor = COALESCE(last_interaction_time, active_time)
```

**The cap clamps; it does not refuse.** Refusing once `now` is already past the boundary lets a
verdict landing one second before it push the deadline to `anchor + 12 h + busyExtension`. The
bound is applied to the candidate instead, so the busy ratchet uses:

```sql
timeout_time = GREATEST(
    COALESCE(timeout_time, NOW()),
    LEAST(NOW() + INTERVAL ? MINUTE, unattended_anchor + INTERVAL ? HOUR)
)
```

Clamping subsumes refusal: past the boundary the clamped candidate is already in the past, so
`GREATEST` keeps the existing deadline and the ratchet becomes a no-op with no separate rule. The
`LEAST` clause appears only here — human and task events use the unclamped form above and are never
refused, so 12 hours is a hard bound measured from the anchor.

An overnight job is covered. A crashed process spinning a core stops buying time twelve hours
after the last keystroke. A user at the keyboard is never cut off.

**Two rules that are not deadlines:**

- **PENDING is unchanged.** A PENDING session still times out ten minutes after it was created.
  The startup lease applies to ACTIVE sessions; a hung provision should die in ten minutes, not
  thirty.
- **A session with a PENDING or ACTIVE task never expires**, regardless of deadline or cap.
  Checked in the sweep rather than encoded in the deadline, so a task submitted during the grace
  period also cancels the close.

### 3. The busy verdict

`isBusy` is a *positive* predicate over `instance_usage_sample`, not `!isIdle`. The distinction
matters: the idle verdict is fail-safe in one direction only — missing samples read as "not idle",
which spares a session. Feeding `!isIdle` into a deadline would invert that fail-safe, making an
unreachable instance immortal.

Over `busyWindowMinutes` (10), a session is busy when sampling coverage meets the existing
80 %-of-visible floor **and** any of average CPU, average GPU, or average network is at or above
its threshold. Thresholds are inherited from the idle policy: CPU 5 %, GPU 5 %, network 50 KB/s.

A threshold means nothing without its denominator, so each is pinned to what the sampler actually
computes (`computeUsage.js`):

| Metric | Scope | Definition | Threshold |
|---|---|---|---|
| CPU | container | `(Δcontainer_cpu / Δsystem_cpu) × online_cpus / instance_cores × 100` — percent of the **whole instance's** cores, not of one core and not of a cgroup quota | 5 % (0.8 cores on a 16-core instance) |
| GPU | device | `nvidia-smi --query-gpu=utilization.gpu`, **mean across devices** — whole-device utilization, not per-process | 5 % (one saturated GPU of eight reads 12.5 %) |
| Network | container | `Δ(rx + tx)` summed over the container's interfaces, per second | 50 KB/s |
| RAM | — | sampled, but **not** part of the verdict | — |

RAM is excluded deliberately: it is a level, not a rate. A finished process that has not exited
holds its heap indefinitely, so a RAM threshold would keep dead sessions alive — the exact failure
the positive predicate exists to avoid.

GPU attribution is unambiguous here despite being per-device, because at most one ACTIVE session is
bound to an instance (`sessionOnInstance`). If that ever stops holding, the metric stops meaning
anything.

Container-scoped network has two consequences. Downloads count as work, which is correct. But so
does anything else chatty in the container — background services, package-index refreshes, and the
proxied HTTP traffic itself. That second one could quietly re-create the immortal-tab failure the
interaction filter exists to remove, arriving through the resource signal instead of the heartbeat.

**Measured on the test server (2026-08-13), and both thresholds fail.** Jupyter Notebook, JupyterLab
and RStudio open on one T3aSmall sandbox, all three idle and untouched, sampled for 13 minutes:

| Phase | n | network | CPU |
|---|---|---|---|
| nothing open | 25 | 0.01 KB/s | 0.15 % |
| three apps open, idle | 13 | **14.7 KB/s** (max 15.0) | **1.48 %** |

That is 29 % of the 50 KB/s network threshold and 30 % of the 5 % CPU threshold — a margin of 3.4×,
not the ~25× this document previously assumed. Both floors scale with the number of open apps at
roughly **4.9 KB/s and 0.44 % CPU per idle app**, so about ten idle tabs cross both thresholds and
pin the session permanently busy. The design's own suggested mitigation does not help: rx and tx are
near-symmetric (7.2 and 8.0 KB/s), so thresholding them separately preserves the same 3.4×.

**CPU normalized to the whole instance is worse than a tuning problem.** `cpu_pct` is
`coresUsed / instance_cores`, so what counts as busy depends on the instance size:

| Situation | T3aSmall (2 cores) | 64-core instance |
|---|---|---|
| three idle app tabs | 1.5 % | 0.05 % |
| one genuine single-core job | 50 % | **1.6 % — below threshold** |

A real one-core job on a large instance therefore reads as *idle* and its session dies, while enough
idle tabs on any instance read as *busy* and their session never dies. Both failure modes are
present at once and no single percentage fixes them, because the quantity that matters — how much
work is happening — is absolute, not proportional.

The fix on both counts is to threshold the absolute quantity: **cores used** rather than percent of
instance (`coresUsed` is already computed in `computeCpuPct` before the division), and a network
threshold set where real transfers live rather than where polling does. Three idle apps use 0.03
cores; a one-core job uses 1.0 core on any instance size. Proposed replacements are in
*Configuration*, and they are proposals — the numbers below want one more measurement round against
a busier app mix before being fixed.

These thresholds were inherited from the idle policy, where crossing one meant *do not warn* — a
fail-safe direction. Feeding the same numbers into a deadline reverses their meaning, and the
inherited values were never chosen for that.

**Coverage below the floor is treated as busy** for up to `unknownBusyGraceTicks` (10) consecutive
ticks, counted per session and reset by any tick that does meet the floor. This is the deliberate answer to the inversion above: under the old FSM missing data spared
a session, and under a deadline it would kill one. A Docker-API blip must not close a computing
instance. After the grace ticks are exhausted the session stops being extended, so a genuinely
dead instance still expires — and `CloseSessionsWithoutInstance` reaches it first in most cases.

The sampler writes the ratchet itself, on its existing 60 s cadence. It must not depend on any
idle-policy flag, and it is already always-on.

`idleMinHourlyCost` does **not** apply. The cost filter existed to decide who gets *nagged*, not
who gets killed; a cheap instance's long job deserves the same protection.

### 4. The interaction signal

Two sources, split by *what is being used* rather than by which client is in front of the user:
apps are observed in the browser, terminals are observed inside the instance. Every terminal —
web or SSH — goes through §4b, and the GUI observes only app iframes. See "Why the web terminal is
not a browser signal" at the end of §4b.

#### 4a. Browser — app iframes

Apps render in **same-origin** iframes (`appInstance.jsx:58`; the code already reaches into
`iFrame.contentWindow.document`). The GUI attaches capture-phase, passive listeners for
`pointerdown`, `keydown`, `wheel` and `touchstart` on the iframe's `contentDocument`, re-attaching
on the existing `onLoad` hook (`appInstance.jsx:127`) because apps navigate their frame after
sign-in.

Reports are coalesced to at most one per session per `interactionReportIntervalSeconds` (60).

**Attribution is per session.** Input inside an app iframe bound to session X extends only session
X. Input in the SEPAL shell — menus, recipe editor, file browser, and critically the expiry
notification itself — extends nothing, because none of it needs a sandbox instance. This falls out naturally:
only the visible, focused tab receives input, so three open app tabs are not all extended by work
in one.

**Transport reuses the gateway's existing loop** rather than adding a channel. The GUI posts
`{sessionId}` to the gateway; the gateway sets the `pendingActivity` marker it already maintains;
the next 30 s beat carries the flag to the worker, which ratchets. The loop already batches,
already prunes its cache on a 404, already tolerates a briefly unreachable worker, and is already
tested.

The only deletion needed is the four `recordActivity` calls inside `resolveTarget`
(`sandboxSessionManager.js:443-478`). *That* is the polling leak, and removing it is the whole
filter.

#### 4b. Terminals — from inside the instance

The sampler adds one `exec` per tick beside `nvidia-smi`: read the atime of `/dev/pts/*` and take
the most recent. A tick counts as an interaction when that maximum **advanced since the previous
tick**, not when it falls within some window of now — the window form silently drops input landing
near a tick boundary or during a slow sample, and the comparison form does not.

**The atime/mtime split is what makes this work, and it was verified empirically** (2026-08-12,
Linux 6.12, `os.openpty()` with a 10 s gap to defeat `tty_update_time`'s ~8 s coarsening):

| Direction | atime | mtime |
|---|---|---|
| Program output (slave writes, master reads) | unchanged | changed |
| User input (master writes, slave reads) | **changed** | unchanged |

So a job printing a thousand log lines to an abandoned terminal does not touch atime, and one
keystroke does. This is the same fact `w`'s IDLE column has always been derived from, but read
directly: `stat` on the device is preferred to `w`/`who`, which need utmp entries that are
unreliable in containers.

The ~8 s update coarsening in the kernel is far below the 60 s sampling interval and so is
irrelevant here — but it is why this cannot be made much finer-grained later without changing
approach.

**Confirmed on the production sandbox image** (test server, 2026-08-13, `stat -c '%X %Y %n'
/dev/pts/[0-9]*` inside a running sandbox container). Four results, in ascending order of how much
they matter:

| Observation | Result |
|---|---|
| Input advances atime on the pty being typed into | yes, in ~8 s steps |
| Output advances mtime but **not** atime | yes — a pty written to for 32 s held atime constant while mtime moved +32 |
| Nothing in the image touches pty atime in the background | four idle ptys frozen across a 22-minute window |
| `relatime` does not suppress repeated atime updates | yes — three input rounds with mtime frozen each advanced atime |

The third is the one that would have been fatal and silent: a supervisor, keepalive or monitoring
script reading `/dev/pts/*` on a timer would register phantom interaction on every session forever,
making the filter useless without ever raising an error. The fourth was a live concern because
`relatime` normally suppresses an atime update once atime is newer than mtime — it does not apply
here, since `tty_update_time` writes the inode directly rather than going through `touch_atime()`.

**The exec must not use `Tty: true`.** This was found by testing and it would have made the feature
silently inert. A Docker exec created with `Tty: true` allocates a pty *inside the container*, which
appears in `/dev/pts/` with `atime` equal to the moment of the exec — so the sampler's own
measurement is indistinguishable from a keystroke. Reading max-atime would return `now` on every
tick, every session would be extended forever, and nothing would ever log an error.

Verified on the test server (2026-08-13, sandbox container, Docker Engine 25.0.16, API v1.44):

| Exec | What its own `stat` sees | Container devpts observed from the host |
|---|---|---|
| `Tty: true` | four real ptys **plus a fresh one at `now`** | the extra pty is really there |
| `Tty: false` | the four real ptys only | unchanged |
| no exec at all | — | four real ptys, all frozen |

This matters because `gpuStats` already execs `nvidia-smi` with `Tty: true` (`dockerInstanceStats.js`)
and the natural implementation puts the pty read beside it. Two rules follow:

1. **The pty exec is created and started with `Tty: false`,** which multiplexes stdout in 8-byte
   frame headers rather than returning raw text — the parser must demux, unlike `parseGpuCsv`.
2. **A pty created this tick is ignored,** because the exec pty lingers briefly after the exec exits
   (a `Tty: false` stat issued immediately after a `Tty: true` exec still saw it). The discriminator
   is `ctime`: `stat -c '%X %Z %n'`, skipping rows whose `%Z` is within the tick window. A real
   terminal's ctime is its allocation time and stays put — measured 22 minutes of atime movement on
   a pty whose ctime never budged — because `tty_update_time` writes atime/mtime directly and does
   not touch ctime. A brand-new terminal is not lost by this rule: ssh-gateway's one-shot
   "terminal opened" extension already covers it.

**Most ptys in a sandbox are not terminals.** Process ancestry on the test container (2026-08-13):

| pty | owner |
|---|---|
| `pts/0` | `supervisord` (PID 1), with `start-jupyter`, `rserver`, `start-shiny-server`, `sshd` as children |
| `pts/1` | `sudo` → `shiny-server` |
| `pts/2` | `sudo` → `jupyter-server` |
| `pts/3` | `bash` ← `sshd` ← `sshd` ← `sshd(66)` — the only user terminal |

Two things follow. The good one: `pts/3`'s ancestry confirms the signal was verified on a genuine
**sshd-allocated** pty, not just a synthetic `openpty()` — which is the path both SSH and the web
terminal reach (§4b). The watch item: three of the four ptys belong to supervised services, so any
sandbox image whose service reads from its controlling tty on a timer would manufacture phantom
interaction and make every session on that image immortal. All three were inert here — frozen for
3.5 hours — but that is a property of the current image, not of the design, and it should be
re-checked whenever the sandbox image's supervision changes.

**What remains untested:** other hosting providers and sandbox images — with the service-pty caveat
above being the specific thing to look at, since the kernel mechanism itself is common to all.

**Why the web terminal is not a browser signal.** It would be easy to read xterm's input callback
in the GUI, but it would be redundant. The terminal module spawns `node-pty` running an *ssh
client* (`terminal/src/session.js:51`), which connects to sshd in the sandbox — so there are two
ptys, and the shell's pty, the one this sampler stats, is inside the sandbox container either way.
Keystrokes reach it identically whether they came from xterm over a websocket or from `ssh` on a
laptop. Adding a browser path would mean a second code path and a second set of tests for a signal
already covered, and would give web-terminal users better treatment than SSH users for no
principled reason. One mechanism, uniform semantics for every terminal.

The consequence to accept: if the `exec` fails, terminals have *no* interaction signal (§4c rule
2) — there is no browser-side backstop for the web terminal. That is the right trade only because
the failure is not selective: a broken exec fails SSH users too, so a browser backstop would have
patched a third of the problem while making the design look complete.

`alive.sh` is then dead weight — an open-but-untouched SSH connection is exactly what has been
decided should not extend — and is deleted. ssh-gateway instead fires a one-shot "terminal opened"
extension on connect, and pty sampling carries it from there.

#### 4c. Fail-open

Three places where the signal can fail, all resolved toward keeping the session:

1. **Iframe inaccessible** (an app navigates genuinely cross-origin) → fall back to counting
   proxied requests for that session, i.e. today's behaviour. That app can then keep itself alive
   by polling — worse for objective 1, but it never destroys someone's work.

   This needs a protocol, not just an intention. The gateway sees proxied requests but cannot tell
   *"the GUI cannot observe this app"* from *"the GUI can observe it and nobody is touching it"*,
   and those must produce opposite outcomes. So the GUI declares it: on mounting an app iframe, and
   again on every `onLoad`, it attempts to attach its listeners and reports
   `{sessionId, observable: true|false}` — `false` when the attach throws. The gateway holds the
   flag per session with a short TTL refreshed by each report, and counts proxied requests as
   interactions **only** for sessions currently flagged `observable: false`.

   The default with no report is `observable: true`, i.e. proxied requests do not extend. This is a
   deliberate exception to fail-open, chosen on which failure gets noticed: defaulting the other way
   means one bug in GUI reporting silently reverts every session to the old behaviour and the filter
   stops working with no symptom at all. Defaulting this way, the same bug appears as sessions
   expiring while someone is working — loud, reported, and caught by the notification and the
   60-minute grace before anything is lost.
2. **pty exec fails** → no terminal signal; the CPU/network busy verdict still applies.
3. **Sampler coverage below the floor** → busy, bounded by `unknownBusyGraceTicks` (§3).
4. **A lost ratchet write** is harmless only for the *recurring* signals — busy verdicts,
   interaction reports and task progress all repeat within a minute or two. The one-shot events (app
   or terminal opened, the in-app Extend button, the email link) have no successor to re-assert
   them, so losing one loses the extension outright, and the Extend button in particular would
   appear to work while doing nothing. Those must be acknowledged by the worker, retried by the
   sender, and surface failure in the UI. Retries are safe because the ratchet is monotonic and its
   magnitude is a duration applied to `NOW()`.

### 5. Expiry, notification, grace

A single `ExpireSessions` sweep on the existing 1-minute cadence. All values configurable.

| When | Condition | Effect |
|---|---|---|
| **T+0** | `timeout_time < now`, no PENDING/ACTIVE task, state `NONE` | `notification_state = NOTIFIED`, `notified_time = now`; ws push → in-app notification with `[Keep it running 60 min] [Terminate now]` |
| **T+`notificationVisibleMinutes`** (5) | still `NOTIFIED` | send email with one management link → `EMAILED` |
| **T+`graceMinutes`** (60) | state ∈ {`NOTIFIED`, `DISMISSED`, `EMAILED`} and mode = `enforce` | close via the guarded path in §5b |
| **T+`graceMinutes`** (60) | same, but mode = `notify` | record a would-have-closed metric, reset the cycle to `NONE` |

**Any extension event, at any point, cancels the whole thing** — ratchets `timeout_time`, resets
`notification_state` to `NONE`, clears `notified_time`, and pushes a ws update that dismisses the
notification. The common rescue therefore needs no interaction with the notification at all: a
user who simply goes back to typing in their notebook is saved silently. The keep-running button
exists for the case where the machine is wanted but not being touched.

**Dismissing the notification — clicking it — means only "I saw it, don't email me."** The session
still closes at T+grace. It is not read as consent to close early: an easy misclick must not
destroy a session. Closing early is the separate `[Terminate now]` button.

The `OK → WARNED` transition's race-safety technique carries over — the state advance is a guarded
`UPDATE` on `notification_state`, so exactly one sweep observes each transition and the
event/email fire once.

**Leaving task protection restarts the cycle.** Excluding sessions with a PENDING or ACTIVE task
from the sweep is not the same as cancelling the expiry cycle, and treating them as equivalent
produces a session that closes with no usable warning:

> Session expires and goes `NOTIFIED` → a task starts and runs three hours → the sweep skips the
> session throughout → the task ends → `notified_time` is three hours old, well past grace → the
> next sweep closes immediately.

The warning was issued three hours before the user could act on it. So task protection is expressed
as a ratchet, not only as a filter: task progress ratchets and resets the notification state like
any other extension event, and the PENDING/ACTIVE-task check in the sweep is a second, independent
guard rather than the only one. A session leaving protection therefore always starts a fresh cycle.

**`notify` mode must not accumulate state.** If sessions sat in `EMAILED` for as long as they were
expired, switching production from `notify` to `enforce` would close every accumulated session on
the first sweep — the worst possible first impression of the feature, delivered to exactly the users
who had already ignored a warning. In `notify` mode the sweep records what it would have done and
resets to `NONE`, so flipping to `enforce` starts everyone from a fresh warning. That
would-have-closed counter is the number worth watching during rollout step 4.

**What "notified" does and does not guarantee.** A persisted `notification_state` records that the
system *attempted* to warn, not that anyone was told: the ws push reaches only a connected browser,
a user with no tab open sees nothing until they return, and mail can fail or be filtered. The
honest claim is a best-effort warning plus a grace period in which any normal use silently rescues
the session — still strictly more than the current behaviour, which closes with no warning at all.

#### 5a. The email management link

The email must be actionable from a phone, without an active browser session. It carries **one**
link, to a page offering both choices the in-app notification does — keep it running, and stop it
now — because for a user who is not looking at SEPAL, the mail *is* the notification.

One link rather than two: a mail is read on a phone, and a destructive action one tap from the
inbox is a mis-tap waiting to happen. Reaching *stop* always costs a page load first, which is
also where the consequences are spelled out.

`GET /api/sessions/expiry/:token` renders that page; each button `POST`s the same token back to
the same URL with a hidden `action` field, and the action happens on the `POST`. **The `GET` must
not mutate anything** — mail-client link scanners, corporate URL-rewriting proxies and preview
fetchers all fire it, so a mutating `GET` would act for users who never opened the mail and spend
the token before the real click arrived, which for termination means destroying an instance nobody
asked to destroy. A `POST` naming no action, or one the server does not implement, does nothing and
re-renders the page: guessing a default would eventually guess `terminate` for someone who never
asked.

The token is an HMAC over `(sessionId, notifiedTime)` with a server-side secret, valid until
`notified_time + graceMinutes`. It authorises a decision about one session's expiry, **either
way**. The action is deliberately not signed into it: with a single link leading to a page that
offers both buttons, scoping the token to one action would protect nothing while implying a
guarantee it cannot make.

Binding the token to `notified_time` gives single-use semantics *provided redemption is a guarded
update* — the HMAC alone proves only that the token is well-formed, and two concurrent clicks both
verify. Redemption is therefore `UPDATE … WHERE id = ? AND notified_time = ?` and only the
transaction that changed a row acts. **Both** actions are guarded this way, and for terminate the
guard carries most of the value: any extension clears `notified_time`, so a user who went back to
work cannot have their instance killed by a link left sitting in an inbox. Terminate deliberately
drops the sweep's grace and running-task predicates — this is someone asking explicitly, exactly
as the in-app `[Terminate now]` button is. After the session is gone the link is dead, and the
endpoint returns a page saying so rather than a bare error — someone clicked a link in an email and
needs to be told what happened.

`emailExtensionMinutes` is its own key, defaulting to 60 to match the in-app button. It stays
separately configurable rather than sharing `manualExtensionMinutes` because email delivery plus
"find a laptop" is itself several minutes, so the email path may yet deserve a different value.

Without `SEPAL_ENDPOINT` there is no absolute URL worth putting in a mail, so the link is omitted.
The mail still goes out, and using the instance rescues it just as well.

#### 5b. The concurrency contract

The sweep reads, decides, and writes; extension events arrive continuously from four independent
senders. "Any extension cancels the expiry" is a claim about interleaving, and it is only true if
written down as one. Three rules, all compare-and-set on `worker_session`:

1. **Extension is one statement.** The ratchet, the `last_interaction_time` stamp and the
   notification reset are a single `UPDATE` (§2). A read-modify-write would let a sweep observe a
   cleared notification with a stale deadline, or the reverse.
2. **Every sweep transition is guarded on the state it observed** — `UPDATE … WHERE id = ? AND
   notification_state = ?`, acting only if a row changed. Exactly one sweep observes each
   transition, so the event and the email fire once even if a sweep overruns its minute.
3. **The close re-checks everything it decided on, in the transaction that closes.** Selecting
   candidates and then closing them is a lost update waiting to happen: an interaction landing
   between the two loses to a decision made before it arrived. The first transaction of the existing
   two-transaction close becomes:

   ```sql
   UPDATE worker_session
      SET state = 'CLOSED'
    WHERE id = ?
      AND state = 'ACTIVE'
      AND timeout_time < NOW()                 -- not re-ratcheted since selection
      AND notification_state = ?               -- as observed
      AND notified_time = ?                    -- as observed; also invalidates issued tokens
      AND notified_time < NOW() - INTERVAL ? MINUTE
      AND NOT EXISTS (
          SELECT 1 FROM task
           WHERE session_id = worker_session.id AND state IN ('PENDING', 'ACTIVE'))
   ```

   Zero rows changed means something rescued the session in the interval, and the sweep moves on
   without teardown. The task check appears here as well as in candidate selection precisely because
   a task can start during the grace period.

The general rule: **the sweep may never act on a fact it read earlier.** Every decision is
re-asserted as a predicate in the statement that acts on it.

### 6. What is deleted

- `workerSession/command/evaluateIdleSessions.js` and its tests; `idle_state`, `warned_time`; both
  idle emails; the `SessionIdleWarned` / `SessionIdleClosed` events and their two gateway
  subscribers (`workerSessionIdleWarnedSubscriber.js`, `workerSessionIdleClosedSubscriber.js`) —
  all replaced by the single expiry notification.
- The ACTIVE branch of `closeTimedOutSessions.js` and the `update_time` freshness SQL in
  `timedOutSessions()`. The PENDING branch stays exactly as it is.
- `setEarliestTimeoutTime` → becomes `extendSession`; `earliest_timeout_time` folds into
  `timeout_time`. The GUI slider keeps its shape and becomes a ratchet.
- The `recordActivity` calls in `resolveTarget`.
- `ssh-gateway/script/alive.sh`, and the `{userActivity: true}` body it sent.

### 7. What is untouched

The sampler, `instance_usage_sample` / `instance_usage_hourly`, the Prometheus gauges, and the
admin usage reports — none of that is lifecycle code, and phase 4's reporting keeps working
unchanged. Likewise `CloseSessionsWithoutInstance`, `ReleaseUnusedInstances`, `SizeIdlePool`, the
budget and locked-user paths, and the two-transaction close ordering.

~~The 2-minute startup grace on the expiry sweep stays~~ — **removed 2026-09-17.** It was kept on
the argument that extension senders need wall-clock time to re-assert after an outage, but under
this model the first thing the sweep does to a passed deadline is *notify*, and the close is
`graceMinutes` later: the senders have an hour, not two minutes, and bare heartbeats no longer
extend anything to re-assert with. The grace protected nothing and was the sole cause of the
crash-loop gap in §8. `CloseTimedOutSessions` (PENDING-only) now runs in the same job as
`ReconcilePendingSessions`, after it, which is the ordering the grace was papering over.

### 8. What this fixes, and what it does not

Of the two findings in `docs/instance-stopping-parity.md`, one dissolves and one does not.

- **§5.2 — a gateway restart stops heartbeats for sessions nobody touches. Dissolved.** Liveness no
  longer depends on any process's in-memory cache. If the gateway forgot a session, the user has no
  tab open, and the deadline is the correct arbiter. A restart costs at most one interaction report
  and one `observable` flag, both re-asserted on the next event.
- **§5.1 — a crash-looping worker never times out abandoned sessions. Not fixed by this design;
  fixed 2026-09-17 by removing the grace.** An earlier draft of this design claimed the durable
  deadline fixed it. It did not: storing the deadline removes the *loss* of timing state across a
  restart, which is a different problem from the sweep never running, and `STARTUP_GRACE_MS` still
  suppressed `ExpireSessions` for two minutes after every process start. What closed the gap was
  noticing that the grace had nothing left to protect (§7): with the sweep running on the first
  tick after start, a crash loop that reaches the sweep at all now closes what is due.

This is a deliberate divergence from the Groovy monolith rather than a port, and needs its own
entry in `docs/instance-stopping-parity.md`.

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `SESSION_EXPIRY_MODE` | `off` | `off` \| `notify` \| `enforce` — `notify` runs the full UX without closing anything |
| `startupLeaseMinutes` | 30 | initial deadline on session request |
| `openExtensionMinutes` | 15 | app or terminal opened |
| `interactionExtensionMinutes` | 15 | per attributed human interaction |
| `busyExtensionMinutes` | 15 | per busy verdict from the sampler |
| `taskExtensionMinutes` | 15 | per task progress report |
| `manualExtensionMinutes` | 60 | in-app Keep-it-running button |
| `emailExtensionMinutes` | 60 | email keep-running link |
| `maxUnattendedHours` | 12 | cap on load-only extension, from `last_interaction_time` |
| `notificationVisibleMinutes` | 5 | unacknowledged notification → email |
| `graceMinutes` | 60 | notification → close |
| `interactionReportIntervalSeconds` | 60 | GUI report coalescing |
| `unknownBusyGraceTicks` | 10 | consecutive below-coverage ticks treated as busy |
| `busyWindowMinutes` | 10 | rolling window for the busy verdict |
| ~~`busyCpuThresholdPct`~~ → `busyCpuCores` | ~~5 %~~ → 0.5 cores | absolute cores used; percent-of-instance fails on both large and tab-heavy instances (§3) |
| `busyGpuThresholdPct` | 5 | unchanged — already device-absolute |
| `busyNetworkThresholdKBps` | ~~50~~ → 500 | measured idle floor is 14.7 KB/s for three apps and scales per app (§3); real transfers run at MB/s |

Defaults are deliberately generous where a mistake costs a user their work. They should be
tightened from production data, not loosened from complaints.

## Error handling

- Per-item try/catch in the sweep, matching every other sweep in the module. A failed notification
  never blocks the close; a failed close never blocks the next session.
- The email is attempted once and the state advances to `EMAILED` regardless of the result, logging
  failures. A permanently failing address must not turn the sweep into a per-minute retry loop.
- Ratchet writes are narrow single-row `UPDATE`s, and safe to lose **only for the recurring
  signals**; the one-shot events need acknowledgement and retry (§4c rule 4).
- All times are derived inside the database via `NOW()` (§2), which is what makes clock skew
  irrelevant — not any process being trusted to stamp correctly. Client-supplied timestamps are
  never accepted.
- GUI listener attachment is wrapped in try/catch; an inaccessible frame degrades to §4c rule 1
  rather than throwing into the render path.

## Testing

- **Unit** — the ratchet, including `NULL` handling and out-of-order arrival; the cap clause
  clamping busy but not human events, **including the boundary case** (a verdict one second before
  the cap must not push the deadline past it); the anchor falling back to `active_time`, so a
  task-executor session that never had a human interaction still hits the cap; the four
  `notification_state` transitions and their race-safe guard; the `isBusy` verdict including the
  coverage-grace inversion; pty-atime advance detection across ticks.
- **Concurrency** — an interaction landing between candidate selection and the close leaves the
  session open (the guarded close changes zero rows); two concurrent sweeps produce one notification
  and one email; a token is redeemable once under concurrent redemption; a `GET` of the email link
  does nothing; a `POST` with no or an unknown action does nothing; an extension between the mail
  and the click spends the token for BOTH buttons.
- **Lifecycle** — notified, then a three-hour task, then task end must not close immediately but
  start a fresh cycle; `notify` mode returns sessions to `NONE` after grace, so flipping to
  `enforce` closes no backlog on the first sweep.
- **Repository** — the new columns and the sweep SQL, using the existing injectable-pool pattern.
- **Regression, gateway** — the inverse of the existing test at `sandboxSessionManager.test.js:261`:
  a proxied request alone must *not* set the interaction flag. That single test is the filter's
  guarantee, and it should be named so that deleting it looks alarming.
- **GUI** — listener attach/detach across iframe reload, report throttling, and the cross-origin
  fallback path.
- **Integration, dev-env (local provider)** — open an app, confirm the deadline moves on typing and
  *not* on background polling; stop, and watch notify → email → close with
  `SESSION_EXPIRY_MODE=enforce` and compressed timers.
- Worker test baseline is 560 pass + 1 known unrelated failure
  (`waitUntilDockerIsAvailable` fake-timer leak).

## Rollout

1. Implement with `SESSION_EXPIRY_MODE=off`. Deadlines are computed and recorded; nothing closes.
2. On the test instance, run at `notify` with compressed timers. This is where the three empirical
   claims the design rests on get measured, none of which can be reasoned to a conclusion: §4a's
   input signal against the actual JupyterLab and RStudio builds in use; the **idle-tab network
   floor** of those same builds against the 50 KB/s threshold (§3); and **pty atime behaviour** on
   each production sandbox image and provider (§4b — closed for the current image on 2026-08-13,
   still open for other images and providers). A failure in any one changes the design, not just a
   constant.
3. `enforce` on the test instance with production timers.
4. Production at `notify` first, with an admin message announcing the change. Per the `master`
   section above, this ends two habits users have relied on for years; the notification-only period
   is what turns that from a surprise into a warning.
5. `enforce` in production, with the generous defaults above.

A test instance validates the mechanism, not the thresholds. How often a real user goes fifteen
minutes without an attributed interaction is a behavioural number that only appears in production
— which argues for shipping generous defaults and tightening, not for delaying.

## Open questions

The first three are release gates rather than open questions — the design is not validated until
they are answered with measurements.

1. ~~**The crash-loop enforcement gap is unfixed** (§8).~~ **Closed 2026-09-17** — `STARTUP_GRACE_MS`
   was removed rather than made restart-satisfiable, since the notification cycle already gives
   extension senders an hour (§7, §8).
2. **The idle floor was measured on 2026-08-13 and both thresholds failed** (§3). Three idle apps
   sit at 29 % of the network threshold and 30 % of the CPU threshold, scaling per app, so ~10 idle
   tabs make a session permanently busy — the immortal-tab failure, arriving through the resource
   signal. Separately, percent-of-instance CPU makes a real one-core job on a 64-core instance read
   as idle. **This is the one open item that changes the design rather than a constant:** the busy
   verdict must threshold absolute cores and a much higher network rate. Proposed values are in
   *Configuration*; they need one more measurement round against a busier app mix, and against a
   large instance, before being fixed.
3. ~~**pty atime behaviour is one experiment on one kernel**~~ — **closed 2026-08-13** on the
   production sandbox image (§4b): the input/output split, the absence of a background atime toucher,
   and `relatime` non-interference all confirmed in a live container. Residual: other providers and
   images, and an sshd-allocated pty.
4. **`emailExtensionMinutes` was raised from 15 to 60.** Delivery latency plus reaching a computer
   is itself several minutes, so a short extension is routinely clicked with a good part of it
   already spent. Whether an hour is the right size — for the email path or the in-app button —
   needs one round of real use to say.
5. **Nested cross-origin frames and closed shadow roots are invisible** to §4a's listeners.
   JupyterLab and RStudio are single-document apps today, so the approach should hold, but that is
   an empirical claim about specific app versions rather than a guarantee. Rule 1 of §4c is the
   mitigation; whether it is ever exercised is a question for step 2 of the rollout.
6. **Should task-executor sessions have a cap at all?** They are protected absolutely by the
   PENDING/ACTIVE task rule, so a wedged task that never reports terminal state pins an instance
   indefinitely. `CancelTimedOutTasks` is the existing backstop; whether it is sufficient here has
   not been re-examined.
7. **Should the in-app notification appear for sessions whose apps are not open in this browser?**
   A user with SEPAL open in one tab and no app tabs would see a notification for a session they
   cannot see. Probably yes — it is actionable either way — but the Usage panel may be the better
   surface for it.
