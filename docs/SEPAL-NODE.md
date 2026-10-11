# SEPAL-NODE — changes vs `master`

Report of the `sepal-node` branch. **Keep this document up to date**: whenever a substantive
change lands on this branch, amend the relevant section and the footer.

**Goal**: retire the Java/Groovy `sepal-server` monolith and the LDAP-based `user` module,
replacing them with Node.js microservices — without breaking rollback to the `user` branch.

**Companion branch `sepal`** (created 2026-08-05): a compacted rewrite of this branch's
history — the same final tree (verified byte-identical) as 36 module/feature-grouped commits
built from milestone tree snapshots via `git commit-tree`. Mid-branch-only artifacts
(`docs/superpowers/` plans, the sepal-server golden-fixture generator, the pre-simplification
recipe migrators) were elided. `sepal-node` remains the authoritative development branch;
new work here means the `sepal` branch must be rebuilt or extended to match.

## New Node modules (replacing sepal-server components)

- **`worker`** — EC2 worker-instance provisioning, sandbox session lifecycle, task execution
  orchestration (replaces `hostingservice`/`workersession`/`task`). Owns the `worker` schema
  (copies of the `sdms` worker-cluster tables; originals untouched). Adds per-app session
  associations (`session_app`) and pushes session/task state to the GUI over websocket.
  A 12-minute `RemoveOrphanedContainers` sweep (first run at startup; no Groovy counterpart)
  deletes worker containers on the shared local dev daemon that no open session or
  provider-tracked instance claims — the in-memory local provider forgets instances on
  restart, so their containers would otherwise leak forever. No-op on AWS.
  Adds **instance resource monitoring** (phase 1, observe-only — see
  `docs/instance-resource-monitoring.md`): a 60s sampler reads CPU/RAM/network (and GPU via
  `nvidia-smi` exec on GPU types) for every ACTIVE session through the instances' Docker API,
  computing CPU/network as counter deltas between ticks (true interval averages). Samples land
  in `worker.instance_usage_sample` (30-day retention) with hourly rollups in
  `instance_usage_hourly` (1-year retention, migration 003, which also adds the inert phase-2
  idle-policy columns to `worker_session`); the latest sample rides the session report/ws DTO
  (`usage`, nulled when >5 min stale) and is mirrored as `sepal_instance_*` Prometheus gauges
  on the worker's `/metrics`. Phase-4 user-details half: admin endpoint
  `GET /sessions/:username/usage?days=30` returns time-weighted per-instance-type
  avg/max aggregates from the hourly rollups (per-metric sample-count denominators, so
  GPU averages weight over GPU hours only), shown in the Users-section user-details form.
  Phase 2 (config-gated by `IDLE_WARNINGS_ENABLED`, default off): heartbeats gain a
  `{userActivity: true}` flag (gateway sends it only for sessions with actually-proxied
  user requests; ssh-gateway's `alive.sh` always — open SSH suppresses idleness; a bare
  heartbeat is never activity), and a 1-minute `EvaluateIdleSessions` sweep drives the
  persisted `OK ⇄ WARNED` state from sample-window averages with a trim-adjusted
  80%-coverage fail-safe — asymmetric windows: 30 min to warn, 10 min to recover
  (`IDLE_RECOVERY_WINDOW_MINUTES`), so resumed load clears quickly and auto-shutdown can
  never hit a session that worked in the last recovery window — emitting `workerSession.SessionIdleWarned` (gateway relays to the user's
  tabs → toast + Usage-button pulse; IDLE badge on session rows) and an `email.sendToUser`
  warning. Phase 3 (additionally gated by `IDLE_AUTO_SHUTDOWN`, default off): a WARNED
  session still idle after `IDLE_GRACE_MINUTES` (default 60) is closed via the normal
  close cascade — unless the keepAlive slider is in the future (absolute opt-out) —
  publishing `workerSession.SessionIdleClosed` (browser toast) + a shutdown email; the
  DTO carries `idle.shutdownTime` for the GUI countdown.
  **Expiry notification, in-app and by email** (see `docs/session-expiration-model.md` §5/§5a):
  the in-app notification offers exactly two actions — `[Keep it running 60 min]` and
  `[Terminate now]` — and the escalation email carries ONE link to a page offering the same pair as
  buttons, because for a user who is not looking at SEPAL the mail *is* the notification. One link
  rather than two: a mail is read on a phone, and a destructive action one tap from the inbox is a
  mis-tap waiting to happen. Unauthenticated (`GET|POST /api/sessions/expiry/:token`, gateway-routed
  before the authenticated `/api/sessions`): clicked from a mail client with no SEPAL session, so
  the HMAC token carries its own authority over that session's expiry decision, either way. The
  `GET` only renders the page (link scanners and preview fetchers fire every `GET` in a mail); each
  button `POST`s the token back with a hidden `action`, and an absent or unknown action does
  nothing. Both redemptions are guarded on the `notified_time` the token was signed against, so any
  extension spends the token — a user who went back to work cannot have their instance killed by a
  stale link. `manualExtensionMinutes` / `emailExtensionMinutes` default to 60 (were 15).
  **Instance allocation is arbitrated by claims, not by a mirror table.** The Node port initially
  kept its own copy of the instance list; that table is gone. The hosting service (EC2, or the
  in-memory local provider) is the sole authority on what instances exist, and MySQL holds exactly
  one fact about them — `instance_claim (instance_id PK, session_id, claimed_at)`, "this instance
  is spoken for". Allocation walks the provider's idle instances and races an `INSERT`; the PK
  makes the win atomic with no `affectedRows` interpretation, and a lost race moves to the next
  candidate rather than launching. Two sweeps keep the table honest: `ReleaseUnusedInstances`
  (@1min, 5-minute minimum age) releases reserved instances no open session holds, skipping
  claimed ones because a claim means an allocation is still in flight; `ReclaimStaleClaims`
  (@1min, 10-minute grace) drops claims whose instance the hosting service no longer reports and
  routes claims whose session never appeared through the full release. The grace must outlast
  `awaitHost`, which on AWS can run for minutes.
  **Surviving a restart of the `worker` container itself** (see `modules/worker/CLAUDE.md`) — in
  dev that is every file save, via nodemon. Four mechanisms: a rejected `main()` now exits
  non-zero, so `restart: always` retries it instead of leaving a process alive on the MySQL pool's
  handles with no HTTP server (Compose does not act on a failing healthcheck); `provider.restore`
  hands the open sessions' instances back to the in-memory local provider at startup, before
  `backfillClaims`, since without it every live instance reads as gone and its container leaks
  (AWS no-ops — EC2 answers from tags); `ReconcilePendingSessions` (@1min) activates or
  re-provisions PENDING sessions whose provisioning nobody is driving any more, which previously
  died at the 10-minute PENDING timeout even when the instance was healthy; and `releaseInstance`
  now undeploys *before* dropping the claim, so the invariant is *claim row absent ⇒ container
  definitely gone* and a half-finished release is retried rather than stranding the previous
  user's container on an instance about to be tagged idle. Provisioning is deduplicated by
  instance id in an in-process registry — `provisionInstance` opens by deleting the instance's
  containers, so re-entering it would destroy the work in flight — and the entry carries the
  session it was started for and is forgotten on release, or an instance back in the pool would
  silently drop the *next* session's provisioning as a duplicate. The re-provision path re-reads
  the instance's PENDING session immediately before acting, because the probe verdict it acts on
  is a batch snapshot up to 30s old. Known limitation: `provisionInstance`'s ~17-minute retry loop
  still has no abort, so a provision can outlive its session (pre-existing on the event path).
