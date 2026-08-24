# CLAUDE.md - modules/ssh-gateway

CLI tool for managing interactive/non-interactive SSH sessions to sandbox workers. **Not an HTTP service** - generates SSH scripts on-demand.

## Commands

```bash
npm test              # Jest (src/*.test.js)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - **No HTTP server**. RxJS pipeline selects `interactive$()` or `nonInteractive$()` based on `--interactive`/`--non-interactive` CLI flag. Writes generated SSH script to `sshCommandPath`.

### Interactive Mode
`src/interactive.js` - User-facing terminal menu:
- Displays budget info (instance/storage spending and quotas) in ASCII tables
- Lists instance types and active sessions
- Handles: start instance, join session, stop session (stop asks y/N confirmation
  listing the apps running on the instance, when the report shows any)
- Budget confirmation when hours remaining < 10
- Built entirely as RxJS pipeline (defer, switchMap, merge, interval, tap, first)
- Auto-refreshes: the top-level prompt races user input against `workerSession.*` events
  (`src/sessionEvents.js` — `#sepal/messageQueue` with an anonymous exclusive queue per
  connection, filtered by username); an event clears the screen and re-fetches the report.
  In-flight actions (join/start/stop, y/N confirmation) are never interrupted. Event failures
  degrade silently; `main.js` calls `configureNoLogging()` because any log output corrupts the
  menu.

### Non-Interactive Mode
`src/nonInteractive.js` - Finds active session OR creates new session on first tagged instance type.

### SEPAL API Client
`src/endpoint.js` - HTTP calls using `#sepal/httpClient`:
- `sandboxInfo$` - Fetches `/api/sessions/{username}/report`
- `createSession$`, `joinSession$`, `terminateSession$`
- Retries every 5s until session leaves STARTING state

### Terminal Utilities
`src/console.js` - ANSI color formatting (30+ styles), `readline` wrapped in RxJS `defer/fromEvent/first`.

## Non-Obvious Conventions

- **Pure CLI tool**: Writes SSH script file instead of serving HTTP
- **Entire app is an RxJS pipeline**: User interaction, HTTP calls, and output all composed as observables
- **ASCII table rendering**: `src/asciiTable.js` for formatted budget/session display
- **Session selection logic**: ACTIVE -> STARTING -> create new instance
