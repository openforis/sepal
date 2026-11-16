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
- `POST /setFile` - Upload one file (multipart field `file` via `koa-body`, max 100MB); see [Uploads](#uploads) and
  [Publishing uploads](#publishing-uploads)
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
- `subscriptionDown` releases that subscription's grouping key and stops its polls; `clientDown` does the same for
  every subscription of that client. The same identities can monitor again. Other clients and subscriptions keep
  running. Closing the gateway connection cancels all its scans and polls, including queued entry descriptions;
  filesystem calls already started may finish, but send nothing late.

### File System
- `src/filesystem.js` - REST handlers
- `src/homePath.js` - Resolves and describes paths in a user's home, following links only within it; shared with the watcher
- `src/homeWrite.js` - Write policy: refuses links, anything not owned by the user, and missing parents unless recursive
- `src/createFoldersAsUser.js` - Program that `homeWrite.js` runs as the home's owner to create folders; see [Creating folders](#creating-folders)
- `src/upload.js` - Multipart parsing for `setFile`; owns and removes the parser's temporary files
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

### Listings
REST listings (`listFiles`) and watcher scans describe a directory's entries through `describeEntries$`
(`src/homePath.js`).
- **Limit.** Each listing has at most `ENTRY_CONCURRENCY` (16) entry descriptions active at once. Each lane takes
  its next name after its previous description finishes. The limit is per listing, not service-wide: concurrent
  listings have separate allowances.
- **Linear work.** Names are taken from the `readdir` array, never spread into arguments, and results collect in a
  per-listing array. Watcher `items` are built with `Object.fromEntries`, so names like `__proto__` or `constructor`
  stay ordinary entries.
- **Cancellation.** Unmonitoring, or anything else ending a scan, stops lanes taking names. A description already
  started finishes unseen, and nothing is sent late. A REST listing runs to the end even if its client leaves.
- **Memory.** A listing still holds every name and every described entry until it is answered; there is no
  pagination.
- **Unchanged:** response shapes, hidden-file and extension filtering, REST sort order (directories first, then by
  name), skipping vanished or unreadable entries, and watcher `items` in completion order.

### Uploads
`src/upload.js` parses the `/setFile` body and owns every temporary file the parser writes, in the process's temporary
directory. However the request ends, each file's writer is closed and the file removed, whatever field it came in.
That includes success, refusals, failed writes, bodies the parser rejects part-way, and clients that go away.

- A file is removed only once its writer has closed, so one still opening is not created after its removal.
- Having rejected a part, the parser still reads on through the parts it already holds. Files it opens for them
  before the request's files are discarded are closed and removed with the rest; parts it reaches afterwards are read
  into nothing, without a file.
- A request carries one file, in the field `file`. A request with any other file part is refused (400).
- Only paths the parser generated are removed, never ones taken from the query or the client's file name. A file that
  cannot be removed is logged, and the request is answered as it would have been.
- The body is parsed before authentication and validation, so a refused request still takes up to 100MB of temporary
  storage until it ends. A client that stalls keeps it until the server times the request out.
- Parser rejections, such as an oversized file or a malformed body, are answered 500.

### Publishing uploads
`publishFile` (`src/homeWrite.js`) never writes into the target. It copies the upload into a staged file next to the
target, `.upload-<uuid>`, created exclusively. Through that file's open handle it sets the home owner's uid/gid and mode
0644, fsyncs and closes it. Only then is the copy published:
- `overwrite=true` renames it over the target, so readers see the previous file or the new one, whole. Of concurrent
  overwrites, the last rename wins.
- Otherwise it is hard-linked at the target, which fails while anything is there, however late it arrived. That
  answers 409; of concurrent creators, one wins. The staged name is then removed.
- Any failure before publication removes the staged file and leaves the target as it was (500). A staged name that
  cannot be removed after publication is logged, and the upload is still answered as published.
- A target that is not a regular file (socket, FIFO, device) is refused (400), since a rename would replace it without
  opening it. Links, directories and entries not the user's stay refused.
- `overwritten` says whether a file was there when the request was checked; another request may since have created or
  replaced one.

Compatibility: an overwrite gives the target a new inode.
- Hard links to the old file keep the old content.
- Processes that already have the old file open keep reading the old content. On EFS this assumes the server keeps a
  replaced file readable while it is open.
- Ownership and mode are reset as before, but the old file's extended attributes and ACLs are not carried over.
- A staged file is briefly visible in listings. One left by a crash stays until removed.

Assumptions and limits:
- **Atomicity.** Rename and link are atomic within one directory of one filesystem: locally, and on NFSv4.1, which EFS
  serves, with hard links. NFSv4.1 sessions keep a retried link from reporting a false conflict. Staging next to the
  target keeps both on the target's filesystem and mount, wherever the parser's temporary directory is.
- **Durability.** The staged file is fsynced before publication, so a published name never refers to unwritten
  content. The directory is not, so after a crash the target may still hold the previous version; both are complete.
- **Path boundary.** Each operation resolves its path again through the `nosymfollow` view, so a link swapped in on the
  way fails. The parent folder's ownership is not checked again at publication. A user rearranging their own folders
  meanwhile can redirect their upload within their home or make it fail, not move it out. A rename replaces whatever is
  at the target by then, without opening or following it.

### Creating folders
`createFolder` validates the path as root (containment, links, ownership, missing parents), then creates the folders
in a short-lived process running as the home's owner: `createFoldersAsUser.js`, started by `createFolders`
(`src/homeWrite.js`). Nothing created is ever changed with more authority than the user's, so a folder the user swaps
in after creation keeps its owner and mode.
- **Identity.** The uid and gid are those of `/sepalUsers/<user>`, the home the request's user selects. The
  process starts with `spawn`'s `uid`/`gid` options and fixed arguments, with no shell, environment or descriptors
  beyond its output. It is killed after 60 seconds. A request ends only once the process has ended and its output is
  closed, a failed start included.
- **Never root.** A home root owns is refused (500) before any process starts. The process itself also refuses to
  run as root.
- **Checks before changing anything.** The process checks its real and effective uid and gid, and that its only
  group is the home's gid. If not, nothing is created (500). A failed start or identity change is an error, never a
  run as root. A non-root service, as in DEV tests, cannot drop its own groups; the process then has those too.
- **Creation.** Each folder is made with `mkdir`. One this process creates is opened (`O_DIRECTORY|O_NOFOLLOW`),
  checked to be the user's, and given the home's gid and mode 0755 through its handle. A setgid parent's group and
  bit are not inherited, as before. A folder found in place, including one that appeared after validation, is
  accepted only if it is the user's directory and not a link.
- **Refusals.** Permission errors and refused folders answer 403 `Forbidden path`; other failures answer 500. Folders
  created before a failure stay, as before.

Compatibility: the operating system's permissions now apply where root bypassed them.
- A parent the user may not write is refused (403), where root created the folder anyway.
- Every directory on the way, `/sepalUsers` included, must be searchable by the user.
- A folder of the user's that appears during creation is accepted, where it used to answer 500.
- Each request starts one Node process.

### Releasing link browsing
The GUI must ship these together with link browsing; they belong to the GUI, not this module:
- Replace an entry's metadata on refresh, dropping the optional properties the update omits, rather than merging the
  update over the previous entry.
- Monitor a directory again once it recovers, since it stopped being monitored when its path stopped resolving.

Showing scan errors (`data: {path, error}`) is optional.

## Non-Obvious Conventions

- **Files and folders belong to the home's owner**: uploads get their owner and mode through the staged file's handle;
  folders are created by a process running as the owner
- **Polling interval configurable**: `--poll-interval-milliseconds` CLI arg for file watcher
- **No database** - filesystem-based; RabbitMQ only to publish `files.FilesDeleted` (`{username}`) after a WebSocket `remove` deletes a path, so storage rescans the user's quota
