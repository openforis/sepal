# GUI ↔ worker interactions

Every interaction between the browser (`modules/gui`) and the `worker` module is mediated by the
`gateway`. The GUI never resolves the worker's host: it talks to `/api/...` on the SEPAL origin,
and the gateway proxies or translates.

There are four distinct channels, and they behave differently:

| # | Channel | Direction | Gateway role |
|---|---------|-----------|--------------|
| 1 | `/api/sessions/*` REST | GUI → worker | transparent proxy (strips `/api`) |
| 2 | `/api/tasks/*` REST | GUI → worker | transparent proxy (strips `/api`) |
| 3 | `/api/sandbox/*` | GUI → gateway → worker | **translating** — the gateway owns the session cache, the heartbeat loop and the app proxy; the GUI never calls the worker's app/session-request endpoints itself |
| 4 | `/api/ws` websocket | worker → GUI (push) and GUI → worker (subscribe/refresh) | multiplexes every browser client onto one uplink per worker ws endpoint, and turns worker RabbitMQ events into client events |

---

## 1. Topology

```
browser (gui)
   │  https
   ▼
 caddy ──► gateway ─────────────► worker  (http://worker/sessions/*, /tasks/*)
             │  ws uplink ──────► worker  (ws://worker/session/ws, ws://worker/task/ws)
             │  amqp subscribe ◄─ worker  (sepal.topic  workerSession.*)
             └─ sandbox proxy ──► the user's sandbox instance
```

Routing is declared in [modules/gateway/config/endpoints.js](modules/gateway/config/endpoints.js):

