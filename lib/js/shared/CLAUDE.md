# CLAUDE.md - lib/js/shared

Shared Node.js library used by most SEPAL microservices. Imported via `#sepal/*` import maps.

## Test Commands

```bash
npm test              # Jest
npm run testWatch     # Jest watch mode
```

## Key Modules

| Module | Purpose |
|--------|---------|
| `httpServer.js` | Koa 3 server with middleware (error handling, Prometheus, request ID, body parsing up to 100mb, WebSocket via `ws`) |
| `httpClient.js` | RxJS-based HTTP client. Functions return observables (`get$`, `post$`, `postJson$`, `delete$`). Default 600s timeout, 5 retries with exponential backoff (500-2000ms). |
| `messageQueue.js` | RabbitMQ via amqplib. Exchange: `sepal.topic`. Use `initMessageQueue(amqpUri, {publishers, subscribers, handler})` to set up. Auto-reconnects. |
| `service.js` | Service request/response pattern using RxJS. Supports local and remote dispatch via transport abstraction. |
| `log.js` | log4js wrapper. Call `configureServer(config)` at startup, then `getLogger(name)`. Supports lazy evaluation: `log.debug(() => expensiveCall())`. |
| `metrics.js` | prom-client wrapper. `createCounter()`, `createGauge()`, `createHistogram()`, `createSummary()`. |
| `rxjs.js` | Utility operators: `autoRetry({maxRetries, minRetryDelay, ...})`, `finalizeObservable()`, `promise$()`, `lastInWindow()`, `repeating()`, `swallow()`. |
| `exception.js` | Exception hierarchy: `ServerException` (500), `ClientException` (400), `NotFoundException` (404). All extend `Exception` base. Error codes: `EE_NOT_AVAILABLE`, `MISSING_OAUTH_SCOPES`, `MISSING_GOOGLE_TOKENS`. |
| `db/mysql.js` | mysql2/promise wrapper. `createPool(database)`, `initDatabase(database, migrationsPath)`. Schema versioning via Postgrator. Reads `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD` from env. |

## Non-Obvious Conventions

- **RxJS everywhere**: All async operations return observables (suffix `$`). Functions that return observables are named `functionName$`.
- **Worker system** (`worker/`): Uses Node.js `worker_threads`. Jobs run in worker pools with token-based concurrency limiting. Key files: `worker.js`, `pool.js`, `scheduler.js`, `factory.js`.
- **Event definitions** (`event/definitions.js`): System event constants (MODULE_UP/DOWN, USER_UP/DOWN, CLIENT_UP/DOWN, GOOGLE_ACCESS_TOKEN_*) used by gateway WebSocket routing.
- **Service registry** (`service/registry.js`): `addServices([{serviceName, serviceHandler$}])` registers handlers; `getServiceHandler$(name)` retrieves them.
- **Import map**: In this lib's own package.json: `"#sepal/*": "./src/*.js"`. Consuming modules link it as `"sepal": "../../lib/js/shared"` and map `"#sepal/*": "sepal/src/*.js"`.
- **CommonJS**: This library uses `require()` / `module.exports`, not ESM.
