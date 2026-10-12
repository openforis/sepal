
# Worker session expiration — Groovy vs. the new model

**Status:** design approved 2026-08-12, revised after review 2026-08-13, not implemented
**Date:** 2026-08-13
**Branch:** sepal
**Companion to:** `docs/session-expiration-model.md` (the design itself)

> **Revision note.** The first draft stated several safety properties as prose that the mechanism
> did not actually enforce, and overstated three guarantees. This revision turns them into explicit
> transactional rules (§2.5), defines the cap's anchor and clamp (§2.3), pins the busy metrics to
> their denominators (§2.2), and withdraws the claims about crash-loop recovery (§3), universal
> warning delivery (§2.4) and nobody losing anything (§4).

## Scope of this comparison

This document compares **the Groovy `sepal-server` implementation on `master`** with **the model
described in `docs/session-expiration-model.md`**, as a single step. It deliberately leaves out the
intermediate Node port — the heartbeat-based `worker` module and its idle state machine — and
describes everything that is not on `master` as new. That elision is a presentation choice for
readability, not a claim about the code: the intermediate exists on this branch, and
`docs/session-expiration-model.md` is the document that describes the actual migration path from
it.

The `master` side of every claim below was verified against `master` source on 2026-08-12 and
re-verified 2026-08-13.

## The comparison in one table

| Dimension | Groovy (`master`) | New model |
|---|---|---|
| What decides lifetime | derived at sweep time from `update_time` freshness | a stored `timeout_time` column |
| Timeout constant | 10 min after the last heartbeat, ACTIVE and PENDING alike (`Timeout.groovy`) | per-event extensions, 15 min typical, 30 min startup lease; PENDING unchanged at 10 min |
| What refreshes it | any heartbeat, from any sender, unconditionally | only enumerated ratchet events |
| Web heartbeat | every 30 s for every sandbox session referenced by a live HTTP session, no request required | one report per attributed **human input event**, coalesced to 60 s |
| Bound on the web path | the Undertow HTTP session's 15-min idle timeout, reset by any proxied request | none needed — polling never reports |
| SSH heartbeat | every 30 s while an `ssh` client process exists (`alive.sh`) | `alive.sh` deleted; pty atime sampled inside the container |
| Bound on the SSH path | **none** | the same deadline as everything else |
| Resource signal | none — nothing ever read CPU, GPU or network | a positive `isBusy` verdict extends the deadline |
| Load can save a session | no | yes, capped at `maxUnattendedHours` (12) from the last human interaction |
| Runaway protection | not needed — nothing but attachment extended | busy ratchet clamped at the cap; human events never clamped |
| Warning before close | none — the session simply disappeared | notify at expiry → email at +5 min → close at +60 min |
| Recovery after warning | n/a | any extension event cancels it, including simply resuming work |
| keepAlive slider | `earliest_timeout_time`, an AND-guard that only ever delays | folds into `timeout_time` as an ordinary ratchet |
| Task protection | task progress heartbeats the session (`UpdateTaskProgress.groovy:61,72`) | task progress ratchets, **and** a PENDING/ACTIVE task blocks the close outright |
| Survives a server restart | no — liveness state is lost on every restart | the deadline survives; **enforcement does not** — see §3 |
| Survives a proxy restart | no — the in-memory map is the only liveness record | yes — liveness does not live in any process's memory |

## 1. The Groovy implementation

### 1.1 The mechanism

Lifetime was *derived*, never stored. `CloseTimedOutSessions` swept whatever
`JdbcWorkerSessionRepository.timedOutSessions()` returned:

```groovy
WHERE (earliest_timeout_time IS NULL OR earliest_timeout_time < ?) AND (
      (state = ? AND update_time < ?)
   OR (state = ? AND update_time < ?))
```

Both thresholds come from the same enum, and both are ten minutes:

```groovy
enum Timeout {
    PENDING(10, TimeUnit.MINUTES),
    ACTIVE(10, TimeUnit.MINUTES)
```

`update_time` was refreshed by `repository.update(session)` — which `HeartbeatHandler` called on
every beat for an ACTIVE session, and which every other session mutation called too. So the rule
was exactly: **a session lives ten minutes past the last time anything touched its row.**

`earliest_timeout_time` — the keepAlive slider, set through
`POST /sessions/session/{sessionId}/earliestTimeoutTime` — was an AND-guard, not a deadline. It
could only push a timeout later, never earlier, and once passed it stopped mattering.

There were three heartbeat senders: the web proxy, `alive.sh`, and task progress.

### 1.2 The web path — an open tab was immortal

`SandboxWebProxy` scheduled `endpointProvider.heartbeatSender()` every `sessionHeartbeatInterval`
(30 s). That runnable iterates the map and beats **every** session in it, unconditionally — it
never asks whether a request occurred:

```groovy
def sandboxSessionIds = sandboxSessionIdByhttpSessionId.values().toSet() as Set<String>
sandboxSessionIds.each { sandboxSessionId -> sendHeartbeat(sandboxSessionId) }
```

