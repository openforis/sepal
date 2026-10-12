
# Session expiration — live simulation

**Date:** 2026-08-14
**Branch:** `sepal-worker`
**Subject:** `docs/session-expiration-model.md` as implemented
**Stack:** dev-env, `HOSTING_SERVICE=local`, real sandbox containers, real sweeps on their
production cadence (sweep @1 min, sampler @60 s), `SESSION_EXPIRY_MODE=enforce`

Everything below was driven against the live stack — the worker's REST surface, the worker schema,
sandbox containers on the host daemon, and the gateway over authenticated HTTPS. Nothing was
mocked. The harness is in the session scratchpad (`sim/`, see its README).

Timings were compressed for campaigns A–F (lease 2 m, email +1 m, close +3 m, cap 6 min) so a full
cycle takes five minutes instead of ninety. **The sweep and the sampler were left on their real
cadences** — compressing those would have tested a different system. Campaign G then ran one full
cycle at the shipped defaults.

## What it found

Three defects, none of which the test suite could have caught: two are about what MySQL does with a
statement, and one only appears when the sampler and the sweep run against each other on their real
cadences. All three are fixed, and each has a regression test that names the live symptom.

### 1. A fractional `maxUnattendedHours` silently disabled the busy ratchet

The cap reached SQL as `INTERVAL ? HOUR`. MySQL accepts only an integer number of units there and
**rounds** rather than erroring:

```
NOW()                       2026-08-14 08:17:22
NOW() + INTERVAL 0.1 HOUR   2026-08-14 08:17:22   ← zero
NOW() + INTERVAL 0.5 HOUR   2026-08-14 09:17:22   ← a full hour
NOW() + INTERVAL 12 HOUR    2026-08-14 20:17:22   ← fine
```

`maxUnattendedHours` is a float by configuration. With a fractional value the clamp
`LEAST(now + ext, anchor + 0)` resolves to the anchor, always in the past, so `GREATEST` keeps the
old deadline and **the busy ratchet becomes a complete no-op** — load-based keep-alive silently off,
nothing logged as wrong. Fourteen consecutive busy verdicts all reported the same frozen deadline:

```
07:49:14  BUSY over 3m (cpu 100% of 1 cores) … [busy] +2m, capped … → 07:44:38
07:50:14  BUSY over 3m (cpu 100% of 1 cores) … [busy] +2m, capped … → 07:44:38
   … through 07:58:14, deadline stuck at the startup lease
```

The shipped default (12) is an integer, so defaults were never affected; any operator setting `0.5`
would have got 1 hour and `0.1` would have turned the protection off.

**Fix:** the cap converts to whole minutes before it reaches SQL, and the slider's fractional hours
are rounded the same way. A regression test asserts the statement contains no `HOUR` at all.

### 2. A clamped ratchet cancelled the expiry cycle it had not earned

The cap worked — the deadline froze at `08:43:59` — but every minute a busy ratchet clamped into the
past, moving the deadline *not at all*, still cleared `notification_state`:

```
08:44:41  expired — notifying              ← sweep notifies
08:44:41  [busy] +2m, capped → 08:43:59    ← deadline unmoved, cycle reset to NONE
08:45:41  expired — notifying              ← notifies again
   … eleven notifications in eleven minutes
```

Load stopped buying time exactly as designed, and then bought it back through the reset. The close
only landed once the CPU load stopped — so a crashed process spinning a core would have held its
session indefinitely, which is the runaway the cap exists to prevent, arriving through a different
door. Users would also have received one notification per minute.

**Fix:** both notification columns are guarded on `candidate > COALESCE(timeout_time, NOW())`, and
assigned **before** `timeout_time` — MySQL evaluates `SET` clauses left to right and later ones see
earlier writes, so the comparison would otherwise read the deadline the same statement just wrote.
Human rescues are unaffected: a notified session's deadline is in the past by definition, so any
real extension moves it and still cancels the cycle. Pinned by two tests, one of them on the
ordering.

### 3. The coverage fail-safe could not see the outage it exists for

With the Docker API stopped, the sampler logged failures and extended nothing:

```
10:03:02  WARN Usage sampling failed for session 324629d7…: fetch failed
10:04:02  WARN Usage sampling failed for session 324629d7…: fetch failed
10:05:02  WARN Usage sampling failed for session 324629d7…: fetch failed
```

No coverage-grace line at all. A session whose `containerStats` call threw was caught per-session and
dropped before the busy evaluation, so it never reached the fail-safe. §3 says in as many words that
"a Docker-API blip must not close a computing instance" — but the blip was the one case the fail-safe
could not see. It covered a thin window, never an unreachable daemon.

