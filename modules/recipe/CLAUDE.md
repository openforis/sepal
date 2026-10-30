# CLAUDE.md - modules/recipe

Processing-recipe persistence service. Owns the `recipe` MySQL schema (recipe and folder tables; the
`project` table and `recipe.project_id` are the pre-folder originals, kept until the legacy import is removed)
and serves `/api/processing-recipes`. Content and its monotonic revision are loaded together; updates require
`expectedRevision`. See the [storage contract](../../docs/design/recipes/source-freshness.md#recipe-storage-contract).

## Database migrations

`migrations/` holds the portable schema stream, `migrations/legacy-import/` the one-off copy from
`processing_recipe`. Startup and import cleanup are described in
[docs/database-migrations.md](../../docs/database-migrations.md).

## Commands
- `npm test` — Node test runner (`node --test`)
- `sepal build recipe` / `sepal start recipe` / `sepal logs recipe -r`

## Routes (served without the `/api/processing-recipes` gateway prefix)
- `GET /healthcheck`
- `GET /` (list recipes) / `DELETE /` (remove recipes by id list) / `GET /:id` (load) / `POST /:id` (save, gzip body) / `DELETE /:id` (remove)
- `GET /folder` / `POST /folder` (save) / `DELETE /folder/:id` (remove) / `POST /folder/:id` (move recipes, `:id` `none` for the root)
