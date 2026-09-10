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
   of its old `instance` mirror. The hosting service owns instance inventory; Worker reconstructs claims
   from active reservations on startup.
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
