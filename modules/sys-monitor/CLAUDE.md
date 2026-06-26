# CLAUDE.md - modules/sys-monitor

Monitors SEPAL server logs for errors/warnings and sends emergency notifications via Pushover API.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Starts HTTP server (health check only, no routes). Schedules `logMonitor.start()` after configurable `initialDelayMinutes`.

### Log Monitor
`src/logMonitor.js` - Tails log file using `tail-file` package:
- Parses entries for error/warning patterns (configured in `config/logMonitor.json`)
- Maintains armed/disarmed notification state
- Auto-rearm after configurable hours

### Pushover Client
`src/pushover.js` - Posts notifications to Pushover API with retry logic and timeout.

### Configuration
`src/config.js` - Required args: `--pushover-api-key`, `--pushover-group-key`, `--sepal-server-log`. Optional: `--initial-delay-minutes`, `--auto-rearm-delay-hours`, `--notify-from`, retry delay/timeout.

## Non-Obvious Conventions

- **Delayed startup**: Configurable delay before monitoring starts (avoids startup noise)
- **Armed/disarmed state**: Prevents notification storms, auto-rearms after delay
- **Minimal module**: Only 4 source files, no database or message queue
