# Where should recipe exports run? — topology options

*2026-08-13 — an options report on where the `task` module executes recipe exports: the current
per-user EC2 worker instance, a hybrid split, one shared container on the main instance
(single- or multi-process), or many containers on the main instance. Companion to
[export-without-worker-instances.md](export-without-worker-instances.md), which established the
Class A / Class B split and the motivation; this report compares topologies.*

## 0. Recap and measured baseline

**Class A — pure EE orchestration** (`image.GEE`, `ccdc.GEE`, `samplingDesign.GEE`,
`image.DRIVE`): build the expression, start an EE batch export on Google's side, poll
`getTaskStatus` every 10 s ([src/ee/task.js](../modules/task/src/ee/task.js)). Verified: no
filesystem access, no external binaries — grepping `homeDir`/`fs`/`mkdir` across
[tasks/](../modules/task/src/tasks/) and the asset/drive exporters hits only Class B.

**Class B — SEPAL-workspace destinations** (`image.SEPAL`, `timeseries.download`,
`samplingDesign.SEPAL`): EE export to Drive/GCS, streamed multi-GB download into the user's home
dir, then `gdalbuildvrt` + `set_band_names.py` (+ `sepal-stack-time-series` for time series).
Needs the EFS home mount, correct uid/gid, GDAL and Python osgeo.

**Measured on a dev host (2026-08-13):**

| | Value |
|---|---|
| `openforis/task:latest` image | **5.53 GB** (4.58 GB of it is the `sandbox-base` parent) |
| Writable layer per container | **0 B** (`docker ps -s`) — layers are shared, disk is paid once per host |
| Idle container (main process + 1 pool thread, `ee` not yet loaded) | **164 MiB** cgroup / 207 MB RSS, 12 threads |
| `import('@google/earthengine')` in a thread | 40 MB → 126 MB, i.e. **+86 MB** |
| Container actively running an export | **~250–300 MB** |
| Cross-check: `gee` with `INSTANCES: 3` | 601 MiB for main + 3 ee-loaded threads (~150 MB/thread) |