- **`budget`** — extracted from `worker`: instance + storage spending and monthly budget
  enforcement. Owns the `budget` schema with an event-sourced `open_session_use` table,
  level-triggered `budget.UserBudgetExceeded/Cleared` events, hourly reconciler, and a
  spending websocket for the GUI. Migration copies legacy data from `sdms` (copy-only, guarded).
- **`recipe`** — processing recipes (replaces the Groovy recipe component). Owns
  `processing_recipe`. Ports the recipe fold-forward migration engine to JS with golden-parity
  tests against the Java migrators (all 24 fixtures) and a locked type-version registry.
- **`scene-metadata`** — scene search/best-scenes API next to the existing ingester; moves
  `scene_meta_data` out of `sdms` into its own schema. Gateway route `/api/scene-metadata`.
  Its Redis (own instance, own volume) is flushed at startup when the schema was missing, so a
  wiped MySQL can no longer leave a stale `initialized` key that skips the CSV load forever.
  To support this, the shared `initDatabase` now returns `{created, migrated, version}`
  (additive — every other caller ignores it).
- **`message`** (formerly `notification`) — admin system messages + per-user read state.
  Owns the new `message` schema. Message `priority` (−1 unpublished draft / 0 normal /
  1 urgent), re-notification of all users on update, author auto-read, per-message
  "seen by N users" count, full-list websocket push to the GUI (replaced the last 60s
  HTTP polling loop).
