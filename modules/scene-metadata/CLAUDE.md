# CLAUDE.md - modules/scene-metadata

Maintains scene metadata database for Landsat and Sentinel-2 satellite imagery. Runs a background ingester **and** an HTTP server serving `/api/data` endpoints (gateway routes `/api/data` here).

## Database migrations

`migrations/` holds the portable schema stream. There is no legacy import. Startup and import cleanup are described in [docs/database-migrations.md](../../docs/database-migrations.md).

## Commands

```bash
npm test              # Jest
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` constructs the adapters and starts ingestion before serving HTTP:
1. Initializes Redis (`initializeRedis`) and MySQL (`initializeDb`), which returns `{db, created}` after migrations
2. Constructs `SceneRepository` and `SceneIngestor` using the same DB adapter and pool
3. Subscribes to `IngestionCoordinator.start$(created)`. The coordinator resets Redis when the database was created, rebuilds from CSV when the initialization marker is absent, and schedules periodic STAC updates
4. Starts the Koa HTTP server (`startHttpServer`) only after the coordinator is ready. Startup failure is logged and exits with status 1, so failed initialization cannot leave a healthy HTTP-only process

### HTTP Server (`src/httpServer.js`, `src/routes.js`)
Koa server (via `#sepal/httpServer`) on port 80 (env `HTTP_PORT`). `main.js` builds the read repository,
the handlers and the routes and passes them to `startHttpServer`. Routes (all require `sepal-user` auth):
- `GET /healthcheck` — `{status: 'ok'}`
- `GET /map-api-keys` — returns `{google, nicfiPlanet}` from config
- `POST /best-scenes` — scores and greedily selects best scenes per area from `scene_metadata.scene_meta_data`
- `GET /sceneareas/:sceneAreaId` — returns all scored scenes for one area

The gateway forwards `/api/data/*` here after stripping the prefix, so `/api/data/map-api-keys` → `/map-api-keys`.

### Data Pipeline (ingester)
`src/ingestionCoordinator.js` owns initialization and update sequencing. Source adapters own downloads
and scene mapping; `csv.js` owns streaming parsing and chunk files; `SceneIngestor` owns SQL. The
coordinator uses RxJS `timer()` + `exhaustMap()` for periodic updates (default: 60 min).

`main.js` supplies an ordered `sources` array (Landsat, then Sentinel-2). Each source exposes
`download$()`, `load$({database, maxTimestamp, timestamp})` and `update$({redis, database, timestamp})`.
All defer effects until subscription. Successful downloads emit once after their writers settle;
loads emit one checkpoint map, including `{}` when no scenes qualify. CSV adapters wrap native I/O
at this boundary and compose collection loads sequentially; no parallel public Promise API is needed.

`start$(created)` receives the database creation outcome as a fact; database construction stays in
`main.js`/`db.js`. The coordinator resets Redis before reading its initialization marker when that
fact is true, so a recreated database cannot reuse an old marker. An existing database keeps its state.
The observable defers initialization until subscription, emits readiness once the update scheduler is
active, and remains subscribed for the scheduler's lifetime. `main.js` starts HTTP from that emission.
The coordinator composes observables throughout initialization and updates, wrapping Promise-based
DB and Redis operations at their boundaries. The same subscription owns
the active Landsat/Sentinel update and its STAC pagination, without an intermediate Promise adapter.

Initialization assumes **one rebuild at a time**; there is no distributed lock or resumable chunk loading:
- **Before publication:** prepare clean staging/backup schemas while retaining the live catalogue.
  Download archives in parallel, waiting for all writers to settle even after a download fails. Parse
  and load collections sequentially. Download, parsing and bulk-load errors propagate and prevent
  publication; a restart discards staging and downloads/reloads from the beginning.
- **Publication:** rename the live and staged tables in one statement only after every load succeeds.
  Dataset checkpoints are derived during parsing, but are saved to Redis only after publication. Set
  `initialized` only after checkpoint persistence succeeds.
- **After publication:** if checkpoint or initialization-marker persistence fails, keep the newly
  published live catalogue. With no marker, the next startup does a complete fresh rebuild; it never
  blindly replays the table swap. MySQL and Redis are not wrapped in a transaction.
- **Cleanup:** disposal of staging and backup schemas is separate and repeatable. A failure after
  initialization is logged and retried at the next startup, without failing the data load or preventing
  scheduling/HTTP. Cleanup needed to prepare a new rebuild must succeed before loading starts.