**Current cost per export:** a dedicated `t3a.small` ($0.0204/h, 1 vCPU, 2 GiB, `idleCount: 1`
warm — [instanceTypes.js:35](../modules/worker/src/hostingService/instanceTypes.js#L35)), with
hours ceiled **per use record**
([instanceSpendingCalculator.js:6-14](../modules/budget/src/instanceSpendingCalculator.js#L6-L14))
— so a 3-minute export that cold-boots an instance charges a full instance-hour, boot window
included.

**Constraints that shape every option** (each is detailed under the option it bites):

1. The task module is **single-tenant by construction** — one `--home-dir`/`--username`, one
   credentials file polled every 60 s ([context.js](../modules/task/src/context.js)), EE auth as
   per-thread global state ([ee/initialize.js](../modules/task/src/jobs/ee/initialize.js)), a
   `STICKY, instances: 1` pool ([main.js:20](../modules/task/src/main.js#L20)), and main-thread
   limiter singletons ([jobs/service/](../modules/task/src/jobs/service/)).
2. The task lifecycle is **session-driven**: `task.session_id` is NOT NULL
   ([001.do.schema.sql:51](../modules/worker/migrations/001.do.schema.sql#L51)), tasks execute on
   `WorkerSessionActivated` and fail on `WorkerSessionClosed`
   ([taskManager.js:56-62](../modules/worker/src/task/taskManager.js#L56-L62)), and cancel/timeout
   reach the container at `http://{session.host}:8080`
   ([workerGateway.js:23](../modules/worker/src/task/workerGateway.js#L23)).
3. **Google tokens are refreshed per session**, not per task
   ([refreshGoogleTokens.js:12-13](../modules/worker/src/workerSession/command/refreshGoogleTokens.js#L12-L13)).
   Lose the session and a user who closes the browser goes stale within ~1 h, at which point
   [taskManager.js:100-105](../modules/task/src/taskManager.js#L100-L105) cancels all their tasks.
4. **Billing rides on sessions** ([budget/src/sessionEventHandlers.js](../modules/budget/src/sessionEventHandlers.js)).
   No session → no charge → no brake on submission volume.

---

## Option 0 — Status quo: task executor on a per-user EC2 instance

One `TASK_EXECUTOR` session per `(username, instanceType)`
([findPendingOrActiveSession.js](../modules/worker/src/workerSession/query/findPendingOrActiveSession.js)),
never shared with the user's sandbox, on a `t3a.small` provisioned by the AWS provider.

**Pros**
- Zero code change; the only option that is already true.
- Complete isolation: one user's runaway export kills a disposable $0.02 instance and nothing else.
- Class B works unmodified — EFS home mount, uid/gid, GDAL, Python.
- Billing, quota and abuse control are automatic and already understood by users.
- CPU and disk for Class B post-processing are off the main server entirely.

**Cons**
- Pays a full instance-hour (ceiled) for a 3-minute Class A poll loop.
- Cold-start latency: EC2 `RunInstances` + up to 300 s public-IP polling + up to 60 s Docker wait
  + image pull; the single warm `t3a.small` covers only the first concurrent user.
- Instances linger ~5 minutes after the last task (`ReleaseUnusedInstances(5, MINUTES)`).
- A 1 vCPU / 2 GiB instance is oversized for a polling loop and undersized for a big Class B job.
- Operationally the heaviest path: AWS API failures, provisioning races, orphaned instances.

---

## Option 1 — Multiple task containers on the main instance

Reuse the local provisioning path that already exists
([dockerInstanceProvisioner.js](../modules/worker/src/workerInstance/dockerInstanceProvisioner.js)
+ [localInstanceProvider.js](../modules/worker/src/hostingService/local/localInstanceProvider.js),
used by the dev stack) to put `TASK_EXECUTOR` containers on the main server's Docker daemon. The
main server already mounts the same EFS home tree, so **all seven** export types work with the
task module unchanged. This is "Option A" of the companion doc.

Two granularities:

### 1a — One container per user (recommended granularity)

Mirrors today's session key exactly; the task module already runs a user's tasks concurrently in
one container ([taskManager.js:93-124](../modules/task/src/taskManager.js#L93-L124)), and for
Class A that single sticky thread is near-idle between 10-second polls.

**Pros**
- **Task module completely unchanged** — same image, mounts, uid/gid, credentials file, progress
  reporting, cancellation. No multi-tenancy work at all.
- Per-user isolation preserved; blast radius of a bug or a runaway export is one user.
- No EC2 boot: container start on a warm local daemon is seconds, and the image is already local.
- Session/task state machine, token refresh and billing plumbing all keep working (a session still
  exists; only the provider changes).
- One ~300 MB container serves *all* of that user's simultaneous exports.

**Cons**
- Main-server CPU/disk contention from Class B post-processing (GDAL, multi-GB downloads).
- ~5.5 GB of image on the main instance that isn't there today (paid once).
- Needs a concurrent-container cap, and explicit `mem_limit`/`cpus` — nothing sets limits today.
- Requires the worker changes: per-`workerType` provider selection, the `8080:80` published-port
  collision fix (address containers by their `sepal`-network alias on port 80), and a zero-/low-cost
  instance-type entry for accounting.
- Billing becomes nominal, so the abuse brake weakens (see §Cross-cutting).

### 1b — One container per export

**Pros**
- Simplest possible lifecycle: container is the task; it dies when the task ends.
- Per-export resource limits are exact, and a stuck export can be killed without touching others.

**Cons**
- Most expensive by RAM: every concurrent export pays a fresh ~250–300 MB node baseline
  (10 concurrent ≈ 2.5–3 GB) where per-user amortizes across a user's exports.
- Container create/start per export instead of per user — more Docker API churn, more orphan risk.
- Diverges from the existing session model (sessions are per user), so more worker changes, not fewer.
- No benefit over 1a for Class A, whose containers are idle most of their life.

---

## Option 2 — Single permanent container, multi-process

One long-lived container on the main instance with a small supervisor that forks the existing
single-tenant `main.js` per active user (`--home-dir`/`--username` as today), routes
`POST /api/tasks` / `DELETE /api/tasks/:id` by a `taskId → process` map, and reaps idle children.

**Pros**
- Keeps **every** single-tenant assumption intact: own context, own EE auth, own limiters,
  optionally own uid — none of the hazards in Option 3 exist.
- One container to deploy, monitor and limit; no Docker API churn per user or per export.
- Can serve Class A and Class B (children can be given the home mount and setuid), so it is not
  inherently a Class-A-only design.
- Container restart is the only shared failure; individual child crashes are contained.

**Cons**
- **The memory saving over Option 1a is small**: a forked process costs about what a container
  costs (~165–250 MB active), since container overhead is namespaces, and read-only image pages
  are shared across containers anyway. The win is operational, not RAM.
- New code with no precedent in the codebase: a supervisor, process lifecycle, health, log
  routing, and a task→process registry — all of which Docker already does in Option 1.
- To setuid per user the container must run as root and hold the home mount, concentrating
  privilege that is today spread across disposable containers.
- Container restart fails *every* user's tasks at once, and not promptly: tasks sit ACTIVE until
  the 5-minute timeout ([task.js:105,121](../modules/worker/src/task/task.js#L105)).

---

## Option 3 — Single permanent container, single process (in-process multi-tenancy)

One container, one node process, many users served by the worker-thread pool.

The framework carries some of this already: `Job` forwards `ctx.username` to the pool
([job.js:47](../lib/js/shared/src/worker/job.js#L47)) and `STICKY` binds a thread to a user while
their requests are in flight ([staticPool.js](../lib/js/shared/src/worker/staticPool.js)); and
`service.submit$(service, data)` already passes data to handlers
([service.js:54](../lib/js/shared/src/service.js#L54)), so `contextService` can become
`username => getContext$(username)`.

**Pros**
- Lowest steady-state memory: ~164 MiB base + ~86 MB per *active* user thread — roughly 120 MB
  cheaper per concurrent exporter than Option 1a/2, and the gap grows with concurrency.
- One container, one process: simplest deployment and monitoring surface.
- No per-export or per-user provisioning latency at all.

**Cons**
- Requires real multi-tenancy work in the task module, all of it subtle:
  - EE auth is **per-thread global**; the `getContext$()` subscription in
    [ee/initialize.js](../modules/task/src/jobs/ee/initialize.js) is **never unsubscribed**, so a
    stale subscription from user A's finished job re-authenticates a reused thread to A while B's
    export runs.
  - The four limiter services ([jobs/service/](../modules/task/src/jobs/service/)) are main-thread
    singletons — per-user today only *because* the container is per-user. Shared, they become
    global: `driveSerializer` at concurrency 1 is a cross-user head-of-line block.
  - `instances: 1` must grow, and a sticky thread is held for the whole export; the idle-pool wait
    queue is an unbounded FIFO with no timeout
    ([staticPool.js:237-245](../lib/js/shared/src/worker/staticPool.js#L237-L245)), so user N+1
    simply hangs with no state the GUI can show.
- One process now holds **every** active exporter's Google access token (a read-only mount of
  `${SEPAL_DATA_DIR}/sepal/home` suffices — credentials are mode 644 in 1777 dirs), where today
  the blast radius is one user's own instance.
- Class B in this topology is worse still: shared uid means files land with the wrong ownership
  unless every write is brokered, and GDAL/download load lands in the same process space.
- Widest blast radius of all options: one bug or one restart takes out all users' exports.

---

## Option 4 — Hybrid: Class A on the main instance, Class B in worker instances

Route by `operation` at the single choke point
([submitTask.js](../modules/worker/src/task/command/submitTask.js)): Class A goes to a main-instance
executor (any of Options 1–3), Class B keeps requesting an EC2 `TASK_EXECUTOR` session.

**Pros**
- Removes the instance exactly where it is pure waste: a polling loop that needs no CPU, no disk
  and no home mount.
- Class B keeps everything it genuinely needs — EFS mount, uid/gid, GDAL, dedicated CPU — and its
  cost profile (long, heavy, worth an instance-hour) is unchanged.
- Main-server contention stays bounded: Class A is the light half.
- Can be shipped incrementally, one operation at a time, with an easy revert per operation.

**Cons**
- **Two ways to run a task**, permanently: two lifecycles, two failure modes, two things to
  reason about in every future change to task handling.
- Class A on the main instance loses the session, and with it: token refresh (§Cross-cutting 3),
  billing (4), and the session-driven execute/fail/cancel plumbing (2) — each needing its own
  replacement. Class B keeps them, so both paths must be maintained.
- The heavier half — the one that actually costs instance-hours and boot latency for large jobs —
  is untouched; savings are limited to the cheap exports.
- If Option 1a is available, the hybrid is strictly more work for strictly less coverage: local
  containers remove EC2 for all seven types with no routing split at all.

---

## Variant E (orthogonal) — Delegate the EE work to `gee` with a dedicated export pool

Not a topology of its own but a change to *what the executor contains*, and it changes the
calculus for Options 2–4. Variant F below is a stronger form of the same move. The executor holds no `ee` at all: it calls `gee` to start the export
(returning an `eeTaskId`), persists that id, and polls status with short calls; `gee` gets a
second, dedicated scheduler so exports cannot starve interactive traffic.

Precedent already in the codebase: [batch/exportTask.js](../modules/gee/src/jobs/ee/batch/exportTask.js)
starts an `ee.batch.Export` and polls to a terminal state with cancel-on-unsubscribe
([exportTaskCleanup.js](../modules/gee/src/jobs/ee/batch/exportTaskCleanup.js), tested);
[batch/drive.js](../modules/gee/src/jobs/ee/batch/drive.js) is a per-user Drive client from
`sepalUser.googleTokens`; per-user EE auth is re-established per request from the `sepal-user`
header ([authenticate.js](../modules/gee/src/jobs/ee/authenticate.js)); and multiple named
schedulers are already supported ([scheduler.js:16-27](../lib/js/shared/src/worker/scheduler.js#L16-L27))
— gee's [job.js](../modules/gee/src/jobs/job.js) merely hardcodes one name.

**Pros**
- Option 3's multi-tenancy hazards **disappear**: no in-process `ee`, no per-thread global auth, no
  credentials polling, no worker threads in the executor.
- The executor stops needing the `task` image: no GDAL, no `sandbox-base` — 5.53 GB → a small
  alpine service, ~250–300 MB RSS → ~60–80 MB.
- Short calls release the sticky gee thread between polls, so the export pool is sized for
  concurrent **starts**, not concurrent exports — ten threads can carry hundreds of exports.
- Every call carries a freshly fetched token (`POST /google/refresh-access-token`,
  [userApi.js:398-402](../modules/user/src/userApi.js#L398-L402)), which dissolves the token-refresh
  blocker entirely.
- Persisting the `eeTaskId` makes **restart re-attach** natural — resume polling instead of
  starting a second export.
- Taken to its conclusion: an executor holding no EE and no filesystem is just a task registry with
  a poll loop, which the `worker` module already is — folding Class A orchestration into `worker`
  removes a container, the `workerGateway` hop, the `session_id` problem and the `/api/tasks`
  callback in one move.

**Cons**
- Porting: `toAsset.js` (295 lines), `toDrive.js` (142), `tableToAsset.js` (28) plus the Class A
  wrappers move into gee. (The recipe→expression logic mostly does not move — it is already in
  shared [lib/js/ee](../lib/js/ee/src/).)
- `samplingDesign.GEE` is a multi-round workflow with temp assets, `getInfo` round-trips and
  validation gates ([systematicExport.js](../modules/task/src/tasks/samplingDesign/systematicExport.js),
  [randomExport.js](../modules/task/src/tasks/samplingDesign/randomExport.js) — ~590 lines): it fits
  the model but the orchestrator must drive a real state machine. Stage it last.
- Only helps **Class A**. Class B's download + GDAL work cannot be delegated to gee at all.
- gee gains an export responsibility and a second pool to size; it still has no `mem_limit` or
  worker `resourceLimits`, so a dedicated pool contains contention, not memory.
- Get the granularity wrong — one long-lived gee job per export instead of short calls — and every
  objection from the companion doc returns (pool pinning, token expiry mid-job, restart orphaning).

---

## Variant F (orthogonal) — Per-request EE auth via the REST API

Also not a topology, and a strictly stronger version of Variant E: instead of isolating users with
*threads*, remove the thing that forces isolation at all. Build the expression graph in-process with
the client library, serialize it, and issue the HTTP call yourself with the **user's** bearer token.
Every request then carries its own identity, so one process can serve every user with no shared
auth state.

Prompted by [dfguerrerom/ee-client](https://github.com/dfguerrerom/ee-client/) — a Python package
that binds EE credentials to a session object rather than to global state, so each user reaches
their own private assets. It covers `get_info` / `get_map_id` / `get_asset` only (no exports), and
it works because the *Python* API lets a client be constructed with explicit credentials.

**Why the JS client cannot do that as-is** (verified against `@google/earthengine` 1.7.38 as
shipped): the auth token is a module-level singleton — `apiclient.authToken_` (`src/apiclient.js:1573`)
is read on every request (lines 383-385, 878-880), and `ee.apiclient.Call`'s constructor takes
`(callback, retries)` with **no credentials parameter** (lines 47-60). One module registry = one
identity; in Node that registry is per thread. **This single global is the root cause of the entire
isolation ladder in this report** — threads in gee, processes/containers/instances in task.

**The seams that make the workaround viable**, both present in the same shipped library:

- Serialization without transport: `ee.Serializer.encodeCloudApiExpression`, `toCloudApiJSON`,
  `encodeCloudApiExpressionWithSerializer`.
- The REST surface Class A needs: `image:export`, `table:export`, `value:compute`, `operations` and
  `:cancel` (plus `image:computePixels` / `table:computeFeatures` for interactive work).

Algorithm signatures loaded by `ee.initialize()` (`/algorithms`) are **user-agnostic** — fetch them
once with the service account and reuse them for graph building by all users.

**Pros**
- The only option that removes the executor entirely for Class A: no thread, no process, no
  container, no instance. Class A becomes a stateless orchestrator that can live directly in
  `worker` — no `session_id` problem, no `workerGateway` hop, no `/api/tasks` callback.
- Makes Variant E redundant for Class A: gee's value there was re-authenticating per request, which
  this does inline.
- Isolation becomes structural rather than conventional. The same change would fix gee's own
  per-thread auth ("isolation by convention, not construction" — companion doc §3) and puts its
  40-thread sticky pool up for reconsideration. That is plausibly a larger prize than exports.
- Token handling gets simpler, not harder: each call fetches a fresh token, so the ~1 h expiry and
  the session-driven refresh sweep stop mattering.
- Persisting the returned operation name gives restart re-attach for free, as in Variant E.

**Cons**
- **The real work is auditing `lib/js/ee` for implicit server round trips.** Any `getInfo` inside
  expression building goes through the global transport and must be re-routed explicitly, or the
  global state is back. The Class A path alone has
  [toAsset.js:92,101,273](../modules/task/src/jobs/export/toAsset.js#L92) and
  [toDrive.js:138](../modules/task/src/jobs/export/toDrive.js#L138), plus whatever the recipe
  factories do internally (asset metadata lookups and similar). The size of that surface is the
  main unknown in this option.
- SEPAL owns the request mapping: `ee.batch.Export.image.toAsset(...)` becomes hand-built
  `ExportImageRequest` bodies, including toAsset.js's tiling and ImageCollection
  create/replace/resume strategies (295 lines).
- Loses the library's retry/throttle (`RequestThrottle`, `calculateRetryWait`); SEPAL would lean on
  its own `autoRetry` / `eeLimiterService` instead.
- Off the supported client path for the export call — the REST API is public and versioned, but the
  library no longer shields SEPAL from wire changes.
- **Class B is untouched.** Downloads, GDAL and the home directory still need a container with the
  EFS mount and the user's uid, so this removes workers for Class A only.

**Cheap way to settle it:** serialize one real SEPAL export expression, `POST image:export` with a
user token, poll `operations`. If that round-trips, and the `getInfo` call sites can be routed
through the same explicit transport, Options 2, 3, 4 and Variant E all collapse into "orchestrate
Class A in `worker`, with no executor at all".

---

## Comparison matrix

Options 0–4 are topologies and mutually exclusive; Variants E and F are orthogonal choices about
*what the executor contains*, and F subsumes E for Class A.

| | 0. EC2 per user | 1a. Container per user | 1b. Container per export | 2. One container, multi-process | 3. One container, one process | 4. Hybrid (A local / B EC2) |
|---|---|---|---|---|---|---|
| Export types covered | all 7 | all 7 | all 7 | all 7 | Class A realistically | all 7 (split) |
| Task-module changes | none | **none** | none | supervisor only | substantial multi-tenancy | depends on A's topology |
| Worker-module changes | none | provider selection, port, cost/cap | + per-export lifecycle | + no-session lifecycle | + no-session lifecycle | + routing split |
| Per-user isolation | full (VM) | full (container) | full (container) | full (process) | **none** | mixed |
| Start latency | EC2 boot (up to minutes) | seconds | seconds per export | none | none | none for A |
| RAM per concurrent exporter | n/a (own VM) | ~250–300 MB | ~250–300 MB per *export* | ~165–250 MB | ~86 MB (+164 MiB base) | as chosen |
| Main-server load | none | Class B CPU/disk | Class B CPU/disk | Class B CPU/disk | Class B CPU/disk | Class A only (light) |
| Blast radius | one user | one user | one export | all users on restart | all users, always | all Class A users |
| Billing brake | intact | nominal | nominal | needs replacing | needs replacing | needs replacing (A only) |
| Token refresh | intact | intact | intact | needs task-driven sweep | needs task-driven sweep | needs it for A |
| Code paths for "run a task" | 1 | 1 | 1 | 1 | 1 | **2** |

---

## Cross-cutting concerns (apply to any option that drops the session)

1. **Token refresh — mandatory.** Extend the 5-minute sweep to usernames with PENDING/ACTIVE
   *tasks*, or have the executor pull tokens from the `user` module per call (Variant E gets this
   for free). Without it, asset export hard-fails (it requires a user account) and Drive export
   silently no-ops.
2. **Session lifecycle.** Either a sentinel session per user (no migration, but
   `closeSessionsWithoutInstance`, `closeTimedOutSessions`, `releaseUnusedInstances` and the budget
   path must all learn to skip it — each missed hole silently kills exports) or nullable
   `session_id` + a no-session branch in ~6 commands (a migration, more diff, models reality).
   Prefer the latter for anything long-lived.
3. **Restart recovery.** Task state lives only in RxJS Subjects; nothing persists the `eeTaskId`,
   so a naive resubmit starts a *second* EE export. Until Variant E lands, "fail fast and let the
   user resubmit" is the honest behaviour — and it should be visible in the UI.
4. **Capacity and abuse.** No session → no charge → the only brake becomes an unbounded queue. Any
   main-instance option needs a per-user cap on concurrent tasks plus a visible queued state.
5. **Deployment.** `task` is build-only today (`deps.json`, `"run": false`). A permanent service
   needs `run: true`, a compose service with explicit `mem_limit`/`cpus`, a monit dockercheck
   symlink and `check program` entry, and an entrypoint that does not derive its identity from a
   mounted home ([start.sh:6-14](../modules/task/start.sh#L6-L14)). It is already in
   `build-and-push-images.sh` (lines 67, 110).

---

## Recommendation

1. **Option 1a first.** Per-user task containers on the main server's Docker daemon remove EC2 for
   **all seven** export types with the task module untouched, keep isolation, and cost a container
   start instead of an EC2 boot. It is the best ratio of benefit to risk on the table, and it makes
   Options 2–4 unnecessary as a first step.
2. **Spike Variant F early**, because it is cheap to falsify and it changes what "later" should be:
   serialize one real export expression, `POST image:export` with a user token, poll `operations`,
   and audit `lib/js/ee` for implicit round trips. If it holds, Class A needs no executor at all and
   Variant F is the destination for it; if the round-trip audit turns up a wide surface, fall back
   to **Variant E** — short-call delegation to gee with a dedicated export pool, orchestrated from
   `worker`, which reaches nearly the same place through a supported path. Either way Class A stops
   costing a container, restart re-attach becomes possible, and Option 3 is moot — the
   multi-tenancy problem it would have solved stops existing.
3. **Options 1b and 3 are not worth it**: 1b pays a full node baseline per export for no isolation
   gain over 1a, and 3 buys ~120 MB per concurrent user in exchange for the widest blast radius and
   the subtlest bugs in the report.
4. **Option 2 only if** a single container is a hard operational requirement and Variant E is not
   on the table — it is the safe way to be single-container, but it reimplements in a supervisor
   what Docker already does in Option 1a.
5. **Option 4 (hybrid) is a consequence, not a goal.** If Variant E or F ships, Class A and Class B end
   up in different places anyway — but arrive there because Class A stopped needing a container at
   all, not because a routing split was chosen up front. Choosing the split first buys the smaller
   half of the savings and pays for two permanent code paths.
6. **Regardless of choice:** the token-refresh fix and the per-user concurrency cap are required
   for any topology that drops the session.
