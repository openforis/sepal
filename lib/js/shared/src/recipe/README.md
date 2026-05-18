# recipe

Shared recipe specs + validation. Browser-safe (no `fs`, no `path`).

Each spec exposes `{id, name, schema, defaultModel(), validate(model), rules}`.
The top-level `validateRecipe(id, model)` is a registry-level convenience.

## AOI subschema

The optical mosaic schema (and every other recipe that takes an AOI) currently
inlines the AOI variants directly in its own `$defs`. With only one recipe
ported this is fine. **Before adding a second recipe that takes an AOI**, pick
one of:

1. Extract `recipe/aoi/schema.json` and import + spread its `$defs` into each
   recipe schema at module load (no JSON-Schema `$ref` across files).
2. Tiny build-time bundler script that produces the bundled `schema.json`
   files committed to source.

Either is browser-safe. Don't copy-paste the AOI defs a second time.
