# recipes

Shared recipe specs + validation. Browser-safe (no `fs`, no `path`).

Consumed as `#sepal/recipes` by both the AI module (Node, via the package
`imports` map — `import {x} from '#sepal/recipes'`) and the GUI (Vite, via a
resolve alias to the `recipes` package — `import {x} from '#sepal/recipes'`).
Same package, byte-identical at both runtimes. Deps are limited to `ajv` +
`ajv-formats`.

Each spec exposes `{id, name, schema, rules, defaultModel(), toEffectiveModel(model), selectionFacts(), describeFacts(), editFacts(), llmMetadata(), knowledge(), updateManual(), validate(model)}`.
Registry-level conveniences: `listRecipeSpecs()`, `getRecipeSpec(id)`,
`getRecipeSchema(id)`, `getRecipeDefaults(id)`, `getRecipeSelectionFacts(id)`,
`getRecipeDescribeFacts(id)`, `getRecipeEditFacts(id)`,
`getRecipeLlmMetadata(id)`, `getRecipeUpdateManual(id)`, `getRecipeKnowledge(id)`,
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

LLM-facing facts are split into three purpose-specific buckets so each consumer
sees only what it needs. Adding a recipe type means filling the relevant
buckets here rather than editing prompt assets elsewhere. Fields are returned
fresh on each call; consumers may mutate without corrupting the next caller.

| Method | Consumer | Fields |
|---|---|---|
| `selectionFacts()` | Orchestrator deciding which recipe type fits a request | `description`, `useCases`, `chooseWhen`, `dontChooseWhen`, `outputs` |
| `describeFacts()` | `describe_recipe` specialist (read-only) | `description`, `outputs` |
| `editFacts()` | `update_recipe` / future `create_recipe` specialists (write) | `guidance` (array of edit-time rules, validation closures, path aliases) |

`assembleSpecialistPrompt(basePrompt, spec, {purpose, includeSchema})` in the
AI module reads the bucket for the requested `purpose`:

- `{purpose: 'describe'}` reads `describeFacts()`. Selection facts and edit
  guidance are deliberately excluded — the recipe has already been chosen and
  the specialist is read-only.
- `{purpose: 'update'}` reads `editFacts()` and appends the generated
  `updateManual()` (constraints + `knowledge()` facts). The update specialist
  works from that manual plus the `prepare_update` work packet, not the full
  recipe schema in its static prompt. Selection facts and describe-only prose
  are excluded for the same reason and to stay under the §3 prompt-byte budget.
- The base prompt is placed first so cache-stable prefixes hold across recipe
  types.

## Update metadata (`llmMetadata()`, `updateManual()`)

`llmMetadata()` derives machine-readable edit constraints from the spec's
`rules` — coupled fields, allowed values, validation dependencies. `updateManual()`
renders those constraints plus the spec's `knowledge()` facts into the LLM-facing
edit manual the update specialist receives in its prompt.

The AI `prepare_update` tool reads `llmMetadata().constraints` to expand the
specialist's chosen focus paths into the dependent + writable path set, returning
the current value at each writable path plus `baseModelHash` from the GUI load so
the specialist can call `recipe_patch` with the right concurrency token. The
specialist picks paths from the manual; there is no keyword intent-classification.

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
