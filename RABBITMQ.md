# RabbitMQ — the `sepal.topic` exchange

All asynchronous inter-service messaging goes through a single topic exchange, `sepal.topic`.
Messages are JSON objects, published with `persistent: true`. Consumers bind a **durable queue**
(named `<consumer-module>.<purpose>`) to a routing-key pattern; a handler that resolves acks the
message, a handler that throws nacks it (the message is redelivered).

Node modules wire both sides with `initMessageQueue(amqpUri, {publishers, subscribers, handler})`
from [lib/js/shared/src/messageQueue.js](lib/js/shared/src/messageQueue.js):
publishers are `{key, publish$}` (an RxJS stream per routing key), subscribers are
`{queue, topic, handler}`.

## Quick reference

| Routing key | Published by | Consumed by |
|---|---|---|
| `user.UserUpdated` | user | ssh-gateway |
| `user.UserLocked` | user | gateway, worker |
| `user.emailNotificationsEnabled` | *(none — legacy)* | email |
| `workerSession.WorkerSessionRequested` | worker | budget, user-storage, ssh-gateway |
| `workerSession.WorkerSessionActivated` | worker | budget, user-storage, ssh-gateway |
| `workerSession.WorkerSessionClosed` | worker | budget, user-storage, gateway, ssh-gateway |
| `workerSession.SessionAppAssociated` | worker | ssh-gateway |
| `workerSession.SessionAppDissociated` | worker | ssh-gateway, gateway |
| `workerSession.SessionExpiryNotified` | worker | gateway |
| `workerSession.SessionExpiryClosed` | worker | gateway |
| `workerInstance.*` (7 events) | worker | *(none — telemetry/parity)* |
| `budget.UserBudgetExceeded` | budget | worker |
| `budget.UserBudgetCleared` | budget | worker |
| `userStorage.size` | user-storage | budget |
| `email.sendToAddress` | user | email |
| `email.sendToUser` | user-storage, worker | email |
| `files.FilesDeleted` | *(none — legacy)* | user-storage |
| `systemEvent` | gateway | user-storage |

---

## `user.*` — user lifecycle

Published by **user** ([src/events.js](modules/user/src/events.js)). Both events carry
the full user map:

```
{id, name, username, email, organization, intendedUse,
 googleTokens: {accessToken, accessTokenExpiryDate, refreshToken, projectId} | null,
 emailNotificationsEnabled, manualMapRenderingEnabled, privacyPolicyAccepted,
 status, roles, systemUser, creationTime, updateTime}
```

### `user.UserUpdated`
- **pub:** user — on any user mutation: details updated, account activated, password set,
  Google tokens added/refreshed/revoked ([userApi.js](modules/user/src/userApi.js),
  [googleService.js](modules/user/src/googleService.js))
- **sub:** ssh-gateway (queue `ssh-gateway.userUpdated`) — re-fetches the NSS passwd/group snapshot
  from the user module so sandbox POSIX identities stay current
  ([nssSync.js](modules/ssh-gateway/src/nssSync.js))

### `user.UserLocked`
- **pub:** user — when an admin locks a user (`POST /lock`)
- **sub:** gateway (queue `gateway.userLocked`) — destroys all of the user's HTTP sessions
  ([session.js](modules/gateway/src/session.js))
- **sub:** worker (queue `workersession.user`, bound to `user.*`) — closes all of the user's
  sandbox sessions; other `user.*` keys are ignored
  ([workerSession/index.js](modules/worker/src/workerSession/index.js))

### `user.emailNotificationsEnabled` — `{username, enabled}`
- **pub:** none in the current codebase (legacy key)
- **sub:** email (queue `email.emailNotificationsEnabled`) — updates its notification-preference
  cache ([messageHandler.js](modules/email/src/messageHandler.js))

> The `user` module was formerly named `user-node`; the legacy Java `user` module it replaced
> (which published the same keys via `RabbitMQTopic('user', …)`) has been deleted.

## `workerSession.*` — sandbox session lifecycle

Published by **worker** ([workerSession/events.js](modules/worker/src/workerSession/events.js)).

### `workerSession.WorkerSessionRequested` — `{username, session}`
Same `session` DTO as `WorkerSessionActivated` below, in state `PENDING`.
- **pub:** worker — when a session row is inserted, before the instance is provisioned
- **sub:** budget (queue `budget.workerSessionRequested`) — opens the `open_session_use` row at
  `creationTime`, so a session closed before it ever activates is still billed. The row is an
  upsert keyed on `session_id`, so the later `WorkerSessionActivated` rewrites it identically
- **sub:** user-storage, ssh-gateway — via their wildcard bindings (see below); user-storage has no
  handler for this key and ignores it, ssh-gateway refreshes the terminal menu

### `workerSession.WorkerSessionActivated` — `{username, session}`
`session` is the worker-session DTO with `apiKey` stripped (`null`):
`{id, state, username, workerType, instanceType, instance: {id, host}, host, creationTime,
updateTime, timeoutTime, lastInteractionTime, activeTime, notificationState, notifiedTime,
apiKey: null}`.
- **pub:** worker — when a pending session becomes ACTIVE on a provisioned instance
- **sub:** budget (queue `budget.workerSessionActivated`) — records the open session in
  `open_session_use` for instance-spending tracking ([index.js](modules/budget/src/index.js))