- **`storage`** (formerly `user-storage`) — user storage quota/usage scanning and inactivity
  handling, unchanged in behaviour. Owns the new `storage` schema, populated from the old
  `user_storage` database by a `migrations/legacy-import/` copy of `history` (guarded on
  "source exists and target empty", identities preserved, source untouched) — the pattern
  `user`/`recipe`/`budget` already use. Its RabbitMQ surface follows the name: publishes
  `storage.size`, subscribes as `storage.systemEvent` / `storage.workerSession` /
  `storage.files`, and `budget` consumes it on queue `budget.storage`. Gateway route is
  `/api/storage`; container and Redis are `storage` / `storage-redis`, though the Redis data
  directory keeps its `user-storage-redis` name so existing deployments carry their data over.
  The sibling `user-storage-backup` module keeps its name — it backs up user home directories,
  not this module's data.

## User module / LDAP removal

- The Java `user` module and OpenLDAP are gone; `user` is a Node rewrite handling
  authentication, credentials, Google account/tokens. Keeps `uid`/`gid` columns and SSHA
  password verification for sandbox compatibility. The whole Java toolchain (Gradle build,
  `common` library, Java base image, dev-env JDK) was removed with it.
- **Username case has one answer everywhere.** Every `username` column is `ascii_general_ci`, so
  lookups match any case without `LOWER()`; what a collation cannot decide is which spelling gets
  stored, so `#sepal/username`'s `storedUsername` normalizes on the way in. Anything that reads a
  username back as data rather than comparing it in SQL — a Redis key, an event payload, a
  filesystem path — therefore sees one spelling. Redis had accumulated the pre-normalization
  spellings (5,433 keys and 2,927 values over 4,494 users in a production copy: duplicate storage
  sizes, session flags that never cleared, cached users holding years-old tokens), so gateway,
  storage and user-assets now normalize what they hold at startup — removing duplicates,
  renaming the keys that have no stored-spelling counterpart, and correcting usernames embedded in
  cached values. The inactivity queue is restated through the BullMQ API (a job id cannot be
  renamed: it is re-added under the stored name, keeping its remaining delay, and the original
  removed). The planner is shared and tested (`#sepal/redisKeyCase`); the passes are idempotent and
  become no-ops once the write paths have held.

## Gateway

- **Sandbox proxy** replaces the Java `sandboxwebproxy`: dynamic per-user routing of
  `/api/sandbox/*` (kernel-probe → app-path → referer → fallback attribution) and
  `POST /api/sandbox/start` with per-app session reuse; forwards session-closed events to the
  browser. `Location` rewrite preserves trailing slashes (RStudio first-launch fix).