Entries leave that map in exactly one place, the `sessionDestroyed` listener. So a sandbox session
lived exactly as long as the Undertow HTTP session, whose idle timeout was 15 minutes
(`sandbox.webproxy_session_timeout=900`, `config/sepal.properties`). That idle timer is reset by
any proxied request — `endpointFor` → `username(exchange)` → `getOrCreateHttpSession`, plus
`httpSession.getAttribute(...)`, both of which bump Undertow's timer.

Because JupyterLab and RStudio poll their backends continuously, an open tab refreshed the HTTP
session forever, and the heartbeat loop ran forever. The bound was the tab, not the visit: close
it, polling stops, the HTTP session expires after 15 minutes, heartbeats stop, and the session
closes 10 minutes later — **roughly 25 minutes from the last request.**

### 1.3 The SSH path — no bound at all

`alive.sh` loops on nothing but the existence of an `ssh` client process:

```bash
while ps -u $USER | grep -q " ssh$"
do
    curl -X POST -s "http://sepal/api/sessions/$USER/session/$1"
    /bin/sleep 30
done
```

There is no idle timeout here — no analogue of the web path's 15 minutes. A terminal left open on a
laptop, a forgotten tmux pane, or a connection nobody has typed into for days heartbeated every 30
seconds forever.

### 1.4 The task path

`UpdateTaskProgress` heartbeats the session on every non-terminal progress report. That is what
kept task-executor sessions alive, and it is the one heartbeat in the system that genuinely tracked
work rather than attachment.

### 1.5 No resource signal existed

Nothing on `master` ever read CPU, GPU or network for any purpose. There was no sampler, no
`instance_usage_sample` table, no usage reporting. A saturated four-GPU instance and an idle one
were indistinguishable to the timeout logic.

### 1.6 What the Groovy design got right

It is worth being explicit, because the new model keeps all of it:

- **The sweep is cheap and stateless.** One indexed query, close each hit, no coordination.
- **Failure is fail-safe in the direction that matters.** A missed heartbeat costs a session; but
  the senders beat every 30 s against a 10-minute threshold, a 20× margin.
- **The keepAlive slider can only help.** A user could never shorten their own session by mistake.
- **Task sessions are protected by the same mechanism as everything else** — one concept, not two.

### 1.7 The three failure modes

- **A heartbeat proves attachment, not use.** A forgotten browser tab kept an expensive instance
  alive for as long as the tab existed; the proxy beat it forever.
- **Attachment is the *only* thing that could save a session.** A saturated instance whose owner
  disconnected from SSH expired exactly like an abandoned one. Nothing read load to *extend*
  anything. (`docs/instance-stopping-parity.md` §5.2.)
- **Liveness lived in process memory.** The proxy's `sandboxSessionIdByhttpSessionId` map was the
  sole record that a session was attached; a proxy restart silently condemned every session whose
  user was not actively clicking. Symmetrically, a crash-looping server never reached its first
  sweep, so abandoned sessions were never closed at all (§5.1).

## 2. The new model

Full detail is in `docs/session-expiration-model.md`; this is the shape needed to read the
comparison.

### 2.1 A stored deadline, moved only by a ratchet

`worker_session` gains `timeout_time`, `last_interaction_time`, `active_time`,
`notification_state` and `notified_time`. Every extension is the same statement, and there is no
other way to move a deadline:

```sql
UPDATE worker_session
   SET timeout_time          = GREATEST(COALESCE(timeout_time, NOW()), NOW() + INTERVAL ? MINUTE),
       last_interaction_time = IF(?, NOW(), last_interaction_time),   -- human events only
       notification_state    = 'NONE',
       notified_time         = NULL
 WHERE id = ? AND state = 'ACTIVE'
```

Three properties are load-bearing, and all three are properties of this one statement:

- **Monotonic.** `GREATEST` means an event arriving out of order, or a small extension landing after
  a large one, can never shorten a session. `earliest_timeout_time` disappears into this — the
  slider becomes an ordinary ratchet, still incapable of shortening anything.
- **Single clock.** Every timestamp is derived from the database's `NOW()`, never from a value the
  caller computed. The earlier draft of this design passed candidate deadlines as bound parameters
  while also claiming clock skew was irrelevant; only one of those can be true. Deriving in SQL is
  what makes the claim true, and it is why extensions are expressed as a *duration* parameter rather
  than a timestamp.
- **Atomic with the notification reset.** Clearing `notification_state` in the same statement is
  what makes "any extension cancels the expiry cycle" (§2.4) a guarantee rather than a race. See
  §2.5.

| Event | Ratchet by | Stamps `last_interaction_time` | Capped |
|---|---|---|---|
| Session requested (PENDING) | `startupLease` (30 min) | — | — |
| Session activated | re-ratchet to `active_time + startupLease` | — | — |
| App opened / terminal opened | `openExtension` (15 min) | yes | no |
| Real user interaction (GUI input or pty input) | `interactionExtension` (15 min) | yes | no |
| Busy verdict from the sampler | `busyExtension` (15 min) | **no** | **yes** |
| Manual extend (slider, notification button, email link) | requested amount | yes | no |
| Task progress | `taskExtension` (15 min) | — | no |

