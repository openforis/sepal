# CLAUDE.md - modules/user-assets

Manages Google Earth Engine assets for authenticated users. Monitors asset trees, caches in Redis, syncs with user authentication state.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Koa server with WebSocket support only (no REST routes). Initializes Redis and AssetManager.

### Asset Manager
`src/assetManager.js` - Complex RxJS state machine managing multiple subject streams:
- `userUp$`/`userDown$` - User session lifecycle
- `googleAccessToken$` - Token add/update/remove events
- `subscriptionUp$`/`subscriptionDown$` - Client subscriptions
- `update$`/`remove$`/`create$`/`reload$` - Asset operations

Uses `STree` (Sepal Tree) from `#sepal/tree/sTree` for hierarchical asset representation.

### Asset Scanner
`src/assetScanner.js` - Polls GEE for asset changes. Returns `busy$` stream for concurrent request tracking. Hierarchical scanning via `scanTree$`/`scanNode$`.

### WebSocket Messages
`src/ws.js` - Receives: `userUp`, `userDown`, `googleAccessTokenAdded/Updated/Removed`, `subscriptionUp/Down`, `reload`, `cancelReload`, `remove`. Streams asset updates back to clients.

### Redis Storage
- `src/assetStore.js` - Stores entire asset trees as JSON, TTL-based expiration on token refresh
- `src/userStore.js` - Stores user state (username, Google tokens, project IDs)

## Non-Obvious Conventions

- **WebSocket only** - no REST endpoints, all communication via WebSocket
- **Extensive RxJS**: `groupBy`, `mergeMap`, `switchMap`, `debounceTime`, `exhaustMap`, `race`, `concat`, `defer`, `autoRetry`
- **Min reload delay**: 60 seconds to prevent thrashing
- **Retry strategy**: 2s to 3660s max with exponential backoff
- **Polling interval**: Configurable in minutes via `--poll-interval-minutes`
