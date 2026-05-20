# Recipe update knowledge design

Status: partially implemented design note. The current implementation has
rule-derived constraint metadata, a generated update manual, and the
`prepare_update({recipeId, focusPaths})` update-preparation tool. Rich
operational recipe knowledge is still being expanded.

This note captures the target direction for making recipe update specialists
knowledge-rich without putting all recipe semantics into the always-visible
orchestrator prompt, and without hand-coding every possible user request.

The broad specialist architecture lives in `DESIGN_chat_specialists_v2.md`.
This document focuses on recipe update authoring, prompt-cache shape, and the
relationship between static recipe knowledge and deterministic path-oriented
preparation.

## Problem

The current update specialist is good at narrow, explicitly supported edits,
especially date updates. It is weaker for broad semantic requests such as:

```text
Make sure the mosaic renders as quick as possible.
```

For that kind of request, the specialist needs to understand recipe-domain
tradeoffs: which fields affect processing time or memory, which options trade
quality for speed, which values are reasonable, and which fields interact.

The generated `MOSAIC` update manual now provides structural information such
as paths, value shape, and validation constraints. It still needs richer
operational knowledge in a general reusable form. The JSON Schema does not
contain most speed/rendering/quality tradeoffs; useful source prose often lives
in GUI labels/tooltips, public docs, or backend implementation details and must
be distilled before it becomes runtime prompt input.

## Goals

- Let the specialist reason over rich recipe knowledge, not just validation
  shape.
- Keep the orchestrator prompt small and recipe-agnostic.
- Keep static recipe knowledge cacheable and byte-stable.
- Keep the compact static specialist package small enough for Nova prompt-cache
  limits while still useful to local small-model development.
- Avoid keyword-matching user instructions in deterministic tool code.
- Avoid requiring many separate authoring files for each recipe type.
- Keep patch generation safe by deterministically expanding dependencies and
  write scope before `recipe_patch`.
- Allow recipe support to start minimal and improve as richer facts are added.
- Make operational recipe knowledge reusable by update, describe, and future
  troubleshooting/advice specialists rather than baking it into one generated
  update-manual prose block.

## Model profile stance

The design should be model-neutral. It should work with the current local Qwen
development profile and with a future Bedrock Nova production profile.

Use Qwen as a useful development constraint: if the compact manual,
path-focused preparation, dependency expansion, and validation loop work on a
smaller local model, the same structure should generally be easier for a larger
managed production model. Switch development focus to Nova only when Qwen starts
forcing design choices that would be undesirable in production.

Acceptable Qwen pressure:

- make manuals clearer and more compact
- reduce duplicated schema prose
- make write scopes explicit
- add evals for subtle recipe cases
- generate focused artifacts instead of raw schema dumps

Bad Qwen pressure:

- brittle keyword routers
- deterministic tools inferring natural-language intent
- prompt branches for every user phrasing
- extra tool round trips only because the model loses context
- hand-written recipe hacks that do not generalize
- removing useful recipe semantics from the manual just to fit the model

Generated artifacts may have profiles, for example `compact` and `full`, but
they must come from the same source metadata. The `compact` profile is the
default target for Qwen and for cacheable Nova specialist prompts. A fuller
profile is optional and should be justified by evals.

## Responsibility split

The update flow should separate language reasoning from deterministic recipe
mechanics:

- **Update specialist** receives the user instruction and static recipe manual.
  It decides which recipe paths are relevant and what tradeoffs may matter.
- **Preparation/closure tool** receives formal paths, not user prose. It loads
  current values, returns path facts, expands dependencies, and defines the
  allowed write scope.
- **GUI/shared validator** remains authoritative for final validation and
  persistence.

In short:

```text
user request -> specialist chooses paths -> prepare_update expands facts/scope
             -> specialist writes JSON Patch -> recipe_patch validates/applies
```

The deterministic preparation layer should not infer intent from natural
language. Passing the original instruction to it would encourage keyword
matching and hidden per-request heuristics. The specialist already has the
instruction in its own prompt and logs.

## Static recipe manual

Each update specialist should get a compact, path-first recipe manual in its
static system prompt. This manual is cacheable because it is stable for a given
recipe type and version.

The manual should be generated from structured recipe metadata rather than
hand-written as a separate prompt file. The manual is a generated artifact, not
the source of truth. It can include facts from schema, validation rules, and
reusable operational recipe knowledge.

A useful generated field entry shape is:

```text
/compositeOptions/tileOverlap
Purpose: Sentinel-2 tile-overlap handling.
Values:
- KEEP: keeps duplicate S2 tile observations; highest memory risk.
- QUICK_REMOVE: removes most duplicate tile observations; preferred fast/default
  memory reduction.
- REMOVE: removes all overlap; extra preprocessing; usually no meaningful memory
  gain over QUICK_REMOVE.
Related: /sources/dataSets
```

The manual should cover:

- canonical model-relative paths
- field meaning
- allowed values or range shape
- value tradeoffs
- common related paths
- high-level recipe sections

It should not contain current recipe state, user identity, selected GUI state,
or runtime values.

## Reusable operational knowledge

Operational knowledge covers speed, rendering risk, memory/data volume,
quality/completeness tradeoffs, availability, and advice-oriented inspection
clues. It is broader than update guidance and should not be modeled as a
deterministic analyzer first. The immediate consumer is the update manual, but
the same source facts should be renderable later for a troubleshooting/advice
specialist answering questions such as:

```text
Why does this recipe render slowly?
What settings should I inspect?
How can I make this recipe cheaper to preview?
```

Across recipe types, operational facts should describe the execution shape and
known failure modes instead of relying on simple option-count heuristics. A
recipe with more selected methods is not necessarily slower if those methods are
folded into an existing per-item map. Conversely, one option can be extremely
expensive if it adds spatial neighborhood work, a collection reduction, an extra
collection pass, or greatly increases the number of observations carried through
the graph.

Reusable cost vocabulary should cover at least:

- `observation-volume`: more scenes, wider date windows, extra sources, or
  duplicate observations increase memory pressure and downstream latency.
- `spatial-operation`: neighborhood, morphology, buffering, distance-transform,
  or other "look around each pixel" work. These can be much more expensive than
  pixel-by-pixel band math.
- `collection-reduction`: reducers over an image collection, percentile filters,
  medoids, or similar operations that need to inspect many observations together.
- `extra-pass`: options that add another collection map/reduce/mask pass rather
  than only changing work already performed in an existing pass.
- `heavy-per-item`: per-scene/per-image geometry, calibration, correction, or
  ancillary-data work that is expensive even when expressed inside an existing
  map.
- `availability`: settings that change which backend collections are used or
  whether data exists for the requested time/place.
- `warning`: high-impact settings that commonly cause severe latency, memory
  failures, or surprising quality loss and should be called out explicitly.

The fact metadata should make memory and latency distinct where the domain knows
the difference. In Earth Engine, memory pressure is often the hard failure mode,
but the same graph shape usually also becomes slow. Specialist guidance should
therefore avoid flattening everything to "fast/slow"; it should identify whether
the issue is likely memory, latency, availability, or quality.

Facts may be semi-structured instead of fully machine-evaluable predicates. The
important property is reusable shape and topic tagging, not deterministic
execution. A compact fact can look like:

```js
{
  path: '/compositeOptions/cloudBuffer',
  topics: ['performance', 'memory', 'latency', 'quality', 'spatial-operation'],
  severity: 'warning',
  warning: 'Cloud buffering is a high-cost spatial operation and can make large or cloudy jobs very slow or fail.',
  guidance: [
    '0 avoids cloud buffering and is preferred for fastest rendering.',
    '120/600 should be used only when the user wants stricter cloud-edge masking and accepts the cost.'
  ],
  inspectWhen: [
    'Recipe renders slowly',
    'User asks for faster preview',
    'Render fails with memory or timeout symptoms',
    'Unexpected missing pixels around clouds'
  ],
  tradeoffs: [
    'Lower buffer improves speed/reliability but may leave cloud-edge artifacts.'
  ]
}
```

Interactions should use the same model:

```js
{
  paths: ['/sources/dataSets', '/compositeOptions/corrections'],
  topics: ['performance', 'rendering', 'validation'],
  guidance: [
    'Using both Landsat and Sentinel-2 increases data volume.',
    'Mixed sources require CALIBRATE and sceneSelectionOptions.type=ALL.'
  ],
  inspectWhen: [
    'Slow rendering',
    'Source changes',
    'Calibration or validation errors'
  ]
}
```

The update-manual generator can render facts tagged `performance` into a
compact "speed/rendering" section. A future advice specialist can select the
same facts by `topics` and `inspectWhen` without depending on update-specific
patch workflow wording.

Warning-level facts should be rendered distinctly from normal field guidance.
They represent settings that specialists should actively mention when proposing,
keeping, or troubleshooting risky values. Examples include expensive spatial
operations, expensive corrections, collection filters that add reducers/passes,
and data-availability caveats.

## Preparation tool

The update preparation tool is deterministic and path-oriented:

```js
prepare_update({
  recipeId,
  focusPaths
})
```

