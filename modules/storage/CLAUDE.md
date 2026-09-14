# CLAUDE.md - modules/storage

Monitors user storage quota and usage. Tracks inactivity, sends notifications, manages cleanup jobs via BullMQ.

## Database migrations

`migrations/` holds the portable schema stream and `migrations/legacy-import/` the one-off copy from the `user_storage` database this module used before the rename. Startup and import cleanup are described in [docs/database-migrations.md](../../docs/database-migrations.md).

## Commands

```bash
npm test              # Jest; the *.integration.test.js suites need a reachable MySQL
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Composes the database, repository, inactivity check and message handler, then starts RabbitMQ
(publishers + subscribers), the HTTP server and the scheduled storage/inactivity checks. The database is
initialized before the queue, so no subscriber can be handed work that records events before it can.

### RabbitMQ Integration
Publishers:
- `storage.size` - Publishes `{username, size}` after storage scan
- `email.sendToUser` - Sends notification emails

Subscribers:
- `storage.systemEvent` - System lifecycle events (`CLIENT_UP`, `USER_DOWN`)
- `storage.workerSession` - Worker session activated/closed (bound to `workerSession.#`)
- `files.#` - File deletion events trigger storage recheck

### Message Handler
`src/messageHandler.js` - Routes RabbitMQ events. Uses RxJS `groupBy` + `debounceTime` + `switchMap` for debounced event processing (1000ms).

### Storage Scanning
`src/storageCheck.js` - Recursively scans user home directories, publishes size changes.

### Inactivity Detection
`src/inactivityCheck.js` - Checks last activity, sends email notifications before cleanup. Uses BullMQ for scheduled cleanup jobs.

### REST API
- `GET /mostRecentEvents` - Most recent event per user
- `GET /userEvents?username=X` - Event history for user

### Database
MySQL (`storage` schema):
- Table: `history` - Records `(username, event, timestamp)` with deduplication
- `src/db.js` runs the schema and legacy-import migrations and returns the shared callback db; `src/historyRepository.js` holds it
  and owns every statement against `history`. Nothing else reaches the pool.
- `addEvent` uses `GET_LOCK()`/`RELEASE_LOCK()` on one connection for concurrent access safety. Known defects
  in that locking are recorded in [docs/database-migrations.md](../../docs/database-migrations.md) and are
  not addressed here.
- Migration: `migrations/001.do.schema.sql`

### Session Tracking
`src/kvstore.js` - Redis for session active/inactive state per user.

## Non-Obvious Conventions

- **Thundering herd prevention**: Inactivity grace period spreads notifications over configurable hours
- **Scan parameters**: Min delay 5s (enforced), exponential backoff with configurable factor
- **Concurrent scan limits**: Configurable concurrency and retry budgets
- **Dual storage**: MySQL for event history, Redis for session state