**Activation re-ratchets the lease.** The lease is stamped at request time, but provisioning can
take many minutes, so a session that took eight minutes to come up would otherwise reach ACTIVE
with 22 minutes of lease left. On the PENDING → ACTIVE transition the session stamps `active_time`
and ratchets to `active_time + startupLease`, giving every session the same full lease from the
moment it is usable. Because the ratchet is monotonic this can only ever help.

### 2.2 The two new signals

**Load.** A usage sampler (new; nothing like it exists on `master`) reads the session's worker
container over the Docker Engine API on a 60 s cadence, writes to `instance_usage_sample`, and
derives a *positive* `isBusy` predicate over a 10-minute window: coverage at or above the
80 %-of-visible floor **and** any one metric at or above its threshold.

A threshold is meaningless without its denominator, so each is pinned explicitly:

| Metric | Scope | Definition | Threshold |
|---|---|---|---|
| CPU | container | `(Δcontainer_cpu / Δsystem_cpu) × online_cpus / instance_cores × 100` — percent of the **whole instance's** cores, not of one core and not of a cgroup quota | 5 % (0.8 cores on a 16-core instance) |
| GPU | device | `nvidia-smi --query-gpu=utilization.gpu`, **arithmetic mean across devices** — whole-device utilization, not per-process | 5 % (one saturated GPU of eight reads 12.5 %) |
| Network | container | `Δ(rx + tx)` summed over the container's interfaces, per second | 50 KB/s |
| RAM | — | sampled, but **not** part of the verdict | — |

RAM is excluded deliberately: it is a level, not a rate. A finished process that has not exited
holds its heap indefinitely, so a RAM threshold would keep dead sessions alive — the exact failure
the positive predicate exists to avoid.

GPU attribution is unambiguous *here* even though `nvidia-smi` reports per-device rather than
per-process, because SEPAL binds at most one ACTIVE session to an instance
(`worker_session.instance_id`, `sessionOnInstance`). If that ever stops being true, this metric
stops meaning anything and must be revisited.

Two consequences to accept, both of which follow from container-scoped network:

- **Downloads count as work.** A `pip install` or a large dataset fetch reads as busy. That is
  correct.
- **Anything else chatty in the container also counts.** Background services, package-index
  refreshes and the proxied HTTP traffic itself all land in the same counter.

The second is the one that could quietly re-create `master`'s central failure — an open tab held
alive by its own polling, arriving through the resource signal instead of the heartbeat.

**Measured 2026-08-13, and it does.** Jupyter Notebook, JupyterLab and RStudio open on one T3aSmall
sandbox, all idle: 14.7 KB/s and 1.48 % CPU, against a 0.01 KB/s baseline with nothing open. That is
29 % of the network threshold and 30 % of the CPU threshold — a 3.4× margin, scaling at ~4.9 KB/s
and ~0.44 % CPU per idle app, so roughly ten idle tabs pin a session busy forever. Splitting rx and
tx does not help; they are near-symmetric.

Percent-of-instance CPU fails in the opposite direction too: a genuine one-core job reads as 50 % on
this 2-core instance but **1.6 % on a 64-core one**, below the threshold, so its session would die
while it works. Both failure modes exist simultaneously and no single percentage removes them,
because the quantity that matters is absolute. The busy verdict therefore has to threshold **cores
used** rather than percent — three idle apps use 0.03 cores, a one-core job uses 1.0 on any instance
— and a network rate set where transfers live (MB/s) rather than where polling does.

These thresholds were inherited from the idle policy, where crossing one meant *do not warn*, a
fail-safe direction. Feeding the same numbers into a deadline reverses their meaning.

Coverage below the floor counts as busy for up to `unknownBusyGraceTicks` (10) consecutive ticks,
so a Docker-API blip cannot close a computing instance, while a genuinely dead one still expires.
The predicate is positive rather than `!isIdle` on purpose: a negative verdict would make an
unreachable instance immortal.

**Human input.** Two sources, split by *what is being used*:

- *Apps* — the GUI attaches capture-phase passive listeners for `pointerdown`, `keydown`, `wheel`
  and `touchstart` on the same-origin app iframe's `contentDocument`, coalesced to one report per
  60 s, attributed per session. Polling is invisible to this, which is the whole filter. Input in
  the SEPAL shell extends nothing.
