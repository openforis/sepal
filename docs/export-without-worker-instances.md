# Recipe exports without dedicated worker instances — feasibility analysis

*2026-07-29 — analysis of whether recipe exports (the `task` module) can run via the `gee`
module's per-user isolated job capability instead of provisioning an AWS instance per export.*

## TL;DR

**Partially feasible, but not with the gee module's job framework as it exists today, and not
for all export types.** Four of the seven export types are pure EE-side orchestration (a
10-second polling loop) and could run without an AWS instance. The other three write into the
user's home directory and post-process with GDAL/Python — moving those into gee would
compromise its role as a lean, stateless interactive service. The most pragmatic path is a
third option: **provision the existing task container on the main server's Docker daemon**
(the local provisioning path the worker module already uses in dev), which removes the EC2
instance for *all seven* types with the task module unchanged.

## 1. Motivation: what an export costs today

- Every export gets a **dedicated t3a.small**. The GUI never sends an `instanceType`
  (`modules/gui/src/app/home/body/process/recipe/recipeTaskSubmitter.js`), so
  `submitTask` falls back to the default instance type
  (`modules/worker/src/task/command/submitTask.js:33-47`), which is the first tagged type —
  `T3aSmall` (`modules/worker/src/hostingService/instanceTypes.js:39`).
- A task-executor session **never shares an instance with the user's sandbox**: session
  lookup is scoped by `(username, workerType, instanceType)`
  (`modules/worker/src/workerSession/query/findPendingOrActiveSession.js:10-14`), and
  `TASK_EXECUTOR ≠ SANDBOX`. Only a user's concurrent exports share one instance.
- **Billing starts at session creation** (`modules/budget/src/sessionEventHandlers.js:32`)
  and hours are `Math.ceil`ed per session
  (`modules/budget/src/instanceSpendingCalculator.js:32`): a 3-minute export that cold-boots
  an instance charges a full instance-hour, including the boot window.
- Latency: the warm pool holds a single idle t3a.small (`idleCount: 1`). A cold launch pays
  EC2 RunInstances + up to 300 s public-IP polling
  (`modules/worker/src/hostingService/aws/awsInstanceProvider.js:364-383`) + up to 60 s
  Docker-availability wait + image pull. The instance is only released ~5 minutes after the
  last task ends (`ReleaseUnusedInstances(5, MINUTES)`,
  `modules/worker/src/workerSession/index.js:51,77-80`).

## 2. What exports actually do

Task dispatch table: `modules/task/src/taskRunner.js:20-28`. The seven operations fall into
two very different classes.

### Class A — pure orchestration (no local work)

| Operation | Destination |
|---|---|
| `image.GEE` | EE asset |
| `ccdc.GEE` | EE asset |
| `samplingDesign.GEE` | EE asset (table) |
| `image.DRIVE` | user's Google Drive |

These build the EE expression tree, start an EE **batch export on Google's side**
(`ee.batch.ExportTask.create` / `ee.data.startProcessing`), and poll `getTaskStatus` every
10 s (`modules/task/src/ee/task.js`). Zero filesystem access, zero external binaries,
negligible CPU/RAM. The EC2 instance exists to run a polling loop. Notes:

- Asset export requires a **user account** (hard guard `toAsset.js:38-39`); Drive export
  silently no-ops on a service account (`toDrive.js:76-80`).
- ImageCollection assets tile into up to 3 concurrent EE batch tasks (`toAsset.js:153`).
- `samplingDesign.GEE` is a multi-round EE workflow with temporary assets and `getInfo`
  round-trips, but still no local I/O.

### Class B — SEPAL-workspace destinations (real local work)

| Operation | Destination |
|---|---|
| `image.SEPAL` | user home dir |
| `timeseries.download` | user home dir |
| `samplingDesign.SEPAL` | user home dir (table) |

Mechanics (`modules/task/src/jobs/export/toSepal.js`):

1. EE batch export to an intermediate store — **Drive** for user accounts, a per-user **GCS
   bucket** for service accounts.
2. Streamed download into `${homeDir}/downloads/...` — Drive at concurrency 3, GCS in
   10 MiB chunks (`src/cloudStorageDownload.js:13-14`). Multi-GB is normal; downloads are
   streaming so RAM stays bounded, but disk and network are not.
3. **External binaries for post-processing**: `gdalbuildvrt` and
   `python3 set_band_names.py` (`lib/js/shared/src/gdal.js`); time series additionally runs
   `sepal-stack-time-series` (`lib/python/shared/stack_time_series.py`) per tile — real
   CPU + disk work over every downloaded GeoTIFF.

Two facts that matter for any redesign:

- **The home directory is EFS, not instance-local** (`hosting-services/aws/sepal/worker-ami.yml:58`).
  The task container writes through a bind mount that the main server also has. Nothing goes
  through the `user-files` module. So Class B is not physically tied to the worker instance.
- The task container runs **as the user's uid/gid** (created at startup from the mounted home
  dir, `modules/task/start.sh:6-14`) so files land with correct ownership. Its image is built
  on `openforis/sandbox-base` (Ubuntu, GDAL 3.11, Python + osgeo — multi-GB).

### Credentials

The task module reads the user's Google tokens from
`${homeDir}/.config/earthengine/credentials`, **polled every 60 s**
(`modules/task/src/context.js:41-58`); the `user` module refreshes that file. There is no
in-task refresh: if the token lapses to a service account, **all running tasks are
cancelled** (`taskManager.js:100-105`). Progress/state reporting is plain HTTP to
`/api/tasks/...` as `sepaladmin` — it works from anywhere; no RabbitMQ involved.

