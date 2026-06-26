# CLAUDE.md - modules/app-launcher

Manages Docker-based user applications. Monitors Git repos, builds/starts Docker containers, and proxies HTTP/WebSocket requests to running containers.

## Commands

```bash
npm test              # Jest (no test files currently exist)
npm run testWatch     # Jest watch mode
```

## Key Architecture

### Entry Point
`src/main.js` - Starts **two servers**: main Express on port 80, management server on port 8080. Optionally monitors apps and creates GEE credentials.

### Dual Server Design
- **Main server (port 80)**: Proxies requests to Docker containers via `http-proxy-middleware`
- **Management server (port 8080)**: App management API endpoints (`src/managementRoutes.js`)

### Docker Integration
`src/docker.js` - Uses `dockerode` library for container lifecycle. Retry logic with MAX_RETRIES=3 and 5s delay.

`src/appsService.js` - Higher-level Docker operations: build, start, get container info, logs, health checking, stats.

### Proxy System
- `src/proxy.js` - HTTP proxy with `changeOrigin: true`, path rewriting, security headers (CSP, HSTS), `sepal-user` header injection
- `src/proxyManager.js` - Dynamic proxy endpoint registration with change detection
- WebSocket upgrade handling via manual server listeners

### Git Operations
`src/git.js` - Clone, pull, branch checking, commit info retrieval with error handling and retry.

## Non-Obvious Conventions

- **Uses Express.js**, not Koa like most other Node modules
- **Injects `sepal-user` header** into proxied requests for downstream authentication
- **Security headers**: CSP, HSTS, X-Content-Type-Options set on all proxied responses
- **GEE credentials**: `src/gee.js` creates Earth Engine credentials file if configured