**Fix:** the verdict is computed over *stored* samples, not over this tick's reading, so a failed
reading must not remove a session from the evaluation. Every ACTIVE session of a known instance type
is now evaluated, sampled or not.

Re-measuring it exposed a second thing worth stating plainly, because two attempts to observe the
fail-safe measured nothing before this was understood: **an outage shorter than the busy window does
not engage the fail-safe at all**, because the window still holds samples written before the daemon
went away. The verdict during those minutes is computed from real, pre-outage data. The grace only
begins once the window has drained — which is right, since until then there is nothing to protect
against.

## Results

| Campaign | Result | What it establishes |
|---|---|---|
| A — baseline | 11/11 | notify → email → close, container gone, api_key cleared, both emails delivered |
| B — rescues | 15/15 | bare heartbeat moves nothing; slider, Extend button and email link all ratchet; monotonic |
| B2 — terminal | 7/7 | pty **input** counts as interaction, program **output** does not |
| C — gateway | 10/10 | 20 proxied requests + 3 min of heartbeats moved nothing; reported input did; observable fallback works |
| D — busy + cap | 13/13 | load extends, the cap still closes it under load, a human at the keyboard is never cut off |
| E — task protection | 8/8 | protected while a task runs; a **fresh** cycle on leaving, `notified_time` 1 s old |
| F1/F2 — dismiss, restart | 14/14 | dismiss silences the email only; a restart loses no state |
| F3 — Docker-API outage | 5/6 | the fail-safe engages once the window drains, then exhausts |
| G — production defaults | 11/14 | one full cycle at lease 30 m / email +5 m / close +60 m |

Totals: **94 assertions passing, 4 red — none of them a product defect.** All four are harness
errors whose subject was verified by direct measurement instead, and all four are corrected in the
scripts but have not been re-executed, so they are reported red rather than promoted to passes:

| Red | What was wrong | How the behaviour was confirmed |
|---|---|---|
| F3 grace-tick count | the bound counted a session's whole life, adding its young-session ticks to the outage's | exactly two grace ticks inside the outage window, then two "no longer extended" |
| G warning email | `docker logs --since` reads a bare ISO timestamp as local time | delivered 07:57:26, five minutes after notify |
| G close notice | same | delivered 08:53:26 |
| G interaction gap | written as though extensions accumulate onto the deadline rather than setting `now + N` | close gap 300 s, matching the deadline gap exactly |

