# recipes

Shared recipe specs + validation. Browser-safe (no `fs`, no `path`).

Consumed by the AI module (Node, via the `#recipes` imports map — `import {x} from '#recipes'`)
and the GUI (Vite, as a normal npm dep — `import {x} from 'recipes'`). The `#`
prefix is a Node imports-map convention that doesn't carry to Vite, so the GUI
uses the bare package name. Same package, byte-identical at both runtimes.
Deps are limited to `ajv` + `ajv-formats`.

Each spec exposes `{id, name, schema, rules, defaultModel(), toEffectiveModel(model), selectionFacts(), describeFacts(), editFacts(), updateClosure({instruction, effectiveModel}), validate(model)}`.
Registry-level conveniences: `listRecipeSpecs()`, `getRecipeSpec(id)`,
`getRecipeSchema(id)`, `getRecipeDefaults(id)`, `getRecipeSelectionFacts(id)`,
`getRecipeDescribeFacts(id)`, `getRecipeEditFacts(id)`,
`getRecipeUpdateClosure(id, args)`,
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
- `{purpose: 'update'}` reads `editFacts()`. The update specialist normally
  receives scoped schema/rule details through `load_for_update`, not the full
  recipe schema in its static prompt. Selection facts and describe-only prose
  are excluded for the same reason and to stay under the §3 prompt-byte budget.
- The base prompt is placed first so cache-stable prefixes hold across recipe
  types.

## Update closure (`updateClosure({instruction, effectiveModel})`)

The AI `load_for_update` tool calls this to return a **bounded** edit scope
rather than handing the whole effective model + full `editFacts` to the
update specialist every turn. The closure shape:

```
{
  intent,                 // 'dateWindow' | 'broad' | ... (per-spec)
  currentValues,          // {jsonPointer: value} — only the paths the specialist needs
  dependentPaths,         // [jsonPointer]      — paths the patch may write; empty == broad scope (any path)
  guidance                // [string]           — rules relevant to this intent
}
```

`load_for_update` adds `baseModelHash` from the GUI load response so the
specialist can call `recipe_patch` with the right concurrency token without a
second round-trip.

Intent classification is the spec's responsibility (lives next to its facts +
rules). Detection is deliberately narrow — keyword-match on the instruction
against a small set of known intent labels per spec, falling back to a `broad`
closure (top-level effective sections + full `editFacts.guidance`) when no
intent matches. No NL parsing of values; the LLM extracts target values from
the user's instruction.

MOSAIC intents today: `dateWindow` (target-date / season-window edits) +
`broad`.

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
