# CLAUDE.md - modules/sepal-server

Main orchestration server. Groovy/Java, hexagonal architecture, CQRS pattern.

## Build & Test

```bash
./gradlew :sepal-server:classes   # Compile
./gradlew :sepal-server:test      # Run all tests (Spock, maxParallelForks=1)
```

Entry point: `org.openforis.sepal.Main`

## Components (9 total)

Each component is a self-contained unit following hexagonal architecture under `src/main/groovy/org/openforis/sepal/component/`:

| Component | Schema | Key Responsibility |
|-----------|--------|--------------------|
| `budget` | sdms | User instance/storage spending tracking, budget enforcement, cost alerts |
| `workerinstance` | worker_instance | EC2 instance provisioning/lifecycle, idle pool sizing |
| `workersession` | sdms | Sandbox/task-executor session lifecycle, heartbeats, Google token refresh |
| `task` | sdms | Task submission, execution, progress tracking, cancellation |
| `processingrecipe` | processing_recipe | Recipe/project storage with versioned migration system per recipe type |
| `datasearch` | sdms | Scene/satellite imagery search, GEE gateway integration |
| `notification` | notification | User notifications and messages |
| `files` | - | User file operations (browse, delete, download, archive) |
| `sandboxwebproxy` | - | HTTP proxy for sandbox services (RStudio:8787, Shiny:3838, Jupyter:8888) |

## CQRS Pattern

Commands (write) and queries (read) are registered in each component's constructor:

```groovy
command(SubmitTask, new SubmitTaskHandler(taskRepo, sessionMgr, workerGateway, clock))
query(UserTasks, new UserTasksHandler(taskRepo))
```

Submit via `component.submit(new SubmitTask(...))`. Commands run in transactions by default.

## Scheduled Jobs

Components can schedule recurring commands:
- `CancelTimedOutTasks` - every 1 min
- `CloseTimedOutSessions` - every 1 min
- `CloseSessionsForUsersExceedingBudget` - every 11 min
- `RemoveOrphanedTmpDirs` - every 12 min
- `RefreshGoogleTokens` - every 5 min

## Database Migrations (Flyway)

Located in `src/main/resources/sql/`. Four schemas:
- `sdms/` - 15 migrations (V1_0 through V15_0) - core tables
- `processing_recipe/` - 5 migrations
- `notification/` - 2 migrations
- `worker_instance/` - 2 migrations

## REST Endpoints

Uses GroovyMVC controller framework. Authorization roles: `NO_AUTHORIZATION`, `ADMIN`, `TASK_EXECUTOR`.

Health check at `/healthcheck` returns `{status: 'OK'}`. All responses are JSON with UTF-8.

## Worker Types

Defined in `src/main/groovy/org/openforis/sepal/workertype/WorkerTypes.groovy`:
- **SANDBOX**: User interactive environment (SSH:22, RStudio:8787, Shiny:3838, Jupyter:8888)
- **TASK_EXECUTOR**: Processing jobs (HTTP:80). Runs the `task` module image.

Both support GPU via NVIDIA environment variables.

## Hosting Service Adapter

`component/hostingservice/` has `aws/` and `local/` implementations:
- AWS: EC2 instance management with budget tracking
- Local: Docker-based (for development)

## Test Structure

71 Spock test files under `src/test/groovy/`, organized by component. Each component has an `Abstract*Test` base class that sets up mocks (database, clock, event dispatcher, etc.).

## Configuration

Properties files in `config/`: `sepal.properties`, `budget.properties`, `workerSession.properties`, `workerInstance.properties`, `dataSearch.properties`, `database.properties`. Values use environment variable substitution (`$SEPAL_HOST`, etc.).