- *Terminals* — the sampler stats `/dev/pts/*` inside the container and keeps the maximum atime it
  saw. A tick counts as an interaction when that maximum **advanced since the previous tick**, not
  when it falls within some window of now: the window form silently drops input that lands near a
  tick boundary or during a slow sample, and the comparison form does not.

  The mechanism rests on user input changing atime while program output does not, so a job printing
  a thousand log lines to an abandoned terminal buys no time and one keystroke does. This was
  verified synthetically (2026-08-12, Linux 6.12, `os.openpty()`) and then **on the production
  sandbox image** (2026-08-13, inside a running container on the test server): input advanced atime
  in ~8 s steps; a pty written to for 32 s held atime constant while mtime moved; four idle ptys
  stayed frozen across 22 minutes, ruling out a background reader that would have made every session
  immortal; and `relatime` did not suppress repeated updates, because `tty_update_time` writes the
  inode directly instead of going through `touch_atime()`.

  **The exec must use `Tty: false`.** A Docker exec created with `Tty: true` allocates a pty inside
  the container, with `atime` equal to the moment of the exec — so the sampler's own measurement
  reads as a keystroke, max-atime returns `now` every tick, every session lives forever, and nothing
  logs an error. Verified against the live container: `Tty: true` sees a fresh pty that a host-side
  observation confirms is real, `Tty: false` sees only the four genuine ones. Since the GPU exec
  beside it already uses `Tty: true` and its pty lingers briefly after exit, ptys whose `ctime` falls
  in the current tick are also skipped — `ctime` is a stable allocation stamp, unaffected by the
  atime writes.

  Ancestry on the test container showed three of four ptys belong to supervised services
  (`supervisord`, `shiny-server`, `jupyter-server`) and only one to a user shell — that one traced
  back through `sshd`, confirming the signal on the genuine SSH path rather than a synthetic pty.
  All three service ptys were inert over 3.5 hours, but an image whose service reads its controlling
  tty on a timer would fabricate interaction on every tick, so this is re-checked per image.

  Untested: other providers and images. Web and SSH terminals are covered identically, because both
  end at a pty inside the sandbox.

### 2.3 The cap

That the busy verdict does *not* stamp `last_interaction_time` is the entire runaway protection.
Two details decide whether it is a cap at all.

**The anchor must be defined when nobody has ever interacted.** `last_interaction_time` is NULL
until the first human event, and two paths reach a busy verdict without one: a task-executor session
(task progress does not stamp it) and a sandbox session whose job starts before any app or terminal
is opened. `now − NULL` is not a number, so the rule as originally written had no defined behaviour
in exactly the cases the cap exists for — and in SQL it would silently evaluate to NULL, making the
comparison false and the busy ratchet **unbounded**. The anchor is therefore explicit:

```
unattended_anchor = COALESCE(last_interaction_time, active_time)
```

which is why `active_time` is a stored column rather than something inferred.

**The cap clamps; it does not refuse.** Refusing a ratchet once `now` is already past the boundary
lets a verdict landing one second before it push the deadline to `anchor + 12 h + busyExtension`.
The bound is applied to the candidate instead:

```sql
timeout_time = GREATEST(
    COALESCE(timeout_time, NOW()),
    LEAST(NOW() + INTERVAL ? MINUTE, unattended_anchor + INTERVAL ? HOUR)
)
```

Clamping subsumes refusal: past the boundary the clamped candidate is already in the past, so
`GREATEST` keeps the existing deadline and the ratchet becomes a no-op without a separate rule. The
`LEAST` clause is present only for the busy ratchet — human and task events use the unclamped form
from §2.1, so they are never refused and 12 hours is a hard bound measured from the anchor.

An overnight job is covered. A crashed process spinning a core stops buying time twelve hours after
the last keystroke. A user at the keyboard is never cut off.

### 2.4 Expiry is warned before it is enforced

A single `ExpireSessions` sweep on a 1-minute cadence:

| When | Condition | Effect |
|---|---|---|
| **T+0** | `timeout_time < NOW()`, no PENDING/ACTIVE task, state `NONE` | in-app notification with `[Extend 15 min] [Dismiss]` |
| **T+5 min** | still `NOTIFIED` | email with one management link |
| **T+60 min** | notified and not extended, mode = `enforce` | close via the guarded path in §2.5 |
| **T+60 min** | notified and not extended, mode = `notify` | record a would-have-closed metric, reset the cycle |

Any extension event at any point cancels the whole thing and clears the notification (§2.1), so the
common rescue is simply going back to typing. Dismiss means only "don't email me"; it is never read
as consent to close early.

**Leaving task protection restarts the cycle.** Excluding sessions with a PENDING or ACTIVE task
from the sweep is not the same as cancelling the expiry cycle, and treating them as equivalent
produces a session that closes with no usable warning:

> Session expires and goes `NOTIFIED` → a task starts and runs three hours → the sweep skips the
> session throughout → the task ends → `notified_time` is now three hours old, well past grace →
> the next sweep closes immediately.

The user's warning was issued three hours before they could act on it. So task protection is
expressed as a ratchet, not just as a filter: task progress ratchets and resets the notification
state like any other extension event, and the PENDING/ACTIVE-task check in the sweep is a second,
independent guard rather than the only one. A session that leaves protection therefore always
starts a fresh cycle and gets the full notify → email → grace sequence.