- **sub:** user-storage (queue `userStorage.workerSession`, bound to `workerSession.#`) — marks the
  user's session active, cancels any pending inactivity check, schedules a debounced storage re-scan
  ([messageHandler.js](modules/user-storage/src/messageHandler.js))
- **sub:** ssh-gateway (anonymous exclusive queue per interactive SSH connection, bound to
  `workerSession.*`, auto-deleted when the connection drops) — refreshes the terminal menu when
  one of the logged-in user's sessions changes
  ([sessionEvents.js](modules/ssh-gateway/src/sessionEvents.js))

### `workerSession.WorkerSessionClosed` — `{username, sessionId}`
- **pub:** worker — when a session is closed (user request, timeout, budget lock, instance failure)
- **sub:** budget (queue `budget.workerSessionClosed`) — closes the session's `open_session_use` row
- **sub:** user-storage (queue `userStorage.workerSession`) — marks the session inactive, schedules
  an inactivity check and a storage re-scan
- **sub:** gateway (queue `gateway.workerSession`) — tears down the session's cached sandbox proxy
  endpoints, and additionally forwards the event to the user's browser websocket clients as
  `{event: {type: 'workerSessionClosed', data: {sessionId}}}` (username selects the recipients and
  is stripped from the frame), which the GUI uses to close app tabs pinned to that session; the
  internal `{type, data: {username, sessionId}}` event is also republished on the bus as
  `systemEvent`, like every gateway-internal event
  ([workerSessionClosedSubscriber.js](modules/gateway/src/sandbox/workerSessionClosedSubscriber.js))
- **sub:** ssh-gateway (anonymous exclusive queue per interactive SSH connection) — refreshes the
  terminal menu ([sessionEvents.js](modules/ssh-gateway/src/sessionEvents.js))

### `workerSession.SessionAppAssociated` — `{username, sessionId, path, label}`
- **pub:** worker — when an app is STARTED on a session (a new `session_app` association is
  created; an existing live association winning over a request emits nothing).
- **sub:** ssh-gateway — via its existing `workerSession.*` wildcard binding: the terminal menu
  refreshes, updating each session's app list ([sessionEvents.js](modules/ssh-gateway/src/sessionEvents.js))