- **Lazy sandbox servers**: the sandbox image no longer starts `rserver`, `shiny-server` and
  `jupyter` at container boot (`autostart=false`; supervisord gains a control socket), and the
  provision wait command drops from `'22;8787;3838;8888'` to `'22'` — so a session becomes ACTIVE,
  and the terminal usable, without waiting ~9s for Jupyter. The worker starts a server on demand
  by exec'ing `/script/sandbox-server.sh start <endpoint>` through the Docker API
  (`dockerSandboxServerControl`, which reads `ExitCode` — the script blocks until the port
  listens), behind `POST /sessions/session/:sessionId/server/:endpoint` and an in-memory
  per-`(sessionId, endpoint)` memo (`sandboxServerManager`). The gateway ensures the server
  before proxying the first request (`resolveTarget` now returns `sessionId`) and warms it
  best-effort on `POST /api/sandbox/start`. Nothing stops a server: they run until the container
  goes away. Design: `docs/superpowers/specs/2026-08-26-lazy-sandbox-servers-design.md`.
- **App ↔ client ownership plumbing**: the downlink pushes each browser its gateway-minted
  `clientId` after ws connect (new `{clientId}` protocol message); sandbox start/release
  requests carry it through to the worker, which stores it as the association's owner. The
  `gateway.sessionAppDissociated` subscriber drops cached app entries on every dissociation
  and unicasts `appSessionDissociated` to the owner client when another client dissociated
  its app (takeover close).
- **Route cutover** from the monolith to the modules: `/api/sessions`, `/api/tasks` → worker;
  `/api/budget` → budget; `/api/processing-recipes` → recipe; `/api/scene-metadata`;
  `/api/message` → message.
- **Virtual websocket endpoints** (uplink/downlink fan-out) now cover: `user-files`,
  `user-assets`, `user`, `worker/task`, `worker/session`, `budget`, `message`.

## GUI

- HTTP polling replaced by websocket subscriptions: tasks, budget spending, worker sessions,
  and messages (monitors in `widget/*Monitor.jsx`).
- Usage panel session rows show live CPU/RAM (and GPU where present) percentages from the
  worker's resource sampler.
- Messages UX rework (`app/home/messages/`, renamed from "user messages"): priority selection
  in the editor header, unpublished drafts, urgent messages open directly one-after-another
  (immediately at load, after 10 s when arriving live), acknowledgment on close, buzzing
  warning bell, "Seen by N users" in the message footer (admins only), author shown in the
  header as localized "from: {username}".
- Textarea Enter fix (`widget/input.jsx`): Enter inserts a newline instead of triggering the
  panel's global Apply/Close keybinding (last-mounted-wins dispatch beat the textarea's
  `{Enter: null}` neutralizer); Enter/NumpadEnter propagation now stops at the textarea,
  like the existing navigation-key capture.
- App-launcher instance picker with per-tab sessions; `CrudItem` timestamp modes; various
  fixes (tab-handle focus steal, modal focus behavior; drag-reorder now triggers on
  >50% clone/target overlap instead of pointer position, so the swap point no longer
  depends on where the tab was grabbed; stuck grab-cursor after a quick grab-and-release
  fixed — `onDragEnd`'s guard read not-yet-committed React state when panend landed in
  the same frame as panstart; the guard is gone, replaced by stream pairing — each
  panstart arms one `panEnd$.pipe(take(1))`, and move/end streams self-terminate on
  gesture end or Escape-cancel via `takeUntil`).
- Instance picker options render two lines (hosted apps dimmed under the instance line via
  the combo option `render` hook); selected-item label carries the app count; the picker is
  a modal overlay with the app list still visible behind it. Instance-type
  description now `"N CPU, N GPU, N GiB"` (GPU segment only when present), and the
  serialized instance-type field `gpu` renamed to `gpuCount` (worker + GUI in lockstep).