**`notify` mode must not accumulate state.** If sessions simply sat in `EMAILED` for as long as
they were expired, switching production from `notify` to `enforce` would close every accumulated
session on the first sweep — the single worst possible first impression of the feature, and one
delivered to precisely the users who had already ignored a warning. In `notify` mode the sweep
instead records what it would have done and resets the session to `NONE`, so the cycle recycles and
flipping to `enforce` starts everyone from a fresh warning. The would-have-closed counter is also
the number worth watching during rollout step 4.

**What "warned" does and does not guarantee.** A persisted `notification_state` records that the
system *attempted* to warn, not that anyone was told. The websocket push reaches only a connected
browser, a user with no tab open sees nothing until they return, and mail delivery can fail or be
filtered. The honest claim is a best-effort warning plus a grace period during which any normal use
silently rescues the session — which is still strictly more than `master` offered, since `master`
closed sessions with no warning at all.

#### The email management link

`GET /api/sessions/expiry/:token` renders a confirmation page with a button that `POST`s the same
token; the extension happens on the `POST`. A mutating `GET` would be fired by mail-client link
scanners, corporate URL-rewriting proxies and preview fetchers, so the deadline would be extended
for users who never opened the mail — and, worse, the token would be spent before the user clicked
it.

The token is an HMAC over `(sessionId, notifiedTime, expiry)` with a server-side secret, valid until
`notified_time + graceMinutes`. Binding it to `notified_time` gives single-use semantics *provided
the redemption is a guarded update* — the HMAC alone proves only that the token was well-formed, and
two concurrent clicks both verify. Redemption is therefore
`UPDATE … WHERE id = ? AND notified_time = ?`, and only the transaction that changed a row acts.
After the session is gone the link is dead and the endpoint says so rather than returning a bare
error.

### 2.5 The concurrency contract

The sweep reads, decides, and writes; extension events arrive continuously from four independent
senders. "Any extension cancels the expiry" is a claim about interleaving, and it is only true if
it is written down as one. Three rules, all compare-and-set on `worker_session`:

1. **Extension is one statement.** The ratchet, the `last_interaction_time` stamp and the
   notification reset are a single `UPDATE` (§2.1). A read-modify-write here would let a sweep
   observe a cleared notification with a stale deadline, or the reverse.

2. **Every sweep transition is guarded on the state it observed.** `NONE → NOTIFIED` and
   `NOTIFIED → EMAILED` are `UPDATE … WHERE id = ? AND notification_state = ?`, and the sweep acts
   only if the statement changed a row. Exactly one sweep observes each transition, so the event
   and the email fire once even if a sweep overruns its minute and overlaps the next.

3. **The close re-checks everything it decided on, in the transaction that closes.** Selecting
   candidates and then closing them is a lost update waiting to happen: an interaction landing
   between the two loses to a decision made before it arrived. The first transaction of the
   existing two-transaction close becomes:

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
   without teardown. The task check appears here as well as in candidate selection precisely
   because a task can start during the grace period.

The general rule: **the sweep may never act on a fact it read earlier.** Every decision is
re-asserted as a predicate in the statement that acts on it.

## 3. Behaviour, scenario by scenario

The column headings are what actually happens to the instance.

| Scenario | Groovy (`master`) | New model |
|---|---|---|
| Notebook tab open, user working | alive | alive |
| Notebook tab open, nobody there | **alive forever** (polling refreshes the HTTP session) | notified at 15 min, closed at 75 min |
| Notebook tab closed mid-job, job still running | closed ~25 min after the last request | alive while busy, up to 12 h past the last keystroke |
| Laptop lid closed, tab still "open" | closed ~25 min later | same, but with a notification and an email first |
| SSH open, user typing | alive | alive |
| SSH open, untouched for days | **alive forever, no bound** | notified at 15 min, closed at 75 min |
| SSH disconnected, long job running | **closed 10 min later** | alive while busy, up to the 12 h cap |
| Overnight batch, nobody attached | **closed 10 min after disconnect** | alive to completion if under 12 h |
| Crashed process pinning a core, nobody attached | closed (nothing beats) | alive until the 12 h cap, then expires |
| Task-executor session, task reporting progress | alive | alive; additionally immune to close while the task is PENDING/ACTIVE |
| Wedged task that never reports terminal state | pinned indefinitely | pinned indefinitely (`CancelTimedOutTasks` is still the only backstop) |
| keepAlive slider set to +4 h, user leaves | alive 4 h, then the normal rule resumes | identical, expressed as a ratchet |
| Proxy/gateway restarts, user idle but attached | **session condemned** — the map is gone | unaffected; the deadline is in the database |
| Server restarts normally | idle attached sessions condemned; liveness state lost | unaffected — the deadline is stored |
| Server crash-loops faster than the startup grace | **abandoned sessions never close** | **still never close** — see below |
| Instance unreachable, Docker API blips | irrelevant — no signal existed | treated as busy for 10 ticks, then stops extending |
| Instance genuinely dead | closed on the 10-min rule | `CloseSessionsWithoutInstance` reaches it first; otherwise it expires |

