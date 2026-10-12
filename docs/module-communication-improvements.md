# SEPAL module communication improvements

This document proposes improvements to SEPAL's module communication infrastructure: internal HTTP, RabbitMQ messaging, and WebSockets.

## Highest-impact improvements

### 1. Introduce explicit service contracts

Add OpenAPI specs for HTTP APIs and AsyncAPI specs for RabbitMQ/WebSocket messages. Many contracts are currently implicit in source code and comments. Typed contracts would make module boundaries clearer, enable generated clients, and catch breaking changes earlier.

### 2. Standardize internal HTTP clients

Some modules call other modules directly, some call through gateway, and some use configured public URLs. Adopt a clear rule:

- Internal module-to-module calls use Docker service names directly.
- Browser/public calls go through gateway.
- Gateway-mediated internal calls are used only when gateway auth/session behavior is intentionally required.

This would clarify cases like `email -> gateway -> user` and `user-storage -> gateway -> user/worker`.

### 3. Define RabbitMQ event ownership

**Status: done (documentation).** Formal ownership is now recorded in the "Event ownership" section
of [RABBITMQ.md](../RABBITMQ.md). Each routing-key family has a single owning module:

- `user.*` owned by `user`
- `workerSession.*` owned by `worker`
- `workerInstance.*` owned by `worker`
- `budget.*` owned by `budget`
- `userStorage.*` owned by `user-storage`
- `systemEvent` owned by `gateway`
- `email.*` owned by `email` (a *command* family: the owner defines the contract, and `user` +
  `user-storage` are authorized senders)

Deprecated keys (`files.*`, `user.emailNotificationsEnabled`) are recorded as owner-less pending
removal under #9. Ownership is currently enforced by review; per-family schemas and versioning are
covered by #4 and #6. Runtime enforcement (a publish guard keyed on module ownership) remains an
optional follow-up.

### 4. Add message versioning

Current routing keys like `user.UserUpdated` and `workerSession.WorkerSessionClosed` have unversioned payloads. Add either versioned routing keys:

```text
user.v1.UserUpdated
workerSession.v1.WorkerSessionClosed
```

or keep routing keys stable and include schema metadata in the message envelope.

### 5. Add correlation IDs across protocols

Events should carry the same trace/correlation ID when caused by an HTTP request or WebSocket action. This would make flows like `lock user -> close sessions -> gateway invalidates session -> budget updates` much easier to debug.

## Reliability improvements

### 6. Add a standard event envelope

Use a durable event envelope for RabbitMQ messages:

```json
{
  "eventId": "uuid",
  "type": "workerSession.WorkerSessionClosed",
  "schemaVersion": 1,
  "occurredAt": "2026-07-07T00:00:00Z",
  "producer": "worker",
  "correlationId": "...",
  "payload": {}
}
```

### 7. Add dead-letter queues and retry policy

The shared consumer (`lib/js/shared/src/messageQueue.js`) nacks failed messages with default arguments, which requeues them immediately: a handler that fails persistently produces an infinite redelivery loop. There is currently no retry cap, backoff, or dead-letter queue anywhere. Define per-subscriber behavior for:

- Retry count
- Retry backoff
- Dead-letter exchange/queue
- Poison-message handling
- Alerting on DLQ growth

### 8. Make event consumers idempotent

RabbitMQ delivery should be treated as at-least-once. Handlers for budget rows, storage scans, session closure, and email sends should tolerate duplicate events and be tested for it.

### 9. Remove or mark dead topics

Topics with no publisher or no subscriber should be restored, removed, or explicitly marked deprecated. Dead topics make the system harder to understand. Current examples:

- `files.FilesDeleted` — subscribed by `user-storage` (via its `files.#` binding), but nothing publishes it: `user-files` has no message-queue publisher, so the old Java files module's event was lost in the migration.
- `user.emailNotificationsEnabled` — subscribed by `email`, but the `user` module never publishes it. The email module falls back to an HTTP lookup, so its Redis cache is never invalidated by events — a live bug, not just a documentation smell.
- `workerInstance.*` — the `worker` module publishes seven instance lifecycle events with no subscriber anywhere.

## Architecture improvements

### 10. Reduce gateway as an internal dependency

`email` and `user-storage` call gateway endpoints for data that ultimately comes from `user` or `worker`. That couples background services to public routing/auth behavior. Prefer direct internal clients unless gateway policy is required.

### 11. Separate WebSocket concerns

Gateway's `/api/ws` bus currently carries client lifecycle, module readiness, user updates, subscription lifecycle, and module payloads. Consider separating:

- Client/module presence events
- Domain events
- Module data streams

Even if these remain on one socket, use stricter message envelopes and schemas.

### 12. Generate or validate the module map

`modules/gateway/config/modules.json` is manually maintained. A generated service map from compose files or module manifests could reduce drift.

## Developer experience improvements

### 13. Generate the interaction report automatically

Turn `docs/module-interactions-report.md` into a script-backed artifact that scans:

- Gateway endpoint config
- `initMessageQueue` publishers/subscribers
- Direct HTTP client usage
- WebSocket endpoint config

CI should fail when new interactions are added without documentation.

### 14. Add contract tests at module boundaries

Useful tests include:

- Gateway proxy map resolves expected targets.
- Every RabbitMQ publisher payload validates against schema.
- Every subscriber accepts the current schema.
- WebSocket modules accept standard lifecycle events.

### 15. Create typed client modules

Replace scattered calls such as `get$('http://user/...')` (from `#sepal/httpClient`) with consistent small clients:

- `userClient`
- `workerClient`
- `budgetClient`
- `gatewayClient`

Some clients already exist. Make that pattern consistent across modules.

## Recommended priority

1. Add a standard event envelope with `eventId`, `schemaVersion`, and `correlationId`.
2. Add AsyncAPI/OpenAPI specs for active module boundaries.
3. Add DLQ, retry, and idempotency policy for RabbitMQ consumers.
4. Normalize direct HTTP vs gateway-mediated HTTP.
5. Generate the interaction report in CI.
