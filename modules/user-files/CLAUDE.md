# CLAUDE.md - modules/user-files

File management service for user workspaces. REST API for file operations and WebSocket for real-time file monitoring.

## Commands

```bash
npm test              # Node test runner
npm run testWatch     # Node test runner watch mode
```

Changes to path resolution (`src/homePath.js`) must also pass the suite as root in the module image, with every
fixture behind a disposable `nosymfollow` bind view: DEV's normal mounts cannot show what that view refuses. CI does
not run this yet. From this directory:

```bash
docker run --rm --privileged --entrypoint sh \
  -v "$PWD/src:/usr/local/src/sepal/modules/user-files/src:ro" \
  -v "$PWD/../../lib/js/shared/src:/usr/local/src/sepal/lib/js/shared/src:ro" \
  "${DOCKER_REGISTRY_HOST:-localhost}/openforis/user-files:${SEPAL_VERSION:-latest}" -c '
    set -e
    mkdir -p /scratch/source /scratch/restricted
    mount -t tmpfs tmpfs /scratch/source
    mount --bind /scratch/source /scratch/restricted
    mount -o remount,bind,nosymfollow /scratch/source /scratch/restricted
    cd /usr/local/src/sepal/modules/user-files
    TMPDIR=/scratch/restricted node --experimental-test-module-mocks --test --test-concurrency=2 "src/*.test.js"'
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

One gateway connection carries every user's commands, so a command affects only itself:
- `monitor`, `unmonitor` and `remove` take a whole path string, or a flat list of them. Paths are client paths, either
  relative (`project`) or slash-prefixed (`/project`), with the root as `''` or `/`.
- `monitor` may carry `reset: true`. That first stops every path the client's subscription monitors, however each is
  written. An empty list with `reset` clears them all, and other subscriptions are unaffected.
- A command is checked whole before any of it is acted on. One with anything else (a number, object, `null`, nested
  list or non-boolean `reset`) is rejected and logged, and nothing is monitored, unmonitored, reset or removed.
- A message that fails unexpectedly is logged, without the user object, and goes no further. Heartbeats and later
  commands continue.
- A monitored path that fails unexpectedly stops being monitored on its own; every other path keeps its monitoring.

### File System
- `src/filesystem.js` - REST handlers
- `src/homePath.js` - Resolves and describes paths in a user's home, following links only within it; shared with the watcher
- `src/homeWrite.js` - Write policy: refuses links, anything not owned by the user, and missing parents unless recursive
- `src/watcher.js` - Directory polling using RxJS
- User uid/gid looked up via `stat` on `/sepalUsers/{username}`
- Deployed homes use the host's separate `nosymfollow` bind view, prepared and verified before Docker starts. DEV keeps normal mounts.

### Links
Clients browse a logical tree: a path stays the one the client named (`shortcut/subfolder/file`), wherever the
links on it lead within the user's home.

- Every operation and the watcher resolve paths with `resolvePath` (`src/homePath.js`). It takes a client's path
  lexically, then follows links one name at a time from inside the home, as the kernel would. Relative targets start
  from the link's directory, a `..` after a link starts from where it led, and at most 40 links are followed.
- Nothing outside the user's home is ever looked up. A `..` leading above the home is refused before anything there is
  touched, even if the rest of the path would lead back. So nothing outside a user's home changes what that user is
  told.
- An absolute target is followed only from a prefix naming the home, which can be either:
  - the home as this service shows it (`/sepalUsers/<user>`);
  - the home as sandboxes and tasks mount it (`/home/sepal-user`), which maps to the authenticated user's home.

  Repeated `/` and `.` are allowed within that prefix, but `..` is not. Names past the prefix reach the walk unchanged,
  `..` included. Any other absolute target is `outside-home`, including a similar prefix such as `/home/sepal-user-other`.
- A sandbox mounts other storage at `shared` and `tmp` in the home (`/home/sepal-user/shared`, `/home/sepal-user/tmp`).
  A link target that would step from the home into either name is `outside-home`, however it gets there: through
  `/home/sepal-user/shared/...`, `/home/sepal-user/x/../tmp`, or `../shared`. The refusal happens before anything is
  looked up, so it does not depend on whether the home has entries of those names. A client's own path still lists the
  home's `shared` and `tmp` folders, if any, as ordinary folders.
- Each operation resolves afresh and then uses only the resolved path, which contains no links. If a part of it is
  replaced by a link before use, the `nosymfollow` view makes the operation fail with `ELOOP` instead of following it.
- Listings (`listFiles` entries, WebSocket `items`) describe a link as what it leads to, plus `symlinkTarget`: the
  target the link stores, as `readlink` returns it. An unusable link keeps `symlinkTarget` and adds `symlinkProblem`,
  one of `missing-target`, `link-loop`, `outside-home` or `inaccessible-target`. It is never advertised as a file or
  directory: REST gives `type: 'symlink'`, the WebSocket omits `dir` and `file`. Ordinary entries have neither property.
- Listings carry current metadata only. Consumers must drop optional properties an updated entry omits (`symlinkTarget`,
  `symlinkProblem`, `dir`, `file`, `size`) rather than merge the update over the previous entry.
- A monitored path that stops leading to a directory in the home stops being monitored. That covers a deleted path and
  one whose link broke or now leads out of the home. The parent's listing reports the link's problem and its recovery,
  and a client monitors the path again to see its contents.
- A monitored path that resolves but cannot be listed, such as a file, is reported once to the subscription monitoring
  it, as `data: {path, error}` with the error code, and then no longer monitored.
- A download opens the resolved path without waiting and judges the file by what it opened. Anything other than a
  regular file is closed again and refused (400), including a FIFO put there meanwhile.
- Removing a link removes the link, never its target. Removing beneath a linked directory acts where the link leads,
  after the same containment check.
- Writes (`setFile`, `createFolder`) never pass through links. Their unexpected failures answer a generic error; the
  details stay in the log.

### Releasing link browsing
The GUI must ship these together with link browsing; they belong to the GUI, not this module:
- Replace an entry's metadata on refresh, dropping the optional properties the update omits, rather than merging the
  update over the previous entry.
- Monitor a directory again once it recovers, since it stopped being monitored when its path stopped resolving.

Showing scan errors (`data: {path, error}`) is optional.

## Non-Obvious Conventions

- **File permissions preserved**: Uses `chown`/`chmod` based on looked-up user info
- **Polling interval configurable**: `--poll-interval-milliseconds` CLI arg for file watcher
- **No database** - filesystem-based; RabbitMQ only to publish `files.FilesDeleted` (`{username}`) after a WebSocket `remove` deletes a path, so storage rescans the user's quota
