# Database migrations

Every module that owns a database builds it with Postgrator over the `pg` driver, the same way in
production and in integration tests. Postgres is the primary database. MySQL still runs as the source of
a one-off import and as the database of `scene-metadata`, which `scene` replaced.

## Staged rollout

Three builds move SEPAL to Postgres, each deployed on its own:

1. `postgres-prepare` adds Postgres, pgAdmin, postgres-backup and `scene`, which rebuilds the scene
   catalogue from the USGS/Copernicus exports into Postgres. `scene-metadata` keeps serving the GUI from
   MySQL meanwhile. The rebuild, with the STAC catch-up after it, takes about 17 hours.
2. `postgres-finalize` moves the other modules to Postgres, each importing its MySQL database on first
   start, and the GUI to `scene` (`/api/scene`; the gateway also routes `/api/scene-metadata` there for tabs
   opened before the deploy). Deploy it once `scene`'s catalogue has caught up: per sensor, its count and
   latest `acquisition_date` match `scene-metadata`'s. `scene-metadata` keeps running unused on MySQL, so a
   rollback to the prepare build serves searches from a current catalogue.
3. `postgres-cleanup` removes `scene-metadata` and MySQL; see [Retiring the import](#retiring-the-import).

## Schema

`migrations/` holds the schema stream, tracked in `schema_version`. Targets are unqualified: the
connection selects the database, and `initDb` (`lib/js/shared/src/db/postgres.js`) creates it before
running the migrations. Scripts do not create their database.

Postgrator validates checksums even when nothing is pending. No code rewrites historical checksums or
certifies an old database as matching the current schema. `migrateDb` holds an advisory lock per history
table, so processes migrating the same stream take turns.

## MySQL import

On first start each module copies its legacy MySQL database into its migrated Postgres database:

```text
initDb(dbName, migrations)                                  -> schema_version
importFromMysql({dbName, sourceDb, sqlPath, fingerprint})   -> mysql_import
```

`importFromMysql` (`lib/js/shared/src/db/mysqlImport.js`) reads MySQL through `mysql_fdw`, runs the
module's `migrations/mysql-import.sql` once in a single transaction, and records it in `mysql_import`. The
SQL reads `mysql_source.<table>` and writes the Postgres tables; a failed import changes nothing. Later
starts verify a per-table fingerprint, either a row count plus the maximum of a column or, for tables
without such a column, a hash of every row (`CONTENTS`), and refuse to start with `StaleImportError` when
MySQL changed since the import; see [Rollback and redeploy](#rollback-and-redeploy). When the source database
is absent, holds no tables, or its tables lost every row they held at the import, the module refuses with
`MissingSourceError` instead: importing again would discard the Postgres data, so restore MySQL, or unset
`MYSQL_HOST` to stop checking. When MySQL is unreachable on a later start, the module logs a warning and
starts unverified. An import is skipped when `MYSQL_HOST` is unset, and a source database that is absent or
holds no tables on the first start is recorded as an empty import, with a warning.

| Module | Imports from MySQL database |
|---|---|
| `recipe` | `recipe` |
| `budget` | `budget` |
| `worker` | `worker` |
| `task-manager` | `task_manager` |
| `user` | `user` |
| `storage` | `storage` |
| `message` | `message` |

Before the first import, check the MySQL source for keys that collide once usernames are case-insensitive
(`citext`): `username` in User's `sepal_user` and Budget's `user_budget` and `user_spending`, and
`(username, year, month)` in Budget's `user_monthly_storage`. Resolve account identity and the affected data
explicitly before importing; otherwise the target rejects duplicate keys and the import fails. Nothing merges
rows or skips them on its own, and the import SQL is not where to resolve these collisions.

## Cutover and rollback

### Before the cutover

- Resolve the case collisions described above.
- Find recipes whose `contents` Postgres `jsonb` would reject: a `\u0000` escape, a lone escaped surrogate,
  or a document over 256 MB. One rejected row fails the recipe import, and Recipe does not start. The query
  lists candidates: it also matches escaped surrogate pairs such as `\ud83c\udf32`, which some writers
  produce and `jsonb` accepts, and an escaped backslash followed by such text. A listed row is a problem only
  if it holds `\u0000`, a high surrogate (`\ud800`–`\udbff`) not directly followed by a low one
  (`\udc00`–`\udfff`), or a low one without a high one before it:

  ```sql
  SELECT id, username, name, LENGTH(contents) AS bytes
  FROM recipe.recipe
  WHERE contents LIKE '%\\\\u0000%'
     OR contents REGEXP '\\\\u[dD][89a-fA-F][0-9a-fA-F]{2}'
     OR LENGTH(contents) > 256 * 1024 * 1024;
  ```

- Check that the filesystem holding `${SEPAL_DATA_DIR}` has room for a Postgres copy of every module
  database while MySQL stays: at least what `${SEPAL_DATA_DIR}/mysql` uses apart from `scene_metadata`.
- Check that `scene` has caught up with `scene-metadata` (see [Staged rollout](#staged-rollout)).
- Passwords need no check for `:` or `\`: postgres-backup escapes them in `.pgpass`, and the import passes
  the MySQL password as an escaped literal.

### Rollback and redeploy

A rollback to the prepare build runs the imported modules on MySQL as it was at the cutover, and scene search
on `scene-metadata`. Everything they wrote to Postgres since exists only there, and their Postgres databases
stay, since the prepare build does not use them. Its writes to MySQL make the import stale: User, Worker and Budget write on their own and always end up stale,
while the others may still verify. Redeploying Postgres then leaves the cluster mixed, some modules refusing
to start with `StaleImportError` and others running on Postgres data the old build never saw.

To redeploy after a rollback:

1. Dump every module database: `docker exec postgres-backup /script/backup.sh` writes
   `${SEPAL_BACKUP_DIR}/postgres/<db>.dump`, every database but `scene`.
2. Drop all imported module databases together, never a subset, so that no module keeps Postgres data the
   others have replaced: `budget`, `message`, `recipe`, `storage`, `task_manager`, `user` and `worker`,
   with `DROP DATABASE … WITH (FORCE)` as `postgres` in the `postgres` container. Leave `scene`: it
   imports nothing and kept updating through the rollback.
3. Redeploy. Every module imports MySQL again.

This loses every write made to Postgres between the cutover and the rollback; only the dumps from step 1
keep it, for whatever is recovered by hand. A `MissingSourceError` is not a stale import: it means MySQL
lost data, and dropping a database would lose it for good.

## Retiring the import

Once every environment has imported, the cleanup build removes MySQL: each module's `mysql-import.sql`,
`migrations-mysql/`, the `importFromMysql` call in its `databaseMigrations.js`, the `mysql_import` table,
`db/mysqlImport.js`, `db/mysql.js`, `testSupport/db/mysqlTestDb.js`, the `scene-metadata` module with the
gateway's `/api/scene-metadata` route, and the `mysql` and `mysql-backup` modules. The schema migrations,
`schema_version` and checksum validation stay. pgAdmin then moves from `127.0.0.1:8981` to
`127.0.0.1:8980`: phpMyAdmin keeps 8980 until MySQL is gone, because the build before Postgres binds it
there and does not know to stop pgAdmin when it is rolled back to.

## Integration tests

`createTestDb` (`lib/js/shared/src/testSupport/db/testDb.js`) builds a database from the production schema
stream and returns a restricted adapter; see `lib/js/shared/CLAUDE.md`. It needs a reachable Postgres with
`POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_ROOT_PASSWORD`.

Repository tests never run the import. Each module's `src/mysqlImport.integration.test.js` runs it against
the MySQL fixtures in `migrations-mysql/`, the legacy schema kept only as the import tests' source, and needs
MySQL as well (`MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`). Where `mysql_fdw` in the Postgres container
reaches MySQL under another name than the tests do, `MYSQL_FDW_HOST` gives that name.
