# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SEPAL (System for Earth Observation Data Access, Processing and Analysis for Land Monitoring) is a cloud computing platform for geographical data processing, built by FAO and Norway. It enables users to process large geospatial datasets without local high-performance infrastructure.

## Architecture

SEPAL is a distributed microservices system where each module runs as an independent Docker container, orchestrated via Docker Compose over a shared `sepal` Docker network.

When introducing or restructuring workflows, follow [Code design](docs/code-design.md).

Recipe developer notes live in [docs/recipes](docs/recipes/README.md). Shared recipe architecture and proposals
live in [docs/design/recipes](docs/design/recipes/data-sources.md). Document current behavior or future design,
not implementation history; recipe-specific issues are deferred unless explicitly scheduled.

### Module Types

**Node.js microservices** (most modules use Koa web framework + RxJS; the former Java/Groovy services — `sepal-server` and the old `user` module — were rewritten as Node.js modules and deleted, along with the Gradle build):
- `gui` - React 19 frontend with Redux, React Router, react-intl (Vite build, Vitest tests)
- `gateway` - HTTP gateway/proxy (uses Express, not Koa; Redis for sessions); also proxies user sandboxes (`/api/sandbox/*`)
- `gee` - Google Earth Engine integration
- `user` - User management, authentication, credentials (formerly `user-node`; replaced the Java `user` module and LDAP)
- `worker` - Worker instances, sandbox sessions, task orchestration (replaced the sepal-server `sdms` cluster)
- `task` - Task execution (runs inside sandbox containers, not a standalone service)
- `app-manager` / `app-launcher` - Application management
- `email`, `terminal`, `user-assets`, `user-files`, `storage`, `ssh-gateway`, `scene-metadata`, `ceo-gateway`, `r-proxy`, `message`, `recipe`, `budget`

**Infrastructure modules** (Docker-only, no application code):
- `caddy`, `mysql`, `rabbitmq`, `prometheus`, `logger`

**Build-only modules** (images only, not runnable services):
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

- **Caddy** - HTTPS entry point (ports 80/443) with automatic ACME certificate management; reverse-proxies to `gateway` (for `/api/*`, `/privacy-policy`) and `gui` (everything else)
- **nginx** - HTTP reverse proxy within containers
- **MySQL** - Primary database (Postgrator migrations per Node module; the legacy Java schemas used Flyway)
- **AWS EC2** - Dynamic worker instances for user sandboxes with per-user budget tracking

## Development Environment

Development runs inside a Docker container (Debian Trixie-slim based). Runtime version: Node.js 26.x. The `sepal` CLI manages all modules.

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

## Build Commands

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

## Testing

