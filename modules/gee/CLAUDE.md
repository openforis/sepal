# CLAUDE.md - modules/gee

Google Earth Engine API service. Exposes GEE operations as REST endpoints for the frontend.

## Commands

```bash
npm test              # Node test runner
npm run testWatch     # Node test runner watch mode
```

Target one suite while working, from `modules/gee` in the dev-env container:

```bash
node --experimental-test-module-mocks --test test/jobs/recipeIdentity.test.js
```

## Tests

Automated tests live in `test/`, mirroring the `src/` tree they exercise (`test/jobs/ee/image/...`), as
`*.test.js` files.

`verify/` is separate: hand-run gates against live Earth Engine, outside any suite. The helpers those scripts
share are ordinary modules, and `test/verify/` covers them over fakes.

## Key Architecture

### Entry Point
`src/main.js` - Starts HTTP server with `#sepal/httpServer`, initializes scheduler with the `ROUND_ROBIN` strategy (any worker thread serves any user) over `GEE_INSTANCES` threads, half the cores by default.

### Import Maps
- `#sepal/*` -> shared library
- `#sepal/ee/*` -> EE wrapper library (`lib/js/ee`)
- `#gee/*` -> this module's `src/`
- `#config/*.json` -> config files

### Job Framework
`src/jobs/job.js` wraps all GEE operations:
1. Authenticates user (OAuth tokens from `sepal-user` header) or service account
2. Sets workload tag (`sepal-work-{jobName}`)
3. Runs in worker thread via scheduler

Jobs are in `src/jobs/ee/` organized by domain:
- `image/` - preview, bands, histogram, sample, sceneAreas, bounds, geometry
- `asset/` - metadata, list, createFolder, rename, delete
- `table/` - rows, columns, columnValues, query, map
- `ccdc/` - loadSegments
- `timeSeries/` - loadObservations
- `classification/` - nextReferenceDataPoints
- `datasets/` - dataset discovery
- `aoi/` - bounds calculation

### Routes
`src/routes.js` - 27 REST endpoints using Koa `stream()` pattern (returns RxJS observable as HTTP stream).

Key endpoints: `POST /preview`, `POST /bands`, `POST /sceneareas`, `POST /assetMetadata`, `GET /projects`, `POST /ccdc/loadSegments`, `POST /timeSeries/loadObservations`.

## Non-Obvious Conventions

- **Authentication per-request**: Each GEE call authenticates using the user's Google OAuth tokens from the `sepal-user` header. Falls back to service account.
- **Scheduler**: Named "GoogleEarthEngine", configurable instances via `--instances` CLI flag.
- **Config**: `src/config.js` uses `commander` for CLI args: `--gee-email`, `--gee-key-path`, `--google-project-id`, `--sepal-endpoint`, `--recipe-endpoint`, `--port`, `--instances`.
- **Recipe reads**: referenced recipes are read from the `recipe` module as the user the gateway authenticated on the request, installed per job by `src/jobs/configure.js`. There is no service-credential fallback.

## Earth Engine requests

The `EE runtime` job (default `before` of every job) initializes Earth Engine once per worker thread and installs
the REST transport; each task runs in its request's Earth Engine context (wrapped in `jobs/job.js`, built by `jobs/eeRequestContext.js`), so any
thread serves any user. Calls pass the `EERestLimiter` tiers `taskUser` → `taskGlobal` (task traffic only, identified by
`sepal-session` `workerType: 'task'`) before user → project → global, configured with
`EE_LIMIT_*` (`src/config.js`). `verify/restTransport.mjs` checks the transport against live Earth Engine.

## Task endpoints

Task containers keep the image of the release that started them while gee is redeployed, so the `/task/...`
endpoints must accept the previous release's requests: add fields, never rename or remove them within one
release.
