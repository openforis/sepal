# CLAUDE.md - modules/gateway

HTTP gateway/reverse proxy. Entry point for all API traffic. Uses **Express** (not Koa like other modules).

## Commands

```bash
npm test              # Jest
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Initializes Redis, Express app, WebSocket server, and RabbitMQ connection.

### Middleware Chain
Session (Redis-backed) -> User injection -> Auth -> Google token refresh -> Proxy

### Proxy Configuration
- `config/endpoints.js`: Defines all 25+ HTTP proxy routes and 2 WebSocket routes with auth requirements, timeouts, and caching
- `config/modules.json`: Maps module names to Docker hostnames (e.g., `"gee": "gee"`, `"sepal": "sepal"`)
- `src/proxy.js`: Creates `http-proxy-middleware` instances per endpoint. Sets `sepal-user` header with user JSON for downstream services.

### WebSocket Architecture (6 files)
Three-layer WebSocket system:
1. **Uplink** (`websocket-uplink.js`): Gateway connects TO each module. Heartbeat every 1s. Auto-reconnects.
2. **Downlink** (`websocket-downlink.js`): Browser clients connect TO gateway. Heartbeat every 10s. Tracks USER_UP/DOWN events.
3. **Events** (`websocket-events.js`): Routes events between clients and modules (MODULE_UP/DOWN, USER_UP/DOWN, SUBSCRIPTION_UP/DOWN, GOOGLE_ACCESS_TOKEN_*).

Client registry in `websocket-client.js` (in-memory, keyed by clientId). Server registry in `websocket-server.js` (keyed by module name).

### Sandbox App Routing
- `sandboxSessionManager.resolveTarget` attributes a proxied sandbox request to a host in this
  order: kernel-id probe (Jupyter `/api/kernels/:id/` paths, probes candidate hosts) → app-path
  prefix match → `Referer` header prefix match → single-candidate fallback → legacy
  per-endpoint lookup (`GET /sessions/active`).
- `POST /api/sandbox/start` (`sandboxStartRoute.js`) takes query params `endpoint`, `appPath`,
  `appLabel`, `sessionId`, `instanceType` and returns `{id, status, reused?}`; `reused: true` means
  an explicit `sessionId`/`instanceType` pick was overridden by a winning live association or a
  concurrent-start race. Omitting `appPath` keeps the legacy reuse-any-session behavior.
- `DELETE /api/sandbox/start?appPath=…&clientId=…` → 204: releases the app ↔ session binding
  (GUI tab close, or a takeover before re-opening the app elsewhere) via worker
  `DELETE /sessions/app` and drops the cached app entry; the session stays open, so the app
  can be re-opened on a different instance.
- **App ↔ client ownership (worker-owned)**: the downlink sends each browser its
  gateway-minted `clientId` right after ws connect; the GUI tags `POST`/`DELETE
  /api/sandbox/start` with it and the worker stores it on the association
  (`session_app.client_id`). On clientDown the WORKER dissociates that client's apps (the
  gateway only broadcasts the event). `startApp` hitting an existing association still calls
  the worker associate to refresh ownership (reconnect re-assert). The
  `gateway.sessionAppDissociated` subscriber drops the cached app entry on every
  dissociation and, when the owner ≠ requester (takeover), unicasts `appSessionDissociated
  {appPath, sessionId}` to the owner client, whose GUI closes the app's tab. The reconnect
  re-assert sends `reassert=true`, which the gateway forwards in the associate body: the worker
  refreshes ownership but moves NO deadline, since the socket dropping is not a user opening an
  app. Only the literal `'true'` counts, so a garbled report reads as a real open.
- **Interaction reporting** (`sandboxInteractionRoute.js`, `POST /api/sandbox/interaction?sessionId=&observable=`):
  the GUI reports real input events observed inside an app iframe; the gateway sets the marker its
  existing 30 s heartbeat loop already carries, and the beat sends `{interaction: true}`. A
  PROXIED REQUEST IS NOT AN INTERACTION — JupyterLab and RStudio poll continuously, and counting
  those is what made an open tab immortal (`sandboxSessionManager.test.js` pins this). The one
  exception is a session the GUI declared `observable=false` (a genuinely cross-origin app), for
  which proxied requests are counted as before; the declaration has a short TTL and the default
  with no report is observable.
- Forwards `workerSession.WorkerSessionClosed` to the user's browsers as
  `{event: {type: 'workerSessionClosed', data: {sessionId}}}` (username only selects the
  recipient clients), used by the GUI to close app tabs pinned to that session; the internal
  event (with username) is also republished on the bus as `systemEvent` (see `RABBITMQ.md`).

### Session Management
- Cookie: `SEPAL-SESSIONID`
- Redis store via `connect-redis`
- Session secret persisted in Redis (survives restarts)
- `src/session.js`: Logout destroys session, invalidate-other-sessions destroys all but current

### Authentication
- `src/authMiddleware.js`: Checks `sepal-user` header, falls back to HTTP Basic Auth via POST to `http://user/authenticate`
- `src/googleAccessToken.js`: Background token refresh monitor. Refreshes 10 min before expiry with exponential backoff retry.

### RabbitMQ
- Publishes: system events (USER_UP, USER_DOWN) via RxJS Subject
- Subscribes: `user.UserLocked` topic -> destroys all user sessions

## Non-Obvious Conventions

- **ESM**: Uses `import`/`export` (`"type": "module"`). JSON imports use import attributes (`import x from './foo.json' with {type: 'json'}`), and relative imports include the `.js` extension. A few CJS deps need workarounds: `prometheus-api-metrics` is loaded via `createRequire` (it reads `module.parent`, which is undefined under the ESM loader), and `micromatch`/`#sepal/rxjs` are default-imported then destructured (their named exports aren't statically detectable).
- **`#config/*` import map**: Config JSON files accessed via `import logConfig from '#config/log.json' with {type: 'json'}`.
- **Security headers**: Proxy sets CSP, HSTS, X-Content-Type-Options, Referrer-Policy on all responses.
- **User header injection**: Downstream services receive authenticated user as JSON in `sepal-user` request header. The gateway strips any client-injected values first.
- **`sepal-user-updated` response header**: When a downstream service sets this header, the gateway triggers a user refresh from the user module.
- **Tag utilities** (`src/tag.js`): Formatted log tags like `Client<username:ab12>`, `Subscription<user:id:sub>`.
- **Only test file**: `src/rewrite.test.js` tests HTTP Location header rewriting for proxied redirects.
