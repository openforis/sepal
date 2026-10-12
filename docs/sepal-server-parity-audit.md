# sepal-server → Node modules: parity audit

**Date:** 2026-08-06
**Branches compared:** `sepal` (compacted rewrite) vs `master` (`da3345913`, the merge base)
**Scope:** the Java/Groovy `sepal-server` monolith — 355 files, 256 under `src/main`, 10 components —
and everything that replaced it.

**Verdict:** functional coverage is complete and the ports are high-fidelity. One regression is a
release blocker — §4.1, AWS instance types. The rest are minor. (§4.2, recipe migrations, was
initially filed as a second blocker and has since been withdrawn — see that section.)

## 1. Component mapping

| `sepal-server` component | Files | Replacement |
|---|---:|---|
| `workersession` | 41 | `modules/worker/src/workerSession/` |
| `workerinstance` | 23 | `modules/worker/src/workerInstance/` |
| `task` | 25 | `modules/worker/src/task/` |
| `hostingservice` | 12 | `modules/worker/src/hostingService/` |
| `budget` | 31 | `modules/budget/` |
| `processingrecipe` | 32 | `modules/recipe/` |
| `notification` | 14 | `modules/message/` |
| `datasearch` | 25 | `modules/scene-metadata/` |
| `sandboxwebproxy` | 11 | `modules/gateway/src/sandbox/` |
| `files` | 13 | *none — dead code* |

`FilesComponent` was never passed to `Endpoints` in `Main.groovy` and no gateway route reached it,
so it was unreachable in `master`. Dropping it is correct, not a gap.

## 2. Coverage

Every Groovy command, query, event, scheduled job and repository method has a counterpart.
Schedules match exactly:

| Interval | Jobs |
|---|---|
| 1 min | CloseTimedOutSessions, CloseSessionsWithoutInstance, ReleaseUnusedInstances(5 min), SizeIdlePool, CancelTimedOutTasks |
| 5 min | RefreshGoogleTokens |
| 12 min | RemoveOrphanedTmpDirs (+ RemoveOrphanedContainers, new) |
| 1 h | UpdateSpendingReport (+ ReconcileOpenSessions, new) |

`CloseSessionsForUsersExceedingBudget` (@11 min in Groovy) became event-driven — see §4.4.

Every job keeps Groovy's immediate first run, with one deliberate exception added after this audit
(2026-08-07): `CloseTimedOutSessions` is inert for its first 2 minutes — see §3.7. The schedules
are otherwise unchanged; §3.8 changes what CloseSessionsWithoutInstance may conclude, not when it
runs.

### 2.1 HTTP surface

All Groovy routes are present except three deliberate drops:

| Dropped | Assessment |
|---|---|
| `POST /data/sceneareas` (`FindSceneAreasForAoi`) | No consumer in `master` outside the endpoint itself. Safe. |
| `GET /tasks` (+ `outputPath`/`destination`/`status` filters) | Replaced by ws push; filtering moved client-side into `widget/assetDestination.jsx` and `widget/workspaceDestination.jsx`. |
| `spending` / `budgetUpdateRequest` on `GET /sessions/report` | Moved to the budget module's ws + `GET /api/budget/report`; `widget/budgetMonitor.jsx` writes the same store paths the GUI already read. |

Additions beyond the Groovy surface: `GET /sessions/active`, `GET /sessions/open`,
`GET /sessions/app-sessions`, `GET /sessions/:username/usage`, `POST /sessions/session/:id/app`,
`DELETE /sessions/app`, `GET /budget/spending/:username`.

### 2.2 Deployment plumbing

Complete and internally consistent:

- `modules/ops/script/build-and-push-images.sh` — `build` + `push` for all four new modules.
- `hosting-services/aws/sepal/deploy.yml` — `worker`, `budget`, `message`, `recipe` present;
  `ldap`, `ldap-backup`, `user-node`, `sepal-server` removed. Order is correct: `user` → `budget`
  → the four replacements → GUI/ssh-gateway/terminal → **gateway last** (it repoints `/api/*`).
  Transition notes cover the one-time `docker rm -f sepal` / `docker rm -f user-node` container-name
  collisions.
- monit — `dockercheck-*` symlinks and `check program` entries in `monit.d/docker-containers` are
  exactly symmetric (no orphan on either side).

Minor ordering wrinkle: `budget` starts before `worker` but its boot seed calls the worker's
`GET /sessions/open`. Handled — `budget/src/main.js` catches the seed failure; the hourly
reconciler heals `open_session_use` within an hour.

## 3. Pre-existing bugs fixed

1. **AWS `retry()` swallowed the final exception.** Groovy's loop bound
   `for (retries = 0; retries - 1 < tries; retries++)` exits *after* the last catch without
   rethrowing, so `tagInstance`'s "terminate on persistent tag failure" path was dead code.
   `awsInstanceProvider.js` rethrows. Note the live consequence: tagging failures now really do
   terminate the instance.
2. **Heartbeat on a CLOSED/unknown session returned 200.** Now 404
   (`workerSession/command/heartbeat.js`), letting the gateway prune stale app→session cache
   entries instead of resolving every app to a dead instance forever.
