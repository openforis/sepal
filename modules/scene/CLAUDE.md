# Scene

Landsat/Sentinel-2 catalogue ingester and HTTP query service. Owns the `scene` table in the Postgres `scene`
database; the gateway strips `/api/scene` before forwarding requests here. Commands: `npm test`,
`npm run testWatch`. Schema migrations only; see [database migrations](../../docs/database-migrations.md).

## Startup and HTTP

`src/main.js` initializes Redis and Postgres, obtaining `{db, created}`, then starts HTTP over the live table
before subscribing to `IngestionCoordinator.start$(created)`. Queries keep the previous catalogue during a
rebuild; the first catalogue is empty until a rebuild publishes, which with the STAC catch-up that follows takes
many hours from scratch. Initialization failure logs and exits with status 1.

Port defaults to 80 (`HTTP_PORT`). `src/routes.js` serves:

| Route | Authentication | Result |
| --- | --- | --- |
| `GET /healthcheck` | none | `{status: 'ok'}` |
| `GET /map-api-keys` | `sepal-user` | `{google, nicfiPlanet}` |
| `POST /best-scenes` | `sepal-user` | Scored, greedily selected scenes per area. |
| `GET /sceneareas/:sceneAreaId` | `sepal-user` | Scored scenes for one area. |

`DataApi` maps requests/results; `SceneRepository` owns read SQL and receives a db and clock.
`sceneSearch.js` parses date/season selections. Scoring is
`(1-w)*cloud_cover/100 + w*LEAST(ABS(doy-target), 365-ABS(doy-target))/182`.
Scene responses use `{id, dataSet, date, cloudCover, daysFromTarget}`.

## Ingestion ownership

`IngestionCoordinator` sequences initialization and updates. Ordered sources are Landsat, then Sentinel-2;
each supplies cold `download$()`, `load$({database, maxTimestamp, timestamp})` and
`update$({redis, database, timestamp})`. Downloads emit success after writers settle; loads emit one
checkpoint map, including `{}` when empty. Native Promise I/O is wrapped at these boundaries.

`SceneIngestor` owns the `staging`/`backup` schemas, bulk loading, publication and incremental insert SQL.
It uses the shared callback db, one connection per operation; preparation, each chunk load and publication
are each one transaction. `csv.js` owns streaming parsing and chunk files in `CSV_DIR`. Redis holds
initialization and per-collection checkpoints.

### Initial CSV rebuild

Assumes one rebuild at a time; no distributed lock or resumable chunks.

1. For a newly created database, reset Redis before reading the initialization marker. Existing databases
   retain Redis state. Rebuild when the marker is absent.
2. Prepare clean staging/backup schemas without touching the live table. Download source archives in
   parallel and drain all writers before reporting a failure. Replace archives only after temporary files finish.
3. Parse/load collections sequentially. Await each chunk writer and bulk load before preparing the next chunk;
   remove chunk files only after successful load. A chunk is streamed with `COPY … FROM STDIN` into the
   unlogged `staging.scene_load`, then appended to the unlogged, unindexed `staging.scene_rows` with its
   file position (`seq`, counting across chunks). Failures prevent publication. Restart rebuilds from scratch.
4. Publish in one transaction: copy the first row of each id (`DISTINCT ON (id) … ORDER BY id, seq`, so the
   first row with an id wins within and across chunks) into a logged, index-free `staging.scene`,
   build its primary key and search index under the migration's names, `ANALYZE` it, then
   `ALTER TABLE … SET SCHEMA` moves live to `backup` and staging to `public`. Building the indexes once
   instead of maintaining them row by row keeps chunk loads from slowing as the indexes outgrow memory.
   Save checkpoints, then the initialized marker, only after publication.
5. Clean staging/backup schemas separately and repeatably. Post-initialization cleanup failures log and retry
   next startup without preventing HTTP/scheduling; preparation cleanup must succeed before another rebuild.

Post-publication Redis failure retains the new live catalogue. Without an initialized marker, restart does
a fresh rebuild, never a blind repeat of the swap. Postgres/Redis are not one transaction. Failed temporary
files may remain and be overwritten on retry. An empty CSV field loads as NULL and fails its chunk.
Sequential chunk loading bounds pending work.

`CSV_DIR` is bind-mounted from the host; `start.sh` runs as root only to take ownership of it, then drops to
`node`. `scene` is derived data and is not backed up.

### Incremental STAC updates

A timer starts after 10 seconds and repeats every `UPDATE_INTERVAL_MINUTES` (default 60); `exhaustMap`
prevents overlapping cycles. `MIN_HOURS_PUBLISHED` defaults to 24. Dataset mapping is source-owned;
Landsat filters category/cloud cover and adjusts Landsat-7 cloud cover by 22 percentage points.

`updateLandsat$`/`updateSentinel2$` compose `updateFromStac$`; `updateFromStac` remains a Promise adapter.
Fetching can overlap sequential page inserts. Advance Redis only after all fetches/inserts succeed.
Fetch/write failures log and settle normally without checkpoint advancement; completed inserts remain and
retry uses `ON CONFLICT (id) DO NOTHING`. Initial checkpoint-read failures propagate. Empty streams settle normally;
checkpoint-write failure preserves inserted rows.

### Cancellation and limits

Unsubscribing `start$()` stops timers, later requests, queued inserts, later datasets and checkpoint writes.
Already-started Promise operations can finish and release their connections; cancellation does not undo them.
Initialization downloads/current CSV collection may finish, so a cancelled rebuild must not overlap a new one.
No successful-completion work runs through finalization. Fetching may buffer unbounded pages if writes lag.
Graceful shutdown, pool cleanup and startup-failure cleanup remain unimplemented.

## Calendar convention

All stored/query/response day-of-year values use UTC `dayOfYearIgnoringLeapDay`: subtract one after Feb 29
in leap years. Rebuild catalogues ingested with raw leap-year day numbers before relying on season boundaries.
The removed scene-area EE lookup is not part of this service; the GUI uses `/api/gee/sceneareas`.

## Verification

- `db.test.js`, `ingestionCoordinator.test.js`, `csvSources.test.js`: migration gating, reset policy,
  source sequencing, deferred I/O, download draining and cancellation through actual source/STAC composition.
- Repository/migration/ingestor integration tests: isolated real Postgres, duplicate handling, ordered inserts,
  fetch/write overlap, failure recovery, checkpoints and connection release.
- `rebuild.integration.test.js`: tiny gzip fixtures through parsing, `COPY` and publication; partial
  failure/restart, post-publication Redis failure and repeatable cleanup. Runs the ingestor as the role that
  owns its test database, since moving tables between schemas requires ownership.
- `filesystem.integration.test.js`: local HTTP downloads preserve complete archives on interruption.
- `routes.integration.test.js`: real HTTP with an in-memory repository.

Live providers, full-scale throughput and process/DB crashes during DDL are not covered. Injected workflow
failures do not establish a distributed Postgres/Redis transaction. HTTP-before-ingest
and fatal-exit wiring are checked by inspection, not a dedicated main unit test.