## 3. The gee module's job capability

- Static pool of **40 pre-spawned `worker_threads`** in prod (`INSTANCES`,
  `modules/gee/docker-compose.yml:22`), **sticky per user**
  (`lib/js/shared/src/worker/staticPool.js`): a worker binds to a username while that user
  has in-flight requests, then returns to the shared idle pool.
- Per-user GEE identity is re-established **on every request** by the `before` chain
  (`configure → authenticate → job`, `modules/gee/src/jobs/ee/authenticate.js`):
  `clearAuthToken()` + `setAuthToken()` from the `sepal-user` header the gateway injects.
  `ee` is per-thread global state (`requireOnce` caches on the per-thread `global`), so
  isolation holds — **by convention, not construction**: it depends on `authenticate`
  running before every job.
- Jobs are **strictly request-scoped**: single value via `firstValueFrom`, torn down when the
  HTTP request ends; gateway timeout 10–11 min for `/api/gee`
  (`modules/gateway/config/endpoints.js:5-12`). No detached jobs, no progress reporting, no
  websocket use (the `arg$`/`cmd$` machinery exists in the shared lib but gee doesn't use it).
- **No resource limits anywhere**: no container `mem_limit`/`cpus`, no worker
  `resourceLimits`, and the idle-pool wait queue is an unbounded FIFO with no timeout
  (`staticPool.js:237-245`).
- **No volumes in production** — gee has zero access to user data; it talks only to Google
  and the gateway. Image is `node:26-alpine`, runs as `node`.

## 4. Why exports don't fit gee as-is

1. **Lifetime mismatch.** Exports run for hours; gee jobs die with their HTTP request
   (≤ 10 min). Supporting exports means building submit-and-detach semantics, a persistent
   task registry, progress reporting, and restart recovery — i.e. re-implementing
   `modules/task`'s `taskManager`/`taskRunner` inside gee.
2. **Pool pinning.** A sticky worker is held while requests are in flight; a multi-hour
   export would pin one of 40 workers, and ~40 concurrently exporting users would starve
   interactive traffic (previews, band lists) for everyone, with unbounded queueing. A
   separate export scheduler/pool would be needed.
3. **Credential lifetime.** gee gets a ~1 h access token per request from the `sepal-user`
   header. Long exports need a refresh path (e.g. periodic fetch from the `user` module) that
   doesn't exist; the task module solves this via the credentials file on EFS, which gee
   cannot see. Per-thread EE auth being global mutable state makes long-lived jobs
   interleaved with fresh interactive requests fragile.
4. **Filesystem + GDAL (Class B only — the hard blocker).** Class B needs the EFS home
   mount, uid/gid-correct ownership, GDAL binaries and Python osgeo. Grafting a
   sandbox-base-like toolchain and user-data mounts onto Alpine gee destroys its clean
   security posture, and puts multi-GB downloads plus GDAL CPU spikes into the unlimited,
   shared container that serves every interactive map preview. Today a runaway export kills a
   disposable $0.02 instance; in gee it could OOM the module for all users.

Secondary gaps: gee has no durable state (container restart orphans in-flight exports — EE
batch tasks keep running server-side, so re-attachment by EE task id would need persisting),
and removing the instance silently removes billing (no session → no budget charge), which
needs a product decision on quotas/abuse (EE workload tags help attribution:
`sepal-task-{recipeType}` today).

## 5. Options

### Option A — task containers on the main server's Docker daemon (recommended)

Provision `TASK_EXECUTOR` sessions on the main server's daemon instead of EC2, reusing the
**local provisioning path that already exists** (`dockerInstanceProvisioner.js` +
`localInstanceProvider`, used by the dev stack; the orphaned-container GC work on this branch
hardens exactly this path). The main server already mounts the same EFS home tree.

- Works for **all seven** export types; the task module is completely unchanged (same image,
  mounts, uid/gid handling, credentials file, progress reporting, cancellation).
- Preserves per-user container isolation and the existing session/task state machine.
- Changes are contained in the worker module:
  - per-workerType provider selection (TASK_EXECUTOR → local daemon, SANDBOX → AWS) instead
    of one hosting service per deployment;
  - fix the `8080:80` published-port collision when multiple users' task containers share one
    daemon — address containers via their `sepal`-network alias on port 80
    (`workerGateway.js` currently posts to `http://{session.host}:8080`);
  - a zero-/low-cost instance-type entry for budget accounting, and a cap on concurrent task
    containers so exports can't starve the main server.
- Risk: main-server CPU/disk contention from Class B post-processing — mitigated by the
  container cap and by `Tmpfs`/cgroup limits the provisioner can already set per container.

### Option B — Class A exports as detached jobs in gee

Eliminates even the container for asset/Drive exports. Requires: a dedicated worker
pool/scheduler, persistent task table (re-attach to EE task ids on restart), token refresh
via the `user` module, submit/cancel/progress endpoints compatible with
`/api/tasks` semantics. Real work; only worth it if Option A's per-user containers prove too
heavy. Class B stays elsewhere regardless.

### Option C — everything into gee

Largest change, worst blast radius, for the export types least suited to it (Class B).
**Advised against.**

### Recommendation

Phase 1: Option A. Phase 2 (optional): Option B for Class A. Never Option C.
