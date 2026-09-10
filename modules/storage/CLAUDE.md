# CLAUDE.md - modules/storage

Monitors user storage quota and usage. Tracks inactivity, sends notifications, manages cleanup jobs via BullMQ.

## Database migrations

`migrations/` holds the portable schema stream and `migrations/legacy-import/` the one-off copy from the `user_storage` database this module used before the rename. Startup and import cleanup are described in [docs/database-migrations.md](../../docs/database-migrations.md).

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Initializes RabbitMQ (publishers + subscribers), HTTP server, scheduled storage/inactivity checks.

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
- Uses `GET_LOCK()`/`RELEASE_LOCK()` for concurrent access safety
- Migration: `migrations/001.do.schema.sql`

### Session Tracking
`src/kvstore.js` - Redis for session active/inactive state per user.

## Non-Obvious Conventions

- **Thundering herd prevention**: Inactivity grace period spreads notifications over configurable hours
- **Scan parameters**: Min delay 5s (enforced), exponential backoff with configurable factor
- **Concurrent scan limits**: Configurable concurrency and retry budgets
- **Dual storage**: MySQL for event history, Redis for session state
