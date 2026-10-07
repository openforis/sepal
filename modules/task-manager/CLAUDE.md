# CLAUDE.md - modules/task-manager

Runs each SEPAL export task in its own detached Docker container (`task.<username>.<taskId>`, like sandbox containers) on the main host's
Docker daemon, instead of inside a user's worker session. Owns the `task_manager` MySQL schema and serves the
GUI task API (the contract the worker module served before), the container progress callback, the gateway's
API-key check, and the task-list websocket.

## Container contract

- The container image is `openforis/task`. It receives `/task` (the task's workspace directory, holding the
  task description) and the user's home directory.
- It authenticates with a per-task API key, prefixed `task_` and stored only as a SHA-256 hash. The gateway
  resolves the key through `POST /tasks/api-key-authenticate` and sets `sepal-session` to
  `{"workerType":"task","taskId":"<id>"}`.
- It attaches to the Docker network `sepal-task`, which only the gateway also joins, and calls
  `http://gateway/api/...`. It never joins the `sepal` network, whose services trust the `sepal-user` header.
- It reports progress with `POST /tasks/task/:id/progress` and writes its outcome to `/task/result.json`
  before exiting; the supervisor settles the task state from that file. A container that exits without one
  has failed, and a CANCELED result counts only for a task being cancelled (any other stop interrupted it).

## Supervisor

All supervisor work (dispatch, stop, supervision ticks, recovery) goes through its queue; never act on
containers or task state from outside it.

## Commands
- `npm test` - Jest (ESM); `*.integration.test.js` needs `MYSQL_HOST`, `MYSQL_USER` and `MYSQL_PASSWORD`
- `sepal build task-manager` / `sepal start task-manager` / `sepal logs task-manager -r`

## Routes (served without the `/api/tasks` gateway prefix)
- `POST /tasks`, `GET /tasks/task/:id`, `GET /tasks/task/:id/details` (auth)
- `POST /tasks/task/:id/{cancel,remove,execute}`, `POST /tasks/remove` (auth)
- `POST /tasks/task/:id/progress` (task key)
- `POST /tasks/api-key-authenticate` (admin)
- `/ws` - gateway virtual-websocket endpoint (module `task-manager/task`)
