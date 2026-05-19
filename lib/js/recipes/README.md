# recipes

Shared recipe specs + validation. Browser-safe (no `fs`, no `path`).

Consumed by the AI module (Node, via the `#recipes` imports map — `import {x} from '#recipes'`)
and the GUI (Vite, as a normal npm dep — `import {x} from 'recipes'`). The `#`
prefix is a Node imports-map convention that doesn't carry to Vite, so the GUI
uses the bare package name. Same package, byte-identical at both runtimes.
Deps are limited to `ajv` + `ajv-formats`.

Each spec exposes `{id, name, schema, rules, defaultModel(), toEffectiveModel(model), promptFacts(), validate(model)}`.
Registry-level conveniences: `listRecipeSpecs()`, `getRecipeSpec(id)`,
`getRecipeSchema(id)`, `getRecipeDefaults(id)`, `getRecipePromptFacts(id)`,
`validateRecipe(id, model)`, `toEffectiveModel(id, model)`.

## LLM-facing model contract

The GUI persists a stored form of each recipe model that may carry **dormant
preferences** — sub-configuration fields the user previously set but isn't
currently using (e.g. tuning fields for cloud-masking methods not in
`includedCloudMasking`, or `scenes` when `sceneSelectionOptions.type !== 'SELECT'`).

LLM-facing code only ever sees the **effective shape**: those dormant fields
projected out by `toEffectiveModel(model)`. Anything the LLM produces is
persisted as-is — no merge-back of dormant fields.

| Direction | Behavior |
|---|---|
| Recipe → LLM (load tool, future slice) | `toEffectiveModel(stored)` projects out dormant fields |
| LLM → Recipe (patch-apply, future slice) | LLM's effective output is persisted directly; no re-merge |
| Normal GUI user flows | Untouched |
| Persisted recipes at rest | Untouched |

Invariants the rest of the system relies on:

- `defaultModel()` returns an **effective** shape — that's the LLM's starting
  point for `create_recipe`.
- `validate(model)` assumes the model is already in effective shape; stored
  models must be projected first.
- `toEffectiveModel` is **pure** (deep-clones the input) and **idempotent**
  (`proj(proj(m))` deep-equals `proj(m)`).
- Effective recipes round-trip cleanly: `validate(toEffectiveModel(stored))`
  returns `[]` for any stored model that's structurally valid modulo dormancy.

### Trade-off (explicit)

AI edits drop the user's previously-parked dormant preferences. This is the
deliberate choice over the alternative — merging dormant fields back — because
the merge-back path has scenarios where the LLM's explicit intent (e.g.
`includedCloudMasking: []`, "remove method X") gets silently undone, and that's
worse than predictable cleanup.

## Specialist prompt assembly

`promptFacts()` returns the structured inputs from which a recipe specialist's
system prompt is mechanically assembled per DESIGN §8: `description`,
`useCases`, `chooseWhen`, `dontChooseWhen`, `outputs`. The point is to keep
LLM-facing knowledge co-located with the spec it describes, so adding a recipe
type means adding facts in one place rather than editing a prompt asset in
another. Fields are returned fresh on each call; consumers may mutate without
corrupting the next caller.

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
