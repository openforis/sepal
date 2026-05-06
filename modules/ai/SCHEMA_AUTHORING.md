# Recipe Schema Authoring Guide

Lessons from porting the first recipe (radarMosaic) — read before tightening the next one.

## Purpose

Each recipe schema serves two consumers:

1. **The validator** — checks that recipes are processable by the GEE backend.
2. **The LLM** — uses the schema as its primary source of truth for what fields exist, what they mean, and how to respond to user feedback.

The validator wants tight constraints; the LLM wants rich semantic descriptions. Both fit in the same JSON Schema document if you write descriptions well.

## Layout

```
recipes/
  shared/
    <fragment>.schema.json       # Reused across recipes (e.g. aoi)
  <recipe>/
    schema.json                   # Parameter schema (JSON Schema 2020-12)
    rules.js                      # Cross-field validators (CommonJS)
    defaults.js                   # Complete default model
    index.js                      # Aggregator (entry point)
  validate.js                     # Validation engine
  bundleSchema.js                 # Inlines cross-file $refs for the LLM
```

`index.js` exports `{id, name, description, useCases, terms, chooseWhen, dontChooseWhen, outputs, parameterSchema, rules, getDefaults, workflowSteps, bands, visualizations}` and is the only entry point — `main.js` requires `./recipes/<recipe>` and the registry handles the rest.

## Philosophy: schema-as-truth, not GUI-mirror

The schema captures what's *correct*, not what the GUI happens to allow:

- If the GUI lets users enter values the backend rejects (e.g. unbounded incidence angles when the physical range is [0, 90]), tighten the schema and fix the GUI separately.
- If the GUI snaps a slider but the backend accepts any in-range value, prefer a range over a hard enum and mention the typical tick values in the description. Snapping is a UX concern, not a constraint.
- Exception: when discrete values encode real semantics (odd kernel sizes, sigma values from a hardcoded lookup table), enums are correct.

When the schema is tighter than the GUI, that's a GUI bug, not a schema bug.

## Selection fields (recipe_types tool)

The `recipe_types` MCP tool returns one entry per registered recipe and is the LLM's **first stop** when the user describes what they want — well before it knows which `parameterSchema` to fetch. Each `index.js` therefore carries five selection fields that go beyond the bare description:

```js
useCases: ['Concrete user-facing use case', '…'],
terms: ['SAR', 'radar', 'time-scan', 'VV', 'VH', '…'],
chooseWhen: 'One sentence, written so the LLM can answer "is this the right recipe?" against it.',
dontChooseWhen: 'Common confusable cases — name the alternative recipe by id.',
outputs: 'One line summarizing the bands the recipe produces.',
```

Authoring guidance:

- **`useCases`**: 3-6 concrete bullets, phrased the way a user would phrase the goal ("Two-date deforestation mapping", not "compute dNDVI"). Keep them disjoint — overlapping use cases dilute the signal.
- **`terms`**: synonyms, jargon, satellite/sensor names, algorithm names, well-known indices, common abbreviations. The LLM matches the user's wording against this list. Include both the formal term and the colloquial form (e.g. `'SAR'` AND `'radar'`).
- **`chooseWhen`**: a single sentence that is *true* for this recipe and *false* for its neighbours. If you can't write one, the recipes likely overlap — fix the modeling, don't paper it over.
- **`dontChooseWhen`**: name the alternative recipe by id (e.g. "use MOSAIC instead"). This builds the cross-recipe disambiguation the LLM needs.
- **`outputs`**: one line summarizing the bands. Mirrors `bands` but in prose form so the LLM doesn't need to parse the structured `bands` object just to confirm the recipe will produce what the user asked for.

These fields are NOT for the validator; they are pure LLM guidance. If user feedback shows the LLM picks the wrong recipe for a class of requests, fix it here first — adjust `terms` / `chooseWhen` / `dontChooseWhen` rather than touching the schema.

## Description authoring

Every property gets a description. For non-trivial fields, cover:

- **What it is** — one sentence stating the field's purpose.
- **Why it exists** — physical or algorithmic motivation.
- **Effect of changes** — what gets bigger/smaller/sharper/blurrier as the value moves.
- **Failure modes at extremes** — what breaks at high/low.
- **Interactions with other fields** — explicit cross-references where behavior depends on another field.
- **Cost implications** — performance/memory hints for Earth Engine.
- **Default and reasoning** — why the default is the default.

The LLM uses these to make decisions when the user gives feedback ("too noisy", "edges look blurry"). Brief property names and ranges are not enough.

Read the backend code (`lib/js/ee/src/<recipe>/`) before writing descriptions — the implementation tells you what each parameter actually controls, which is sometimes different from the GUI tooltip's framing. When you don't know a domain detail, say so in the PR rather than guessing; domain experts can amend.

## Defaults

`defaults.js` exports a `getDefaults()` function returning a complete default model — every field a sensible value, AOI excluded (no sensible default).

- **Function, not static object:** dates often compute from "now" (start of current year, etc.); a function returns fresh values each call.
- **Complete, not partial:** the LLM uses defaults as a baseline to tweak. A complete model means it only emits the fields it actually wants to change — shorter responses, fewer mistakes. The validator's deep merge fills in the rest.

### Auditing implicit defaults

The GUI's `defaultModel` (e.g. `radarMosaicRecipe.js`) is the starting point but not always complete. Values also get set implicitly:

