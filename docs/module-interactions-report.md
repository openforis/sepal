# SEPAL module interaction report

Generated from the current repository on 2026-07-07. This report covers interactions between SEPAL modules through internal HTTP, RabbitMQ, and WebSockets. External calls to Google, CEO, package registries, SMTP, AWS, and host Docker APIs are only mentioned when they explain a module boundary.

## Communication primitives

- Internal HTTP uses Docker service names from `modules/gateway/config/modules.json`; most modules expose port 80 on the `sepal` Docker network.
- Gateway HTTP proxying is centralized in `modules/gateway/config/endpoints.js` and implemented by `modules/gateway/src/proxy.js`.
- Asynchronous messaging uses one RabbitMQ topic exchange, `sepal.topic`, through `lib/js/shared/src/messageQueue.js`.
- Module WebSocket routing uses the browser-facing gateway endpoint `/api/ws`; gateway maintains upstream WebSocket clients to selected modules.
- Several proxied application surfaces also tunnel raw WebSocket upgrades, notably terminal, sandbox tools, and user-launched apps.

## Internal HTTP

### Gateway public API proxy map

The gateway is the main HTTP ingress. It maps public `/api/...` routes to internal module URLs:

| Public path | Internal target | Auth | Notes |
|---|---:|---:|---|
| `/api/gee` | `http://gee` | yes | Earth Engine processing API |
| `/api/ceo-gateway` | `http://ceo-gateway` | yes | CEO integration gateway |
| `/api/terminal` | `http://terminal` | yes | HTTP and WebSocket terminal traffic |
| `/api/user/password/reset-request` | `http://user/password/reset-request` | no | Public account recovery |
| `/api/user/password/reset` | `http://user/password/reset` | no | Public account recovery |
| `/api/user/activate` | `http://user/activate` | no | Public account activation |
| `/api/user/validate` | `http://user/validate` | no | Public validation |
| `/api/user/signup` | `http://user/signup` | no | Public signup |
| `/api/user/google/access-request-callback` | `http://user/google/access-request-callback` | no | OAuth callback |
| `/api/user` | `http://user` | yes | User API, except gateway blocks `/api/user/auth` and `/api/user/nss` from public access |
| `/api/processing-recipes` | `http://recipe` | yes | Recipe API |
| `/api/budget` | `http://budget/budget` | yes | Budget API |
| `/api/notification` | `http://notification` | yes | Notification API |
| `/api/user-files` | `http://user-files` | yes | User file API |
| `/api/user-storage` | `http://user-storage` | yes | Storage API |
| `/api/tasks` | `http://worker/tasks` | yes | Worker task API |
| `/api/sessions` | `http://worker/sessions` | yes | Worker session API |
| `/api/scene-metadata` | `http://scene-metadata` | yes | Scene metadata API |
| `/api/apps/list` | `http://app-manager/list` | no explicit auth in endpoint definition | App list |
| `/api/apps` | `http://app-manager` | yes | App management API |
| `/api/app-manager` | `http://app-manager` | yes | App manager API |
| `/api/app-launcher` | `http://app-launcher` or `http://${SEPAL_APPS_HOST}` | yes | App launcher and app proxy API |
| `/api/email` | `http://email` | yes | Email service API |
| `/api/sys-monitor` | `http://sys-monitor` | yes | System monitor API |
| `/api/docker/metrics` | `http://host.docker.internal:9323/metrics` | yes | Host Docker metrics, not a SEPAL module |
| `/privacy-policy` | `http://gui/resource/privacy-policy.html` | no | Static GUI resource |

Source: `modules/gateway/config/endpoints.js`.

### Direct module-to-module HTTP calls

These bypass the public gateway proxy and create direct runtime dependencies:

