# Portable database migrations

The schema migrations build the same database for production and integration tests. This guide covers
startup, the unreleased dev/test reset, and removal of the one-off legacy imports.

## Schema and imports

`migrations/` contains the schema stream, tracked in `schema_version`. Targets are unqualified: the
connection selects the database, and `initDb` creates it before running migrations. Scripts do not
create their database. Routine calls use `DATABASE()` where they need the selected database name.

`migrations/legacy-import/` contains copies from legacy databases, tracked separately in
`legacy_import_version`. Only the source references are qualified. Changes needed by the schema itself,
including reference data and backfills, belong in the schema stream instead.

| Module | Legacy import |
|---|---|
| `recipe` | `processing_recipe` |
| `budget` | `sdms` |
| `worker` | `sdms` sessions and tasks |
| `user` | `sepal_user` |
| `message`, `user-storage`, `scene-metadata` | none |

Before a fresh import, check the legacy source for full keys that collide after username normalization:
`username` in User's `sepal_user` and Budget's `user_budget` and `user_spending`, and
`(username, year, month)` in Budget's `user_monthly_storage`. Different months do not collide. Resolve
account identity and the affected data explicitly before importing; otherwise the target rejects duplicate
keys and the import fails. Nothing merges rows, skips them or repairs a checksum on its own, and the
import SQL is not where to resolve these collisions.

## Startup

Modules without imports call `initDb` directly. The remaining `databaseMigrations.js` files run:

```text
initDb(dbName, migrations)                          -> schema_version
migrateDb(dbName, migrations/legacy-import, options) -> legacy_import_version
```

The schema finishes before the import starts. `migrateDb` requires an existing database; it does not
create one. The `schemaTable` option selects the history table, and `label` names the stream in logs.
The import paths are one-off copies, not a general solution for interleaving schema and data migrations.

Postgrator validates checksums even when nothing is pending. No code rewrites historical checksums or
automatically certifies an old database as matching the current schema.

## Existing dev/test databases

These changes have not been released. The initial schema files therefore include the final username
collations and Worker claim-table design directly; no forward migrations or historical-checksum
compatibility are provided for intermediate development states.

Before running this code against an existing dev/test database:

1. Stop its writers and take a backup of both data and migration histories.
2. Bring the actual schema into agreement with the current files, preserving application data. This
   includes case-insensitive username columns, Worker's `instance_name` and `instance_claim`, and removal
   of its old `instance` mirror. The hosting service owns instance inventory; MySQL holds only the claim.
   Sessions predating the claim table get one back from `backfillClaims`
   (`modules/worker/src/workerInstance/index.js`), a temporary startup shim that claims reserved instances
   the hosting service reports with a session ID. It is not permanent Worker behavior and is marked for
   removal one release after this ships; retire this instruction together with it.
3. Verify the schema before aligning its history with the checksums of the exact files being deployed.
   Preserve unrelated migration versions, names and timestamps. Changing a checksum alone does not
   apply a schema change.
4. Preserve completion records for imports that already ran, aligning their checksums where necessary.
   If a combined migration performed the copy, record that completion in the separate import history;
   do not repeat it. Production's fresh databases have no such records and run the imports normally.

The repair is an environment operation, not application migration code. Inspect each environment's
actual state rather than assuming it matches another development database.

## After the imports

Once test and production have completed their imports, remove those modules' `databaseMigrations.js`
coordinators, restore direct `initDb` calls, remove `migrations/legacy-import/`, and drop
`legacy_import_version`. Keep the schema migrations, `schema_version`, checksum validation, and the
schema and repository integration tests.

## Integration tests

`createTestDb` (`lib/js/shared/src/testSupport/db/testDb.js`) builds from the production schema stream and
returns a restricted database adapter; see `lib/js/shared/CLAUDE.md`. Repository tests never run the
legacy imports. Tests of the migration runner itself reserve their own databases and exercise it
directly. Neither needs a handwritten copy of the application schema.

## Follow-up: User Storage event lock

Not part of this rollout and not implemented. `addEvent` in `modules/user-storage/src/historyRepository.js`
serializes writes with `GET_LOCK`. Three things need correcting together, with integration tests against real
MySQL covering both the concurrent and the failure paths:

- The lock name is built from the username as given, while the row is stored and compared
  case-insensitively. Case variants of one username must take the same lock; today `Bob` and `bob` take
  different ones and can both pass the "same as the previous event" guard.
- The result of `GET_LOCK(?, 5)` is never read. A timeout or an error must prevent the write rather than
  fall through to an unserialized insert.
- `RELEASE_LOCK` runs only on the success path. The lock is session-scoped, so a connection returned to
  the pool while still holding it carries it to the next borrower; the lock must be released on failure
  as well as on success. The shared `withConnection` returns its connection to the pool unconditionally,
  so quarantining one would need a way for a callback to refuse that return.

A fourth, independent defect belongs with that work. `timestamp` is a TIMESTAMP filled by `NOW()`, so events
recorded in the same second tie, and both the duplicate guard in `addEvent` and the ordering in
`getUserEvents` break those ties by nothing. Which event counts as the latest is therefore undecided exactly
when two arrive together, which is when it matters.
