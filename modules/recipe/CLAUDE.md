# CLAUDE.md - modules/recipe

Processing-recipe persistence service. Owns the `recipe` MySQL schema (recipe and project tables) and
serves `/api/processing-recipes`. Content and its monotonic revision are loaded together; updates require
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
- `GET /project` / `POST /project` (save) / `DELETE /project/:id` (remove) / `POST /project/:id` (move recipes)
