# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

SEPAL (System for Earth Observation Data Access, Processing and Analysis for Land Monitoring) — a cloud platform by FAO and Norway for processing large geospatial datasets without local HPC. Distributed microservices, each an independent Docker container, orchestrated via Docker Compose over a shared `sepal` Docker network.

## Architecture

### Module types

**Java/Groovy** (Gradle, hexagonal):
- `sepal-server` — main server UI + orchestration (entry `org.openforis.sepal.Main`)
- `user` — user management, LDAP, auth (entry `org.openforis.sepal.component.user.Main`)
- `common` / `common-test` — shared Java libs

**Node.js** (mostly Koa + RxJS):
- `gui` — React 19 frontend (Redux, React Router, react-intl; Vite build, Vitest)
- `gateway` — HTTP gateway/proxy (Express, not Koa; Redis sessions)
- `gee` — Google Earth Engine integration
- `task` — task execution (runs inside sandbox containers, not standalone)
- `app-manager` / `app-launcher` — application management
- `email`, `terminal`, `user-assets`, `user-files`, `user-storage`, `ssh-gateway`, `scene-metadata`, `sys-monitor`, `ceo-gateway`, `r-proxy`

**Infrastructure** (Docker-only): `caddy`, `mysql`, `rabbitmq`, `ldap`, `prometheus`, `logger`.
**Build-only** (images, not services): `java`; `sandbox-base`, `sandbox`, `geospatial-toolkit`.

### Shared libraries
- `lib/js/shared` — core Node lib used by most Node modules: HTTP server/client (`httpServer.js`, `httpClient.js`), message queue (`messageQueue.js`, amqplib), DB (`db/`, mysql2), logging (`log.js`, log4js), metrics (`metrics.js`, prom-client), RxJS utils, `service.js`.
- `lib/js/ee` — Earth Engine JS wrapper (`gee`, `task`).
- `lib/js/recipes` — browser-safe recipe specs + validation, consumed by `gui` and `modules/ai`.
- `lib/python/shared` — shared Python utils.

**Import maps:** shared libs use Node import maps. The lib declares `"#sepal/*": "./src/*.js"`; consumers link it (`"sepal": "../../lib/js/shared"`) and map `"#sepal/*": "sepal/src/*.js"`. Imports read `import {x} from '#sepal/httpServer'`. (`lib/js/recipes` similarly resolves as `#recipes` in `modules/ai`, `recipes` in the GUI Vite build.)

### Inter-service
- **RabbitMQ** `sepal.topic` exchange for async events (user lifecycle, files, worker sessions, email, storage metrics) — message formats in `RABBITMQ.md`.
- **HTTP** for synchronous service-to-service calls via the gateway.

### Key infrastructure
- **Caddy** — HTTPS entry (80/443), ACME certs; proxies `gateway` (`/api/*`, `/privacy-policy`) and `gui` (everything else).
- **nginx** — in-container HTTP reverse proxy.
- **MySQL** — primary DB (Flyway migrations).
- **LDAP** — authentication.
- **AWS EC2** — dynamic worker instances for sandboxes, per-user budget tracking.

## Dev environment

Development runs in a Docker container (`sepal-dev`, Debian Trixie-slim). Runtime: Node 24.x, Java 11, Gradle 6.9.1. The `sepal` CLI manages modules. Repo path inside the container: `/home/sepal/sepal` (container user matches host — no `safe.directory` dance).

```bash
bin/dev-env start [-c /path/to/config]   # start (config default ~/.sepal); -v verbose
bin/dev-env stop
```

### Running things in the container

Claude usually runs on the host checkout, but tooling and correct module deps live in `sepal-dev`. Run project commands through it:

```bash
docker exec sepal-dev sepal npm-test <module> [pattern] --runInBand   # module tests (Jest); --run for Vitest (gui)
docker exec sepal-dev sepal status [-d] [<module>]                    # module status (+deps)
docker exec sepal-dev sepal eslint <module> [-f]                      # ESLint (-f autofix)
docker exec sepal-dev gradle :sepal-server:classes                    # JVM compile (fast once daemon warm)
docker exec sepal-dev gradle :sepal-user:test                         # JVM tests
docker exec -w /home/sepal/sepal/lib/js/recipes sepal-dev npm test -- <pattern> --runInBand   # shared JS lib tests
docker exec -w /home/sepal/sepal/modules/<module> sepal-dev <cmd>     # arbitrary command in a module dir
```

