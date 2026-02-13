# CLAUDE.md - common-test

Shared test infrastructure for Java/Groovy modules. Provides fake implementations, in-memory database, and Spock test base classes.

## Build

```bash
./gradlew :sepal-common-test:classes   # Compile
./gradlew :sepal-common-test:test      # Run unit tests (Spock)
```

## Test Infrastructure

### In-Memory Database

`fake/Database.groovy` - H2 in-memory database in MySQL compatibility mode:
- Cached DataSource per schema name
- Automatic Flyway migration on creation
- `reset()` deletes all table rows except `schema_version`
- Case-insensitive schema names

### Fake Implementations

| Fake | Replaces | Behavior |
|------|----------|----------|
| `FakeClock` | `Clock` | Settable time, `forward()` for time jumping |
| `FakeMessageBroker` | `MessageBroker` | Synchronous - immediately consumes published messages |
| `FakeTopic` | `RabbitMQTopic` | In-memory listener list, no actual messaging |
| `FakeUserProvider` | `UserProvider` | Configurable roles |
| `FakeUserRepository` | `UserRepository` | Switchable user existence |
| `FakeUsernamePasswordVerifier` | Credential verifier | Valid/invalid toggle |
| `SynchronousJobExecutor` | `JobExecutor` | Executes jobs immediately on same thread |
| `FakeUserServer` | User service | Undertow test server with `/authenticate` endpoint |

### Test Base Classes

- `AbstractComponentEndpointTest` - Full component testing with mock Component, ResourceServer, REST client, role helpers
- `AbstractEndpointTest` - Endpoint testing with mock CommandDispatcher/QueryDispatcher, ResourceServer, REST client

Both provide: `inRole()`, `nonAdmin()`, `failExecution()`, `get()`/`post()`/`delete()`, `sameJson()` (recursive JSON comparison).

### Test Server

`fake/server/TestServer.groovy` - Undertow-based with dynamic port allocation, DSL for route registration, PathRestrictions with authentication, automatic cleanup hooks.

### Utilities

- `Port.groovy` - Free port finder with recently-used cache
- `DirectoryStructure.groovy` - XML-based directory structure assertion matcher

## Unit Tests

5 test files in `src/test/groovy/unit/util/`:
- `CsvInputStreamReaderTest`, `DateTimeTest`, `DecompressTest`, `IsTest`, `RegExprTest`

## Non-Obvious Conventions

- All fakes are in the `fake` package (not `mock` or `stub`)
- `FakeMessageBroker` makes async message processing synchronous for deterministic tests
- `Database.reset()` preserves Flyway migration history
- Test servers allocate random ports to avoid conflicts in parallel test runs
