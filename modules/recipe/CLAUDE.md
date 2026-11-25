# CLAUDE.md - modules/recipe

Processing-recipe persistence service. Owns the `recipe` Postgres database (recipe and project tables) and
serves `/api/processing-recipes`. Content and its monotonic revision are loaded together; updates require
`expectedRevision`. See the [storage contract](../../docs/design/recipes/source-freshness.md#recipe-storage-contract).

## Database migrations

`migrations/001.do.schema.sql` creates the complete Postgres schema; recipe contents are `jsonb`.
`migrations/mysql-import.sql` copies both tables from the legacy MySQL `recipe` database (kept in
`migrations-mysql/`) on first start, failing the whole import on a document that is not valid JSON; a restart
that finds MySQL changed since the import is refused. Usernames are `citext`, and names sort with the ICU
`und-x-icu` collation (case-insensitive, accent-aware). See
[docs/database-migrations.md](../../docs/database-migrations.md) for startup and repair.

## Commands
- `npm test` — Node test runner (`node --test`)
- `sepal build recipe` / `sepal start recipe` / `sepal logs recipe -r`

## Routes (served without the `/api/processing-recipes` gateway prefix)
- `GET /healthcheck`
- `GET /` (list recipes) / `DELETE /` (remove recipes by id list) / `GET /:id` (load) / `POST /:id` (save, gzip body) / `DELETE /:id` (remove)
- `GET /project` / `POST /project` (save) / `DELETE /project/:id` (remove) / `POST /project/:id` (move recipes)