- Closing an app tab unbinds the app from its instance (GUI `onClose` → gateway
  `DELETE /api/sandbox/start?appPath=` → worker `DELETE /sessions/app`, emitting
  `SessionAppDissociated`); the session stays open, so the app can be re-opened on a
  different instance or a second copy run elsewhere. Softens Design Decision 4 (permanent
  associations): permanence now holds only while the tab is open.
- Client-scoped app sessions (worker `session_app.client_id`, migration 004): a browser
  going down (clientDown) makes the WORKER dissociate every app its tabs had open; opening
  a sandbox app always goes through the instance picker, and when the app (or a group-mate)
  is already open — this browser or another — a confirmation closes it at its previous
  location before re-opening on the picked instance (`appOpenPlan.js` decides
  focus / open / confirm; same-browser same-instance picks just focus the open tab).
  An app's ENDPOINT is its group: all apps of one endpoint (every jupyter app — Lab,
  Notebook, voila apps — or every shiny app) may run side by side but must share one
  instance — moving any of them to a new instance closes the whole endpoint group there
  first; joining the group's instance is silent. No catalog changes needed. Docker apps
  are unrestricted (isolated per-copy containers). A ws reconnect (fresh clientId)
  re-asserts open tabs' associations, so transient drops don't strand live tabs.
  Worker + gateway + GUI ship together.
- Instance-number prefix ("2:") on instance-picker options and app tab handles, matching
  the ID column of the ssh-gateway terminal menu: derived (not stored) as the session's
  1-based position in the report's oldest-first session list (`sessionNumber()` in
  `apps/instanceSuitability.js`), so numbers shift down when an older instance closes.
  Rendered on tabs as a non-editable element outside the title input (generic
  `Tabs`/`TabHandle` `tabPrefix`/`prefix` props), so renaming a tab can't eat or
  duplicate it; appears once the session shows up in the polled report (~10 s for a
  fresh instance).
- **The terminal names its session**, on the tab and at the prompt. The GUI terminal tab shows
  `"{menu ID}: {two-word name}"`, carried out of the ssh session as an OSC 0 terminal title that
  the ssh-gateway writes when it hands over the shell (`sessionLabel$` reads both from the report,
  so a just-created session gets the same number the menu would give it) and clears on the way
  back to its menu; the GUI's xterm turns it into the tab's *placeholder*, so a hand-renamed tab
  keeps its name. Unlike the app tabs above the number is a snapshot taken at join time, not
  re-derived from the live report. The shell prompt is `{two-word name}:{dir}$` — the worker sets
  the container's `Hostname` to the same name, and the sandbox image sets `PS1` from a one-shot
  `PROMPT_COMMAND` because the user's persistent home carries the Debian skeleton `~/.bashrc`,
  which is sourced after everything in `/etc` and (under `TERM=xterm*`) embeds a `\u@\h: \w`
  window title that would otherwise overwrite the tab name on every prompt.
- **A stopped session no longer wipes the terminal.** `ssh-bootstrap` already probes the worker
  after a dropped connection and gives up when it answers 404; it now holds there on
  "The session has been terminated - press ENTER to reset the terminal" instead of returning
  immediately into the caller's `clear`, so the user keeps whatever was on screen until they
  choose to lose it. Interactive sessions only.

- Usage-button budget warning also fires when the instance budget runs out within the hour at
  the running sessions' combined hourly cost (previously only a projected month-end storage
  overrun). Budget arithmetic extracted to `widget/budgetRules.js` (pure + unit-tested);
  `user.hasBudget` and `user.budgetWarning` dropped from the store — the warning depends on
  spending AND sessions, which arrive on two different websockets, and `UsageButton` is the
  only reader, so it derives both on render. `user.budgetExceeded` stays stored (menu, body
  and retrieve button read it).

## Deployment / operations

