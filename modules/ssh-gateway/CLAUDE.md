# CLAUDE.md - modules/ssh-gateway

SSH entry point to SEPAL. `ssh alice@<gateway>` opens the menu (a Node CLI managing sandbox sessions);
`ssh alice+<instance-name>@<gateway>` connects straight to that running instance's sandbox, with every SSH feature
(scp, sftp, forwarding, VS Code Remote-SSH). **Not an HTTP service.**

## Commands

```bash
npm test              # Jest (src/*.test.js)
npm run testWatch     # Jest watch mode
```

The Go plugin (`router/`) has no toolchain in dev-env; its tests run in the image build (`sepal build ssh-gateway`),
or in a `golang:1.27-trixie` container mounting `router/` (`go vet ./... && go test ./...`).

## Front door: sshpiperd + `sepal-router`

- **sshpiperd** ([sshpiper](https://github.com/tg123/sshpiper), built from source at a pinned tag and commit in the
  Dockerfile's `go-build` stage) listens on port 22 with the persisted OpenSSH host keys (`/data/ssh`). After
  authentication it relays whole SSH connections, so forwarding and subsystems pass through untouched.
- **`sepal-router`** (`router/`, Go) is its plugin. Per connection it splits the username at the first `+`,
  authenticates the client against the user module (`/auth/password`, `/auth/authorized-keys`), and picks the
  upstream, always logging in with the user's SEPAL key `/home/<username>/.ssh/id_rsa`:
  - no instance named → the internal sshd (menu) on `127.0.0.1:2222` as the user;
  - exactly one ACTIVE session of the user with that name (worker `GET /sessions/<username>/report`) →
    `<session.host>:222` as `sepal-user`;
  - otherwise, or when that sandbox's port 222 does not answer → the menu with `SEPAL_ROUTING_ERROR` set;
    `script/ssh-bootstrap` prints it and exits.
- sshpiper routes a public key, and logs in upstream with it, before the client proves it holds the key. So a direct
  connection fires the one-shot `POST /sessions/session/:id/opened` only when its pipe starts, and one connection
  routes at most two public keys.
- **Internal sshd**: `127.0.0.1:2222`, public keys only (only sshpiperd reaches it, with the SEPAL key),
  `DisableForwarding yes`, `ForceCommand ssh-bootstrap`. It sees every login from 127.0.0.1; the router logs
  client addresses.

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

- **Menu is a pure CLI tool**: Writes SSH script file instead of serving HTTP
- **Entire app is an RxJS pipeline**: User interaction, HTTP calls, and output all composed as observables
- **ASCII table rendering**: `src/asciiTable.js` for formatted budget/session display
- **Session selection logic**: ACTIVE -> STARTING -> create new instance