Initial version should use only `focusPaths`. Tags may be added later if a
concrete need appears, but they should not be required for v1. If tags are
introduced, they must come from a bounded recipe-defined vocabulary, not
free-form user prose.

The tool returns a complete update work packet:

```js
{
  baseModelHash,
  focusPaths,
  dependentPaths,
  writablePaths,
  currentValues,
  fieldFacts,
  dependencyFacts,
  validationRules
}
```

Where:

- `focusPaths` are the paths chosen by the specialist.
- `dependentPaths` are deterministic companion paths that may need to be read
  or patched to keep the recipe valid.
- `writablePaths` is the allowed write set, normally
  `focusPaths + dependentPaths`.
- `currentValues` contains current effective-model values for all relevant
  paths.
- `fieldFacts` contains facts for the focus and dependent paths.
- `dependencyFacts` explains why companion paths were included.
- `validationRules` summarizes relevant schema/rule constraints in
  LLM-friendly terms.

For example, if the specialist focuses `/dates/targetDate`, the tool can add
`/dates/seasonStart`, `/dates/seasonEnd`, `/dates/yearsBefore`, and
`/dates/yearsAfter`. If it focuses `/sources/dataSets`, the tool can add
correction, scene-selection, scene, and cloud-mask availability dependencies.

The tool may return facts for paths the specialist did not choose, but they
must be clearly distinguished as dependent/companion paths rather than primary
focus paths.

## Patch scope

The update specialist should only patch paths returned in `writablePaths`.

The strongest future version would issue a preparation token or short-lived
session id, and `recipe_patch` would reject operations outside the prepared
write set. This is optional for the first design slice, but it is the clearest
way to prevent broad-request drift.

Even without a token, the specialist prompt should treat `writablePaths` as a
hard boundary.

## Facts vs policy

Recipe metadata should distinguish facts from policy.

Facts describe the model:

- what a field means
- what values do
- which fields interact
- expected costs or quality effects
- reasonable ranges

Policy recommends behavior:

- for fastest preview, prefer this setting
- for production quality, avoid that shortcut
- ask before reducing scientific quality

Some light policy is useful, but recipe metadata should mostly expose facts.
The specialist should do the final judgment in context, especially for
open-ended requests.

## Single source of truth

Do not make recipe authors maintain a schema, prompt file, closure file, and
knowledge-tool document independently.

The target authoring shape is one browser-safe recipe spec that can generate
purpose-specific artifacts:

```js
{
  schema,
  defaults,
  rules,
  toEffectiveModel,

  llm: {
    sections,
    fields,
    interactions,
    operationalFacts,
    profiles
  }
}
```

Generated consumers:

- JSON Schema / validator shape
- static path-first update manual
- preparation-tool field facts
- dependency expansion metadata
- advice/troubleshooting specialist facts, especially operational topics such as
  performance, rendering, quality, and validation
- optional future GUI labels/tooltips, where practical

Minimum support for a new recipe can be generated from schema paths, enums,
defaults, and validation rules. Richer AI behavior comes from adding field
facts, value tradeoffs, interactions, operational facts, and optional profiles.

## Authoring source material

The generated manual and `prepare_update` facts should come from structured
recipe metadata, not directly from GUI translations or public documentation.

Recommended source material when adding metadata for a recipe:

- recipe schema, defaults, rules, and `toEffectiveModel`: authoritative for
  model shape, defaults, dormant fields, validation, and path behavior
- GUI recipe panels: useful for understanding field grouping, conditional
  visibility, disabled options, presets, and GUI-side defaults
- English GUI labels/tooltips: useful user-facing prose that often captures
  tradeoffs, but not authoritative and not necessarily path-mapped
- docs.sepal.io recipe documentation: useful high-level behavior and workflow
  guidance, but may lag code and should be distilled before use
- EE/backend implementation and tests: authoritative when behavior,
  performance, or availability is unclear

The implementor should distill these sources into structured facts beside the
recipe spec. Do not copy long tooltip or documentation text verbatim into
runtime prompts, and do not make translations or docs the runtime source of
truth. They are inputs to authoring, not generated artifacts.

When deriving operational facts from backend/EE source, inspect the actual graph
shape before writing guidance. In particular, look for:

- where recipe fields enter the backend call chain
- whether a setting changes source collection size, joins, filters, or selected
  datasets
- whether work happens inside an existing per-image/per-item map or adds a new
  map pass
- reducers over collections, arrays, bands, or neighborhoods
- spatial operations such as buffers, distance transforms, morphology,
  neighborhood reducers, feature distances, and geometry transforms
- exact-removal or cleanup options that add bands, reduce the collection, then
  remap/mask images
