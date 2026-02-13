# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SEPAL (System for Earth Observation Data Access, Processing and Analysis for Land Monitoring) is a cloud computing platform for geographical data processing, built by FAO and Norway. It enables users to process large geospatial datasets without local high-performance infrastructure.

## Architecture

SEPAL is a distributed microservices system where each module runs as an independent Docker container, orchestrated via Docker Compose over a shared `sepal` Docker network.

### Module Types

**Java/Groovy modules** (Gradle-based, hexagonal architecture):
- `sepal-server` - Main server UI and orchestration (entry: `org.openforis.sepal.Main`)
- `user` - User management, LDAP, authentication (entry: `org.openforis.sepal.component.user.Main`)
- `common` / `common-test` - Shared Java libraries

**Node.js microservices** (most modules use Koa web framework + RxJS):
- `gui` - React 19 frontend with Redux, React Router, react-intl (Vite build, Vitest tests)
- `gateway` - HTTP gateway/proxy (uses Express, not Koa; Redis for sessions)
- `gee` - Google Earth Engine integration
- `task` - Task execution (runs inside sandbox containers, not a standalone service)
- `app-manager` / `app-launcher` - Application management
- `email`, `terminal`, `user-assets`, `user-files`, `user-storage`, `ssh-gateway`, `scene-metadata`, `sys-monitor`, `ceo-gateway`, `r-proxy`

**Infrastructure modules** (Docker-only, no application code):
- `haproxy`, `mysql`, `rabbitmq`, `ldap`, `prometheus`, `logger`, `letsencrypt`

**Build-only modules** (images only, not runnable services):
- `java` - Base Java Docker image
- `sandbox-base`, `sandbox`, `geospatial-toolkit` - User sandbox images

### Shared Libraries

- `lib/js/shared` - Core Node.js library used by most Node modules. Provides HTTP server/client (`httpServer.js`, `httpClient.js`), message queue (`messageQueue.js` via amqplib), database (`db/` via mysql2), logging (`log.js` via log4js), metrics (`metrics.js` via prom-client), RxJS utilities, and service base class (`service.js`).
- `lib/js/ee` - Google Earth Engine JavaScript wrapper (used by `gee` and `task` modules)
- `lib/python/shared` - Shared Python utilities

**Import mechanism:** The shared library is accessed via Node.js import maps (`#sepal/*`). In the shared lib's own `package.json`: `"#sepal/*": "./src/*.js"`. In consuming modules, it's linked as a dependency (`"sepal": "../../lib/js/shared"`) and mapped as `"#sepal/*": "sepal/src/*.js"`. Code imports look like `import {something} from '#sepal/httpServer'`.

### Inter-Service Communication

- **RabbitMQ** `sepal.topic` exchange for async events (user lifecycle, file operations, worker sessions, email, storage metrics). See `RABBITMQ.md` for message format details.
- **HTTP** for synchronous service-to-service calls via the gateway.

### Key Infrastructure

- **HAProxy** - Entry point, runs SSH and HTTPS on port 443
- **nginx** - HTTP reverse proxy within containers
- **MySQL** - Primary database (Flyway migrations for schema versioning)
- **LDAP** - User authentication
- **AWS EC2** - Dynamic worker instances for user sandboxes with per-user budget tracking

## Development Environment

Development runs inside a Docker container (Debian Trixie-slim based). Runtime versions: Node.js 24.x, Java 11, Gradle 6.9.1. The `sepal` CLI manages all modules.

### Starting the Dev Environment

```bash
bin/dev-env start                    # Start dev-env container (config from ~/.sepal)
bin/dev-env start -c /path/to/config # Use custom config directory
bin/dev-env stop                     # Stop dev-env
```

### SEPAL CLI (inside dev-env container)

```bash
sepal status                         # Show all module statuses
sepal status <module>                # Show specific module status
sepal status -d                      # Show with dependencies
sepal build <module>                 # Build module Docker image
sepal build <module> --nc            # Build without cache
sepal build <module> -r              # Build recursively (with deps)
sepal start <module>                 # Start module
sepal start <module> -f              # Start with full log follow
sepal stop <module>                  # Stop module
sepal restart <module>               # Restart module
sepal buildrestart <module>          # Build and restart
sepal logs <module> -r               # Recent logs with follow
sepal shell <module>                 # Shell into module container
sepal npm-install <module>           # Install npm dependencies
sepal npm-test <module>              # Run interactive tests
sepal eslint <module>                # Run ESLint
sepal eslint <module> -f             # Run ESLint with autofix
```

Module groups can be used with `:` prefix: `:default`, `:node`, `:process`, `:apps`.

### Module Dependencies

Module dependencies are defined in `dev-env/config/deps.json`. Each module specifies:
- `lib` - Shared library dependencies (`shared`, `ee`)
- `build` - Build-time dependencies on other module images
- `run` - Runtime dependencies (started automatically)
- `gradle` - Whether module uses Gradle build (vs Docker-only)

## Build Commands

### Java/Groovy (Gradle)

```bash
./gradlew :sepal-server:classes      # Compile sepal-server
./gradlew :sepal-user:classes        # Compile user module
./gradlew :sepal-server:test         # Test sepal-server
./gradlew :sepal-user:test           # Test user module
./gradlew test                       # Run all Java/Groovy tests
```

Gradle projects defined in `settings.gradle`: `:sepal-common`, `:sepal-common-test`, `:sepal-user`, `:sepal-server`. Java source compatibility: 10. Tests run with `maxParallelForks = 1`.

### Node.js Modules

```bash
# From within a module directory:
npm install
npm test                             # Run tests (Jest or Vitest)
npm run testWatch                    # Watch mode (shared lib)

# GUI-specific:
cd modules/gui
npm run build                        # Production build (Vite)
npm run lint                         # ESLint
npm start                            # Dev server (Vite)
npm test                             # Vitest
```

### Shared Library Tests

```bash
cd lib/js/shared
npm test                             # Jest
npm run testWatch                    # Jest watch mode
```

## Code Style

ESLint config at root `eslint.config.js`:
- 4-space indentation (`SwitchCase: 1`)
- Single quotes, no semicolons
- Unix line endings
- `1tbs` brace style (single-line allowed)
- `no-console` except `info`, `warn`, `error`
- No trailing spaces, no multiple empty lines
- Unused vars prefixed with `_`
- Arrow parens only as-needed
- No spaces inside braces/brackets/parens
- `space-infix-ops`, `space-before-blocks` required

The GUI module (`modules/gui/eslint.config.js`) extends this with React-specific rules and `simple-import-sort` plugin.

## Java Module Structure (Hexagonal Architecture)

```
src/main/groovy/org/openforis/sepal/component/{feature}/
  adapter/     # Infrastructure implementations (JDBC, HTTP, etc.)
  api/         # Public interfaces and DTOs
  command/     # Command handlers (write operations)
  endpoint/    # REST endpoints
  event/       # Domain events
  query/       # Query handlers (read operations)
```

Tests use Spock Framework 1.2 in `src/test/groovy/`.

## Service Ports

See `PORTS.txt` for complete port mapping. Key ports: HAProxy 80/443, MySQL 3306, RabbitMQ 5672, LDAP 389/636, Prometheus 9090. Most application modules expose port 80 internally. JVM debug: 5005, Node debug: 9229.

## Contributing

- Discuss changes via issue before submitting PRs
- Follow SemVer versioning
- PRs require sign-off from two developers
