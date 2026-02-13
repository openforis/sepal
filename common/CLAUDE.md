# CLAUDE.md - common

Shared Java/Groovy library used by `sepal-server` and `user` modules. Provides CQRS framework, event system, database abstractions, and HTTP server.

## Build

```bash
./gradlew :sepal-common:classes   # Compile
```

No tests in this module (tests are in `common-test`).

## Key Frameworks

### CQRS (Command/Query)

Commands (write) and Queries (read) are separate interfaces with generic return types. Each dispatched through handler registries:

- `CommandDispatcher` - Runs handlers in transactions, supports after-commit callbacks, logs timing
- `QueryDispatcher` - Read-only, no transaction wrapping
- Handler interfaces: `CommandHandler`, `AfterCommitCommandHandler`, `NonTransactionalCommandHandler`, `QueryHandler`

### Component Framework

`Component.groovy` is the core abstraction that wires everything together:

- `DataSourceBackedComponent` - Database-backed with SQL connection manager, Flyway migrations, job scheduling, topic subscriptions
- `NonTransactionalComponent` - Simple in-memory dispatchers for non-DB components

Registration pattern:
```groovy
command(SubmitTask, new SubmitTaskHandler(repo, gateway))
query(UserTasks, new UserTasksHandler(repo))
```

### Event System

Three dispatcher implementations:
- `AsynchronousEventDispatcher` - 10-thread pool for local async events
- `RabbitMQTopic` - Publishes to `sepal.topic` exchange with JSON serialization, auto-recovery
- `TopicEventDispatcher` - Combines local async + remote topic publishing

### HTTP/Endpoint

- `Server.groovy` - Undertow HTTP server wrapper with configurable port and thread pools
- `ResourceServer` - Extends Server with static resource serving from classpath `dist/`
- `Endpoints.groovy` - GroovyMVC filter with error handling, health check at `/healthcheck`, JSON responses
- Authorization via `PathRestrictionsFactory` and `Roles` (ADMIN, TASK_EXECUTOR)

### Database/SQL

- `DatabaseConfig` - Immutable config with C3P0 connection pooling
- `DatabaseMigration` - Flyway schema migration wrapper
- `SqlConnectionManager` - Thread-local connection management, implements both `TransactionManager` and `SqlConnectionProvider`, supports after-commit callbacks
- `RowExtension` - Groovy extension for handling CLOB columns

### Message Broker

`RmbMessageBroker` - Repository Message Broker with JDBC backend, Xstream serialization, exponential backoff retry. Used for reliable async command delivery (separate from RabbitMQ topic events).

## Non-Obvious Conventions

- **User entity** (`User.groovy`): Immutable, carries Google OAuth tokens (`GoogleTokens`), status enum (ACTIVE/PENDING/LOCKED), and admin flag
- **GoogleTokens refresh logic**: Tokens refresh if they expire within 10 minutes
- **Undertow patches**: 4 Java files patch Undertow's gzip/proxy handling (`PatchedProxyHandler.java`, etc.)
- **Config loader** (`Config.groovy`): Loads properties files with typed access (string, int, float, URI, file)
- **Clock abstraction** (`Clock.groovy` / `SystemClock`): All time access goes through injectable Clock for testability
- **JobScheduler**: Wraps ScheduledExecutorService with fixed-delay scheduling pattern
- **Thread safety**: Uses ConcurrentHashMap, CopyOnWriteArrayList, ThreadLocal throughout