3. **RStudio first-launch redirect** — the `Location` rewrite no longer drops the trailing slash.
4. **Scheduled sweeps aborted on the first failure.** Groovy's bare `each` loops in
   `CloseTimedOutSessions`, `CloseUserSessions`, `RefreshGoogleTokens` and `CancelTimedOutTasks`
   propagated the first exception and skipped the remainder. Every Node port isolates each item.
5. `RemoveOrphanedTmpDirs` NPE'd when `/data/home` was absent; `listDirs` tolerates it.
6. The notification `LEFT JOIN … AND (n.username = ? OR n.username IS NULL)` could match foreign
   rows; the `message` module's join is correct.
7. **A worker outage longer than the session timeout closed every open session on restart**
   (fixed 2026-08-07, after this audit). `CloseTimedOutSessions` ran immediately at startup, but
   `update_time` can only be refreshed while the worker is up — so after an outage every open
   session looked timed out, and the sweep beat the gateway's 30 s heartbeat to it. The sweep now
   stays inert for 2 minutes after `start()` (`STARTUP_GRACE_MS`), giving the heartbeat senders
   four cycles to re-assert liveness. Groovy had the identical exposure; this is the one place the
   schedules in §2 deliberately diverge. Live verification of the fix:
   `docs/instance-stopping-simulation.md`.
8. **A transient Docker-API failure closed live sessions** (fixed 2026-08-07, after this audit).
   `isProvisioned` collapsed every error — connection refused, timeout, 5xx, DNS — into the same
   `false` as a genuine "no such container", so one blip closed the session row and
   `ReleaseUnusedInstances` terminated the still-live machine 5 minutes later. The probe now
   returns `PROVISIONED | MISSING | UNKNOWN` (`workerInstance/instanceStatus.js`); only a
   Docker-issued denial can close a session, and only when confirmed on two consecutive sweeps
   (`workerSession/missingInstanceTracker.js`), with a 30-minute backstop so an unreachable host
   still cannot bill forever. The same change replaced the probe itself: it execed the image's
   `waitCommand` but never read the exit code, so it was paying for a `netstat` poll inside every
   container of every ACTIVE session every minute — with no timeout — to learn only what
   `GET /containers/{name}/json` returns instantly. Groovy had the identical defect
   (`DockerInstanceProvisioner.groovy:52-64`). Live verification:
   `docs/instance-stopping-simulation.md`.

## 4. Regressions

### 4.1 CRITICAL — AWS instance-type identifier mismatch

**AWS deployments cannot start sessions.** Everywhere else `instance.type` is the catalog **id**
(`T3aSmall`): `dockerInstanceProvisioner.js:257` does `instanceTypeById[instance.type]`,
`sizeIdlePool` keys its target map by `t.id`, ssh-gateway posts `instance-type/T3aSmall`, and the
local provider echoes the id back. The AWS provider breaks that contract in three places:

| Location | Problem |
|---|---|
| `hostingService/aws/awsInstanceProvider.js:184` | `InstanceType: instanceTypeName` sends `T3aSmall` to `RunInstancesCommand`, which requires `t3a.small`. Every launch fails. |
| `hostingService/aws/awsInstanceProvider.js:62` | The `instance-type` filter gets the id, so no idle instance ever matches. |
| `hostingService/aws/awsInstanceProvider.js:88` | `type: awsInstance.InstanceType` reads back `t3a.small`, so `sizeIdlePool`'s grouping never intersects the target map (target 0 → terminates all idle instances every minute) and provisioning throws `Unknown instance type`. |

Groovy had no such split: it kept the AWS SDK v1 enum **name** internally and converted only at the
API boundary — `instanceType as InstanceType` on launch, `.toString()` (→ value) in the filter,
`InstanceType.fromValue(...).name()` (→ name) on read-back.

**Fix:** map id↔name inside the AWS provider. The catalog already carries both fields, and
`instanceTypes.js` ids/names were verified identical to Groovy for all 61 AWS and 43 local types.

**Why it escaped:** `modules/worker/src/hostingService/` has tests only for `instanceLaunchErrors`
and `instanceTypes` — none for the AWS provider — and live testing ran on the local dev stack.

### 4.2 NOT A DEFECT — recipe migrations are intentionally stubbed out