Reading the table by column: **`master` was generous to the attached and merciless to the working.**
The new model inverts both — it is strict about attachment and protective of work — and it attempts
to warn before it closes.

**The crash loop is not fixed, and an earlier draft of this document claimed it was.** Storing the
deadline fixes *losing* it, which is a different problem. Closing a session still requires
`ExpireSessions` to run, and the 2-minute startup grace retained in §5 suppresses the sweep for two
minutes after every process start (`STARTUP_GRACE_MS`, measured from `startTime`). A worker
crash-looping faster than that never reaches a sweep, exactly as on `master`, and no amount of
durable state changes that. The accurate claim is narrower:

> A normal restart no longer loses liveness state. A persistent crash loop still prevents
> enforcement entirely.

Fixing it means the grace can no longer be a fixed interval from process start — it needs to be
satisfiable across restarts (a persisted "first healthy sweep" marker, or a grace measured from
when extension senders were last able to reach the worker). That is a real change and it is not
part of this design; it is carried in §10.

**Task protection is unchanged from `master` in the one case that matters.** A task that never
reports a terminal state still pins an instance indefinitely under both designs, because both treat
an active task as absolute protection. The new model adds a warning cycle around it but no bound,
and `CancelTimedOutTasks` remains the only backstop.

## 4. What this costs users

Two habits that have always worked stop working:

- *"Leave the notebook tab open overnight."*
- *"Leave the SSH window open."*

Both are common, both are load-bearing for some users' workflows, and both now produce an expiry
notification. That is the intent — it is the reason for the change — but users experience this
class of change as a regression unless it is announced. Hence `SESSION_EXPIRY_MODE=notify` being
more than a testing convenience, and hence announcing the change with a normal-priority admin
message before enforcing.

It also sets the scale for `maxUnattendedHours`, and here the accounting has to be honest in both
directions, because the change is not a strict improvement for everyone.

**Who gains.** Every workflow that computes without an attached client. A disconnected SSH job gets
12 hours instead of 10 minutes. A job whose owner closed the browser tab gets 12 hours instead of
~25 minutes. This is the large majority of real unattended compute, and the gain is enormous.

**Who loses.** A user running a job longer than 12 hours who today protects it by leaving a tab or
an SSH window open. On `master` that works indefinitely; under this design the session dies 12
hours after their last actual interaction, warning first. A 20-hour training run guarded by an open
tab is a real workflow, it works today, and it stops working. Saying *"nobody doing real work loses
anything"* — as an earlier draft of this document did — is simply false, and it is the kind of claim
that turns a defensible change into a broken promise.

Three things blunt it, none of which erase it: any interaction re-anchors the 12 hours, so checking
in once a day is enough; the expiry is warned and any use during the 60-minute grace rescues it; and
`maxUnattendedHours` is per-deployment, so a site with genuinely long jobs can raise it. The
defensible claim is: **most unattended compute gains substantially, and the workflows that lose are
long jobs whose owners must now interact once every twelve hours instead of never.** That is a
trade worth making, but it is a trade, and step 4 of the rollout is where it gets announced as one.

## 5. What carries over unchanged

- **PENDING sessions.** Still ten minutes from creation, still read off `update_time`. A hung
  provision should die in ten minutes, not thirty. `update_time` is kept and still written on
  mutation for audit; it simply stops deciding an ACTIVE session's lifetime.
- **The sweep shape.** One indexed query per minute, per-item try/catch, close through the existing
  `closeSession` path and its two-transaction ordering.
- **The slider's one-way property.** It could never shorten a session on `master`, and the ratchet
  makes that a property of the mechanism rather than of the SQL guard.
- **`CloseSessionsWithoutInstance`, `ReleaseUnusedInstances`, `SizeIdlePool`,** the budget and
  locked-user paths — all untouched.
- **Task progress extends the session.** Same signal, same intent, now doing double duty: it
  ratchets and resets the notification cycle like any other event (§2.4), *and* a PENDING or ACTIVE
  task independently blocks the close in the guarded statement (§2.5), so a task submitted during
  the grace period also cancels it.
- **The 2-minute startup grace,** for a narrower reason: a stored deadline survives an outage, but
  the *senders* of extension events cannot reach a down worker, so they need wall-clock time to
  re-assert. It suppresses the sweep rather than shifting the deadline — and, as §3 notes, keeping
  it measured from process start is exactly what leaves the crash-loop gap open.

## 6. Configuration

Everything on the `master` side was two compile-time constants (`Timeout.PENDING`,
`Timeout.ACTIVE`) and one property (`sandbox.webproxy_session_timeout`). The new model is
configurable throughout.

