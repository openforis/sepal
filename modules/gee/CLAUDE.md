# CLAUDE.md - modules/gee

Google Earth Engine API service. Exposes GEE operations as REST endpoints for the frontend.

## Commands

```bash
npm test              # Jest
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Starts HTTP server with `#sepal/httpServer`, initializes scheduler with `STICKY` strategy (jobs stick to the same worker).

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
- **Config**: `src/config.js` uses `commander` for CLI args: `--gee-email`, `--gee-key-path`, `--google-project-id`, `--sepal-endpoint`, `--port`, `--instances`.