### `workerSession.SessionAppDissociated` — `{username, sessionId, path, clientId, requestingClientId}`
- **pub:** worker — when an app is unbound from its session: GUI app tab closed (DELETE
  `/sessions/app`), a takeover (another browser dissociating before re-opening the app
  elsewhere), or the clientDown sweep (all of a downed browser client's apps). The session
  stays open. The association's removal on session close is NOT announced this way — that is
  the `session_app` cascade, which `WorkerSessionClosed` already covers. `clientId` is the
  association's OWNER (the browser ws client whose tab ran the app; nullable),
  `requestingClientId` the client whose request caused the dissociation (the clientDown
  sweep sets both to the downed client, so it never reads as a takeover).
- **sub:** ssh-gateway — same `workerSession.*` wildcard binding as `SessionAppAssociated`.
- **sub:** gateway (queue `gateway.sessionAppDissociated`) — drops its cached app entry, and
  when `clientId && clientId !== requestingClientId` unicasts `appSessionDissociated
  {appPath, sessionId}` to the owner client, whose GUI closes the app's tab (takeover close).

### `workerSession.SessionExpiryNotified` — `{username, sessionId, session}`
- **pub:** worker — when an ACTIVE session passes its stored `timeout_time` with no PENDING or
  ACTIVE task (docs/session-expiration-model.md; gated by `SESSION_EXPIRY_MODE`, default `off`).
  `session` has `apiKey` stripped. Fires once per cycle — the transition is a guarded UPDATE, and
  any extension resets the cycle to `NONE`.
- **sub:** gateway (queue `gateway.sessionExpiryNotified`) — relays to the user's browser tabs as
  websocket event `sessionExpiryNotified` `{sessionId}`, which the GUI renders as a notification
  carrying [Keep it running] [Dismiss]. Also reaches ssh-gateway's `workerSession.*` wildcard
  binding (menu refresh only).

### `workerSession.SessionExpiryClosed` — `{username, sessionId}`
- **pub:** worker — when a notified session is closed after `SESSION_GRACE_MINUTES`
  (`SESSION_EXPIRY_MODE=enforce` only). Fired in addition to `WorkerSessionClosed` (the close
  cascade) to say why. Any extension during the grace — including simply using the instance —
  cancels it.
- **sub:** gateway (queue `gateway.sessionExpiryClosed`) — relays to the user's browser tabs as
  websocket event `sessionExpiryClosed` `{sessionId}` (toast).

## `workerInstance.*` — worker instance lifecycle

Published by **worker** ([workerInstance/events.js](modules/worker/src/workerInstance/events.js)).
**No consumers** — published for observability and parity with the old Groovy event dispatcher.

| Routing key | Payload |
|---|---|
| `workerInstance.InstanceLaunched` | `{instance}` |
| `workerInstance.InstancePendingProvisioning` | `{instance}` |
| `workerInstance.InstanceProvisioned` | `{instance}` |
| `workerInstance.InstanceReleased` | `{instance}` |
| `workerInstance.FailedToProvisionInstance` | `{instance, error}` |
| `workerInstance.FailedToReleaseInstance` | `{instanceId, error}` |
| `workerInstance.FailedToRequestInstance` | `{workerType, instanceType, exception}` |

## `budget.*` — budget enforcement verdicts

Published by **budget** ([events.js](modules/budget/src/events.js)). Level-triggered: each event
carries a user's *current* verdict, re-published for every user on the hourly enforcement cycle, so
a lost delivery or a consumer restart self-corrects within the hour.

### `budget.UserBudgetExceeded` / `budget.UserBudgetCleared` — `{username}`
- **pub:** budget — after each enforcement cycle (hourly spending-report rebuild, and on
  storage/session events that change a user's spending)
- **sub:** worker (queues `worker.budgetExceeded` / `worker.budgetCleared`) — maintains the
  in-process locked-users set that gates new session requests; a *new* lock also closes the user's
  running sessions ([main.js](modules/worker/src/main.js))

## `userStorage.size` — storage scan result

### `userStorage.size` — `{username, size}` (bytes)
- **pub:** user-storage — after every completed scan of a user's home directory
  ([storageCheck.js](modules/user-storage/src/storageCheck.js))
- **sub:** budget (queue `budget.userStorage`) — accumulates the month's storage use and refreshes
  the user's cached spending report

## `email.*` — outgoing email

Both consumed by **email**, which queues and sends via SMTP
([messageHandler.js](modules/email/src/messageHandler.js)).

### `email.sendToAddress` — `{from, to, cc, bcc, subject, content, contentType, forceEmailNotificationEnabled}`
Send to explicit address(es); at least one of `to`/`cc`/`bcc` required.
- **pub:** user — transactional emails (account invitation, password reset), sent with
  `forceEmailNotificationEnabled: true` so they bypass the recipient's notification preference
  ([email.js](modules/user/src/email.js))
- **sub:** email (queue `email.sendToAddress`)

### `email.sendToUser` — `{from, username, subject, content, contentType}`
Send to a username; the email module resolves the address via the user module, skips LOCKED users, and
always forces delivery.
- **pub:** user-storage — storage-quota and inactivity notifications
  ([email.js](modules/user-storage/src/email.js))
- **pub:** worker — session-expiry warnings and close notices, config-gated by
  `SESSION_EXPIRY_MODE` ([email.js](modules/worker/src/workerSession/email.js))
- **sub:** email (queue `email.sendToUser`)

## `files.FilesDeleted` — file deletion

### `files.FilesDeleted` — `{username}`
- **pub:** none in the current codebase — the publisher was the decomposed Groovy sepal-server's
  `files` component, and user-files (which absorbed it) does not publish it
- **sub:** user-storage (queue `userStorage.files`, bound to `files.#`) — schedules a debounced
  storage re-scan for the user

## `systemEvent` — gateway client/user activity

### `systemEvent` — `{type, data}`
- **pub:** gateway — every event on its internal WebSocket/user-store event stream
  ([websocket-downlink.js](modules/gateway/src/websocket-downlink.js),
  [websocket-uplink.js](modules/gateway/src/websocket-uplink.js),
  [userStore.js](modules/gateway/src/userStore.js))
- **sub:** user-storage (queue `userStorage.systemEvent`) — acts on `clientUp` (cancels the user's
  inactivity check) and `userDown` (schedules one); other types are ignored
- Any module can tap this stream with `systemEvents$(namespace)` from
  [lib/js/shared/src/event/systemEvents.js](lib/js/shared/src/event/systemEvents.js) (currently unused)

`type` is one of the constants in
[lib/js/shared/src/event/definitions.js](lib/js/shared/src/event/definitions.js), with `data`:

| `type` | `data` |
|---|---|
| `moduleUp` / `moduleDown` | `{module}` |
| `userUp` / `userDown` / `userUpdated` | `{user}` |
| `clientUp` / `clientDown` / `clientVersionMismatch` | `{username, clientId}` |
| `subscriptionUp` / `subscriptionDown` | `{module, username, clientId, subscriptionId}` |
| `googleAccessTokenAdded` / `googleAccessTokenUpdated` / `googleAccessTokenRemoved` | `{user}` |
| `workerSessionClosed` | `{username, sessionId}` — emitted onto the same internal `event$` by the `workerSession.WorkerSessionClosed` subscriber (not from the WebSocket/user-store stream), so it reaches browsers and gets republished here like every other type |
| `appSessionDissociated` | `{username, clientId, appPath, sessionId}` — emitted onto `event$` by the `workerSession.SessionAppDissociated` subscriber when another client dissociated the owner's app (takeover); unicast to that owner client, which closes the app's tab |