| Setting | Default | Meaning |
|---|---|---|
| `SESSION_EXPIRY_MODE` | `off` | `off` \| `notify` \| `enforce` — `notify` runs the full UX without closing anything |
| `startupLeaseMinutes` | 30 | initial deadline on session request |
| `openExtensionMinutes` | 15 | app or terminal opened |
| `interactionExtensionMinutes` | 15 | per attributed human interaction |
| `busyExtensionMinutes` | 15 | per busy verdict from the sampler |
| `taskExtensionMinutes` | 15 | per task progress report |
| `manualExtensionMinutes` | 15 | in-app Extend button |
| `emailExtensionMinutes` | 60 | email keep-running link |
| `maxUnattendedHours` | 12 | cap on load-only extension, from `last_interaction_time` |
| `notificationVisibleMinutes` | 5 | unacknowledged notification → email |
| `graceMinutes` | 60 | notification → close |
| `interactionReportIntervalSeconds` | 60 | GUI report coalescing |
| `unknownBusyGraceTicks` | 10 | consecutive below-coverage ticks treated as busy |
| `busyWindowMinutes` | 10 | rolling window for the busy verdict |
| ~~`busyCpuThresholdPct`~~ → `busyCpuCores` | ~~5 %~~ → 0.5 cores | absolute cores; percent-of-instance fails both ways (§2.2) |
| `busyGpuThresholdPct` | 5 | unchanged — already device-absolute |
| `busyNetworkThresholdKBps` | ~~50~~ → 500 | measured idle floor 14.7 KB/s for three apps, scaling per app (§2.2) |

Defaults are deliberately generous where a mistake costs a user their work. They should be tightened
from production data, not loosened from complaints.

## 7. Fail-open, in both designs

`master` failed open by accident of its margins: a 30 s beat against a 10-minute threshold survives
almost any transient. The new model has more signals and therefore needs the property stated
explicitly:

1. **Iframe inaccessible** (an app navigates genuinely cross-origin) → fall back to counting proxied
   requests for that session, i.e. `master`'s behaviour. This needs a protocol, not just an
   intention: the gateway sees proxied requests but has no way to tell *"the GUI cannot observe this
   app"* from *"the GUI can observe it and the user is not touching it"* — and those must produce
   opposite outcomes. The GUI therefore declares it explicitly.

   On mounting an app iframe, and again on every `onLoad` (apps navigate their frame after sign-in,
   possibly across origins), the GUI attempts to attach its listeners and reports
   `{sessionId, observable: true|false}` — `false` when the attach throws. The gateway keeps the
   flag per session with a short TTL refreshed by each report, and counts proxied requests as
   interactions **only** for sessions currently flagged `observable: false`.

   The default when no report has ever arrived is `observable: true`, i.e. proxied requests do not
   extend. This is a deliberate exception to fail-open, and the reasoning is about which failure
   gets noticed: defaulting the other way means one bug in GUI reporting silently reverts every
   session to `master` behaviour and the entire filter stops working with no symptom. Defaulting
   this way means the same bug shows up as sessions expiring while someone is working — which is
   loud, gets reported, and is caught by the warning and the 60-minute grace before anything is
   destroyed. A failure that announces itself is worth more here than one that fails soft.

2. **pty exec fails** → no terminal signal; the CPU/network busy verdict still applies. There is no
   browser-side backstop for the web terminal, deliberately: a broken exec fails SSH users too, so a
   browser backstop would patch a third of the problem while making the design look complete.
3. **Sampler coverage below the floor** → busy, bounded by `unknownBusyGraceTicks`.
4. **A lost ratchet write** is harmless only for the *recurring* signals. Busy verdicts, interaction
   reports and task progress all repeat within a minute or two, so a dropped write costs nothing.
   The one-shot events — app or terminal opened, the in-app Extend button, the email link — have no
   successor to re-assert them, and losing one loses the extension outright; the Extend button in
   particular would appear to work while doing nothing. Those three must be acknowledged by the
   worker and retried by the sender, and must surface failure in the UI rather than silently
   no-op. Retries are safe because the ratchet is idempotent in the only way that matters: it is
   monotonic, and its magnitude is a duration applied to `NOW()`.

Clock skew is irrelevant because every timestamp is derived inside the database (§2.1), not because
any particular process is trusted to stamp correctly.

## 8. Testing the difference

The tests that matter are the ones that would have passed on `master` and must now fail:

- **A proxied request alone must not extend a session.** This is the inverse of `master`'s central
  behaviour and the single guarantee the whole filter rests on. It should be named so that deleting
  it looks alarming.
- **An `ssh` process existing must not extend a session** — only pty atime movement does.
- **A busy verdict must extend a session** — the case `master` could not express at all.
- **The cap must clamp a busy ratchet and never clamp a human one**, including the boundary case:
  a busy verdict one second before the cap must not produce a deadline beyond it.

The rules added in review need tests of their own, since each of them was originally an English
sentence that the SQL did not enforce:

- **The anchor is never NULL in effect.** A task-executor session that has never had a human
  interaction must still hit the 12-hour cap, measured from `active_time`. This is the test that
  fails loudly if `COALESCE` is dropped.