- `sepal-server` (and its deploy role, monit checks, Flyway control of migrated schemas)
  removed from the stack; new modules wired into `deploy.yml`, `build-and-push-images.sh`,
  monit dockerchecks, dev-env `deps.json`/`groups.json`, `PORTS.txt`.
- Deployments are pinned to the sources their build was made from: `build-and-push-images.sh`
  tags the built commit `build-<BUILD_NUMBER>` (pushed last, so an incomplete build stays
  undeployable), and `bin/deploy` resolves that tag, checks it out into a throwaway worktree
  and re-executes itself from there. The operator's branch and uncommitted files no longer
  affect what gets deployed. `--local` keeps the old behaviour for hot-patching, printing
  branch/commit/dirty-count first.
- Prometheus now scrapes the worker module (`/api/worker/metrics` gateway route + `worker`
  job) — per-instance usage gauges for dashboards and idle-threshold calibration.
- Schema strategy for rollback to the `user` branch: new schemas (`worker`, `budget`,
  `message`) are dropped on rollback; `processing_recipe` returns to Flyway by restoring
  `schema_version_old`; `sdms`/`worker_instance` stay untouched Flyway originals.
- Shared lib: Postgrator-based migrations with legacy-Flyway coexistence, message-queue and
  websocket scaffolding (`#sepal/ws/module`) reused by all new modules.
- Shared lib fix: client disconnect on `stream()` HTTP routes no longer calls
  `ctx.result$.complete()` (a TypeError → process crash for plain-Observable routes such as
  ceo-gateway's; gee routes survived only via RxJS 7's `AnonymousSubject` accident, removed
  in RxJS 8) — replaced with a `takeUntil(close$)` cancellation subject, with regression
  tests in `httpServer/stream.clientDisconnect.test.js`.
- The worker AMI is rebuilt only when its content hash changes (sandbox and task image IDs, the
  files in `hosting-services/aws/sepal/worker-ami/`, the baked-in env values). `provision`
  skips packer when an AMI carries the hash; `deploy` passes that AMI's build to the worker as
  `WORKER_AMI_VERSION`, which replaces `SEPAL_VERSION` for the AMI lookup, instance tags and
  sandbox/task image tags — so deploys that reuse the AMI also keep the idle and stopped pools.
  Instances of any other version, newer ones included (a revert moves the version back), are
  recycled. `build-worker-ami.sh` forces a rebuild, refusing the current AMI's own build.

## Parity audit vs `master`

Full component-by-component comparison of the `sepal` branch against the `sepal-server` monolith:
**`docs/sepal-server-parity-audit.md`** (2026-08-06). Coverage is complete — every Groovy command,
query, event and schedule has a counterpart, three dropped routes are all verified unused or
replaced, and deploy/monit plumbing is symmetric. Eight pre-existing bugs were fixed (notably the
AWS `retry()` that swallowed its final exception, and the 200-on-closed-session heartbeat); the
last two came after the audit — see below.

**Fixed after the audit** — *a worker outage longer than the session timeout closed every open
session on restart* (2026-08-07). `CloseTimedOutSessions` ran immediately at startup, but a
session's `update_time` can only be refreshed while the worker is up, so after an outage every open
session looked timed out and the sweep beat the gateway's 30 s heartbeat to it — closing live
sessions and, one sweep later, releasing and terminating their instances. The predicate was
treating wall-clock time as if it were time during which the worker was reachable. The fix at the
time was a 2-minute `STARTUP_GRACE_MS` holding the sweep after `start()`. That grace was **removed
on 2026-09-17**: once an ACTIVE session's lifetime became a stored deadline swept by
`ExpireSessions` (notify → email → close over an hour), a deadline that passed during an outage
earns a notification, never a close, so there was nothing left for the grace to protect — while
measuring it from process start meant a worker crash-looping faster than two minutes never closed
anything. `CloseTimedOutSessions` is PENDING-only and now runs in the same job as
`ReconcilePendingSessions`, after it, so a missed activation lands before the sweep can see the row.
For the current state of every stop trigger, keep-alive signal and restart behaviour — plus the
persisted-liveness alternative not taken, and what is still open (the AWS provider being
unverified): see **`docs/instance-stopping-parity.md`**.

