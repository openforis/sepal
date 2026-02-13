# CLAUDE.md - modules/user-files

File management service for user workspaces. REST API for file operations and WebSocket for real-time file monitoring.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Koa HTTP server with WebSocket support via `#sepal/httpServer` `wsStream()`.

### REST API
- `GET /files` - Download file
- `GET /listFiles` - List directory contents
- `POST /setFile` - Upload file (multipart via `koa-body`, max 100MB)
- `POST /createFolder` - Create new folder

### WebSocket
`src/ws.js` - Real-time file monitoring. Message types:
- `clientUp`/`clientDown` - Client lifecycle
- `subscriptionUp`/`subscriptionDown` - Watcher registration
- `monitor`/`unmonitor` - Start/stop watching paths
- `remove` - Delete file/directory

### File System
- `src/filesystem.js` - Core file operations with `resolvePath()` security check against path traversal
- `src/watcher.js` - Directory watching using Node.js `fs.watch()`
- User uid/gid looked up via `stat` on `/sepalUsers/{username}`

## Non-Obvious Conventions

- **File permissions preserved**: Uses `chown`/`chmod` based on looked-up user info
- **Path traversal protection**: `resolvePath()` validates all paths stay within user's home directory
- **Polling interval configurable**: `--poll-interval-milliseconds` CLI arg for file watcher
- **No RabbitMQ or database** - purely filesystem-based
