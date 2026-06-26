# CLAUDE.md - modules/task

Task execution module. Runs inside sandbox containers (not a standalone service). Handles GEE exports and data processing.

## Commands

```bash
npm test              # Jest with jest-expect-message
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Single worker instance, HTTP server, scheduler with STICKY strategy.

### API (3 endpoints)
- `GET /healthcheck`
- `POST /api/tasks` - Submit task (id, operation, params)
- `DELETE /api/tasks/:taskId` - Cancel task

### Task Manager
`src/taskManager.js` - Manages lifecycle (ACTIVE -> COMPLETED/CANCELED/FAILED). Reports progress back to sepal-server at 1-60s intervals. Handles service account switching.

### Supported Task Types (`src/tasks/`)

| Operation | File | Destination |
|-----------|------|-------------|
| `image.GEE` | `imageAssetExport.js` | EE Asset |
| `image.SEPAL` | `imageSepalExport.js` | User workspace |
| `image.DRIVE` | `imageDriveExport.js` | Google Drive |
| `ccdc.GEE` | `ccdcAssetExport.js` | EE Asset |
| `timeseries.download` | `timeSeriesSepalExport.js` | User workspace |

### Export Orchestration (`src/jobs/export/`)
- `toSepal.js`: Smart routing - Cloud Storage (service account) or Google Drive (user account). Downloads to local filesystem.
- `toDrive.js`: Creates `SEPAL/exports/` folder structure in Drive. User accounts only.
- `toAsset.js`: Multi-tile parallel export (3 concurrent). Supports create/replace/resume strategies for ImageCollections.

### Rate Limiting Services
- `exportLimiterService` - Throttles concurrent EE exports
- `driveLimiterService` - Rate-limits Drive API calls
- `driveSerializerService` / `gcsSerializerService` - Serializes storage operations

## Non-Obvious Conventions

- **Runs as user**: Dockerfile creates a user matching the sandbox user's uid/gid. Task process runs as that user.
- **Base image**: `openforis/sandbox-base` (Ubuntu-based), not Alpine like other Node modules.
- **Credential monitoring**: `src/context.js` polls credentials file every 60s, detects token expiration, switches between user/service account auth.
- **Workload tags**: `src/tasks/workloadTag.js` sets GEE workload tag as `sepal-task-{recipeType}` for quota tracking.
- **Post-processing**: After download, creates VRT files and sets band names via GDAL (uses Python `stack_time_series.py` from `lib/python/shared`).
- **CRC32 validation**: Cloud Storage downloads validated with `fast-crc32c`.
