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

- **CommonJS**: Uses `require()`, not ESM.
- **`#config/*` import map**: Config JSON files accessed via `require('#config/log.json')`.
- **Security headers**: Proxy sets CSP, HSTS, X-Content-Type-Options, Referrer-Policy on all responses.
- **User header injection**: Downstream services receive authenticated user as JSON in `sepal-user` request header. The gateway strips any client-injected values first.
- **`sepal-user-updated` response header**: When a downstream service sets this header, the gateway triggers a user refresh from the user module.
- **Tag utilities** (`src/tag.js`): Formatted log tags like `Client<username:ab12>`, `Subscription<user:id:sub>`.
- **Only test file**: `src/rewrite.test.js` tests HTTP Location header rewriting for proxied redirects.
