# CLAUDE.md - modules/recipe

SEPAL processing-recipe service (Node.js). Replaces the storage/CRUD half of the Java `sepal-server`
`processingrecipe` component. Owns the `processing_recipe` MySQL schema (recipe + project tables).
Serves the existing `/api/processing-recipes` routes. The recipe-content migration engine is Phase 2b.

## Commands
- `npm test` — Jest (ESM)
- `sepal build recipe` / `sepal start recipe` / `sepal logs recipe -r`

## Routes (served without the `/api/processing-recipes` gateway prefix)
- `GET /healthcheck`
- `GET /` (list recipes) / `DELETE /` (remove recipes by id list) / `GET /:id` (load) / `POST /:id` (save, gzip body) / `DELETE /:id` (remove)
- `GET /project` / `POST /project` (save) / `DELETE /project/:id` (remove) / `POST /project/:id` (move recipes)
