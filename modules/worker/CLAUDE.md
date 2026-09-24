# CLAUDE.md - modules/worker

SEPAL worker service (Node.js). Will replace the Java `sepal-server` `hostingservice`,
`workersession`, `task`, and `budget` components. Owns the single `worker` MySQL schema via
Postgrator (Phase 4a-revision). Phase 4a scaffolds the module with healthcheck only.
Sub-phases 4b–4f will add worker instance provisioning, session management, task execution,
budget tracking, and gateway route migration.

## Database migrations

`migrations/` holds the portable schema stream. `migrations/legacy-import/` holds the one-off copy from `sdms`. Startup and import cleanup are described in [docs/database-migrations.md](../../docs/database-migrations.md).

## Commands
- `npm test` — Jest (ESM)
- `sepal build worker` / `sepal start worker` / `sepal logs worker -r`

## Routes
- `GET /healthcheck` — returns `{status: 'ok'}`
- `GET /task/ws` — gateway virtual-websocket endpoint (module `worker/task` in the gateway's
  `webSocketEndpoints`): pushes per-user task listings to GUI subscribers
  (`{path: '', items: {taskId: listItem}}` on subscribe and on every task mutation).
- `/sessions/*` and `/tasks/*` REST surfaces (see `src/workerSession/routes.js` and `src/task/routes.js`)
  - `GET /sessions/app-sessions` — the current user's app↔session associations, `[{path, label,
    sessionId, host, status, instanceType}]`.
  - `POST /sessions/session/:sessionId/app` — body `{path, label, clientId}`; associates the app
    with the session, storing `clientId` (the browser ws client owning the tab) on the row. If a
    live association for that `(username, path)` already exists it wins — the existing
    `{sessionId, path, label}` is returned as-is rather than moved — but its `client_id` is
    refreshed to the requester (reconnect re-assert must disarm the old id's pending clientDown).
    Body `reassert: true` marks that reconnect replay: ownership is refreshed but NO deadline
    moves, because the socket dropping is not a user opening an app. Only a literal `true` counts.
  - `DELETE /sessions/app?path=…&clientId=…` — unbinds the app from its session (GUI tab close,
    or a takeover before re-opening the app elsewhere); the session stays open. Idempotent (204
    either way). Emits `SessionAppDissociated {…, clientId: owner, requestingClientId}` — the
    gateway closes the OWNER's tab when someone else dissociated it.
  - `POST /sessions/session/:sessionId/server/:endpoint` — start one of the sandbox's on-demand
    servers (`rstudio` | `shiny` | `jupyter`) on the session's instance, 204 once its port is
    listening. The sandbox image starts only `sshd` at boot (`autostart=false` on the other three),
    so the provision wait command covers port 22 alone and the terminal no longer waits for
    Jupyter. `sandboxServerManager` memoizes started `(sessionId, endpoint)` pairs IN MEMORY and
    shares one in-flight start between concurrent callers; nothing is persisted because nothing
    needs to survive a restart — `/script/sandbox-server.sh` exits 0 immediately for a server that
    is already listening. **Servers are never stopped**; they live until the container does.
  - The session ws protocol (`/session/ws`) handles `clientDown` by dissociating every
    association owned by that client (its tabs died with it), one event per app.
  - `POST /sessions/session/:sessionId/extend` — the Usage-panel keepAlive slider, body/query
    `{hours}`. A RATCHET, not an override: it can only move the deadline further out.
  - `POST /sessions/session/:sessionId/extend-now` — the Keep-it-running button on the expiry
    notification. 200 `{extended: true}`, or 409 when no ACTIVE session matched.
  - `POST /sessions/session/:sessionId/opened` — the one-shot "terminal opened" extension
    (ssh-gateway on connect). Apps reach the same ratchet through the app association instead.
  - `POST /sessions/session/:sessionId/dismiss-expiry` — "I saw it, don't email me". Does NOT
    move the deadline; the session still closes at T+grace.
  - `GET|POST /sessions/expiry/:token` — the expiry email's single management link.
    **UNAUTHENTICATED**: it is clicked from a mail client with no SEPAL session, and the HMAC token
    carries its own authority over that session's expiry decision, either way (the action is NOT
    signed in — the page it opens offers both buttons, so scoping the token would protect
    nothing). The GET only renders the page — a mutating GET would be fired by link scanners and
    preview fetchers, which for termination means destroying an instance nobody asked to destroy.
    Each button POSTs the same token back with a hidden `action` field (`extend` | `terminate`);
    an absent or unknown action does nothing and re-renders. The gateway routes
    `/api/sessions/expiry` before its authenticated `/api/sessions` entry.

## Session API keys
Every session — SANDBOX and TASK_EXECUTOR alike — is minted an `api_key` by `RequestSession` and
provisioned with it as `SEPAL_API_KEY`. `dockerInstanceProvisioner` REFUSES to create a container
without one (the caller's retry covers a lookup made before the row committed), so a worker never
starts unable to authenticate.

A worker authenticates back to SEPAL with Basic auth, empty username, key as password. The gateway
resolves it through `POST /sessions/api-key-authenticate` → `{username, sessionId, workerType}` and
injects the session as `sepal-session`; the two task-executor callbacks (`POST /tasks/active`,
`POST /tasks/task/:id/state-updated`) require a TASK_EXECUTOR `sepal-session`, and
`UpdateTaskProgress` additionally requires the task's owner and assigned `sessionId` to match. A
role is never sufficient: every session of a user would share it.

Keys resolve only while the session is PENDING or ACTIVE; closing a session clears `api_key`, so the
last terminal callback of a session revokes its own credential.

**One-time transition (task executors).** Task executors previously authenticated with
`SEPAL_ADMIN_PASSWORD`. Executors already running when this change deploys hold no key and their
callbacks are refused, and TASK_EXECUTOR rows predating it have `api_key = NULL`, so reprovisioning
one fails through the full provision retry. Deploy with no PENDING/ACTIVE TASK_EXECUTOR session: let
running tasks finish or cancel them, then close any leftover executor session so the next task
requests a fresh one. Interactive sandboxes always had keys and are unaffected.

## Session expiration
See `docs/session-expiration-model.md`. Lifetime is a STORED `timeout_time` moved only by
`workerSessionRepository.extendSession` — one monotonic UPDATE that is also atomic with the
notification reset, which is what makes "any extension cancels the expiry" a guarantee rather than
a race. There is no other way to move a deadline.

- **A bare heartbeat extends nothing.** `update_time` is audit only. Only a real interaction does:
  input observed in an app iframe (gateway → `{interaction: true}` on the next beat), or pty atime
  advancing inside the container (the sampler).
- **The busy verdict** (`instanceUsage/busyVerdict.js`) extends on absolute cores / device GPU /
  network, clamped to `MAX_UNATTENDED_HOURS` from the last human interaction — so load alone can
  never keep a session alive forever. It does NOT stamp `last_interaction_time`; that is the whole
  cap mechanism.
- **`ExpireSessions`** @1 min: notify → email at +`NOTIFICATION_VISIBLE_MINUTES` → close at
  +`SESSION_GRACE_MINUTES`. Gated by `SESSION_EXPIRY_MODE` (`off` | `notify` | `enforce`,
  default `off`); the ratchets run regardless, so `off` still records deadlines.
- Every sweep transition is a compare-and-set guarded on what was observed. **The sweep may never
  act on a fact it read earlier.**
- `CloseTimedOutSessions` is now PENDING-only.

## Surviving a worker restart

The `worker` container restarts routinely — a deploy, an OOM kill, and in dev a nodemon reload
on every file save. Four mechanisms carry instance management across it:

- **The boot fails loudly.** A rejected `main()` exits non-zero so `restart: always` retries it.
  Left to log and hang, the process stayed alive on the MySQL pool's handles with no HTTP server,
  and Compose does not act on a failing healthcheck.
- **`provider.restore(instances)`** (`workerInstance/index.js`, before `backfillClaims`) hands the
  open sessions' instances back to a provider that keeps its world in memory. The LOCAL provider
  needs it; AWS implements it as a no-op because EC2 answers from tags.
- **`ReconcilePendingSessions`** @1min activates or re-provisions PENDING sessions whose
  provisioning nobody is driving any more. Provisioning is deduplicated by instance id in an
  in-process registry (`workerInstance/provisioningRegistry.js`), because `provisionInstance`
  opens by deleting the instance's containers — re-entering it destroys the work in flight.
  `releaseInstance` forgets the entry, so an instance back in the pool cannot drop the next
  session's provisioning as a duplicate. Re-provisioning re-reads the instance's PENDING session
  first: the probe verdict it acts on is a batch snapshot, and the invariant above holds here too.
- **`releaseInstance` undeploys before dropping the claim.** The invariant is *claim row absent ⇒
  container definitely gone*: die mid-release and the claim survives, so `ReclaimStaleClaims`
  runs the whole release again. `backfillClaims` is permanent reconciliation, not an upgrade shim.
- **No startup grace.** `ReconcilePendingSessions` and `CloseTimedOutSessions` run as one job, in
  that order, so a restart lands a missed activation before the timed-out sweep can see the PENDING
  row. `ExpireSessions` needs no head start: a deadline that passed during an outage earns a
  notification and the full grace, never a close. The former 2-minute grace, measured from process
  start, was what let a crash loop starve every closing sweep.

## Stopped-instance pool (AWS)
`STOPPED_POOL_SIZE` (default 0 = off) keeps that many stopped worker instances whose disk has already
been read from the AMI snapshot. A stopped instance costs only its EBS storage and can be started as
any instance type, so one type-agnostic pool serves every request. EC2 tag `State=pooled` marks
members; only `stopped` ones are candidates.

- `requestInstance` order: running idle instance of the type → oldest ready pooled instance
  (`ModifyInstanceAttribute` → `StartInstances` → tag reserved) → cold launch. A
  failed pooled start (capacity, incompatible type) leaves it in the pool and cold-launches. It is
  tagged only once started: nothing but the pool may leave a worker stopped.
  The request emits `InstancePendingProvisioning` itself, as for an idle instance; a pooled start is
  never tagged `Starting=true`, since the started-instance poll would provision it a second time.
- `SizeIdlePool` recycles: surplus idle instances fill the pool (oldest first) instead of being
  terminated. It pools or terminates a surplus instance only under an `instance_claim` (session id
  `pool-cycle`), the election a request runs before reserving, so it never takes an instance a
  request is reserving; that instance's pool slot goes to the next surplus instance. Warm-up launches (`T3aSmall`, user data = `prewarmVolume.sh` + `poweroff`) fill the
  rest. User data runs on the first boot only, so a pooled instance does not power off when started.
- `sweep` terminates pooled instances of another version, pooled instances still running an hour
  after their start (failed warm-up or stop), and stopped instances outside the pool — every other
  query sees only pending/running instances, so those would otherwise bill for their disk forever.
- Recycled instances only carry the blocks their sessions read; warm-ups are fully read.

## Worker AMI version (AWS)
`WORKER_AMI_VERSION` (default `SEPAL_VERSION`) names the build the worker AMI was made from. The worker
finds the AMI by that `Version` tag, tags its instances with it, and runs the `sandbox` and `task`
images of that tag, the ones baked into the AMI, so the provisioner never pulls. A deploy reuses the
AMI while its content hash (`hosting-services/aws/sepal/worker-ami/worker_ami.py`) is unchanged, so
this is often an older build than the one deployed, and can move back when a change is reverted.
Instances of any other version are therefore stale, newer ones included, and are recycled.

## Budget enforcement
`POST /sessions/instance-type/:type` asks the budget module for a LIVE verdict first
(`GET /budget/check/:username`, `src/workerSession/budgetClient.js`) and throws the matching typed
error from `budgetErrors.js` when the user is over budget. `BUDGET_URL` configures the base URL.
The event-fed `lockedUsers` set is only the FALLBACK for when that call fails — it is empty after a
restart, so it must not be the authoritative gate. It remains what closes an over-budget user's
running sessions, via the `budget.UserBudgetExceeded` subscriber in `main.js`.

## Database Schemas
- `worker` — consolidated worker-cluster schema. Holds a COPY of the worker-cluster tables:
  `worker_session`, `task`. The budget tables belong to the budget module's own schema.
  - `session_app` — `(username, app_path)` PK mapping to `session_id` + `label`;
    one live session per app per user. No DB-level FK; rows are cascade-deleted at the application
    layer (`sessionAppRepository.deleteForSession`) when a session transitions to CLOSED.
    Nullable `client_id` is the gateway ws client (browser window) owning the app's tab;
    clientDown dissociates by it, ownerless rows are never swept.
  - `instance_claim` — not a copy of anything: `(instance_id, session_id, claimed_at)`, one row
    per instance currently claimed by a session. EC2 (the hosting service) is authoritative for
    everything else about an instance; this table records only the one fact MySQL needs to know.
  - The originals remain LIVE in `sdms` (Java still uses them directly).
  - Tables copied from `sdms` (Phase 4a-revision): worker_session, task.
  - `scene_meta_data` lives in the `scene_metadata` schema (moved in Phase 3).
  - `rmb_message` / `rmb_message_processing` (reliable message bus) belong to the Groovy
    sepal-server and stay in `sdms` — NOT part of the worker schema.
  - Vestigial access-control tables (users/groups/roles/etc.) remain in `sdms` — NOT copied.

Migrations managed via Postgrator (single `migrations/` dir) with auto-rename of legacy
Flyway `schema_version` → `schema_version_old`.
