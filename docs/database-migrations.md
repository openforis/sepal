# Database migrations

Every module that owns a database builds it with Postgrator over the `pg` driver, the same way in
production and in integration tests.

## Schema

`migrations/` holds the schema stream, tracked in `schema_version`. Targets are unqualified: the
connection selects the database, and `initDb` (`lib/js/shared/src/db/postgres.js`) creates it before
running the migrations. Scripts do not create their database.

Postgrator validates checksums even when nothing is pending. No code rewrites historical checksums or
certifies an old database as matching the current schema. `migrateDb` holds an advisory lock per history
table, so processes migrating the same stream take turns.

## After MySQL

The data of the modules on Postgres came from MySQL through a one-off import, and `scene` rebuilt the scene
catalogue that `scene-metadata` kept there. The build that removed MySQL leaves behind:

- `/data/mysql`, the last MySQL state, as an archive. Deploying removes the `mysql`, `mysql-admin`,
  `mysql-backup`, `scene-metadata` and `scene-metadata-redis` containers, not their data.
- A `mysql_import` table in each imported database, recording the import. A rollback to the build before
  verifies the import against MySQL (redeployed from `/data/mysql`) and starts as before; a schema migration
  that drops the table would refuse that rollback, so a later build drops it.
- The `mysql_fdw` extension, in the Postgres image and in every database created from `template1`. Removing
  the package would break those databases' dumps and restores, so it stays.
- pgAdmin on `127.0.0.1:8981`: the build before binds phpMyAdmin to 8980, and a rollback to it would fail
  on a pgAdmin holding that port.

## Integration tests

`createTestDb` (`lib/js/shared/src/testSupport/db/testDb.js`) builds a database from the production schema
stream and returns a restricted adapter; see `lib/js/shared/CLAUDE.md`. It needs a reachable Postgres with
`POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_ROOT_PASSWORD`.
