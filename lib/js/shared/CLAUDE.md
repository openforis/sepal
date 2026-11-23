# CLAUDE.md - lib/js/shared

Shared Node.js library used by most SEPAL microservices. Imported via `#sepal/*` import maps.

## Tests

`cd lib/js/shared && npm test` runs the Node test runner, from the dev-env container. Never run it inside a
module's service container: those carry a copy of the repo baked into the image, so the suite silently runs
stale sources.

The `*.integration.test.js` files under `src/db` and `src/testSupport/db` need a reachable Postgres and a
role with `CREATEDB` (`POSTGRES_*`, plus `POSTGRES_ROOT_PASSWORD` for `testDb`); the MySQL import and the
`mysql.*` and `mysqlTestDb` ones also need a reachable MySQL with credentials that can create databases and
accounts, and `MYSQL_FDW_HOST` when `mysql_fdw` reaches it under another name. Dev-env provides both in the
`message` container, which mounts this library's `src` (but not its `test/`), so run single `src/db` files
there. `src/gdal` shells out to Python 3 with GDAL.

## Module map

| Module | Purpose |
|--------|---------|
| `httpServer.js` | Koa 3 server: error handling, Prometheus, request id, body parsing, WebSocket via `ws` |
| `httpClient.js` | RxJS HTTP client (`get$`, `post$`, `postJson$`, `delete$`). Retries with exponential backoff; retry limits, delays and timeout are options with defaults in the module. `responseType` selects how the body is read (`text`, `json`, `arrayBuffer`, `blob`); error bodies are always text. With `json`, an empty body yields `undefined` and a malformed one fails without retrying, carrying the request context, `statusCode` and the raw `body`. |
| `messageQueue.js` | RabbitMQ via amqplib, exchange `sepal.topic`. `initMessageQueue(amqpUri, {publishers, subscribers, handler})`, auto-reconnecting. Publishers hold messages until the broker confirms them and publish unconfirmed ones again after a reconnect (at-least-once). Subscribers assert durable named queues unless `queueOptions` says otherwise. |
| `service.js` | Request/response over RxJS, local or remote transport |
| `log.js` | log4js wrapper. `configureServer(config)`, then `getLogger(name)`; arguments may be lazy (`log.debug(() => …)`). `configureNoLogging()` silences everything, for CLIs whose stdout is the user's terminal |
| `metrics.js` | prom-client wrapper: `createCounter`, `createGauge`, `createHistogram`, `createSummary` |
| `rxjs.js` | Operators: `autoRetry`, `finalizeObservable`, `promise$`, `lastInWindow`, `repeating`, `swallow` |
| `rxjs/subscriberContext.js` | `inSubscriberContext(source$)`: delivers next, error and complete in the async context each subscriber subscribed in. Used by `service.js` and `RecipeScope`'s shared reads. Node only: keep it out of modules browser code imports |
| `exception.js` | `Exception` base with `ServerException` (500), `ClientException` (400), `NotFoundException` (404) |
| `db/mysql.js` | mysql2/promise wrapper, now used only by `testSupport/db/mysqlTestDb.js` and its own tests: `createConnection`, `createPool`, `createDb`, `initDb`, `migrateDb`. Postgrator schema versioning. Reads `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD` from env |
| `db/postgres.js` | node-postgres wrapper with the same API as `db/mysql.js`, plus `isUniqueViolation`. Sets process-wide type parsers on import: int8 to `Number` (out-of-safe-range values fail the query), numeric stays a string. `migrateDb` holds an advisory lock per history table so concurrent migrations take turns. Reads `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| `db/mysqlImport.js` | `importFromMysql({dbName, sourceDb, sqlPath, fingerprint, mysql?})`: copies a module's MySQL database into its migrated Postgres database through `mysql_fdw` once, in one transaction, recorded in `mysql_import`; later starts fail with `StaleImportError` when MySQL changed since (per-table fingerprint: row count plus max of a column, or `CONTENTS`), and with `MissingSourceError` when the source database is gone or its tables lost every row, where a reimport would discard the Postgres data. Import SQL reads `mysql_source.<table>`; `TIMESTAMP` arrives as the right `timestamptz` and is copied as is; `ENUM` arrives as text. Retired with MySQL |
| `event/definitions.js` | System event constants used by gateway WebSocket routing |
| `service/registry.js` | `addServices([...])` registers handlers, `getServiceHandler$(name)` retrieves them |

## Test support

`src/testSupport/` is for tests and other test support only. The root ESLint configuration reports a static
import of it from any JavaScript production file it covers, in this library and in `modules/*/src`; tests
and test-support modules are exempt.

- `testSupport/db/testDb.js` — `createTestDb({name, migrations, connections = 1})` gives a suite its own
  Postgres database, built from the module's production migrations as the application role, plus an account
  that can connect only to that database. Returns `dbName`, `account`, `db`, `query` and
  `withAnotherConnection(callback)`, plus `reset()` to restore the post-migration baseline (rows and sequence
  positions) between tests and `remove()` to drop everything afterwards. An acquisition beyond `connections`
  fails at once instead of waiting. Schemas with foreign keys, triggers, generated columns or views are
  refused. Provisions as the `postgres` superuser with `POSTGRES_ROOT_PASSWORD`. Import as
  `#sepal/testSupport/db/testDb`.
- `testSupport/db/mysqlTestDb.js` — `createMysqlTestDb`, the same contract against MySQL, for the suites
  of the MySQL import tests. Retired with MySQL.
- `testSupport/db/faultyConnection.js` — `failingDb(db, {when, error})` fails the first statement matching
  `when(sql, params)` in each decorated callback, leaving the real database and the production transaction
  handling in place.
- `testSupport/mock.js` — `callsOf(fn)` lists the arguments of each call to a `node:test` mock;
  `inSequence(implementations, otherwise)` answers successive calls in turn.
- `testSupport/worker/threadJob.js` — a job on a `SchedulerTest` scheduler the test initializes; with `crash`
  it takes its worker thread down mid-job.
- `testSupport/assert.js` — `assertMatches(actual, pattern)` checks only the properties the pattern names,
  but arrays element for element; `assert.partialDeepStrictEqual` also accepts an array that merely contains
  the pattern's elements in order.

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