- `sepal npm-test <module>` forwards extra args to the module's test runner, so focused/pattern runs work without a shell.
- Shared JS libs (`lib/js/recipes`, `lib/js/shared`, `lib/js/ee`) have no `sepal` CLI entry — run their tests with the `-w <lib dir>` form above.
- **Don't rely on host `node_modules`** (esp. `modules/gui`): mounted native/optional packages can be built for a different container/libc and fail with binding errors. Always run frontend tests in the container.
- JVM: `sepal-server`'s Gradle build excludes some component test dirs (H2 can't apply the V13 MySQL stored-proc migration) — they compile but don't run unless the exclude is removed. Gradle projects: `:sepal-common`, `:sepal-common-test`, `:sepal-user`, `:sepal-server`. Java source compatibility 10; tests run `maxParallelForks = 1`.

### Build / image
```bash
docker exec sepal-dev sepal build <module> [--nc] [-r]   # build image (--nc no-cache, -r recursive w/ deps)
docker exec sepal-dev sepal buildrestart <module>        # build + restart
docker exec sepal-dev sepal start|stop|restart|logs|shell <module>
```
Module groups use a `:` prefix: `:default`, `:node`, `:process`, `:apps`. Dependencies are declared in `dev-env/config/deps.json` (`lib`, `build`, `run`, `gradle` per module). Ports: see `PORTS.txt` (Caddy 80/443, MySQL 3306, RabbitMQ 5672, LDAP 389/636, Prometheus 9090; most app modules expose 80 internally; JVM debug 5005, Node debug 9229).

## Code style

ESLint config at root `eslint.config.js`: 4-space indent (`SwitchCase: 1`), single quotes, no semicolons, Unix line endings, `1tbs` braces (single-line allowed), `no-console` except `info`/`warn`/`error`, no trailing spaces, no multiple empty lines, unused vars prefixed `_`, arrow parens as-needed, no spaces inside braces/brackets/parens, `space-infix-ops` + `space-before-blocks`. `modules/gui` extends this with React rules + `simple-import-sort`.

### Branching
For exhaustive, mutually-exclusive branches (routing, state transitions, input-type dispatch), use explicit `if / else if / else`, not early-return chains — the structure says "these are the cases" and the final `else` is a deliberate branch, not a fall-through. Reserve early returns for genuine guards/short-circuits before the main logic.

### Comments
Govern all comments (writing, reviewing, rewriting):
- Explain **why**, never **what** — what is derivable from the code. Prefer making the code self-explanatory (rename, extract) over commenting; reach for a comment → first try to make it unnecessary.
- A load-bearing *why* comment stays until the code change that absorbs its meaning lands — don't strip it before then.
- No migration/porting/"old vs new" framing, even when the file was ported.
- No docstrings that merely list structure (fields, methods, params) — derivable from the code.
- No dead-code-museum comments — delete dead code; git remembers.
- No cross-document pointers ("see PUNCH_LIST / DESIGN §X / CLAUDE.md") — inline a one-line self-contained summary instead; external docs rename and decay.
- A Write-tool rewrite of a file silently drops its comments — carry every existing comment over unless the rewrite genuinely makes it self-evident.

## Java module structure (hexagonal)

```
src/main/groovy/org/openforis/sepal/component/{feature}/
  adapter/   # infrastructure impls (JDBC, HTTP, …)
  api/       # public interfaces + DTOs
  command/   # command handlers (writes)
  endpoint/  # REST endpoints
  event/     # domain events
  query/     # query handlers (reads)
```
Tests: Spock 1.2 in `src/test/groovy/`.

## Contributing
- Discuss changes via issue before a PR.
- SemVer.
- PRs need sign-off from two developers.