| Caller | Callee | Endpoint | Purpose | Source |
|---|---|---|---|---|
| `gateway` | `user` | `GET /current` | Load current user into the gateway user store | `modules/gateway/src/userApi.js` |
| `gateway` | `user` | `POST /google/refresh-access-token` | Refresh Google access tokens | `modules/gateway/src/userApi.js` |
| `gateway` | `user` | `POST /google/revoke-access` | Revoke Google access | `modules/gateway/src/userApi.js` |
| `gateway` | `user` | `POST /authenticate` | Session username/password authentication | `modules/gateway/src/authMiddleware.js` |
| `gateway` | `worker` | `POST /sessions/api-key-authenticate` | API-key authentication for sandbox/session calls | `modules/gateway/src/authMiddleware.js` |
| `gateway` | `user` | `GET /info` | User lookup during request authentication | `modules/gateway/src/authMiddleware.js` |
| `gateway` | `worker` | session start/status/heartbeat paths under `/sessions` | Resolve and keep alive dynamic sandbox sessions | `modules/gateway/src/sandbox/sandboxSessionManager.js`, `modules/gateway/src/main.js` |
| `budget` | `worker` | `GET /sessions/open` | Reconcile active worker sessions for spending | `modules/budget/src/workerClient.js` |
| `budget` | `user` | user list/details through `USER_URL` | Seed or reconcile budget state from users | `modules/budget/src/userClient.js` |
| `worker` | `budget` | `GET /budget/spending/:username` | Include budget spending in worker session reports | `modules/worker/src/budgetClient.js` |
| `worker` | `user` | configured Google OAuth endpoint, default `http://user/google/` | Refresh worker-session Google tokens | `modules/worker/src/workerSession/googleOAuthGateway.js`, `modules/worker/docker-compose.yml` |
| `worker` | sandbox task executor | `http://{session.host}:{workerPort}/api/tasks` | Execute or cancel tasks inside a worker/sandbox instance | `modules/worker/src/task/workerGateway.js` |
| `ssh-gateway` | `user` | `GET /nss/snapshot` | Sync NSS/user data for SSH login | `modules/ssh-gateway/src/nssSync.js` |
| `ssh-gateway` scripts | `user` | auth and authorized-key helper URLs | PAM and SSH key lookup | `modules/ssh-gateway/script/sepal-pam-auth`, `modules/ssh-gateway/script/sepal-authorized-keys` |
| `app-launcher` | `gateway` | `https://${SEPAL_HOST}/api/apps/list` | Fetch app metadata through the public app-manager route using admin credentials | `modules/app-launcher/src/apiService.js` |
| `app-manager` | configured catalog URL | catalog URL | Fetch app catalog data; not necessarily a SEPAL module | `modules/app-manager/src/apiService.js` |
| `email` | `gateway` | `/api/user/email-notifications-enabled/:email`, `/api/user/info` | Resolve recipients and notification preferences through the gateway/user API | `modules/email/src/http.js`, `modules/email/src/config.js` |
| `user-storage` | `gateway` | `/api/user/mostRecentLoginByUser`, `/api/user/mostRecentLogin`, `/api/sessions/mostRecentlyClosedByUser`, `/api/sessions/mostRecentlyClosed`, `/api/user/info` | Determine last activity and user details through gateway routes to user and worker | `modules/user-storage/src/http.js`, `modules/user-storage/src/config.js` |

Shared libraries also make HTTP calls when running inside modules:

- `lib/js/ee/src/recipe.js` calls `${context().sepalEndpoint}/api/processing-recipes/:id`; depending on context this goes through the gateway-facing SEPAL endpoint.
- `task` and `gee` call Google APIs directly for Earth Engine, Drive, and Cloud Resource Manager; these are external dependencies, not SEPAL module interactions.
- `ceo-gateway` calls external CEO endpoints through `CEO_URL`.

## RabbitMQ

All RabbitMQ traffic uses topic exchange `sepal.topic`. Publishers are `{key, publish$}` streams and subscribers are `{queue, topic, handler}` bindings.

### Topic matrix

