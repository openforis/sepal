# CLAUDE.md - modules/email

Processes email sending requests via RabbitMQ. Uses BullMQ (Redis) for job queue management and Nodemailer for SMTP delivery.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Initializes RabbitMQ subscribers, BullMQ worker, and HTTP server (port 80).

### Message Queue Subscribers
Three RabbitMQ topics on `sepal.topic` exchange:
- `email.sendToAddress` - Send email to a direct address
- `email.sendToUser` - Send email to a user (looks up email address)
- `user.emailNotificationsEnabled` - Update user notification preference

### BullMQ Job Queue
`src/emailQueue.js` - Redis-backed job queue (db 1):
- Worker concurrency: 4
- Retry: 10 attempts with exponential backoff (10s initial)
- Keeps last 10 completed/failed jobs

### Email Delivery
`src/email.js` - Nodemailer SMTP integration with Handlebars template (`src/template.hbs`). Supports content types: plain text, markdown (via `marked`), HTML.

### Preference Caching
- `src/user.js` - Layered lookup: local Redis cache -> remote SEPAL API
- `src/cache.js` - Redis-based three-state boolean caching (true/false/undefined) on db 0

## Non-Obvious Conventions

- **Dual queue system**: RabbitMQ for message ingestion, BullMQ (Redis) for actual email job processing with retry
- **Locked users skipped**: Email sending silently skips locked user accounts
- **Template compiled once**: Handlebars template compiled at startup, reused for all emails
- **Notification preferences**: Fetched from remote API if not in Redis cache