**Fixed after the audit** — *SizeIdlePool was conditionally scheduled* (2026-08-08). The sweep ran
only when some instance type declared `idleCount > 0`, and exactly one catalog entry did
(`T3aSmall`), so the whole instance-termination path hung on that single line. It is the only step
that terminates a released instance — `releaseInstance` merely re-tags it `State=idle` on AWS, and
`terminateOldIdle` sweeps only *older-version* idle instances — so zeroing that entry would have
leaked every released machine indefinitely. Now scheduled unconditionally, as Groovy did:
`sizeIdlePool` already treats an empty target map correctly (every idle instance gets target 0 and
is terminated), so only the guard was wrong. Surfaced by the live simulation, which showed
`sizeIdlePool: terminating N surplus idle instance(s)` to be the only step in the whole run that
destroyed anything.

**Fixed after the audit** — *a transient Docker-API failure closed live sessions* (2026-08-07).
`CloseSessionsWithoutInstance` asked `isProvisioned`, which collapsed every error — connection
refused, timeout, 5xx, DNS — into the same `false` as a genuine "no such container". One blip
closed the session row, and `ReleaseUnusedInstances` terminated the still-live machine 5 minutes
later, killing the user's running processes. The payoff matrix is starkly asymmetric (a false
"missing" destroys a live session; a false "present" costs one minute of a dead instance), so the
probe is now biased accordingly: `workerInstance/instanceStatus.js` defines
`PROVISIONED | MISSING | UNKNOWN`, only a Docker-issued denial (404/409/not-running) counts as
MISSING, and `workerSession/missingInstanceTracker.js` requires it on two consecutive sweeps before
closing — with a 30-minute backstop so a permanently unreachable host still cannot bill forever.
The probe itself was replaced in the same change: it execed the image's `waitCommand` but never
read the exit code (Docker returns 200 from `exec/{id}/start` regardless), so it was running a
`netstat` poll inside every container of every ACTIVE session every minute, with no timeout, to
learn only what a `GET /containers/{name}/json` returns instantly. `isProvisioned` had exactly one
caller, so it was replaced rather than duplicated; `dockerApi.js` now puts `statusCode` on its
errors. Groovy had the identical defect. Cost: a genuinely gone instance is closed after ~2 minutes
instead of ~1.

No open regressions block a production release:

- ~~**AWS instance-type identifier mismatch**~~ — fixed in `6588e7f25`, see below.

