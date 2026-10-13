# CLAUDE.md - modules/user-files

File management service for user workspaces. REST API for file operations and WebSocket for real-time file monitoring.

## Commands

```bash
npm test              # Jest
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Koa HTTP server with WebSocket support via `#sepal/httpServer` `wsStream()`.

### REST API
- `GET /download` - Download file
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

- **`data` belongs to `user-data`**: in the home, `data` is only a mount point here. The root listing omits it, and monitoring, removing, downloading, listing, uploading or creating folders under it is refused (403 `{message: 'Data is managed by user-data'}` on the routes; a logged warning and nothing sent on the websocket). See `src/dataPath.js`.
- **A legacy `data` is moved aside before the home is listed**: both the `/listFiles` root listing and the websocket's home scan first apply the worker's rule (`#sepal/dataFolder`): an absent or empty `data` stays, anything else becomes the first free `data.local[.n]` and the user is emailed (`email.sendToUser`). A failure is logged and the listing goes on. See `src/legacyData.js`.
- **File permissions preserved**: Uses `chown`/`chmod` based on looked-up user info
- **Path traversal protection**: `resolvePath()` validates all paths stay within user's home directory
- **Polling interval configurable**: `--poll-interval-milliseconds` CLI arg for file watcher
- **No database**; RabbitMQ only to publish `email.sendToUser`
