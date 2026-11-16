# CLAUDE.md - modules/worker

SEPAL worker service (Node.js). Provisions worker instances and manages sandbox sessions. Owns the single
`worker` MySQL schema via Postgrator. Export tasks belong to `task-manager`.

## Database migrations

`migrations/` holds the portable schema stream. `migrations/legacy-import/` holds the one-off copy from `sdms`. Startup and import cleanup are described in [docs/database-migrations.md](../../docs/database-migrations.md).

## Commands
- `npm test` — Node test runner
- `sepal build worker` / `sepal start worker` / `sepal logs worker -r`

## Routes
- `GET /healthcheck` — returns `{status: 'ok'}`
- `/sessions/*` REST surface (see `src/workerSession/routes.js`)
  - `GET /sessions/app-sessions` — the current user's app↔session associations, `[{path, label,
    sessionId, host, status, instanceType}]`.
  - `POST /sessions/session/:sessionId/app` — body `{path, label, clientId}`; associates the app
    with the session, storing `clientId` (the browser ws client owning the tab) on the row. If a
    live association for that `(username, path)` already exists it wins — the existing
    `{sessionId, path, label}` is returned as-is rather than moved — but its `client_id` is
    refreshed to the requester (reconnect re-assert must disarm the old id's pending clientDown).
    Body `reassert: true` marks that reconnect replay: ownership is refreshed but NO deadline
    moves, because the socket dropping is not a user opening an app. Only a literal `true` counts.
  - `DELETE /sessions/app?path=…&clientId=…` — unbinds the app from its session (GUI tab close,
    or a takeover before re-opening the app elsewhere); the session stays open. Idempotent (204
    either way). Emits `SessionAppDissociated {…, clientId: owner, requestingClientId}` — the
    gateway closes the OWNER's tab when someone else dissociated it.
  - `POST /sessions/session/:sessionId/server/:endpoint` — start one of the sandbox's on-demand
    servers (`rstudio` | `shiny` | `jupyter`) on the session's instance, 204 once its port is
    listening. The sandbox image starts only `sshd` at boot (`autostart=false` on the other three),
    so the provision wait command covers port 22 alone and the terminal no longer waits for
    Jupyter. `sandboxServerManager` shares one in-flight start between concurrent callers but
    remembers nothing: every call execs `/script/sandbox-server.sh`, which exits 0 immediately
    for a server that is already listening. The gateway memoizes started pairs and forgets one
    when its proxy gets a refused connection, so the next call revives a server supervisord gave
    up on (FATAL). **Servers are never stopped**; they live until the container does.
  - The session ws protocol (`/session/ws`) handles `clientDown` by dissociating every
    association owned by that client (its tabs died with it), one event per app.
  - `POST /sessions/session/:sessionId/extend` — the Usage-panel keepAlive slider, body/query
    `{hours}`. A RATCHET, not an override: it can only move the deadline further out.
  - `POST /sessions/session/:sessionId/extend-now` — the Keep-it-running button on the expiry
    notification. 200 `{extended: true}`, or 409 when no ACTIVE session matched.
  - `POST /sessions/session/:sessionId/opened` — the one-shot "terminal opened" extension
    (ssh-gateway on connect). Apps reach the same ratchet through the app association instead.
  - `POST /sessions/session/:sessionId/dismiss-expiry` — "I saw it, don't email me". Does NOT
    move the deadline; the session still closes at T+grace.
  - `GET|POST /sessions/expiry/:token` — the expiry email's single management link.
    **UNAUTHENTICATED**: it is clicked from a mail client with no SEPAL session, and the HMAC token
    carries its own authority over that session's expiry decision, either way (the action is NOT
    signed in — the page it opens offers both buttons, so scoping the token would protect
    nothing). The GET only renders the page — a mutating GET would be fired by link scanners and
    preview fetchers, which for termination means destroying an instance nobody asked to destroy.
    Each button POSTs the same token back with a hidden `action` field (`extend` | `terminate`);
    an absent or unknown action does nothing and re-renders. The gateway routes
    `/api/sessions/expiry` before its authenticated `/api/sessions` entry.

## Session API keys
Every session is minted an `api_key` by `RequestSession` and
provisioned with it as `SEPAL_API_KEY`. `dockerInstanceProvisioner` REFUSES to create a container
without one (the caller's retry covers a lookup made before the row committed), so a worker never
starts unable to authenticate.

A worker authenticates back to SEPAL with Basic auth, empty username, key as password. The gateway
resolves it through `POST /sessions/api-key-authenticate` → `{username, sessionId, workerType}` and
injects the session as `sepal-session`.

Keys resolve only while the session is PENDING or ACTIVE; closing a session clears `api_key`, so the
last terminal callback of a session revokes its own credential.

## Session expiration
Lifetime is a stored `timeout_time` moved only by
`workerSessionRepository.extendSession` — one monotonic UPDATE that is also atomic with the
notification reset, which is what makes "any extension cancels the expiry" a guarantee rather than
a race. There is no other way to move a deadline.

- **A bare heartbeat extends nothing.** `update_time` is audit only. Only a real interaction does:
  input observed in an app iframe (gateway → `{interaction: true}` on the next beat), or pty atime
  advancing inside the container (the sampler).
- **The busy verdict** (`instanceUsage/busyVerdict.js`) extends on absolute cores / device GPU /
  network, clamped to `MAX_UNATTENDED_HOURS` from the last human interaction — so load alone can
  never keep a session alive forever. It does NOT stamp `last_interaction_time`; that is the whole
  cap mechanism.
- **`ExpireSessions`** @1 min: notify → email at +`NOTIFICATION_VISIBLE_MINUTES` → close at
  +`SESSION_GRACE_MINUTES`. Gated by `SESSION_EXPIRY_MODE` (`off` | `notify` | `enforce`,
  default `off`); the ratchets run regardless, so `off` still records deadlines.
- Every sweep transition is a compare-and-set guarded on what was observed. **The sweep may never
  act on a fact it read earlier.**
- `CloseTimedOutSessions` is now PENDING-only.

## Surviving a worker restart

The `worker` container restarts routinely — a deploy, an OOM kill, and in dev a nodemon reload
on every file save. Instance management recovers through these mechanisms:

- **The boot fails loudly.** A rejected `main()` exits non-zero so the Docker restart policy retries it.
  Left to log and hang, the process stayed alive on the MySQL pool's handles with no HTTP server,
  and Compose does not act on a failing healthcheck.
- **`provider.restore(instances)`** (`workerInstance/index.js`, before `backfillClaims`) hands the
  open sessions' instances back to a provider that keeps its world in memory. The LOCAL provider
  needs it; AWS implements it as a no-op because EC2 answers from tags.
- **`ReconcilePendingSessions`** @1min activates or re-provisions PENDING sessions whose
  provisioning nobody is driving any more. Provisioning is deduplicated by instance id in an
  in-process registry (`workerInstance/provisioningRegistry.js`), because `provisionInstance`
  opens by deleting the instance's containers — re-entering it destroys the work in flight.
  Release replaces the registry entry before ownership reads, permanently invalidating the old attempt.
  Its entry lasts only while that release attempt is running. A different session can replace a release
  entry; the durable-claim check still decides whether provisioning may proceed. Each provisioning
  attempt gets its own instance-bound Docker client, which
  checks that identity before and after every request, including helper cleanup. Cancellation
  bypasses Docker-availability retries. Teardown, probes and orphan cleanup use independent
  clients. Provisioning resolves credentials and validates its definition before scratch attachment
  or Docker changes. The outer command checks the durable claim owner first; a matching claim
  also covers EC2 reservation tags that are not yet visible. Its retry policy, single attempt
  and ownership check are separate functions; cancellation is rechecked after helper awaits.
- **Manual startup cancellation preserves known-warmed AWS hosts through stop and recovery.**
  Close the session, revoke its key and publish the billing cutoff before instance release. The
  cancellation request returns after EC2 accepts a normal stop; OS shutdown and storage cleanup
  continue under the same coordinated release promise. No forced stop or skipped OS shutdown.
  `ImageDiskWarm=true` records allocation from a ready stopped pool, using that pool's existing
  image-disk warm-up contract. It is independent of lifecycle state and survives reservations.
  Cold/unknown hosts, local instances and automated startup closures retain conservative retirement.
- **Recovery stays exclusively claimed.** `instance_claim.recovery_started_at` records intent before
  tagging `State=recovering` and submitting stop. The marker is a nullable addition in migration 002;
  the original session remains the claim owner. Recovery-tagged hosts survive the stray sweep and
  count toward future pool capacity, but never appear in ready allocation. Confirm `stopped` and
  await all tracked scratch preparation before detaching/deleting scratch and tagging pooled. A known
  attachment missing from cleanup is uncertainty. Failed storage history, shutdown failure or a
  ten-minute storage barrier deadline retires the host with its claim retained. A canceled Docker
  callback stays invalidated; old containers are removed before the next sandbox starts.
  Reclaim handles durable recovery before ordinary filtered absence or claim-age grace. After a
  restart, missing in-memory scratch history conservatively retires instead of guessing. Once
  termination is accepted, clear recovery intent and let existing gone-claim cleanup remove the row.
  A recovery older than the existing grace, absent from all inventory and returning an unfiltered
  by-ID NotFound can use coordinated gone-claim deletion. This remains an absence policy, not proof
  of termination. The orphan sweep also discovers claimless recovering hosts if they reappear.
  Ordinary release entries finish with their attempt; durable claims drive failed-retirement retries.
  Local retirement starts independent cleanup scoped to the retired ID, with orphan sweeping as backstop.
- **Completed instances retain normal reuse.** Undeploy, scratch deletion and the transition to idle
  precede claim removal. Cleanup/idle and claim deletion have separate error scopes. After the idle
  transition succeeds, claim deletion has no error path that can terminate the instance:
  a claim DELETE can commit and admit another session even if its response is lost. A failed DELETE
  clears the normal release gate; any surviving claim remains available to reconciliation.
  Contradictory reservation tags never discard a matching durable claim.
  A stale release of an idle unclaimed host finishes without acquiring a new claim or retiring it.
  Resuming retirement on an idle host requires the same durable claim, including legacy empty keys.
  `backfillClaims` is permanent reconciliation, not an upgrade shim.
- **A release belongs to one session.** It drops only that session's claim, leaves alone an
  instance reserved for another session, and joins a release of the same pair
  already in flight, so a late or duplicate release (Stop racing `ReclaimStaleClaims`) cannot tear
  down the instance the pool has handed on. Reconciliation preserves claims/gates while their matching
  release is in flight, even if inventory queries straddle an idle transition. Owned Docker cleanup
  uses the release predicate; later cleanup/idle calls and termination recovery recheck token identity.
  Gone-claim deletion occupies the same keyed release slot through DELETE settlement and gate
  completion. A later same-session release joins it instead of replacing its token. This coordination
  is local to the single worker process and its shared manager.
  Scheduled jobs run at a fixed delay after their previous
  run completes, so runs of one job never overlap.
- **No startup grace.** `ReconcilePendingSessions` and `CloseTimedOutSessions` run as one job, in
  that order, so a restart lands a missed activation before the timed-out sweep can see the PENDING
  row. `ExpireSessions` needs no head start: a deadline that passed during an outage earns a
  notification and the full grace, never a close. The former 2-minute grace, measured from process
  start, was what let a crash loop starve every closing sweep.

## Outstanding test-server acceptance for provisioning cancellation

At the 2026-11-16 handoff, the lifecycle fix and scratch deletion-flag retry repair had independent
approval and 1,025 passing automated tests. Live AWS acceptance remained outstanding. After a normal
test release, record the deployed build, action times, session/instance/volume IDs and logs for:

- Normal t1 start/stop: matching claim, DeleteOnTermination true, scratch deletion and a fresh `/tmp`
  in the next session.
- Actual host reuse before/after worker restart: fresh scratch and recovery of configured warm capacity.
- Manual PENDING cancellation of a warmed pooled allocation, both during Docker boot and after a
  mutation: user billing ends promptly; stop is accepted; claim/recovery intent remains until stopped
  and scratch cleanup completes; the host returns pooled and a later session gets fresh scratch.
- Pending scratch attachment: the stopped host remains unavailable until its successful completion;
  failure, uncertainty or the deadline retires it. Cold/local and automatic startup closure still retire.
- ACTIVE restart survival and PENDING restart-then-cancel retirement, including eventual cleanup.
- Release of an ACTIVE session with a claim older than eleven minutes racing immediate allocation.
- Three to five startup cancellations: eventual claim/volume cleanup and warmed-host recovery,
  preserving healthy capacity. Pool target 10 remains bounded; recovered ready/warmed hosts take
  priority over unnecessary warming replacements, and every eviction participates in claim arbitration.

Exact accepted-Docker/failed-termination races, interruption between EBS attachment and setting
DeleteOnTermination, and both release/reconciliation orderings with real MySQL connection loss also
remain untested. These require controlled fault timing; ordinary UI runs do not establish coverage.
Record skipped/deferred cases explicitly. The filtered-inventory assumption remains a separate policy
concern, and a stalled local daemon needs its own dev-env check. Live checks follow the test release;
they are not prerequisites for committing the fix.

## Session /tmp
A worker container's `/tmp`, `/var/tmp` and `~/tmp` are one Docker volume per instance, `sepal-tmp.{instanceId}`,
removed with the instance's containers on provision and undeploy, so every session starts with an
empty one. The provisioner creates it and sets its mode 1777 from a throwaway `{image}.prepare-tmp`
container; both mounts are `nocopy`, since Docker would otherwise fill the empty volume with what the
image's build left in `/tmp`. On the shared local daemon the orphan sweep also
removes volumes no live instance claims.

On AWS the volume lives on local disk, never on EFS:
- **Types with local NVMe SSDs:** `sepal-scratch.service` in the worker AMI formats them at every
  boot (RAID 0 when there are several) and mounts them over `/var/lib/docker/volumes` before Docker
  starts, so the plain volume lands on them.
- **Other types** get a blank 100 GiB gp3 EBS volume per session (`hostingService/aws/scratchVolumes.js`).
  `provisionInstance` has the provider attach it as `/dev/xvdg` (idempotent across retries), and the
  provisioner formats it as XFS with the host's `mkfs.xfs`, from a throwaway privileged container
  of the worker image chrooted into the host (`{image}.format-tmp.{instanceId}`), then creates the
  tmp volume on the device (`local` driver, `type=xfs`) before preparing it as above. Docker mounts it with the first container and unmounts it with the last, so
  `releaseInstance` undeploys, then has the provider detach and delete it, before dropping the claim.
  Volumes are tagged `Type=WorkerScratch` from creation and marked delete-on-termination once
  attached, including on retries that find an existing attachment. A failed flag update rejects
  provisioning so the normal retry can repair it. `sweep` deletes detached ones older than ten minutes.
  The worker's AWS credentials need
  `ec2:CreateVolume`, `AttachVolume`, `DetachVolume`, `DeleteVolume` and `DescribeVolumes`.

## Stopped-instance pool (AWS)
`STOPPED_POOL_SIZE` (default 0 = off) keeps that many stopped worker instances whose disk has already
been read from the AMI snapshot. A stopped instance costs only its EBS storage and can be started as
any instance type, so one type-agnostic pool serves every request. EC2 tag `State=pooled` marks
members; only `stopped` ones are candidates.

- `requestInstance` order: running idle instance of the type → oldest ready pooled instance
  (`ModifyInstanceAttribute` → `StartInstances` → tag reserved) → cold launch. A lost claim on a
  pooled instance moves to the next, so simultaneous requests share the pool instead of
  cold-launching past it. A failed pooled start (capacity, incompatible type) leaves it in the pool
  and cold-launches. It is
  tagged only once started; stopped recovery hosts remain unavailable until pooled safely.
  The request emits `InstancePendingProvisioning` itself, as for an idle instance; a pooled start is
  never tagged `Starting=true`, since the started-instance poll would provision it a second time.
- `SizeIdlePool` recycles: surplus idle instances fill the pool (oldest first) instead of being
  terminated. It pools or terminates a surplus instance only under an `instance_claim` (session id
  `pool-cycle`), the election a request runs before reserving, so it never takes an instance a
  request is reserving; that instance's pool slot goes to the next surplus instance. Warm-up launches (`T3aSmall`, user data = `prewarmVolume.sh` + `poweroff`) fill the
  rest, at most two warming at a time: with `VOLUME_INITIALIZATION_RATE` set, every launch draws on
  EC2's regional volume initialization quota, which session launches share. User data runs on the first boot only, so a pooled instance does not power off when started.
- Positive pool targets also trim excess ordinary members on the next sizing cycle, preferring ready,
  known-warm disks. Setting the target to 0 disables pool management and leaves existing members alone.
  Recovering hosts count toward future capacity, so trimming can remove a ready member before a
  recovery finishes; a later recovery failure can require another warm-up.
- `sweep` terminates pooled instances of another version, pooled instances still running an hour
  after their start (failed warm-up or stop), and stopped instances outside the pool/recovery — every other
  query sees only pending/running instances, so those would otherwise bill for their disk forever.
- Recycled instances only carry the blocks their sessions read; warm-ups are fully read.

## Worker AMI version (AWS)
`WORKER_AMI_VERSION` (default `SEPAL_VERSION`) names the build the worker AMI was made from. The worker
finds the AMI by that `Version` tag, tags its instances with it, and runs the `sandbox`
image of that tag, the one baked into the AMI, so the provisioner never pulls. A deploy reuses the
AMI while its content hash (`hosting-services/aws/sepal/worker-ami/worker_ami.py`) is unchanged, so
this is often an older build than the one deployed, and can move back when a change is reverted.
Instances of any other version are therefore stale, newer ones included, and are recycled.

## Budget enforcement
`POST /sessions/instance-type/:type` asks the budget module for a LIVE verdict first
(`POST /budget/check/:username`, `src/workerSession/budgetClient.js`) and throws the matching typed
error from `budgetErrors.js` when the user is over budget. `BUDGET_URL` configures the base URL.
The check sends the user's open sessions, which budget counts before their WorkerSessionRequested
event arrives, and `sessionManager` runs one request per user at a time, so concurrent requests
cannot all pass the same check.
A caller that retries names the session it asks for (`?sessionId=<uuid>`): a repeat answers with the
session its first attempt created instead of launching another instance. The GUI's Usage panel relies
on this to retry a start that timed out at the gateway.
The event-fed `lockedUsers` set is only the FALLBACK for when that call fails — it is empty after a
restart, so it must not be the authoritative gate. It remains what closes an over-budget user's
running sessions, via the `budget.UserBudgetExceeded` subscriber in `main.js`.

## Database schema

The `worker` schema holds:

- `worker_session`: persisted sessions, deadlines, API keys and instance references.
- `session_app`: `(username, app_path)` key mapped to `session_id`, `label` and nullable browser `client_id`.
  Application code removes rows when their session closes; there is no database foreign key. Client-down
  handling dissociates owned rows; ownerless rows are not swept by that event.
- `instance_claim`: `(instance_id, session_id, claimed_at)`, one claim per instance. Hosting-service inventory
  remains authoritative for instance state.
- `task`: historical rows retained solely for task-manager's one-off import from `worker.task`. Keep the
  worker's import from `sdms` until task-manager's import has completed everywhere; drop the table later.

Budget and scene metadata have their own schemas. Legacy reliable-message-bus and access-control tables in
`sdms` are not worker tables. Migration streams and cleanup are owned by the guide linked above.
