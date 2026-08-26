# CLAUDE.md - modules/worker

SEPAL worker service (Node.js). Will replace the Java `sepal-server` `hostingservice`,
`workersession`, `task`, and `budget` components. Owns the single `worker` MySQL schema via
Postgrator (Phase 4a-revision). Phase 4a scaffolds the module with healthcheck only.
Sub-phases 4b–4f will add worker instance provisioning, session management, task execution,
budget tracking, and gateway route migration.

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

## Budget enforcement
`POST /sessions/instance-type/:type` asks the budget module for a LIVE verdict first
(`GET /budget/check/:username`, `src/workerSession/budgetClient.js`) and throws the matching typed
error from `budgetErrors.js` when the user is over budget. `BUDGET_URL` configures the base URL.
The event-fed `lockedUsers` set is only the FALLBACK for when that call fails — it is empty after a
restart, so it must not be the authoritative gate. It remains what closes an over-budget user's
running sessions, via the `budget.UserBudgetExceeded` subscriber in `main.js`.

## Database Schemas
- `worker` — consolidated worker-cluster schema. Holds a COPY of the worker-cluster tables:
  `worker_session`, `task`, `instance`. The budget tables belong to the budget module's own schema.
  - `session_app` (migration 002) — `(username, app_path)` PK mapping to `session_id` + `label`;
    one live session per app per user. No DB-level FK; rows are cascade-deleted at the application
    layer (`sessionAppRepository.deleteForSession`) when a session transitions to CLOSED.
    Migration 004 adds nullable `client_id` — the gateway ws client (browser window) owning the
    app's tab; clientDown dissociates by it, ownerless rows are never swept.
  - The originals remain LIVE in `sdms` / `worker_instance` (Java still uses them directly).
  - Tables copied from `sdms` (Phase 4a-revision): worker_session, task.
  - Table copied from `worker_instance` (Phase 4a-revision): instance.
  - `scene_meta_data` lives in the `scene_metadata` schema (moved in Phase 3).
  - `rmb_message` / `rmb_message_processing` (reliable message bus) belong to the Groovy
    sepal-server and stay in `sdms` — NOT part of the worker schema.
  - Vestigial access-control tables (users/groups/roles/etc.) remain in `sdms` — NOT copied.

Migrations managed via Postgrator (single `migrations/` dir) with auto-rename of legacy
Flyway `schema_version` → `schema_version_old`.