Fifteen reds appeared across the whole run: three were the defects above, and twelve were harness
errors, each described here or in §"What the harness had to learn". They are recorded because a test
that passes for the wrong reason is indistinguishable from one that passes — and three of them
(campaign C's URLs, the email helper's timestamps, F1's "no email was sent") had been passing
vacuously.

### The Docker-API outage, after the fix

```
10:55:46  docker-api stopped
   …      three minutes of nothing: the window still holds pre-outage samples,
          the verdict is computed from real data, the deadline does not move
10:58:57  window drained
10:59:20  below the coverage floor (tick 1 of 2) — treated as busy
11:00:20  below the coverage floor (tick 2 of 2) — treated as busy
11:01:20  past 2 ticks — no longer extended     ← a genuinely dead instance still expires
11:02:20  past 2 ticks — no longer extended
```

The extensions themselves were clamped to the cap and moved the deadline nowhere, which is the cap
working correctly on the fail-safe path too.

### Restart resilience

```
09:57:01  worker restarted mid-cycle
09:57:03  back up — deadline, notification_state and notified_time all identical
09:58:02  "Within the startup grace period — skipping the session expiry sweep"
   …      closed 180s after restart, i.e. after the 2-minute grace elapsed
```

### The baseline, in full

```
06:23:56  session active, deadline 06:25:56 (119 s lease, measured from activation)
06:26:13  NOTIFIED       first sweep after the deadline
06:27:13  EMAILED        → "Your SEPAL instance is about to be stopped"
06:30:13  CLOSED         exactly 3 min after notify = the configured grace
06:30:14  container gone, api_key nulled
06:30:18  → "Your unused SEPAL instance was stopped"
```

### The behaviour change, measured

The claim the whole design rests on is that attachment stops being liveness. Measured directly:

- **Five bare heartbeats**: deadline unchanged, no interaction stamped, `update_time` still bumped
  for audit.
- **Three minutes of gateway heartbeats plus twenty proxied app requests** through the authenticated
  HTTPS surface: deadline unchanged, no interaction stamped.
- **One reported interaction**: deadline moves within one heartbeat cycle.

### The terminal asymmetry, reproduced

The design's core empirical claim, on the production sandbox image:

```
t0                 atime 1786692865  mtime 1786692865
after slave write  atime 1786692865  mtime 1786692876   ← program output: mtime only
after master+read  atime 1786692888  mtime 1786692876   ← keystroke: atime only
```

with the mechanism sharpened: atime is stamped in `tty_read()`, so it moves when the shell
**consumes** input, not when bytes are queued. That refines the watch-item already in §4b — a service
that *reads* from its controlling tty on a timer would manufacture phantom interaction.

End to end: two minutes of program output left `last_interaction_time` NULL; one keystroke at
07:40:34 was detected at 07:41:14 on the next sampler tick.

## Observations that are not defects

**Every young session rides the coverage grace.** A 10-minute busy window needs 6.4 samples, so a
session younger than ~8 minutes is below the coverage floor by construction and is treated as busy.
This is correct — a brand-new session should not be killed — and it is bounded: at production values
the last grace extension lands at roughly T+10 min and buys 15 minutes, i.e. T+25 min, inside the
30-minute lease. It is worth knowing because it means the effective floor on a session's life is
`min(lease, graceTicks × tick + busyExtension)`, and raising `unknownBusyGraceTicks` or
`busyExtensionMinutes` far enough would push a young session past its lease.

**An ownership failure surfaces as 500.** `Unauthorized` carries no status code, so calling a self
route for someone else's session answers 500 rather than 403. Pre-existing — `closeSession` and
`heartbeat` behave the same way — but the new extend routes expose it more.

## What the harness itself had to learn

Two of the campaigns were wrong before they were right, in ways worth recording:

- **Writing to `/dev/pts/N` from inside the container is the slave side** — program output. A
  keystroke is a master-side write followed by a slave-side read, newline-terminated because the
  line discipline is canonical and a read otherwise blocks forever.
- **A proxied request has to go through `/api/sandbox/...`**, not `/sandbox/...`. The first run of
  campaign C requested the wrong path, never reached the proxy, and passed vacuously — the most
  important assertion in that campaign was testing nothing.
- **`docker logs --since` reads a bare ISO timestamp as local time**, so the email helper returned
  nothing and "no email was sent" passed for three campaigns without ever looking at an email.
- **The close notice is delivered asynchronously.** The worker enqueues it inside the close; the
  email module delivers a second later. Asserting immediately after the close raced the delivery.
- **A young session's own grace ticks are in the same log** as the outage's, so counting a session's
  whole life conflates the two.

Both are noted because they are the same class of error as the defects: a test that passes for the
wrong reason is indistinguishable from one that passes.

## Campaign G — the shipped defaults, end to end

Two sessions on one clock: G1 untouched, G2 given a single interaction at T+20 m.

| | active | interaction | deadline | notified | closed |
|---|---|---|---|---|---|
| G1 | 07:21:46 | — | 07:51:46 (lease) | 07:52:22 | 08:53:22 |
| G2 | 07:21:57 | 07:41:35 | 07:56:35 | 07:57:22 | 08:58:22 |

```
07:57:26  "Your SEPAL instance is about to be stopped"      G1 warning, notify +5 m
08:02:26  "Your SEPAL instance is about to be stopped"      G2 warning, its cycle 15 m behind
08:53:26  "Your unused SEPAL instance was stopped"          G1 close notice
```

Every interval landed within one sweep of its configured value: the lease measured 1788 s from
activation, notify came 1837 s after activation (1800 s lease + one sweep), the email exactly 5
minutes later, the close exactly 60 minutes after that. Containers gone, instances released.

**The young-session coverage grace moved the deadline by exactly zero seconds.** Under compressed
timings a fresh session visibly outlives its lease, which raised the question of whether evaluating
every session from tick one was safe. At shipped values it is not merely bounded but inert: each
grace extension is `now + 15 m` while the lease already sits at `activation + 30 m`, so `GREATEST`
keeps the lease throughout. The compressed-timing effect was an artefact of the compression.

**The ratchet is absolute, not accumulating** — and campaign G is where that stopped being a
statement in a document and became a measurement. G2's interaction at T+19 m38 s set its deadline to
`now + 15 m` = T+35 m, which is 4 m38 s past its 30-minute lease, not 15 minutes past it. Its close
followed 300 s behind G1's, tracking the deadline gap exactly. An extension does not stack onto
whatever was there; it sets a floor at `now + N`. That is precisely what makes the ratchet monotonic
and the cap enforceable, and a test written as though extensions accumulate will disagree with it.

## Not covered here
- **AWS** — the whole simulation ran on `HOSTING_SERVICE=local`, so the provider beneath the shared
  lifecycle code is still exercised by neither the suite nor dev-env (`sepal-server-parity-audit.md`).
- **Other sandbox images and providers** — §4b's residual, unchanged.
- The **crash-loop enforcement gap** (§8) — out of scope by design, still open.