- ~~**Recipe migrations stubbed out**~~ — **withdrawn, not a defect** (2026-08-06). Every recipe in
  every environment is already at its current type version and old recipes will never need
  migrating. The residual risk originally raised — an imported or restored old recipe file being
  re-stamped without transformation — never existed: `recipeApi.js` sets
  `typeVersion: currentVersionForType(type)` on every save, ignoring whatever version the incoming
  contents claim, exactly as Groovy's `SaveRecipeHandler` did (`recipe.withTypeVersion(
  migrations.currentVersion)`). There was no migration-on-import path in `master` to lose; the
  engine only ever applied to rows already in the DB that predated a version bump. The one
  forward-looking rule: a future version bump must ship with its transform, not a bare baseline
  marker.

Lower-severity items from the audit, both since fixed: closing an over-budget user's sessions was
edge-triggered with no retry (`eef3c55f5`); `userInstanceUses` ignored its year/month arguments
(`ed7c80db8`).

**Fixed since the audit** — *pre-session budget check restored*. The worker no longer decides a
session request from the event-fed `lockedUsers` set (empty after a restart, stale after a budget
raise, and collapsing the three budget/quota errors into one). `workerSession/budgetClient.js` asks
the budget module directly — new `GET /budget/check/:username` [admin] returning
`{username, exceeded, reason}`. The endpoint is backed by a new `budgetManager.verdict()`, with
`check()` reimplemented on top of it, so the throwing and reporting forms share one decision path
and keep the Groovy `BudgetComponentAdapter` short-circuit order (instance budget → storage budget
→ storage quota). `budgetErrors.js` regains `StorageBudgetExceeded` / `StorageQuotaExceeded` plus a
`budgetErrorFor(reason, username)` mapper keyed on those wire strings, so the three rejections are
distinct again — and since `tasksApi`'s `BUDGET_ERROR_NAMES` already listed all three, they now
answer 403 rather than 500 on the `/tasks` path (`/sessions/instance-type` still 500s, as in
Groovy). `requestSession` holds the fallback inline: `lockedUsers` is consulted only when the
budget call fails or no client is wired — fail-open unless the user is already known to be locked,
since a budget outage must not stop all of SEPAL from starting sessions (a mode in-process Groovy
never had). Only an explicit `exceeded === true` refuses, so a malformed body cannot lock a user
out. `lockedUsers` otherwise keeps its remaining job, closing over-budget sessions — the missing
retry there (audit item 4) is untouched. Worker config gains `BUDGET_URL` (default
`http://budget`); `deps.json` already declared the worker → budget run dependency. The endpoint is
covered by unit tests only; the DB-backed integration suites stay skipped, so it has not been
exercised against a live budget container.

**Fixed since the audit** — *AWS instance-type ids translated at the boundary* (`6588e7f25`). The
provider's public surface is now id-in/id-out like the local one; `createInstanceTypeCodec` maps
catalog id ↔ EC2 name off the catalog and is applied on `RunInstances`, on the `instance-type`
filter and in `toWorkerInstance`, mirroring Groovy's use of the AWS SDK v1 `InstanceType` enum.
Two catalog entries carried Groovy's id/name typos: `M5a12xlarge`'s `name` was `m4.10xlarge`,
colliding with `M410xlarge` — harmless in Groovy (which never used `name` for AWS calls) but here
`name` *is* the launched type, so it is corrected to `m5a.12xlarge`. `C7a12xlarge` is the mirror
image — cpu/ram/cost/tag all describe `c7a.16xlarge`, so the **id** is the typo; `name` stays
`c7a.16xlarge`, meaning this type now provisions the 16xlarge the user selected and is billed for
instead of the 48-vCPU 12xlarge Groovy launched. **Ids are frozen** (persisted in
`worker_session.instance_type` / `open_session_use`, and the GUI + ssh-gateway wire value).
The provider's tests had encoded the inverted contract, which is why the bug survived; catalog
invariants (unique names, id ⇔ name agreement) are now asserted. Still unexercised against live
AWS — only `aws-sdk-client-mock`.

---
*Last updated: 2026-09-24 (worker AMI rebuilt only when its content hash changes — `worker-ami/worker_ami.py`, `build-worker-ami.sh`, `WORKER_AMI_VERSION`; before that, 2026-09-17: worker startup grace removed — `STARTUP_GRACE_MS` no longer holds `CloseTimedOutSessions` / `ExpireSessions` after a restart; the PENDING sweeps are sequenced instead, closing the crash-loop enforcement gap; before that, 2026-09-10: `user-storage` renamed to `storage` — module, image, container, Redis, gateway route, GUI api and RabbitMQ keys, but not the Redis data directory — with a `legacy-import` copy of `history` from the old `user_storage` database, which stays untouched; and worker instance management made resilient to a restart of the `worker` container: fail-fast boot, `provider.restore`, `ReconcilePendingSessions`, undeploy-before-claim-delete; the claim-arbitrated allocation that replaced the instance mirror table is now documented too). Code through commit `d5734fa1f`; the working branch `ec2-performance` is 251 commits / 1853 files vs `master`.*
