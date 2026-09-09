# Portable database migrations

How to make a module's migrations runnable against any database, so integration tests build from the
production schema instead of a handwritten copy. Read this when normalizing a module or finishing the
rollout.

## Two rules for a schema migration

**It must not create its database.** The shared runner does that before Postgrator connects, so delete
statements like `CREATE SCHEMA IF NOT EXISTS recipe;` rather than moving them. Production creates `recipe`
through `initDb()`; a test creates its own database through the same call.

**It must not qualify its targets.** The connection has already selected the database, in both the do and
undo files and in any procedure or `information_schema` query:

```sql
CREATE TABLE history (...);              -- not user_storage.history
ALTER TABLE sepal_user ADD COLUMN ...;   -- not sepal_user.sepal_user
```

A legacy import keeps its *source* references qualified, because they name another database on purpose.

## Two streams

A module that copies from a legacy database keeps that copy separate, with its own Postgrator history:

```text
migrations/                 -> schema_version
migrations/legacy-import/   -> legacy_import_version
```

Only the schema stream is portable. A test applies it and never runs the import, whose sources are
hard-coded to legacy databases.

A data change needed to move schema version N to N+1 belongs in the schema stream: backfilling a new
non-null column, or converting values before adding a constraint. Copying data another database owns is an
import.

## Startup

Schema stream first, then the import where one exists. From `modules/recipe/src/databaseMigrations.js`:

```text
initDb(dbName, migrations)                    -> schema_version
migrateDb(dbName, migrations/legacy-import, ...)     -> legacy_import_version
```

`migrateDb` requires an existing database; `initDb` creates it and then delegates. Both take a `label`
used only in log messages. Ordering beyond this is not solved here: reconciliation moves a database onto
the current files, it does not place an import between arbitrary schema versions.

## Databases already deployed

Normalizing changes a migration's checksum, and Postgrator validates every applied migration, including
when nothing is pending. `reconcileMigrationHistory` (`lib/js/shared/src/db/migrationTransition.js`)
handles that before validation, hooked into the runner's `beforeMigrate`. Given the previous and current
checksums it corrects one it recognizes, does nothing when the checksum is already current or there is no
record, and fails before any migration runs when the checksum is neither.

Where the old migration also performed the import, the correction and the import's completion record commit
together, so the extracted stream never re-runs against populated tables. No history is edited by hand and
no completed import is repeated.

## Deploying this change

The shared runner and both migration transitions ship together, in one commit. That matters because the
runner now validates recorded checksums even when no migration is pending, and Message's and Recipe's
normalized files change theirs. Their reconciliation arrives in the same commit, so a database carrying
either recognized old checksum is corrected on the next startup.

A checksum that is neither the recognized old one nor the current one still stops startup with
`MD5 checksum failed for migration [1]`. That is the intended outcome. Do not resolve it by resetting a
recorded checksum, deleting an import record or disabling validation; add a reviewed transition for that
history instead.

Every other module keeps the checksum it recorded, because this change does not touch its migration files.
That is a property of the expected history rather than something observed in production: a database whose
record was ever advanced by hand, or which ran a file since edited, fails the same way and needs its own
reviewed transition first.

## Finishing the rollout

Per module, once test and production have both started from the new files:

- remove `src/databaseMigrations.js`, restoring the direct `initDb` call in `db.js`
- remove the tests that exercise it, which is the `startup on a database migrated by the deployed …` block
  of `databaseMigrations.integration.test.js`, along with its import of the coordinator
- where an import was extracted, also remove `migrations/legacy-import` and drop the
  `legacy_import_version` history table. That applies to `recipe`, `budget`, `worker` and `user`;
  `message`, `user-storage` and `scene-metadata` have no import stream

Once the last module has done that, remove `lib/js/shared/src/db/migrationTransition.js` and its test.

What stays: the schema stream and its undo, the `schema migrations` tests that use only `initDb` and
`migrateDb`, the repository suites, and `schema_version` with its corrected checksum.

## Status

Every module is normalized: portable schema stream, automatic reconciliation of its recognized deployed
checksum, and where it copied legacy data, an extracted import stream with its own history.

| Module | Legacy import | Notes |
|---|---|---|
| `recipe` | from `processing_recipe` | |
| `budget` | from `sdms` | six tables, including the seeded `open_session_use` |
| `worker` | from `sdms` and `worker_instance` | |
| `user` | from `sepal_user` | |
| `message` | none | |
| `user-storage` | none | `DropIndexIfExists` keeps its database parameter; the callers now pass `DATABASE()` |
| `scene-metadata` | none | the table holds derived data; the ingester's rebuild and swap are unchanged |

## From a test

`createTestDb` (`lib/js/shared/src/testSupport/db/testDb.js`) applies the schema stream to a database it owns and hands
back an adapter; see `lib/js/shared/CLAUDE.md`. A repository suite therefore contains no table DDL, rewrites
no SQL, and never runs the import.

A suite whose subject is the migration history itself is the exception: it rewrites `schema_version`, so it
provisions a fresh database per test rather than sharing one.