```js
{prefix: true, path: '/api/tasks',           target: `http://${modules.worker}/tasks`,           authenticate: true}
{prefix: true, path: '/api/sessions/expiry', target: `http://${modules.worker}/sessions/expiry`, authenticate: false, noCache: true}
{prefix: true, path: '/api/sessions',        target: `http://${modules.worker}/sessions`,        authenticate: true}
{prefix: false, path: '/api/worker/metrics', target: `http://${modules.worker}/metrics`,         authenticate: true}
```

and the websocket endpoints:

```js
{module: 'worker/task',    target: `ws://${modules.worker}/task/ws`}
{module: 'worker/session', target: `ws://${modules.worker}/session/ws`}
```

`/api/sandbox/*` has no endpoints entry — it is handled by gateway middleware
([modules/gateway/src/main.js:155-159](modules/gateway/src/main.js#L155-L159)), registered in this
order so the literal routes are matched before the catch-all proxy:

```js
app.use('/api/sandbox/start',       authMiddleware, googleAccessTokenMiddleware, sandboxStartHandler)
app.use('/api/sandbox/interaction', authMiddleware,                              sandboxInteractionHandler)
app.use('/api/sandbox',             authMiddleware, googleAccessTokenMiddleware, sandboxProxy.middleware)
```

Authentication: the gateway authenticates the browser session and injects a `sepal-user` header;
the worker's routers apply `requireAuth` / `requireAdmin` / `requireAdminOrTaskExecutor` on top of
it ([modules/worker/src/workerSession/currentUser.js](modules/worker/src/workerSession/currentUser.js)).
The only unauthenticated worker route the browser can reach is the expiry-email pair, whose HMAC
token carries its own authority.

---

## 2. REST — sessions (`/api/sessions/*` → worker `/sessions/*`)

Worker router: [modules/worker/src/workerSession/routes.js](modules/worker/src/workerSession/routes.js).
GUI clients: [src/api/sessions.js](modules/gui/src/api/sessions.js) and
[src/api/user.js](modules/gui/src/api/user.js).

### Called by the GUI

| Method + path | GUI caller | Request | Response |
|---|---|---|---|
| `GET /api/sessions/report` | `api.user.loadCurrentUserReport$()` — [instancePicker.jsx:37](modules/gui/src/app/home/body/apps/instancePicker.jsx#L37) | — | `{sessions: [session], instanceTypes: [instanceType]}` |
| `GET /api/sessions/:username/usage?days=` | `api.sessions.userUsage$()` — admin user-details form, [userUsage.jsx](modules/gui/src/app/home/body/users/userUsage.jsx) | `days` clamped to 1…365, default 30 | `{overall, byInstanceType…}` aggregate CPU/RAM/GPU/network + hours |
| `POST /api/sessions/session/:sessionId/keep-alive` | `updateCurrentUserSession$()` — the Usage-panel slider, [userSession.jsx:55](modules/gui/src/app/home/user/userSession.jsx#L55) | `{hours}` | `204` |
| `POST /api/sessions/session/:sessionId/extend-now` | `api.sessions.extendNow$()` — the **Extend** button on the expiry notification | — | `200 {extended: true}` / `409 {extended: false}` |
| `POST /api/sessions/session/:sessionId/dismiss-expiry` | `api.sessions.dismissExpiry$()` — clicking the expiry notification away | — | `204` |
| `DELETE /api/sessions/session/:sessionId` | `stopCurrentUserSession$()` — **Stop** in the session list, and **Terminate now** on the expiry notification | — | `204` |

Semantics worth keeping straight, because the four write routes look interchangeable and are not:

- **keep-alive** *replaces* the deadline (`setSessionTimeoutHours`). It is the only GUI signal that
  can also **shorten** a session — it is the slider's absolute position, and `session.timeoutHours`
  in the report is that same cursor.
- **extend-now** *ratchets* the deadline by `manualExtension`, and is **acknowledged** (`409` when
  no ACTIVE session matched) precisely because it is a one-shot with no successor to re-assert it.
- **dismiss-expiry** silences the escalation e-mail and *nothing else* — the session still closes at
  T+grace. A misclick must not destroy an instance.
- **DELETE session** closes it immediately.

### Reachable but not called by the GUI

Registered on the same routers, consumed by other clients — listed so a reader does not mistake
them for GUI traffic:

| Route | Consumer |
|---|---|
| `POST /sessions/instance-type/:instanceType` | gateway `sandboxSessionManager` (on behalf of `/api/sandbox/start`) |
| `POST /sessions/session/:sessionId` (heartbeat) | gateway heartbeat loop, every 30 s |
| `POST /sessions/session/:sessionId/app`, `DELETE /sessions/app` | gateway (app association) |
| `POST /sessions/session/:sessionId/server/:endpoint` | gateway sandbox proxy (on-demand server start) |
| `GET /sessions/active`, `GET /sessions/app-sessions` | gateway cache-miss fallback |
| `POST /sessions/session/:sessionId/opened` | `ssh-gateway` — [endpoint.js:117](modules/ssh-gateway/src/endpoint.js#L117) |
| `GET /sessions/open` | `budget` module boot seed + hourly reconciler |
| `POST /sessions/api-key-authenticate` | gateway `authMiddleware` |
| `GET/POST /sessions/expiry/:token` | the expiry e-mail's link, opened directly in a browser — **not** the SPA, and deliberately unauthenticated |
| `GET /sessions/:username/report`, `GET /sessions/mostRecentlyClosed*`, `DELETE /sessions/:username` | admin/back-office |

---

## 3. REST — tasks (`/api/tasks/*` → worker `/tasks/*`)

Worker router: [modules/worker/src/task/routes.js](modules/worker/src/task/routes.js).
GUI client: [src/api/tasks.js](modules/gui/src/api/tasks.js).

| Method + path | GUI caller | Request | Response |
|---|---|---|---|
| `POST /api/tasks` | `api.tasks.submit$(task)` — every recipe retrieval, via [recipeTaskSubmitter.js:125](modules/gui/src/app/home/body/process/recipe/recipeTaskSubmitter.js#L125) | JSON body `{recipeId, instanceType, operation, params}` | the created task |
| `GET /api/tasks/task/:id/details` | `api.tasks.loadDetails$()` — the task-details panel | — | `{id, recipeId, name, status, statusDescription, creationTime, updateTime, params}` |
| `POST /api/tasks/task/:id/execute` | `api.tasks.restart$()` | — | `204` |
| `POST /api/tasks/task/:id/cancel` | `api.tasks.cancel$()` — the stop button | — | `204` |
| `POST /api/tasks/task/:id/remove` | `api.tasks.remove$()` | — | `204` |
| `POST /api/tasks/remove` | `api.tasks.removeAll$()` — "remove all" | — | `204` |

The GUI never polls `GET /tasks/task/:id` — the *list* arrives over the websocket (§5.2) and only
the details projection is fetched on demand. `POST /tasks/active` and
`POST /tasks/task/:id/state-updated` are the executor's callbacks (`requireAdminOrTaskExecutor`),
not GUI traffic.

A task submission that the worker rejects (over budget, no instance available) is mapped to a `4xx`
by `mapError` rather than surfacing as a `500`.

---

## 4. `/api/sandbox/*` — the translating channel

This is where "GUI ↔ worker" is least literal: the browser calls the **gateway**, which holds a
per-user session cache and calls the worker. The GUI has no route to the worker's
`requestSession` / `associateApp` endpoints.

GUI client: [src/api/apps.js](modules/gui/src/api/apps.js).

### `POST /api/sandbox/start`

```
POST /api/sandbox/start?endpoint=&appPath=&appLabel=&sessionId=|instanceType=&clientId=&reassert=
→ {id, status}   status ∈ {'STARTING', 'STARTED'}
```

Parameters travel in the **query string**, not a body — the gateway mounts no body parser.

- `endpoint` — the sandbox server to reach (defaults to `shiny`).
- `sessionId` *or* `instanceType` — pin to an existing instance, or launch a new one of that type.
- `clientId` — the gateway-assigned websocket client id of this browser
  ([src/api/ws.js](modules/gui/src/api/ws.js) `getClientId()`). The worker stores it as the app
  association's **owner**: a `clientDown` releases that client's apps, and another client taking the
  app over closes the owner's tab.
- `reassert=true` — the GUI replaying an open tab's association after a websocket reconnect. The
  worker refreshes ownership but **does not** move the deadline: the socket dropped, nobody opened
  anything. Only the literal string `'true'` counts.

Gateway → worker for this one call:
`POST /sessions/instance-type/{type}` (or reuse from cache),
then `POST /sessions/session/{id}/app {path, label, clientId}`.

Note the vocabulary mismatch, which the GUI handles explicitly in
[apps.js](modules/gui/src/apps.js): the start response uses the gateway's contract (`STARTED`),
while the session report the launch waits on uses the worker's (`ACTIVE`).

### `DELETE /api/sandbox/start?appPath=&clientId=` → `204`

Unbinds the app from its instance (tab close, or dissociating a conflicting app before a confirmed
takeover). The instance stays up. `clientId` identifies the *requesting* client so the worker's
dissociation event can tell the owner apart and only *other* browsers are told to close their tabs.

### `POST /api/sandbox/interaction?sessionId=&observable=false` → `204`

The GUI's report that a real user interaction happened inside an app iframe, i.e. the signal that
extends a session's deadline. It answers `204` immediately and never makes the browser wait on the
worker: the gateway only sets a marker that its next 30 s heartbeat carries as
`{interaction: true}`.

Sender: [appInstance.jsx](modules/gui/src/app/home/body/apps/appInstance.jsx) listens for
`pointerdown`, `keydown`, `wheel`, `touchstart` inside the iframe document and coalesces to **at
most one report per session per 60 s** — deadlines move in 15-minute steps, so a report per
keystroke would be pure noise.

`observable=false` is the opposite declaration: the app navigated genuinely cross-origin, the GUI
cannot see its input, so the gateway should fall back to counting proxied requests for that session.
It is held with a short TTL and re-asserted every 60 s for as long as it holds. Anything other than
the literal `'false'` leaves the session observable — a malformed report errs toward keeping the
session alive.

### `GET /api/sandbox/**` (the proxy)

The app iframe's own traffic. The gateway resolves the target from its session cache (falling back
to the worker's `GET /sessions/active` / `GET /sessions/app-sessions` on a miss) and can ask the
worker to start an on-demand server with `POST /sessions/session/{id}/server/{endpoint}` before
forwarding.

### The heartbeat the GUI never sends

The gateway beats `POST /sessions/session/{id}` for every cached session every **30 s**
([sandboxSessionManager.js](modules/gateway/src/sandbox/sandboxSessionManager.js)). A bare beat
extends **nothing** — only `{interaction: true}`, set by an interaction report, ratchets the
deadline. Reading a bare beat as liveness is exactly what used to keep forgotten tabs alive forever.

---

## 5. WebSocket (`/api/ws`)

One browser socket carries every module subscription; one gateway uplink per worker ws endpoint
carries every user. Client side: [modules/gui/src/api/ws.js](modules/gui/src/api/ws.js). Worker
side: [modules/worker/src/routes.js](modules/worker/src/routes.js) `createWsRoutes`.

### Frame shapes

**GUI → gateway**

| Message | Meaning |
|---|---|
| `{module, subscriptionId, subscribed: true}` | open a subscription on a module |
| `{module, subscriptionId, unsubscribed: true}` | close it |
| `{module, subscriptionId, data}` | module-specific upstream payload |
| `{hb}` | heartbeat echo |

**gateway → GUI**

| Message | Meaning |
|---|---|
| `{clientId}` | this client's gateway-assigned id, sent right after connect; a reconnect yields a **fresh** one |
| `{modules: {state: [module…]}}` | which modules are up |
| `{modules: {update: {module: ready}}}` | a module came up / went down |
| `{module, subscriptionId, data}` | unicast to one subscription |
| `{module, data}` | multicast to all of this client's subscriptions on that module |
| `{event: {type, data}}` | a server-pushed event (§6) |
| `{hb}` | heartbeat |

**gateway ↔ worker** (the module protocol, per worker ws endpoint)

| Direction | Message |
|---|---|
| → worker | `{event: 'subscriptionUp'\|'subscriptionDown'\|'clientDown'\|'userDown', user, clientId, subscriptionId}` |
| → worker | `{user, clientId, subscriptionId, data}` — forwarded GUI upstream payload |
| ← worker | `{clientId, subscriptionId, data}` — unicast to one subscriber |
| ← worker | `{username, data}` — multicast to every tab of that user |

The GUI subscribes with `moduleWebSocket$(module)`, which yields `{upstream$, downstream$}`;
`downstream$` emits `{ready}` frames and `{data}` frames.

### 5.1 Module `worker/session`

Worker handler: [modules/worker/src/workerSession/ws.js](modules/worker/src/workerSession/ws.js).
GUI consumer: [src/widget/sessionMonitor.jsx](modules/gui/src/widget/sessionMonitor.jsx).

Payload is always `{sessions: [session]}` — the **full** session list, never a delta. That is what
makes reconnect self-healing: the GUI's ws layer reconnects indefinitely and re-subscribes, which
yields a fresh snapshot.

| Trigger | Delivery | Notes |
|---|---|---|
| `subscriptionUp` | unicast to the new subscriber | full snapshot |
| worker-internal `sessionChanged$` | multicast to every tab of that user | debounced 100 ms **per user** (`groupBy(username)`, so one busy user cannot delay another) |
| GUI sends `{refresh: true}` upstream | unicast | fresh snapshot on demand |

`instanceTypes` — the other half of `GET /sessions/report` — is deliberately **not** pushed: it is
static config that changes only on redeployment and was 93 % of the payload. The GUI fetches it from
the REST report when the instance picker opens.

The GUI raises `{refresh: true}` via `refreshSessions()` because `costSinceCreation` and
`timeoutHours` are derived from *elapsed time* and drift with no event to announce it. The Usage
panel ticks it every **10 s** while open, and the usage button fires one on open
([usage.jsx:35,45,184](modules/gui/src/app/home/user/usage.jsx#L35)).

On receipt the monitor dispatches into `user.currentUserReport.sessions` — the *subkey*, not the
whole report, so the budget keys merged in by the BudgetMonitor survive.

Two GUI polling loops were replaced by this push: the 2 s `GET /api/sandbox/start` app-launch wait
and the 10 s `GET /sessions/report` refresh.

`clientDown` has a side effect beyond bookkeeping: the worker dissociates every app that client
owned. That is why a reconnect must re-assert (§4, `reassert=true`).

### 5.2 Module `worker/task`

Worker handler: [modules/worker/src/task/ws.js](modules/worker/src/task/ws.js).
GUI consumer: [src/widget/taskMonitor.jsx](modules/gui/src/widget/taskMonitor.jsx).

Payload mirrors the `user-files` ws shape so the GUI feeds it straight into an sTree:

```js
data: {path: '', items: {[taskId]: taskAsListItem}}
```

Flat for now — every task is a child of the root path `''`. The monitor merges it with
`TaskTree.updateItem` and dispatches `tasks`.

- `subscriptionUp` → the user's full task listing.
- Every task mutation (`taskChanged$`) → debounced 100 ms re-query and push, with
  `distinctUntilChanged` on the serialized listing so an unchanged re-query pushes nothing.
- One listing pipeline **per username**, shared by all that user's tabs: a mutation costs one query
  regardless of tab count. `ReplaySubject(1)` gives a late subscriber the current listing at once;
  `resetOnRefCountZero` tears the pipeline down when the user's last subscription ends, so no stale
  buffer survives an idle period.
- A failed listing query retries forever (1 s → 30 s backoff) rather than going silent until the
  next task event.

Unlike the session ws, this module accepts **no** upstream data messages — only lifecycle events.

---

## 6. Server-pushed events

These do not belong to a module subscription. The worker publishes to the RabbitMQ `sepal.topic`
exchange, the gateway subscribes, converts to an internal `event$` and pushes an
`{event: {type, data}}` frame to the affected client(s). The GUI exposes them as `event$` in
[src/api/ws.js](modules/gui/src/api/ws.js).

| Rabbit topic | Client event | Scope | Data | GUI consumer |
|---|---|---|---|---|
| `workerSession.WorkerSessionClosed` | `workerSessionClosed` | all of the user's clients | `{sessionId}` | [appSessionMonitor.jsx](modules/gui/src/app/home/body/apps/appSessionMonitor.jsx) — closes app tabs bound to that session |
| `workerSession.SessionExpiryNotified` | `sessionExpiryNotified` | all of the user's clients | `{sessionId, apps, terminals, ordinal, name, typeName, extensionMinutes}` | [sessionExpiryMonitor.jsx](modules/gui/src/widget/sessionExpiryMonitor.jsx) — raises the warning notification |
| `workerSession.SessionExpiryClosed` | `sessionExpiryClosed` | all of the user's clients | `{sessionId, apps, terminals, ordinal, name, typeName}` | same — *replaces* the warning with a close notice |
| `workerSession.SessionAppDissociated` | `appSessionDissociated` | **unicast to one clientId** (the previous owner) | `{appPath, sessionId}` | appSessionMonitor — closes that tab and explains why |

`apps` / `terminals` / `ordinal` / `name` / `typeName` ride along so the browser can name the
instance the way the SSH menu and the expiry e-mail do, and say what is running on it, without a
round trip. `extensionMinutes` is what the **Extend** button actually buys, so the button can be
labelled with the duration the worker grants rather than a guess.

`appSessionDissociated` is unicast because a self-initiated dissociation must not close the
requester's own tab — the subscriber filters `owner === requester`.

---

## 7. Payload reference

### `session` — `GET /sessions/report` and the session ws

```js
{
    id,
    name,             // derived from the id (instanceName.js) — the GUI, the notification,
                      // the expiry mail and the SSH menu all name the machine identically
    path,
    username,
    status,           // 'PENDING' | 'ACTIVE' | …
    host,
    timeoutHours,     // hours left on the stored deadline; the keep-alive slider's cursor
    instanceType: {id, name, hourlyCost, …},
    creationTime,     // ISO 8601, UTC
    costSinceCreation,// hourlyCost × hours since creation
    apps: [],
    terminals: 0,
    verdict,          // busy verdict: 'busy' | 'idle' | 'unknown'
    usage: {cpuPct, ramPct, gpuPct, netBytesPerS, sampleTime} | null,
    expiry: {
        state,        // notification state, 'NONE' when untouched
        timeoutTime,  // ISO or null
        notifiedTime, // ISO or null
        closeTime     // ISO, or null in notify mode — a countdown to a close that
                      // will not happen is a lie the GUI would render faithfully
    }
}
```

`netBytesPerS` is rx + tx, the same sum the busy verdict thresholds — the number the GUI shows is
the number that decides whether the session counts as used.

### `POST /api/sandbox/start` response

```js
{id, status}   // status: 'STARTING' | 'STARTED'   (gateway vocabulary)
```

### `taskAsListItem` — the ws listing

```js
{id, recipeId, name, status, statusDescription, creationTime, updateTime, description, taskInfo}
```

`status` is the worker's `task.state`: `PENDING | ACTIVE | COMPLETED | FAILED | CANCELING | CANCELED`.

### `taskAsDetails` — `GET /tasks/task/:id/details`

Same as the list item, minus `description`/`taskInfo`, plus the full `params` object.

All timestamps are ISO 8601 UTC strings; the worker serializes with `toISOString()` explicitly
because the mysql2 pool has no timezone option.

---

## 8. Cadence

| Signal | Interval | Emitter |
|---|---|---|
| Sandbox session heartbeat | 30 s | gateway → worker (not the GUI) |
| App interaction report | ≤ 1 per session per 60 s | GUI → gateway |
| Unobservable re-assertion | 60 s while it holds | GUI → gateway |
| Usage-panel session refresh | 10 s while the panel is open | GUI → worker (ws `{refresh: true}`) |
| Session push debounce | 100 ms, per user | worker |
| Task listing debounce | 100 ms, per user | worker |
| Task listing retry backoff | 1 s → 30 s, unlimited | worker |

---

## 9. End-to-end sequences

### Launching an app

1. GUI `POST /api/sandbox/start?endpoint&appPath&appLabel&instanceType&clientId`.
2. Gateway asks the worker `POST /sessions/instance-type/{type}` (or reuses a cached session), then
   `POST /sessions/session/{id}/app {path, label, clientId}`.
3. Gateway answers `{id, status}`. If `STARTED`, done.
4. If `STARTING`, the GUI **waits on the store**, not on a poll: `waitForSession$` subscribes to
   `user.currentUserReport.sessions` and completes when that session reports `ACTIVE`. The report is
   kept fresh by the session ws.
5. A session that appeared in a report and then vanished means the launch failed — that surfaces as
   an error. The seen-then-gone guard matters: a session is absent from the report until the first
   push arrives, and treating that initial absence as a closure would fail every launch instantly.
6. The iframe's traffic then flows through `GET /api/sandbox/**`; interactions inside it are
   reported to `/api/sandbox/interaction`.

### Idle expiry

1. Worker decides a session is idle, publishes `workerSession.SessionExpiryNotified`.
2. Gateway pushes `sessionExpiryNotified` to every client of that user.
3. GUI raises a warning notification with two buttons and no auto-dismiss (the grace period is an
   hour, and this is worth a decision). Three outcomes:
   - **Extend** → `POST /api/sessions/session/:id/extend-now`, ratchets by `extensionMinutes`.
   - **Terminate now** → `DELETE /api/sessions/session/:id`, optimistic — the warning goes as soon
     as the request is away.
   - **Clicking the notification itself** → `POST /api/sessions/session/:id/dismiss-expiry`:
     "I saw it, don't email me", nothing more.
4. The common rescue is none of these: any real use of the instance — a keystroke in an app, a
   terminal, a notebook — resets the cycle silently. The next session push shows the deadline moved,
   and the GUI withdraws the warning on its own (`staleWarnings`).
5. If it does expire, `workerSession.SessionExpiryClosed` → `sessionExpiryClosed` replaces the
   warning with a close notice, because the warning's buttons can now only fail.

### Websocket reconnect

1. Socket drops. The worker sees `clientDown` for the old `clientId` and **dissociates every app
   that client owned**.
2. The GUI reconnects, re-subscribes both worker modules, and receives full snapshots.
3. A **new** `clientId` arrives. `createSessionReassert` replays every open app tab as
   `POST /api/sandbox/start?…&reassert=true`, pinned to the tab's `sessionId`, which refreshes
   ownership onto the new clientId (disarming a not-yet-swept old one) **without** ratcheting any
   deadline — the socket dropped, nobody opened anything.

### Running a task

1. A recipe retrieval calls `POST /api/tasks` with `{recipeId, instanceType, operation, params}`.
2. The worker creates the task, emits `taskChanged$`; the task ws pushes the updated listing to
   every tab of that user within ~100 ms.
3. The executor reports progress via `POST /tasks/task/:id/state-updated` (its own auth), each
   report producing another debounced push.
4. The GUI's task list is entirely push-driven; only the details panel fetches
   `GET /api/tasks/task/:id/details`.
5. Stop / restart / remove are `204` calls whose visible effect arrives on the next push, not in the
   response.

---

## 10. What the GUI does *not* do

- It never addresses the worker directly — only `/api/...` on the SEPAL origin.
- It never polls the session report or the task list; both are push-driven. The only remaining timer
  against the worker is the Usage panel's 10 s `{refresh: true}`, and that exists solely because
  two report fields are derived from elapsed time.
- It never sends session heartbeats — the gateway does, and a bare heartbeat extends nothing.
- It never calls the worker's `requestSession` / `associateApp` / `server` endpoints; those are the
  gateway's translation of `/api/sandbox/*`.