- `componentDidMount` initializers in panel files — e.g. `cloudBuffer.set(0)` in optical mosaic's compositeOptions panel.
- `onChange` handlers that propagate state — e.g. spatial speckle filter set to `NONE` forces multitemporal to `NONE`.
- Conditionally-defaulted values when a panel is first opened.

Audit by grepping each panel:

```bash
grep -n "componentDidMount\|set(" modules/gui/src/app/home/body/process/recipe/<recipe>/panels/**/*.jsx
```

Add anything found to `defaults.js`. radarMosaic was complete; other recipes (especially optical mosaic) won't be.

### Backend defaults vs GUI defaults

`lib/js/ee/src/<recipe>/collection.js` (or equivalent) often defaults parameters differently from the GUI. For radar, the EE function defaults `geometricCorrection='ELLIPSOID'` but the GUI defaults `'TERRAIN'`. The GUI defaults are the canonical user-facing baseline; use those.

## Cross-field rules

`rules.js` exports an array of rule objects:

```js
{
    name: 'shortIdentifier',
    description: 'Human-readable rule statement, exposed to the LLM via recipe_schema.',
    validate: (model) => [{path, message}]
}
```

The description is what the LLM reads. Keep it close in wording to the error message the rule emits — a behavior change then forces both to update together, reducing drift.

**Use `rules.js` when:**
- The constraint depends on values in two or more fields (date ordering, value-relative comparisons).
- The constraint requires computation (current date, dynamic year).
- The constraint is awkward to express in `if/then`.

**Use JSON Schema (`if/then`, `allOf`, `dependentSchemas`) when:**
- A field is required only when another field has a specific value.
- A field's allowed values depend on another field's enum.
- The constraint is about presence/absence rather than relative magnitudes.

Mixing both is fine. The validator runs schema first, then rules, and concatenates errors.

## Shared fragments and LLM bundling

Reusable definitions live in `shared/<fragment>.schema.json` under named `$defs`, and recipes reference them via cross-file `$ref`. The AOI fragment exposes `eeTable`, `polygon`, and `assetBounds`; each recipe composes its own `oneOf` from the variants it allows:

```json
"aoi": {
    "oneOf": [
        {"$ref": "../shared/aoi.schema.json#/$defs/eeTable"},
        {"$ref": "../shared/aoi.schema.json#/$defs/polygon"}
    ]
}
```

Don't reference variants the recipe can't actually use — the schema should reject impossible inputs. Most recipes use `eeTable + polygon`; only `asset` uses `assetBounds`.

The two consumers handle these refs differently:

- **The validator** preloads every `*.schema.json` under `recipes/` by `$id`, so cross-file refs resolve server-side.
- **The LLM** sees only what the `recipe_schema` tool returns. A raw cross-file `$ref` is a dangling pointer with no filesystem to resolve against, and recipe creation silently goes wrong.

`recipes/bundleSchema.js` bridges this: it walks the parameter schema, copies each cross-file `$ref` target into the host's own `$defs`, and rewrites the `$ref` to local. Transitive local refs inside imported subtrees (e.g. `eeTable` → `countryTableId` in the same foreign file) are pulled in too, so the bundled schema is closed under `$ref` resolution. The `recipe_schema` handler bundles before returning; results are cached per `$id`.

Authoring implications:

- **Always set a top-level `$id`** on every recipe and shared fragment. The bundler keys both its file index and its cache on `$id`.
- **Write cross-file `$ref`s naturally.** Don't manually inline shared definitions; the shared files stay the source of truth.
- **Avoid `$defs` name collisions** between a recipe and the fragments it pulls in. The bundler silently skips a foreign def when the host already has the same name. (No collisions today; watch as more recipes migrate.)
- **The LLM sees the bundled schema.** When debugging "the model emitted nonsense", run `bundleSchema(parameterSchema)` and inspect the result — that's what the model was working from.

## Migration from the legacy schemas

`mcp/schemas/_shared/aoi.js` exports a loose `aoiSchema` consumed by the not-yet-tightened recipes. Leave it in place; tighten one recipe at a time. Each migration moves a recipe to `recipes/<recipe>/` and off the loose schema. Delete the legacy file once all recipes have migrated.

Don't batch-convert — each recipe needs the per-recipe domain audit described above, not a mechanical conversion.

## Testing

Each recipe deserves a smoke test that exercises:

- Default model + a polygon AOI validates clean.
- Each `if/then` clause in the schema — both satisfying and violating cases.
- Each rule in `rules.js` — both passing and failing inputs.
- Known boundary cases (today, Sentinel-1 epoch, range edges).
- A couple of regression cases for past bugs.

Run against `validate(recipe, model)` directly — that's the same code path the validator delegates to.

## Common pitfalls

1. **`format: 'date'` silently no-ops without `ajv-formats`.** The plugin is wired in `validate.js`; if you ever construct a separate ajv, remember to call `addFormats(ajv)`.
2. **`oneOf` error verbosity.** When a discriminated union fails, ajv reports errors from every branch. Filter by the `type` discriminator on the consuming side if needed.
3. **`additionalProperties: false` on dates branches** rejects stale fields from GUI form values. The GUI's `valuesToModel` strips them before persisting, so this is fine in practice.
4. **Polygon coordinate order is `[lng, lat]`** (GeoJSON convention). Document it loudly in the description — the LLM otherwise emits `[lat, lng]`.
5. **Country-table-only fields like `level`** must be guarded by `dependentSchemas` on both the table id and the keyColumn — without both guards, `level` becomes accidentally legal for arbitrary tables.