`recipe/src/migration/registry.js` contains only baseline markers (`MOSAIC: {8: false}`, …). The
version numbers are right (they match Groovy's `max(key) + 1` for all ten types), but the 24 real
transforms from `MosaicMigrations`/`CcdcMigrations`/… (V3–V7) were not ported.

**Initially filed as a blocker; withdrawn after checking the save path.** Confirmed by the project
owner (2026-08-06) that every recipe in every environment is already at its current type version and
old recipes will never need migrating. The residual risk I raised — an imported or restored old
recipe file getting re-stamped without transformation — **does not exist, and never did**:
`recipe/src/recipeApi.js:43` sets `typeVersion: currentVersionForType(type)` on every save,
ignoring any version the incoming contents claim, and Groovy's `SaveRecipeHandler` did the same
(`recipe.withTypeVersion(migrations.currentVersion)`). There was no migration-on-import path in
`master` to lose. The engine only ever applied to rows already in the DB whose `type_version`
predated a version bump.

`migrateRecipes.js` is therefore a no-op in practice: its
`listRecipesOfTypeBeforeVersion(type, current)` query returns nothing.

Forward-looking note, not a defect: the registry is designed for *future* migrations (add a real
transform keyed at the next version and the engine folds it). The invariant to preserve is that a
version bump always ships with its transform — bumping a baseline marker alone would re-stamp any
below-version row without transforming it.

### 4.3 MEDIUM — budget enforcement at session request is now eventually consistent

Groovy's `RequestSession` called `budgetManager.check()` synchronously and distinguished three
failures: instance budget, storage budget, storage quota.
`workerSession/command/requestSession.js` consults the in-memory `lockedUsers` set fed by
`budget.UserBudgetExceeded` / `UserBudgetCleared`. Consequences:

- `lockedUsers` starts **empty on every worker restart** — an over-budget user can start sessions
  for up to one hourly budget cycle.
- The three error types collapse to `InstanceBudgetExceeded`; storage-budget and storage-quota
  rejections are no longer distinguishable to the caller.
- `budgetManager.check()` still exists in the budget module but nothing calls it.

(HTTP status for a refused `/sessions/instance-type` is 500 in both branches — Groovy's
`common/.../Server.groovy` had no exception mapping either. Not a regression.)

### 4.4 MEDIUM — no retry when closing an over-budget user's sessions

Groovy re-ran `CloseSessionsForUsersExceedingBudget` every 11 minutes, so a failed close was
retried. `worker/src/lockedUsers.js` fires `closeUserSessions` only on the **edge** (`isNew`) and
swallows the result, and `closeUserSessions` logs-and-skips per-session failures. Budget
re-publishes `Exceeded` every hour (level-triggered), but the `isNew` guard suppresses it — so a
partially-failed close is never retried.

### 4.5 LOW

| # | Finding |
|---|---|
| a | `budget/src/budgetRepository.js:44` — `userInstanceUses` ignores its `year`/`month` arguments and selects **all** `open_session_use` rows for the user. Results stay correct (`hoursToCharge` clamps to the month), but the table is never pruned so the query grows unbounded. Groovy filtered in SQL. |
| b | Sessions that never activate aren't charged. Groovy's `instance_use` view charged from `creation_time` in any state; the Node row opens only on `WorkerSessionActivated`. The hourly reconciler partially compensates (it reads PENDING+ACTIVE). |
| c | `task/task.js` `update(task, state, '')` persists an empty `statusDescription`; Groovy's `?:` fell back to the state's default description. |
| d | `budget/src/budgetRepository.js` uses local-time `getFullYear()`/`getMonth()` for the `user_monthly_storage` year/month key while `budget/src/dateTime.js` is UTC throughout. Diverges only if `TZ` ≠ UTC. |

## 5. Areas verified equivalent

Read line-by-line against the Groovy originals, no divergence found:

- Session lifecycle: request / close (two-transaction ordering) / activate-on-instance /
  close-on-instance / timeouts (`earliest_timeout_time` as an AND guard) / heartbeat semantics
  (`update_time` bumped only when ACTIVE) / api-key nulling on close.
- `workerSessionRepository.js` SQL vs `JdbcWorkerSessionRepository.groovy`, including the
  two-variant `update` and the `mostRecentlyClosed*` group-bys.
- Task state machine, i18n status-description JSON, and timeouts (PENDING 10 m, ACTIVE 5 m,
  CANCELING 2 m); `UpdateTaskProgress`'s three guard branches and after-commit close/heartbeat.
- Budget arithmetic: per-use `Math.ceil` before summing, month clamping, gb-hours trapezoid
  accumulation, `spending >= budget` / `use > quota` thresholds, `costPerGbMonth` 0.33.
- `sessionsApi.js` report DTO: `hoursSince` (floor-minutes then ceil-hours), `round2`,
  `yyyy-MM-ddTHH:mm:ss` creation time, self vs admin `path` forms.
- Scene search: the scored SQL, `sort_weight` formula, wrap-around day-of-year constraint,
  `dayOfYearIgnoringLeapDay`, and the `selectBest` cumulative-cloud-cover loop.
- Instance-type catalogs — ids and names identical to Groovy for all 61 AWS and 43 local types.

## 6. Test evidence

Run in the `sepal-dev` container on 2026-08-06:

| Module | Result |
|---|---|
| worker | 631 passed, **1 failed**, 57 skipped (40/45 suites) |
| budget | 116 passed, 17 skipped |
| recipe | 35 passed |
| message | 54 passed |
| scene-metadata | 75 passed |
| gateway | 110 passed |

The worker failure is `waitUntilDockerIsAvailable › succeeds after transient errors then success` —
the known pre-existing fake-timer leak, unrelated to any finding here. The skipped suites are the
five `*.integration.test.js` files, gated on a live MySQL.

No test covers the AWS instance provider (§4.1).