- data-availability changes such as switching from TOA to SR collections
- source comments, GUI tooltips, and tests that explain why an expensive-looking
  option exists

The resulting fact should state what the code does in operational terms, then
separate impact from policy. For example, "this option adds a collection
percentile reduction and an extra masking pass" is a source-derived fact;
"remove optional filters first when optimizing for render reliability" is policy
that the specialist can apply in context.

For example, tooltip/doc prose about Sentinel-2 tile overlap should become
reusable metadata such as:

```js
{
  path: '/compositeOptions/tileOverlap',
  purpose: 'Sentinel-2 tile overlap handling',
  values: {
    KEEP: {memory: 'highest', effect: 'keeps duplicate observations'},
    QUICK_REMOVE: {memory: 'lower', effect: 'preferred default memory reduction'},
    REMOVE: {memory: 'similar to QUICK_REMOVE', cost: 'extra preprocessing'}
  },
  topics: ['performance', 'memory', 'latency', 'quality', 'observation-volume'],
  guidance: [
    'KEEP avoids overlap-removal preprocessing but carries duplicate observations downstream, increasing memory and latency risk.',
    'QUICK_REMOVE is the usual best choice for reducing Sentinel-2 tile-overlap memory pressure.',
    'REMOVE is more exact but adds an extra collection-level cleanup step and often gives little memory benefit beyond QUICK_REMOVE.'
  ],
  inspectWhen: [
    'Slow Sentinel-2 rendering',
    'Earth Engine memory errors',
    'Tile-boundary artifacts',
    'Time-series workflows such as CCDC',
    'User asks for faster preview'
  ],
  tradeoffs: [
    'Deduplication reduces duplicate observation volume, but exact cleanup can add extra processing.'
  ]
}
```

## Prompt cache

Prompt-cache-friendly shape:

- static base update prompt
- static recipe manual generated from recipe facts
- dynamic user request
- dynamic `prepare_update` result
- dynamic patch result

The static manual should be stable and byte-identical across users for a given
recipe version. Runtime GUI state and current recipe values belong in tool
results, not the cacheable manual.

For Nova 2 Lite, treat the prompt-cache budget as smaller than the context
window. The model may accept a very large prompt, but the cacheable repeated
prefix should fit within the Nova cache limits tracked in
`DESIGN_chat_specialists_v2.md`. As a practical target, the compact static
specialist package should stay below roughly 18K tokens, leaving room for base
instructions and cache marker overhead.

Prompt caching can reduce cost and latency for static recipe knowledge, but it
does not remove the model-attention cost of noisy prompts. The manual should
therefore be compact and path-first, not a full raw schema dump.

Cache accounting should be split by role:

- update specialist static prompt plus recipe manual
- create specialist static prompt plus recipe manual
- orchestrator static prompt
- orchestrator always-visible tool schemas
- dynamic runtime context, tool results, and conversation history

The orchestrator budget is a separate concern. Recipe semantics should not be
moved into orchestrator tool descriptions to make specialist prompts smaller.
For Nova-family profiles where tools are not cacheable, long tool descriptions
are a recurring per-round cost and a source of routing confusion.

## Rejected or deferred alternatives

### Full schema in every update prompt

Rich schema descriptions are useful source material, but raw JSON Schema is not
an ideal LLM manual. It is verbose, local to properties, and awkward for
cross-field tradeoffs, operational profiles, and user-goal guidance. The
current MOSAIC schema also lacks most operational descriptions.

### User instruction passed to preparation tool

This would make the deterministic tool responsible for natural-language intent
recognition. That encourages brittle keyword matching and hides important
judgment outside the specialist.

### Separate knowledge and closure tools

The concepts are distinct, but the LLM-facing round trip can be one
`prepare_update` call for update preparation. Static reusable knowledge should
stay in generated manuals/prompts, not require an extra per-update tool round
trip. Internally, implementation can keep field-fact lookup, operational-fact
rendering, and dependency expansion separate.

### Tags in v1

Tags such as `performance`, `quality`, or `cloudMasking` may be useful later,
but v1 should start with explicit `focusPaths`. The static manual should make
canonical paths easy for the specialist to select.

## Open questions

- Should `recipe_patch` enforce `writablePaths` via a preparation token/session?
- How compact should the generated static manual be for large recipe types?
- Can GUI labels/tooltips and LLM facts share one source without making GUI
  translations harder?
- What is the minimum acceptable generated manual for a recipe with no rich
  `llm` metadata yet?
- How should high-impact tradeoffs be surfaced back to the orchestrator for
  user confirmation?
- What purpose-specific renderings should reusable operational facts support
  first: update, describe, troubleshooting/advice, or UI hints?
