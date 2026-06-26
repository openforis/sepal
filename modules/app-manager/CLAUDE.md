# CLAUDE.md - modules/app-manager

Monitors and serves Jupyter/Shiny applications. Polls a config file for app definitions, auto-updates from Git repos, and serves static assets.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - HTTP server on port 80, starts `monitorApps()` interval-based monitoring.

### App Monitoring
`src/apps.js` - RxJS interval polls every 5 seconds using `exhaustMap` + `concatMap` for sequential Git update operations. Calls external `update-app.sh` shell script per app.

### Routes
- `GET /list` - App listing
- `GET /images` - App image assets
- `GET /labextensions` - Jupyter labextension static middleware

### Supporting Files
- `src/file.js` - RxJS wrappers for filesystem (`fileToJson$`, `lastModifiedDate$`)
- `src/terminal.js` - Child process execution via RxJS Subject
- `src/sendFile.js` - HTTP file serving with cache control
- `kernels/` - Jupyter kernel configs (ir, javascript, python3)

## Non-Obvious Conventions

- **No database or message queue** - purely filesystem-based app discovery
- **RxJS-heavy**: interval(), exhaustMap(), concatMap(), switchMap(), catchError() for all async ops
- **Git-based updates**: Each app is a Git repo updated via shell script