- **Extension racing the sweep.** An interaction landing between candidate selection and the close
  must leave the session open — the guarded close changes zero rows. Likewise two concurrent sweeps
  must produce one notification and one email.
- **A token is redeemable once** under concurrent redemption.
- **A `GET` of the email link must not act**; only the `POST` does.
- **Leaving task protection starts a fresh cycle** — notified, then a three-hour task, then task
  end, must not close immediately.
- **`notify` mode does not accumulate.** After grace, the session returns to `NONE`; flipping to
  `enforce` must not close a backlog on the first sweep.

Plus: the ratchet's `NULL` handling and out-of-order arrival; the `notification_state` transitions
and their race-safe guarded `UPDATE`; the `isBusy` coverage-grace inversion; pty-atime advance
detection across ticks; GUI listener attach/detach across iframe reload and the `observable`
reporting protocol; and a dev-env integration run that opens an app, confirms the deadline moves on
typing and *not* on background polling, then watches notify → email → close with compressed timers.

## 9. Rollout

The order is driven by the fact that this is a user-visible tightening of long-standing production
behaviour, not a bug fix:

1. Implement with `SESSION_EXPIRY_MODE=off`. Deadlines are computed and recorded; nothing closes.
2. Test instance at `notify` with compressed timers. This step is where the three empirical claims
   the design rests on get measured, and none of them can be reasoned to a conclusion:
   the browser input signal against the actual JupyterLab and RStudio builds in use; the **idle
   network floor** of those same builds against the 50 KB/s threshold (§2.2); and **pty atime
   behaviour** on each production sandbox image and provider (§2.2 — closed for the current image on
   2026-08-13). A failure in any one of them changes the design, not just a constant.
3. `enforce` on the test instance with production timers.
4. Production at `notify`, with an admin message announcing the change. Per §4, this ends two habits
   users have relied on for years; the notification-only period is what turns that from a surprise
   into a warning.
5. `enforce` in production, with the generous defaults above.

A test instance validates the mechanism, not the thresholds. How often a real user goes fifteen
minutes without an attributed interaction is a behavioural number that only appears in production —
which argues for shipping generous defaults and tightening, not for delaying.

## 10. Open questions

Three of these are release gates rather than open questions — the design cannot be called validated
until they are answered with measurements.

1. ~~**The crash-loop enforcement gap is unfixed** (§3).~~ **Closed 2026-09-17** — the startup
   grace was removed outright; see `session-expiration-model.md` §7–§8. Original text: A worker
   restarting more often than `STARTUP_GRACE_MS` never runs a sweep, so nothing is ever closed, exactly as on `master`. The
   fix — a grace that is satisfiable across restarts rather than measured from each process start —
   is out of scope here but should not be forgotten because the durable deadline makes it *look*
   solved.
2. **Measured 2026-08-13; both thresholds failed** (§2.2). Three idle apps reach ~30 % of both the
   network and CPU thresholds and scale per app, and percent-of-instance CPU misreads a real
   one-core job on a large instance as idle. The busy verdict must move to absolute cores and a much
   higher network rate — **the one finding so far that changes the design rather than a constant.**
3. ~~**The pty atime behaviour is one experiment on one kernel**~~ — **closed 2026-08-13** on the
   production sandbox image (§2.2). Residual: other providers and images, and an sshd-allocated pty.
4. **`emailExtensionMinutes` at 15 may be too short.** Delivery latency plus reaching a computer is
   itself several minutes. A larger value for the email path specifically is probably right; it needs
   one round of real use to say.
5. **Nested cross-origin frames and closed shadow roots are invisible** to the GUI listeners.
   JupyterLab and RStudio are single-document apps today, so the approach should hold, but that is an
   empirical claim about specific app versions rather than a guarantee.
6. **Should task-executor sessions have a cap at all?** They are protected absolutely by the
   PENDING/ACTIVE task rule — the one behaviour inherited from `master` unchanged — so a wedged task
   that never reports terminal state pins an instance indefinitely, exactly as it does today.
   `CancelTimedOutTasks` is the existing backstop; whether it is sufficient has not been re-examined.
7. **Should the in-app notification appear for sessions whose apps are not open in this browser?**
   Probably yes — it is actionable either way — but the Usage panel may be the better surface.

## Divergence from the monolith

This is a deliberate divergence from the Groovy monolith rather than a port, and needs its own entry
in `docs/instance-stopping-parity.md`. Of the two findings there, one dissolves and one does not:

- **§5.2 — a proxy restart stops heartbeats for sessions nobody touches. Dissolved.** Liveness no
  longer depends on any process's in-memory cache; the gateway losing its map costs at most one
  interaction report and one `observable` flag, both re-asserted on the next event.
- **§5.1 — a crash-looping server never times out abandoned sessions. Not fixed.** The startup grace
  is still measured from each process start, and the sweep is still the only thing that closes
  anything. A stored deadline removes the *loss* of timing state across a restart, which is a
  different problem from the sweep never running. This finding stays open and should not be marked
  resolved on the strength of this design.