| Routing key / topic | Publisher | Subscribers | Purpose |
|---|---|---|---|
| `user.UserUpdated` | `user` | `ssh-gateway` (`ssh-gateway.userUpdated`), any `user.*` subscribers | User profile/token/status changes; triggers NSS refresh and gateway/user websocket updates |
| `user.UserLocked` | `user` | `gateway` (`gateway.userLocked`), `worker` (`workersession.user` via `user.*`) | Invalidate sessions and close worker sessions for locked users |
| `email.sendToAddress` | `user` | `email` (`email.sendToAddress`) | Send account invitations, password reset mail, and other direct-address mail |
| `email.sendToUser` | `user-storage` | `email` (`email.sendToUser`) | Send user-targeted storage/inactivity notifications |
| `user.emailNotificationsEnabled` | legacy/none currently identified | `email` (`email.emailNotificationsEnabled`) | Email service preference updates |
| `workerSession.WorkerSessionActivated` | `worker` | `budget` (`budget.workerSessionActivated`), `user-storage` (`userStorage.workerSession` via `workerSession.#`) | Record open session use and trigger storage/user activity handling |
| `workerSession.WorkerSessionClosed` | `worker` | `budget` (`budget.workerSessionClosed`), `user-storage` (`userStorage.workerSession`), `gateway` sandbox cache subscriber | Close spending rows, update storage/activity state, clear gateway sandbox session cache |
| `workerInstance.InstanceLaunched` | `worker` | none identified | Worker instance lifecycle telemetry |
| `workerInstance.InstancePendingProvisioning` | `worker` | none identified | Worker instance lifecycle telemetry |
| `workerInstance.InstanceProvisioned` | `worker` | none identified | Worker instance lifecycle telemetry |
| `workerInstance.InstanceReleased` | `worker` | none identified | Worker instance lifecycle telemetry |
| `workerInstance.FailedToProvisionInstance` | `worker` | none identified | Worker instance lifecycle telemetry |
| `workerInstance.FailedToReleaseInstance` | `worker` | none identified | Worker instance lifecycle telemetry |
| `workerInstance.FailedToRequestInstance` | `worker` | none identified | Worker instance lifecycle telemetry |
| `budget.UserBudgetExceeded` | `budget` | `worker` (`worker.budgetExceeded`) | Lock users out of new worker sessions and close existing sessions |
| `budget.UserBudgetCleared` | `budget` | `worker` (`worker.budgetCleared`) | Clear worker-side budget lock |
| `userStorage.size` | `user-storage` | `budget` (`budget.userStorage`) | Update storage spending/use |
| `files.#`, specifically `files.FilesDeleted` | no current publisher identified | `user-storage` (`userStorage.files`) | Legacy file deletion event that triggers user storage re-scan |
| `systemEvent` | `gateway` | `user-storage` (`userStorage.systemEvent`) | Client/user/module activity events for inactivity checks |

More detail is already maintained in `RABBITMQ.md`; this report intentionally summarizes it from a module-interaction perspective.

### Messaging by module

| Module | Publishes | Subscribes |
|---|---|---|
| `user` | `user.UserUpdated`, `user.UserLocked`, `email.sendToAddress` | none identified |
| `gateway` | `systemEvent` | `user.UserLocked`, `workerSession.WorkerSessionClosed` |
| `worker` | `workerSession.*`, `workerInstance.*` | `user.*`, `budget.UserBudgetExceeded`, `budget.UserBudgetCleared` |
| `budget` | `budget.UserBudgetExceeded`, `budget.UserBudgetCleared` | `workerSession.WorkerSessionActivated`, `workerSession.WorkerSessionClosed`, `userStorage.size` |
| `user-storage` | `userStorage.size`, `email.sendToUser` | `systemEvent`, `workerSession.#`, `files.#` |
| `email` | none identified | `email.sendToAddress`, `email.sendToUser`, `user.emailNotificationsEnabled` |
| `ssh-gateway` | none identified | `user.UserUpdated` |

## WebSockets

### Gateway module WebSocket bus

The GUI opens one browser WebSocket to gateway:

- Browser/GUI endpoint: `/api/ws`.
- Gateway upstream module endpoints:
  - `user-files` at `ws://user-files/ws`
  - `user-assets` at `ws://user-assets/ws`
  - `user` at `ws://user/ws`

The browser-side API `modules/gui/src/api/ws.js` multiplexes module subscriptions over `/api/ws` using `{module, subscriptionId, data}` messages. Gateway connects upstream to each module in `modules/gateway/src/websocket-uplink.js`, tracks browser clients in `websocket-downlink.js`, and routes lifecycle events in `websocket-events.js`.

Main message classes on this bus:

- Heartbeats: `{hb}` between browser, gateway, and upstream modules.
- Module readiness: `{modules: {state/update}}`.
- Subscription lifecycle: `subscriptionUp` / `subscriptionDown` events sent from gateway to modules.
- User lifecycle: `userUp`, `userDown`, `userUpdated`.
- Client lifecycle: `clientUp`, `clientDown`, `clientVersionMismatch`.
- Google token lifecycle: `googleAccessTokenAdded`, `googleAccessTokenUpdated`, `googleAccessTokenRemoved`.
- Module payloads: `{module, subscriptionId, data}` between GUI subscribers and module websocket handlers.

Module websocket roles:

| Module | WebSocket endpoint | Gateway module name | Purpose |
|---|---|---|---|
| `user-files` | `/ws` | `user-files` | Real-time file browser/file monitoring |
| `user-assets` | `/ws` | `user-assets` | Real-time asset browser/asset operations |
| `user` | `/ws` | `user` | Push user updates into gateway websocket event flow |