Downloads replace an archive only after its temporary file is complete. CSV processing waits for each
chunk file to finish writing before bulk loading it, then removes it only after a successful load.
Scene selection/checkpoint tracking, chunk formation and chunk loading are local stages in an awaited
Node stream pipeline; a reported failure leaves no detached chunk consumer running. Failed
chunks/archives can remain on disk and are overwritten by the next attempt;
file removal is best-effort cleanup. The existing `LOAD DATA ... IGNORE` conversion and duplicate
semantics remain unchanged; this is not a new validation policy for MySQL warnings.

CSV parsing and preparation of the next chunk now wait for the current bulk load. Previously, chunk
preparation could overlap ingestion. This bounds pending work and simplifies failure handling, but its
production-scale performance cost is unmeasured. STAC fetching and insertion still overlap.

`updateLandsat$` and `updateSentinel2$` compose `stac.js`'s shared `updateFromStac$` directly.
`updateFromStac` remains an outer Promise adapter for callers that need one.
The observable defers effects until subscription. Pagination can fetch ahead while inserts execute
sequentially in page order; Redis advances only after fetching and every insert succeed. Fetch/write
failures are logged and settle normally, without advancing the checkpoint. Completed writes remain,
and an already-started insert may finish. A retry ignores stored scene IDs through `INSERT IGNORE`.
Failure to read the initial checkpoint propagates; empty page streams settle normally.

Unsubscribing from `start$()` cancels future timer cycles and propagates into the active source update,
stopping subsequent requests, queued inserts, later datasets and checkpoint writes. An already-started
Promise-based operation may finish and release its connection; unsubscription neither cancels that
operation nor undoes its effects. During initialization, active downloads or the current CSV collection
can finish, but cancellation prevents later collections and workflow operations from starting. The single-rebuild assumption
still applies: cancelling a subscription does not make its active adapter work safe to overlap with a
new rebuild. Cancellation does not run successful-completion or checkpoint work through finalization.
Signal handling and graceful shutdown remain follow-ups. Fetching can still outpace writes and buffer
unbounded pages, as in the original STAC workflow.

### Satellite Support

**Landsat** (`src/landsat.js`, `src/landsatCsv.js`, `src/landsatStac.js`):
- `DATASET_BY_PREFIX` maps scene ID prefixes to dataset names
- Filters by collection category and cloud cover
- Adjusts cloud cover for Landsat 7 (+22%)

**Sentinel-2** (`src/sentinel2.js`, `src/sentinel2Csv.js`, `src/sentinel2Stac.js`):
- Similar pipeline structure to Landsat

### Database
MySQL (`scene_metadata` schema — **not** the old `sdms` schema):
- Table: `scene_meta_data` with scene properties and indexes
- `src/db.js` has one entry point, `initializeDb`: shared `initDb` applies the permanent schema
  migrations before creating one pool and wrapping it with shared `createDb`. Initialization returns
  `{db, created}` to `main.js`. Nothing is copied from `sdms` since the table is rebuilt from CSV on
  first run.
- `src/sceneIngestor.js` owns staging database creation/deletion, `CREATE TABLE ... LIKE`, CSV bulk
  loading, table replacement and incremental inserts. These are ingestion operations, not migrations.
  Schema names are derived from the injected connection's database: production publication renames the
  live `scene_meta_data` table into `scene_metadata_old` and the staged table from `scene_metadata_new`
  into `scene_metadata` in one statement. Tests use their own randomly named schemas.
- `SceneIngestor` receives the shared callback-scoped DB API. Its public operations are `prepare`,
  `ingest`, `publish`, `cleanup` and `insert`. Each operation scopes its SQL with `db.withConnection`,
  releasing the connection on success or failure. Incremental inserts target `scene_meta_data` in the
  injected database. Connections are acquired only for SQL work, independently of pagination; an insert
  can overlap a fetch. No SQL transaction is opened.
- Rebuilds leave binary logging at its configured setting and do not change global
  `innodb_flush_log_at_trx_commit`. Removing those overrides changes operational behavior: this MyISAM
  load no longer changes other modules' InnoDB durability, and configured binary logging can add load
  time and log volume. No requirement for binary-log suppression was found in the repository notes.
- `db.js` installs no signal handler. Normal SIGINT termination is restored, without graceful shutdown.
  Shared pool closing, module shutdown ordering and startup-failure cleanup remain follow-ups.

### Verification boundaries
- `db.test.js` checks migration gating and the creation outcome. The coordinator tests own the
  Redis-reset decision for recreated/existing databases, readiness, scheduling and initialization
  failure. The former `main.test.js` construction/transcript harness is removed. HTTP starting from
  readiness and fatal exit status 1 remain composition-root wiring, reviewed by inspection rather than
  exercised by a dedicated main unit test.
