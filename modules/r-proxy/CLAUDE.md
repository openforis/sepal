# CLAUDE.md - modules/r-proxy

R package repository proxy. Caches CRAN and GitHub packages, checks for updates, builds missing packages. Serves via HTTP.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Calls `initProxy()` (HTTP server) and `initQueue()` (BullMQ worker). **Uses raw Node.js HTTP server** (not Koa or Express).

### HTTP Proxy
`src/proxy.js` - Raw `http.createServer` on configurable port:
- Routes `/github/...` to GitHub proxy (`src/proxy-github.js`)
- All other requests to CRAN proxy (`src/proxy-cran.js`)

### BullMQ Job Queue
`src/queue.js` - Redis-backed (db 1), queue name `build-queue-{platformVersion}`:
- Job types: `buildCranPackage`, `buildGitHubPackage`, `updateCranPackage`, `updateGitHubPackage`
- 3 attempts with exponential backoff (3600s initial)
- Logs queue stats: active, waiting, delayed, failed

### Package Operations
- `src/cran.js` - CRAN package checking, updating, building. Version comparison with `compare-versions`
- `src/github.js` - GitHub package repo management
- `src/package.js` - Build orchestration with cleanup
- `src/script.js` - Executes R/shell scripts (`src/script/`) with working directory and environment

### R Scripts
`src/script/` - R and shell scripts for package operations:
- `check_cran_package.r`, `install_cran_package.r`, `install_remote_package.r`, `install_local_package.r`
- `verify_package.r`, `get_r_version.sh`, `make_package.sh`

### Configuration
`src/config.js` - Required: `--os-release`, `--cran-repo`, `--repo-path`, `--lib-path`, `--redis-host`. Derives `platformVersion` from OS release + kernel version.

## Non-Obvious Conventions

- **Platform-specific repos**: `platformVersion` derived from OS release and kernel version determines repository paths
- **Package path structure**: `src/contrib`, `bin/contrib`, `.bin/contrib` (temporary builds)
- **Raw HTTP server**: Only SEPAL module that uses neither Koa nor Express
- **Version parsing regex**: `^(.+?)(?:_(.+?))?(\\.[a-zA-Z.]+)?$` captures name, version, extension
- **Auto-update interval**: Default 24 hours, configurable via `--auto-update-interval-hours`