Test boundaries and collaborator choices: [Code design](docs/code-design.md#test-boundaries).

- Write behavioral tests against stable public seams. Every test must distinguish a meaningful regression through observable outcomes, not private calls, implementation structure, or assertions that merely verify the harness.
- Test responsibilities and contracts, not files. Move tests with an extracted responsibility and remove redundant coverage.
- Keep each test readable as Given/When/Then with minimal mechanics. Keep the operation under test explicit in the test body; helpers may arrange incidental preconditions, but must not hide the When or scenario-defining setup.
- Use builders for minimal valid defaults and common relationships. Override a field only when its value creates the scenario or is itself part of the expected contract. Reuse built values in actions and assertions, and capture generated values from operation results instead of repeating arbitrary literals.
- Assert ordering required by the contract, not a transcript of implementation steps. Meaningful commands to injected adapters are valid observations; incidental internal calls are not.
- Use `*.integration.test.js` only when exercising an adapter through its real protocol or infrastructure, such as HTTP or MySQL; tests over fakes remain `*.test.js`.
- Use coverage as a diagnostic signal for code or branches that did not execute as expected, never as a percentage target. Do not add fragile, redundant, or unreadable tests merely to increase coverage.
- Run the targeted test file while working (`sepal npm-test gui -- --run <path>`), and lint only the files you changed. A module's full suite belongs before a commit or after a broad change, not after every edit.
- Validate through `sepal npm-test <module>`. Raw `npx jest` in dev-env fails every `#sepal/ee/ee`-importing suite with a post-teardown import error — stable, and indistinguishable from a real failure.

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

Export public functions, classes and constants at their declarations (`export const`, `export function`,
`export class`). Avoid separate export lists for locally declared public members; reserve them for
aliases and re-exports.

Name database values `db` for our callback API object (`withTransaction`, `withConnection`), `dbName`
for a database-name string, and `pool` or `connection` for driver resources. Initialization and migration
APIs take the `Db` suffix (`initDb`, `migrateDb`, `initializeDb`, `migrate<Module>Db`).

## Code Organization

- Use classes for objects exposing several related operations over shared dependencies or state, rather than factories returning an object of locally defined functions. Declare public operations as methods and use private fields for implementation-only dependencies and state. Preserve the receiver when passing methods as callbacks. Keep pure functions and single-callback factories as functions, and plain data as plain objects. Apply this when introducing or restructuring an object, not as a reason for unrelated conversions.
- When writing or substantially reworking a file, put module setup (such as loggers) and small shared constants after imports, then public entry points before private helpers in call order. Keep helper-specific constants near their consumers; large lookup tables may follow the code. Preserve initialization dependencies; do not reorder otherwise clear code just to match this convention.
- In React component files, keep form declarations (`fields`, `constraints`) and props mappings (`mapStateToProps`, `mapRecipeToProps`, etc.) above the exported component. Helper functions used by those declarations belong below the component with the other private helpers; preserve initialization dependencies.
- In React class components, order entry points by execution phase: initialization and pre-render lifecycle methods, render, post-render mount/update methods, interaction handlers, then unmount cleanup. Put supporting methods below those entry points in call order.
- Keep a function at one abstraction level: orchestration should name its steps, while lower-level mechanics belong in the functions it calls.
- In test files, put the behavioral specifications before builders and harness helpers. Group by stable public operation and use names that state the outcome or rule, not vague activity such as "loading a recipe".
- Once tests are green, review changed code, tests and comments. Fix introduced or materially worsened problems; leave unrelated structure alone.

Advisory review signals: cyclomatic complexity above 10; functions above 60 code lines; production files
above 300 code lines; more than four positional parameters or six independent injected collaborators.
Exclude blank and comment-only lines from length measurements. An options object does not reduce the
underlying dependency count. Review newly introduced or worsened hotspots; prefer cohesive
responsibilities and clear ownership over lower numbers. Do not extract arbitrary helpers, split
cohesive components or introduce parameter bags just to satisfy metrics. Justified exceptions are
acceptable: explain them in the review, not accumulating narrative comments. Metrics supplement direct
inspection of async lifetimes, cancellation and coupling.

## Comments

Comment code sparingly — only what the code can't say. A comment must earn its place by stating something invisible in the code itself: a non-obvious why, an invariant, a constraint, a workaround. Never write comments that narrate what the next line does, describe the edit you just made ("added X", "now handles Y"), or talk to the reviewer — the diff and git history carry that, and stale narration misleads the next reader, human or agent. Match the comment density of the surrounding file. This is not a ban: the rare high-value comment is welcome, and durable orientation notes belong in docstrings or the repo's docs, not inline.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): description`.

- `type` is one of `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- `scope` is optional and names the module or shared library the change belongs to (`worker`, `recipe`,
  `gui`, `db`, `deploy`). Omit it for changes that span the repository.
- `description` is imperative mood, lower case, no trailing period: `fix(worker): stop leaking sessions`.
- Mark a breaking change with `!` after the type or scope (`feat(user)!: drop LDAP support`), and explain
  it in a `BREAKING CHANGE:` footer.

Keep messages simple, not verbose. A short subject line (and at most a brief body when it genuinely adds
context) — don't pad messages with long bullet lists, restated diffs, or boilerplate.

## Service Ports

See `PORTS.txt` for complete port mapping. Key ports: Caddy 80/443, MySQL 3306, RabbitMQ 5672, Prometheus 9090. Most application modules expose port 80 internally. Node debug: 9229.

## Deployment

Worker sessions authenticate with per-session API keys; see
[modules/worker/CLAUDE.md](modules/worker/CLAUDE.md#session-api-keys), including the one-time
task-executor transition (drain task executors before deploying that change).

When adding a new deployable module (or renaming an existing one), you MUST update
`modules/ops/script/build-and-push-images.sh` to include `build <module>` and `push <module>`
entries for it. This script builds and pushes all production Docker images; a module missing
from it will not be deployed.

## Contributing

- Discuss changes via issue before submitting PRs
- Follow SemVer versioning
- PRs require sign-off from two developers