- `ingestionCoordinator.test.js` exercises the real source-update/STAC chain with controlled page
  retrieval and storage ports. It checks initialization policy, source ordering, cancellation during pending fetches/inserts,
  withholding later datasets and timer cycles, cancellation during a CSV load, and download draining
  before failure is reported. Real connection release remains covered at the ingestor boundary.
- `csvSources.test.js` exercises the public source adapters with controlled native download/CSV
  operations: deferred downloads, explicit success, draining after failure and cancellation between
  Landsat collections. It does not substitute the source adapters themselves.
- `sceneRepository.integration.test.js` and `databaseMigrations.integration.test.js` exercise real MySQL
  in isolated test databases. `sceneIngestor.integration.test.js` uses `createTestDb`'s restricted adapter
  to check insert/readback, duplicate handling, recovery after failed inserts, and the real STAC workflow
  through the ingestor with page retrieval and Redis checkpoint storage substituted. It checks fetch/insert
  overlap, ordered writes, checkpoint advancement, partial progress after fetch/write failures, retries,
  empty results and checkpoint-read failure. A checkpoint-write failure leaves stored rows intact and a
  retry advances the checkpoint without duplicates. Cancellation tests cover pending pages and an
  already-started insert with queued work, including connection release and withholding checkpoint writes.
  `routes.integration.test.js` exercises real HTTP with an in-memory repository.
- `rebuild.integration.test.js` runs both CSV adapters with tiny gzip fixtures through real parsing,
  `LOAD DATA INFILE` and table publication. It checks empty checkpoint emissions when no scenes qualify,
  complete chunks, partial-load restart, failed
  downloads/parsing/loads, post-publication checkpoint/marker failures and repeatable cleanup. Only its
  test provisioner adds DDL access to the three isolated schemas and the FILE privilege required by
  server-side bulk loading; production schemas and application data are never test targets.
- `filesystem.integration.test.js` exercises downloads through a local HTTP server, including an
  interrupted response that must not replace an existing complete archive.
- External provider downloads, live STAC retrieval, production-scale CSV performance and process/DB
  crashes during DDL are not exercised. Recovery tests inject failures between workflow operations;
  they do not establish crash-atomic MyISAM DDL or a distributed MySQL/Redis transaction.

### Scene Query Side (`src/sceneRepository.js`, `src/sceneSearch.js`, `src/dataApi.js`)
- `sceneRepository.js` — `SceneRepository`, built on an injected db and clock; reads
  `scene_metadata.scene_meta_data` with the Java-equivalent scoring SQL (`sort_weight = (1-w)*cloud_cover/100 + w*LEAST(ABS(doy-target), 365-ABS(doy-target))/182`) and greedy best-scene accumulation
- `sceneSearch.js` — date/day-of-year helpers (leap-day-ignoring `dayOfYearIgnoringLeapDay`) and query-parsing from client JSON
- `dataApi.js` — Koa handlers assembling responses in the `DataSearchEndpoint` shape (`{id, dataSet, date, cloudCover, daysFromTarget}`)
- `currentUser.js` — `requireAuth`/`parseCurrentUser` guard (sepal-user header)

### State Tracking (Redis)
- `getInitialized()`/`setInitialized()` - Tracks if initial CSV load completed
- `getLastUpdate()`/`setLastUpdate()` - Tracks per-collection STAC update timestamps

## Non-Obvious Conventions

- **Dual role**: background ingester + HTTP server run in the same Node process
- **`scene_metadata` schema**: table is `scene_meta_data`; ingester owns writes; read repo queries it
- **Leap-day-ignoring day-of-year**: The ingester writes raw day-of-year (date-fns `getDayOfYear`) into the `day_of_year` column. The reader's `target` param uses `dayOfYearIgnoringLeapDay` (if leap year and dayOfYear > 60, subtract 1), matching the Java reader for consistent scoring. The `daysFromTarget` response field uses raw DOY (not leap-ignoring) to compute the circular day difference.
- **MIN_HOURS_PUBLISHED**: Only loads scenes published at least 24 hours ago (configurable)
- **Timer with initial delay**: 10 seconds before first update cycle
- **Parallel downloads, sequential loads**: downloads drain on failure; loads must all finish before publication
- **`exhaustMap()`**: Drops overlapping update requests
- **No GEE dependency**: The `POST /sceneareas` path (legacy GEE scene-area lookup) was removed — it was dead (GUI uses `/api/gee/sceneareas` directly) and broken against the current `gee` module. Only the 3 live endpoints remain: `/map-api-keys`, `/best-scenes`, `/sceneareas/:sceneAreaId`.
