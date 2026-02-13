# CLAUDE.md - modules/scene-metadata

Maintains scene metadata database for Landsat and Sentinel-2 satellite imagery. Background worker only - no HTTP routes.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - **No HTTP server**. Background worker that:
1. Initializes Redis and MySQL on startup
2. Downloads initial CSV files from USGS (if not previously initialized)
3. Loads data into database
4. Schedules periodic STAC-based updates via RxJS `timer()` + `exhaustMap()`

### Data Pipeline
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
MySQL (`sdms` schema):
- Table: `scene_meta_data` with scene properties and indexes
- **Atomic database switching**: Creates new DB, populates, then renames current->old and new->current

### State Tracking (Redis)
- `getInitialized()`/`setInitialized()` - Tracks if initial CSV load completed
- `getLastUpdate()`/`setLastUpdate()` - Tracks per-collection STAC update timestamps

## Non-Obvious Conventions

- **No HTTP server** - purely a background data pipeline
- **MIN_HOURS_PUBLISHED**: Only loads scenes published at least 24 hours ago (configurable)
- **Timer with initial delay**: 10 seconds before first update cycle
- **Parallel loading**: `Promise.all()` for Landsat and Sentinel-2 operations
- **`exhaustMap()`**: Drops overlapping update requests
