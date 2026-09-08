# CLAUDE.md - lib/js/shared

Shared Node.js library used by most SEPAL microservices. Imported via `#sepal/*` import maps.

## Tests

This package declares no jest of its own. Run its suite from inside a module's dev container, invoking that
module's installed jest so nothing is downloaded:

```bash
cd /usr/local/src/sepal/lib/js/shared
NODE_OPTIONS=--experimental-vm-modules ../../../modules/message/node_modules/.bin/jest
```

The `*.integration.test.js` files under `src/db` and `src/testSupport/db` need a reachable MySQL and
credentials that can create databases and accounts. `src/gdal` shells out to Python 3 with GDAL.

## Module map

| Module | Purpose |
|--------|---------|
| `httpServer.js` | Koa 3 server: error handling, Prometheus, request id, body parsing, WebSocket via `ws` |
| `httpClient.js` | RxJS HTTP client (`get$`, `post$`, `postJson$`, `delete$`). Retries with exponential backoff; retry limits, delays and timeout are options with defaults in the module. `responseType` selects how the body is read (`text`, `json`, `arrayBuffer`, `blob`); error bodies are always text. With `json`, an empty body yields `undefined` and a malformed one fails without retrying, carrying the request context, `statusCode` and the raw `body`. |
| `messageQueue.js` | RabbitMQ via amqplib, exchange `sepal.topic`. `initMessageQueue(amqpUri, {publishers, subscribers, handler})`, auto-reconnecting. Subscribers assert durable named queues unless `queueOptions` says otherwise. |
| `service.js` | Request/response over RxJS, local or remote transport |
| `log.js` | log4js wrapper. `configureServer(config)`, then `getLogger(name)`; arguments may be lazy (`log.debug(() => …)`). `configureNoLogging()` silences everything, for CLIs whose stdout is the user's terminal |
| `metrics.js` | prom-client wrapper: `createCounter`, `createGauge`, `createHistogram`, `createSummary` |
| `rxjs.js` | Operators: `autoRetry`, `finalizeObservable`, `promise$`, `lastInWindow`, `repeating`, `swallow` |
| `exception.js` | `Exception` base with `ServerException` (500), `ClientException` (400), `NotFoundException` (404) |
| `db/mysql.js` | mysql2/promise wrapper: `createConnection`, `createPool`, `createDb`, `initDatabase`, `migrateDb`. Postgrator schema versioning. Reads `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD` from env |
| `db/migrationTransition.js` | `reconcileMigrationHistory` corrects a recognized historical checksum before validation. Temporary; see `docs/database-migrations.md` |
| `event/definitions.js` | System event constants used by gateway WebSocket routing |
| `service/registry.js` | `addServices([...])` registers handlers, `getServiceHandler$(name)` retrieves them |

## Test support

`src/testSupport/` is for tests and other test support only. The root ESLint configuration reports a static
import of it from any JavaScript production file it covers, in this library and in `modules/*/src`; tests
and test-support modules are exempt.

- `testSupport/db/testDb.js` — `createTestDb({name, migrations})` gives a suite its own database, built from
  the module's production migrations, plus an account that can reach only that database. Returns `dbName`,
  `db`, `query` and `withAnotherConnection(callback)`, plus `reset()` to restore the post-migration baseline
  between tests and `remove()` to drop everything afterwards. Schemas with foreign keys, triggers, generated
  columns or views are refused. Import as `#sepal/testSupport/db/testDb`.
- `testSupport/db/faultyConnection.js` — `failingDb(db, {when, error})` fails the first statement matching
  `when(sql, params)` in each decorated callback, leaving real MySQL and the production transaction handling
  in place.

## Constraints

- **ESM**: native ESM (`"type": "module"`). Most modules use named exports; `worker/job.js` and
  `worker/worker.js` export a default, and `assert.js` is named (`import {assert}`). Importing a default
  from a module that has none fails when the module is loaded, not when the value is used. Still-CommonJS
  consumers load this library through `require(esm)`, which works because it has no top-level await.
- **Import map**: this package maps `"#sepal/*": "./src/*.js"`. Consumers link it as
  `"sepal": "../../lib/js/shared"` and map `"#sepal/*": "sepal/src/*.js"`.
- **Observable naming**: a function that returns an observable ends in `$`.
- **Workers** (`worker/`): `worker_threads` pools with token-based concurrency limiting. Key files:
  `worker.js`, `pool.js`, `scheduler.js`, `factory.js`.
- **Loader workarounds**: `prometheus-api-metrics` (in `httpServer.js`) and the dynamic requires in
  `util.js` and `worker/worker.js` go through `createRequire`; `__dirname` is reconstructed from
  `import.meta.url` in `gdal.js` and `worker/factory.js`.
