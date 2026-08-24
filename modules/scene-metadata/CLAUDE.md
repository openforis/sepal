# CLAUDE.md - modules/scene-metadata

Maintains scene metadata database for Landsat and Sentinel-2 satellite imagery. Runs a background ingester **and** an HTTP server serving `/api/data` endpoints (gateway routes `/api/data` here).

## Commands

```bash
npm test              # Jest
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Initializes Redis and MySQL, starts the HTTP server, then runs the background ingester:
1. Initializes Redis (`initializeRedis`) and MySQL (`initializeDatabase`)
2. Starts the Koa HTTP server on port 80 (`startHttpServer`)
3. Downloads initial CSV files from USGS (if not previously initialized) via `initializeData`
4. Schedules periodic STAC-based updates via RxJS `timer()` + `exhaustMap()` (`scheduleUpdates`)

### HTTP Server (`src/httpServer.js`, `src/routes.js`)
Koa server (via `#sepal/httpServer`) on port 80 (env `HTTP_PORT`). Routes (all require `sepal-user` auth):
- `GET /healthcheck` — `{status: 'ok'}`
- `GET /map-api-keys` — returns `{google, nicfiPlanet}` from config
- `POST /best-scenes` — scores and greedily selects best scenes per area from `scene_metadata.scene_meta_data`
- `GET /sceneareas/:sceneAreaId` — returns all scored scenes for one area

The gateway forwards `/api/data/*` here after stripping the prefix, so `/api/data/map-api-keys` → `/map-api-keys`.

### Data Pipeline (ingester)
Two-phase approach:
- **Initial load**: Downloads CSV files from USGS, parses, loads into MySQL and Redis
- **Incremental updates**: Queries Earth Search STAC API for changed scenes at configurable interval (default: 60 min)

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
- **Atomic database switching**: Creates `scene_metadata_new`, populates, then renames `scene_metadata` → `scene_metadata_old` and `scene_metadata_new` → `scene_metadata`
- Schema exported as `SCHEMA` from `src/database.js`; used by both the ingester and `src/sceneRepository.js`

### Scene Query Side (`src/sceneRepository.js`, `src/sceneSearch.js`, `src/dataApi.js`)
- `sceneRepository.js` — reads `scene_metadata.scene_meta_data` with the Java-equivalent scoring SQL (`sort_weight = (1-w)*cloud_cover/100 + w*LEAST(ABS(doy-target), 365-ABS(doy-target))/182`) and greedy best-scene accumulation
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
- **Parallel loading**: `Promise.all()` for Landsat and Sentinel-2 operations
- **`exhaustMap()`**: Drops overlapping update requests
- **No GEE dependency**: The `POST /sceneareas` path (legacy GEE scene-area lookup) was removed — it was dead (GUI uses `/api/gee/sceneareas` directly) and broken against the current `gee` module. Only the 3 live endpoints remain: `/map-api-keys`, `/best-scenes`, `/sceneareas/:sceneAreaId`.