### Proxied WebSocket upgrades

Not all WebSockets use `/api/ws`; gateway also tunnels raw upgrades for services that expose their own WebSocket protocols:

| Public path | Internal target | Purpose | Source |
|---|---|---|---|
| `/api/terminal/:sessionId` | `terminal` | Browser terminal to PTY bridge | `modules/terminal/src/terminal.js`, `modules/gui/src/app/home/body/terminal/terminal.jsx`, `modules/gateway/config/endpoints.js` |
| `/api/sandbox/**` | dynamic sandbox host resolved through `worker` sessions | RStudio, Jupyter kernel channels, Shiny, and other sandbox WebSockets | `modules/gateway/src/sandbox/sandboxProxy.js`, `modules/gateway/src/main.js` |
| `/api/app-launcher/**` | `app-launcher` or external apps host | User app WebSocket proxying | `modules/app-launcher/src/proxy.js`, `modules/gateway/config/endpoints.js` |
| Other gateway proxied paths | configured target when the matched proxy supports `upgrade` | Generic proxy WebSocket upgrade support | `modules/gateway/src/main.js`, `modules/gateway/src/proxy.js` |

## High-level dependency graph

```text
browser/gui
  -> gateway HTTP proxy
     -> gee, ceo-gateway, terminal, user, recipe, budget, notification,
        user-files, user-storage, worker, scene-metadata, app-manager,
        app-launcher, email, sys-monitor, gui static resources
  -> gateway /api/ws
     <-> user-files /ws
     <-> user-assets /ws
     <-> user /ws
  -> gateway proxied raw WebSockets
     <-> terminal
     <-> dynamic sandbox sessions resolved through worker
     <-> app-launcher/user apps

gateway
  -> user HTTP auth/current/token APIs
  -> worker HTTP session APIs for sandbox routing
  -> RabbitMQ: publishes systemEvent; consumes user.UserLocked and workerSession.WorkerSessionClosed

user
  -> RabbitMQ: user.UserUpdated, user.UserLocked, email.sendToAddress
  -> user /ws -> gateway websocket event stream

worker
  -> budget HTTP spending reads
  -> user HTTP Google OAuth refresh
  -> sandbox task executor HTTP
  -> RabbitMQ: workerSession.*, workerInstance.*
  <- RabbitMQ: user.*, budget.UserBudgetExceeded, budget.UserBudgetCleared

budget
  -> worker HTTP /sessions/open
  -> user HTTP user data
  -> RabbitMQ: budget.UserBudgetExceeded, budget.UserBudgetCleared
  <- RabbitMQ: workerSession.*, userStorage.size

user-storage
  -> RabbitMQ: userStorage.size, email.sendToUser
  <- RabbitMQ: systemEvent, workerSession.#, files.#

email
  <- RabbitMQ: email.sendToAddress, email.sendToUser, user.emailNotificationsEnabled

ssh-gateway
  -> user HTTP /nss/snapshot and auth/key helpers
  <- RabbitMQ: user.UserUpdated
```

## Source files used

- `modules/gateway/config/modules.json`
- `modules/gateway/config/endpoints.js`
- `modules/gateway/src/main.js`
- `modules/gateway/src/userApi.js`
- `modules/gateway/src/authMiddleware.js`
- `modules/gateway/src/websocket-uplink.js`
- `modules/gateway/src/websocket-downlink.js`
- `modules/gateway/src/websocket-events.js`
- `modules/gateway/src/sandbox/sandboxProxy.js`
- `modules/gateway/src/sandbox/workerSessionClosedSubscriber.js`
- `modules/gui/src/api/ws.js`
- `modules/user/src/main.js`
- `modules/user/src/events.js`
- `modules/user/src/ws.js`
- `modules/worker/src/main.js`
- `modules/worker/src/budgetClient.js`
- `modules/worker/src/workerSession/events.js`
- `modules/worker/src/workerInstance/events.js`
- `modules/budget/src/main.js`
- `modules/budget/src/index.js`
- `modules/budget/src/events.js`
- `modules/budget/src/workerClient.js`
- `modules/budget/src/userClient.js`
- `modules/user-storage/src/main.js`
- `modules/user-storage/src/messageHandler.js`
- `modules/email/src/main.js`
- `modules/email/src/messageHandler.js`
- `modules/ssh-gateway/src/nssSync.js`
- `modules/app-launcher/src/proxy.js`
- `modules/terminal/src/terminal.js`
- `RABBITMQ.md`
