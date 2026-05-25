# Recipe update knowledge design

Status: target direction with partial implementation. The current implementation
has rule-derived constraint metadata, a generated update manual, and the
`prepare_update({recipeId, focusPaths})` update-preparation tool. The target
direction is a handle-based picker/prepare/updater workflow behind the same
`update_recipe(recipeId, instruction)` boundary. Rich operational recipe
knowledge and handle metadata are still being expanded.

This note captures the target direction for making recipe update specialists
knowledge-rich without putting all recipe semantics into the always-visible
orchestrator prompt, and without hand-coding every possible user request.

The broad specialist architecture lives in `DESIGN_chat_specialists_v2.md`.
This document focuses on recipe update authoring, prompt-cache shape, and the
relationship between static recipe knowledge, handle-based preparation, and
deterministic update mechanics.

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
as paths, value shape, and validation constraints. The target picker catalog
should expose short semantic handles instead of JSON Pointer paths, and it still
needs richer operational knowledge in a general reusable form. The JSON Schema
does not contain most speed/rendering/quality tradeoffs; useful source prose
often lives in GUI labels/tooltips, public docs, or backend implementation
details and must be distilled before it becomes runtime prompt input.

## Goals

- Let the specialist reason over rich recipe knowledge, not just validation
  shape.
- Keep the orchestrator prompt small and recipe-agnostic.
- Keep static recipe knowledge cacheable and byte-stable.
- Keep the compact static specialist package small enough for Nova prompt-cache
  limits while still useful to local small-model development.
- Avoid keyword-matching user instructions in deterministic tool code.
- Avoid requiring many separate authoring files for each recipe type.
- Keep patch generation hidden from the model: specialists choose handles and
  values; deterministic code maps handles to internal paths, diffs, and
  applies through the GUI patch bridge.
- Allow recipe support to start minimal and improve as richer facts are added.
- Make operational recipe knowledge reusable by update, describe, and future
  troubleshooting/advice specialists rather than baking it into one generated
  picker-catalog prose block.

## Model profile stance

The design should be model-neutral. It should work with the current local Qwen
development profile and with a future Bedrock Nova production profile.

Use Qwen as a useful development constraint: if the compact handle catalog,
focused preparation, dependency expansion, and validation loop work on a smaller
local model, the same structure should generally be easier for a larger managed
production model. Switch development focus to Nova only when Qwen starts forcing
design choices that would be undesirable in production.

Acceptable Qwen pressure:

- make generated catalogs and prepared packets clearer and more compact
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
- removing useful recipe semantics from generated artifacts just to fit the
  model

Generated artifacts may have profiles, for example `compact` and `full`, but
they must come from the same source metadata. The `compact` profile is the
default target for Qwen and for cacheable Nova specialist prompts. A fuller
profile is optional and should be justified by evals.

## Responsibility split

The update flow should separate language reasoning from deterministic recipe
mechanics:

- **Picker specialist** receives the user instruction and static recipe handle
  catalog. It decides which handles are relevant and what tradeoffs may matter.
  It does not pick values and does not call tools.
- **Preparation/closure step** receives handles, not user prose. It loads
  current values, returns focused handle facts, expands deterministic validation
  dependencies, and defines the writable handle set.
- **Updater specialist** receives the instruction and prepared handle packet. It
  picks values, calls the recipe-value update tool, iterates on validation
  errors, and returns the user-facing summary.
- **Recipe-value update tool** maps handles to internal paths, diffs current vs
  requested values, emits JSON Patch internally, and calls the GUI patch
  bridge.
- **GUI/shared validator** remains authoritative for final validation and
  persistence.

In short:

```text
user request -> picker chooses handles -> prepare_update expands facts/scope
             -> updater sets values -> update_recipe_values generates JSON Patch
             -> GUI patch bridge validates/applies
```

The deterministic preparation layer should not infer intent from natural
language. Passing the original instruction to it would encourage keyword
matching and hidden per-request heuristics. The picker and updater already have
the instruction in their own prompts and logs.

## Chosen direction: picker, prepare, updater

The current live implementation uses `prepare_update -> recipe_patch`: the
specialist picks focus paths, receives a bounded work packet, then authors JSON
Patch operations. This works for many small edits, and it is already wired into
the GUI validation/persistence bridge. It also exposes a real reliability
problem: the model can understand the intended semantic edit but fail on RFC
6902 mechanics such as invented pointers, array indexes, or add-vs-replace.

Model-authored JSON Patch is transitional, not the target. The chosen direction
is a picker/prepare/updater workflow using short semantic handles and requested
values. The orchestrator boundary remains `update_recipe(recipeId,
instruction)`.

Alternatives considered:

1. **Keep JSON Patch.** Lowest implementation cost because it is already live.
   It keeps outputs small and scopes writes explicitly, but continues to make
   the model responsible for pointer and operation mechanics. This path should
   only receive enough hardening to keep the current implementation usable.

2. **Whole recipe JSON.** The archived implementation used this shape and
   worked well because the model's task was natural: rewrite a JSON object into
   the desired state. It avoids patch mechanics entirely and is attractive for
   creation. The costs are larger prompts/outputs, broader blast radius, and
   reliance on the model to preserve unchanged fields.

3. **Panel or submodel JSON.** This mirrors the GUI: prepare returns the
   relevant recipe panels or coherent submodels, the model returns updated
   panel JSON, deterministic code merges those fragments into the full effective
   model, diffs old vs new, and sends generated JSON Patch to the GUI bridge.
   This keeps the model's task natural while bounding blast radius to panel
   roots. The main risk is unchanged-value preservation inside a panel; large
   panels may need further splitting.

4. **Raw path/value pairs.** The model submits `{path, value}` pairs
   rather than operations. Deterministic code validates scope/addressability and
   emits JSON Patch. This removes RFC 6902 mechanics but still exposes internal
   JSON Pointer paths. The chosen workflow keeps the value-setting idea but uses
   stable handles instead of paths.

Guardrails for the chosen direction:

- Avoid expanding prompt guidance around RFC 6902 unless it is needed to keep
  the current transitional tool usable.
- Prefer tests that assert semantic final model changes, validation failures,
  and user-facing outcomes over tests that lock in patch-op shapes.
- Do not build recipe creation around model-authored JSON Patch; model creation
  should reuse the picker/prepare/updater workflow over `defaultModel()`.
- Keep the GUI patch bridge and full recipe validation authoritative regardless
  of the model-facing contract.
- Keep new recipe metadata useful across picker catalogs, prepared packets,
  validation feedback, summaries, and future describe/advice specialists.

## Target workflow

```text
update_recipe(recipeId, instruction)
  -> picker specialist
  -> prepare_update
  -> updater specialist
  -> update_recipe_values
  -> answer
```

The orchestrator still sees one `update_recipe` tool. The split is internal to
that tool and should be reusable for creation by running the same workflow over
`defaultModel()` instead of an existing recipe model.

### Picker

The picker translates the natural-language instruction into recipe field
handles. It is recipe-type-aware, cacheable, tool-free, and should run as a
single structured LLM call.

Picker prompt contents:

- compact handle catalog for the recipe type
- per-field descriptions and purpose
- operational knowledge such as performance, cost, availability, and tradeoffs
- cross-property knowledge useful for selecting related fields

Picker prompt omissions:

- current recipe values
- validation rule details
- value-picking instructions
- patch mechanics

Picker output should be only handles, with no rationale in v1:

```js
{fields: ['datasets', 'cloudMethods', 'cloudFilter']}
```

Leaving out rationale keeps token cost down and avoids passing fuzzy picker
reasoning to the updater. If logs later show picker decisions are hard to
debug, rationale can be added to diagnostics without becoming updater input.

### Handles

The model should not use JSON Pointer paths as its primary field handles.
Internal paths are deterministic metadata behind the tool boundary. LLM-facing
handles should be short, stable, semantic lower-camel identifiers with as few
words as clarity allows:

```text
datasets
cloudFilter
cloudMethods
s2CloudScore
landsatCloudMask
landsatShadowMask
landsatCirrusMask
corrections
tileOverlap
targetDate
dateWindow
filters
```

Handles should come from explicit recipe metadata and be transformed
programmatically for picker catalogs, prepare lookup, validation feedback,
summaries, and logs. The exact source file is less important than avoiding
duplication and keeping one deterministic handle-to-path mapping.

Handle granularity rules for v1:

- Prefer one handle per atomic settable recipe value.
- Avoid one-handle-to-many-path clusters. If a broad move needs many fields,
  the picker should return multiple concrete handles.
- `datasets` represents the whole source-membership object, because changing
  "only Landsat" is a coherent membership update.
- Config arrays such as cloud methods are whole-value handles, not
  index-addressable handles.
- Do not expose group handles such as `cloudMasking` or `performance` in v1.
  They require group descriptions, group expansion logic, and another model
  choice.
- For MOSAIC v1, expose `filters` as one whole-array handle because filters are
  a material rendering-cost lever. Do not expose per-filter item handles until a
  concrete edit need appears.

### Programmatic prepare

`prepare_update` should run programmatically after picker output. It receives
handles, not user prose, and expands only deterministic validation dependencies
in v1. Semantic breadth belongs in the picker catalog; prepare should not become
a hidden natural-language policy engine.

The prepared object is the contract between picker and updater. It should be
handle-keyed and contain only the subset the updater may edit:

- current value per handle
- field description and value guidance
- allowed values, labels, ranges, and examples where available
- per-handle validation rules
- cross-handle validation rules
- dependency reasons for fields pulled in by closure
- `baseModelHash`

For fields without a current value, the prepared object may include examples or
templates plus a source-of-truth classification:

- model-selectable
- user-required
- GUI-context-required
- unsupported by chat

The updater must not invent values for user-required or GUI-context-required
fields.

### Updater

The updater is generic and recipe-agnostic. Its prompt explains how to read the
prepared format, choose values, satisfy validation rules, call the recipe-value
update tool, recover from validation errors, and summarize applied changes. It
should know nothing about a specific recipe type except what the prepared
object says.

The updater owns the `update_recipe_values` tool call so it can iterate on
validation errors without bouncing through the orchestrator or picker. Each
update attempt should submit all values together:

```js
update_recipe_values({
  baseModelHash,
  writableHandles: ['datasets', 'cloudMethods'],
  values: {
    datasets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']},
    cloudMethods: ['sepalCloudScore', 'landsatCFMask']
  }
})
```

Retries should also submit a full corrected value set for the current
attempt, not tiny incremental edits. This preserves atomic cross-field
validation.

The updater returns the final user-facing summary itself after a successful
update. It has the relevant instruction, prepared fields, chosen values, update
result, and validation history. This is intentional: the summary should explain
what changed and why in user language, including the impact of Earth Engine
concepts such as mapping, reductions, or spatial operations without exposing
technical implementation terms. A separate summarizer should remain a fallback
mechanism, not the primary design.

### Recipe-value update tool

`update_recipe_values` is deterministic:

```text
writableHandles + values + current values + baseModelHash
  -> internal paths
  -> JSON Patch ops
  -> GUI patch bridge
```

The updater never authors RFC 6902. Validation and update errors returned to the
updater should be expressed in handles, not paths. Internal paths may appear in
logs, but the model should never need to see them.

`writableHandles` is passed through from the prepared packet. The tool rejects
any value whose handle is outside that set before mapping handles to internal
paths. A preparation token/session can be added later for cross-process
hardening, but the in-process boundary is unconditional.

### Missing information and state

Any specialist step may discover missing information. This is not specific to
recipe update; creation and other workflows can hit the same case.

The preferred interaction is explicit, not inferred from the next free-text
message:

1. A step returns structured `needs_info`.
2. The chat UI opens a question panel tied to a pending action id.
3. The user answers that panel or cancels it.
4. The workflow resumes or clears the pending action.

Pending action state should be stored with the conversation as structured
workflow state, not raw specialist message history and not extra orchestrator
chat context. It should include enough to reconstruct a bounded next call:

- workflow type and phase
- pending action id
- recipe id/type
- original instruction
- selected handles if picker already ran
- prepared object if prepare already ran
- `baseModelHash` if known
- question asked
- created metadata

On resume, verify that any saved `baseModelHash` is still current. If stale,
rerun prepare for the selected handles before invoking the updater. Also verify
that selected handles still exist and apply to the current recipe state; if they
do not, fail clearly or rerun the picker rather than preparing a broken packet.

Do not automatically dump map or GUI context into recipe update. The
orchestrator or workflow wrapper should include sparse external context only
when the user request actually depends on it, for example "what I am looking
at" or "use the selected area". Recipe-state and validation context belongs in
the prepared object; map state and earlier-user-message context belong in the
orchestrator-supplied instruction/context.

The first version does not need a time-based expiry policy. Explicit answer,
cancel, conversation switch, stale `baseModelHash`, and stale handles are enough
to define the lifecycle. Old pending-state cleanup can be added later as
housekeeping.

If the user types a normal chat message while a pending action exists, do not
silently consume that message as the answer. The explicit question panel owns
answer/cancel for the pending action; ordinary chat input starts a normal turn
or is blocked by the UI until the panel is resolved.

### Metrics

This workflow needs first-class metrics from the start:

- picker input/output tokens
- selected handle count
- prepared handle count
- prepared object bytes or estimated tokens
- updater attempts and tokens
- updater final-summary tokens
- update validation failures
- `needs_info` count and cancellation count
- total workflow duration and token cost

The expected token advantage is not fewer LLM calls in the happy path. It is
prompt specialization: the full recipe catalog appears only in the picker call,
while updater rounds work on a prepared subset with a generic cacheable prompt.

## Static picker catalog and field knowledge

Each recipe type should generate a compact picker catalog for the picker
specialist. The catalog is cacheable because it is stable for a given recipe
type and version. It should be handle-first, not path-first: the model sees
short semantic handles, while deterministic metadata maps handles to internal
paths.

The catalog and the prepared field packets should be generated from structured
recipe metadata rather than hand-written as separate prompt files. Generated
artifacts are not the source of truth. They can include facts from schema,
validation rules, and reusable operational recipe knowledge, rendered
differently for picker and updater.

A useful generated picker entry shape is:

```text
tileOverlap
Purpose: Sentinel-2 tile-overlap handling.
Values:
- KEEP: keeps duplicate S2 tile observations; highest memory risk.
- QUICK_REMOVE: removes most duplicate tile observations; preferred fast/default
  memory reduction.
- REMOVE: removes all overlap; extra preprocessing; usually no meaningful memory
  gain over QUICK_REMOVE.
Related: datasets
```

The picker catalog should cover:

- stable handles
- field meaning
- broad value shape and important value tradeoffs
- common related handles
- high-level recipe sections

It should not contain current recipe state, user identity, selected GUI state,
runtime values, detailed validation rules, or value-picking instructions. Those
belong in the prepared packet for the updater after the picker has selected a
small subset of handles.

## Reusable operational knowledge

Operational knowledge covers speed, rendering risk, memory/data volume,
quality/completeness tradeoffs, availability, and advice-oriented inspection
clues. It is broader than update guidance and should not be modeled as a
deterministic analyzer first. The immediate consumers are the picker catalog
and prepared field packets, but the same source facts should be renderable
later for a troubleshooting/advice specialist answering questions such as:

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
execution.

Use one canonical envelope with typed variants:

- Field facts use `handle`, `internalPath`, `purpose`, `topics`, optional
  `severity`, `guidance`, `inspectWhen`, and `tradeoffs`.
- Enum-bearing fields may add a `values` map for per-value memory, cost,
  quality, or behavior notes.
- Scalar/range/array fields should use flat `guidance` and `tradeoffs` unless
  they have a small named value set worth describing per value.
- Interaction facts use `handles` and `internalPaths` instead of one `handle`.

For example, a scalar/range-style fact can look like:

```js
{
  handle: 'cloudBuffer',
  internalPath: '/compositeOptions/cloudBuffer',
  purpose: 'Cloud-edge buffer distance',
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

Interactions use the same envelope but target a set of handles:

```js
{
  handles: ['datasets', 'corrections'],
  internalPaths: ['/sources/dataSets', '/compositeOptions/corrections'],
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

The picker-catalog generator can render facts tagged `performance` into a
compact "speed/rendering" section, while preparation can include detailed
value/rule guidance only for selected handles. A future advice specialist can
select the same facts by `topics` and `inspectWhen` without depending on
update-specific patch workflow wording.

Warning-level facts should be rendered distinctly from normal field guidance.
They represent settings that specialists should actively mention when proposing,
keeping, or troubleshooting risky values. Examples include expensive spatial
operations, expensive corrections, collection filters that add reducers/passes,
and data-availability caveats.

## Preparation step

The target preparation step is deterministic and handle-oriented:

```js
prepare_update({
  recipeId,
  handles: ['datasets', 'cloudMethods']
})
```

The current live tool accepts `focusPaths`; that is transitional. The target
workflow should call preparation programmatically after the picker, using
handles selected from the static picker catalog. Tags may be added later if a
concrete need appears, but they should not be required for v1. If tags are
introduced, they must come from bounded recipe metadata, not free-form user
prose.

The step returns a complete prepared packet for the updater:

```js
{
  baseModelHash,
  pickedHandles,
  dependentHandles,
  writableHandles,
  fields,
  dependencyFacts,
  validationRules
}
```

Where:

- `pickedHandles` are the handles chosen by the picker.
- `dependentHandles` are deterministic companion handles that may need to be
  read or changed to keep the recipe valid.
- `writableHandles` is the allowed write set, normally
  `pickedHandles + dependentHandles`.
- `fields` is keyed by handle. Each entry contains current effective value,
  handle-local description, value guidance, allowed values/labels/ranges,
  examples where available, source-of-truth classification for missing values,
  and any handle-local validation facts.
- `dependencyFacts` explains why companion handles were included.
- `validationRules` summarizes relevant schema/rule constraints in
  LLM-friendly terms.

For example, if the picker selects `targetDate`, preparation can add
`dateWindow` companions needed by validation. If it selects `datasets`,
preparation can add correction, scene-selection, and cloud-mask availability
companions.

The step may return facts for handles the picker did not choose, but they must
be clearly distinguished as dependent/companion handles rather than primary
picked handles.

## Update scope

The updater should only set values for handles returned in `writableHandles`.
The model should not see or author JSON Pointer paths.

The strongest future version would issue a preparation token or short-lived
session id, and `update_recipe_values` would reject values outside the prepared
write set. This is optional for the first implementation slice, but it is the
clearest way to prevent broad-request drift.

Even without a token, `update_recipe_values` must enforce `writableHandles` in
code. The updater prompt should state the same boundary, but prompt text is not
a boundary. Validation/update errors returned to the updater should use handles,
not paths.

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
    knowledge,
    profiles
  }
}
```

Generated consumers:

- JSON Schema / validator shape
- static handle-first picker catalog
- prepared field packets for the updater
- dependency expansion metadata
- advice/troubleshooting specialist facts, especially operational topics such as
  performance, rendering, quality, and validation
- optional future GUI labels/tooltips, where practical

Minimum support for a new recipe can be generated from schema paths, enums,
defaults, and validation rules, but exposed update fields should get explicit
stable handles. Richer AI behavior comes from adding field facts, value
tradeoffs, interactions, operational facts, and optional profiles.

## Authoring source material

The generated picker catalog and prepared field facts should come from
structured recipe metadata, not directly from GUI translations or public
documentation.

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

## Captured MOSAIC cloud-masking notes

These notes are working source material for future MOSAIC `knowledge.js` and
catalog/preparation-generation slices. They capture behavior observed while testing the
update specialist and facts checked against the GUI implementation on
2026-05-21. They are not intended to be copied verbatim into prompts; distill
them into structured recipe metadata with tests.

### User intent shape

Users are more likely to complain that a mosaic does not render, a layer does
not load, or clouds remain visible than to use precise terms such as "optimize
latency". For Earth Engine-backed mosaics, failed rendering is often memory
pressure first and slowness second. Specialist guidance should therefore treat
"render fails", "layer does not load", "timeout", and "very slow" as related
operational symptoms, but still distinguish memory, latency, availability, and
quality when the fact source supports it.

For a broad request such as "there are still clouds, remove them", the expected
first move is usually a coherent cloud-masking strategy, not an isolated
threshold tweak. The specialist should consider the source groups currently in
the recipe and adjust source-appropriate masking settings together. It should
avoid changing expensive performance levers such as cloud buffering unless the
user specifically mentions cloud-edge haze or border artifacts.

### GUI simple presets

The optical mosaic GUI has a simple cloud-masking control with `MODERATE`,
`AGGRESSIVE`, and read-only `CUSTOM` states in:

```text
modules/gui/src/app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions.jsx
```

The preset detection only compares this subset of fields:

```js
MODERATE: {
  includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
  sentinel2CloudScorePlusBand: 'cs_cdf',
  sentinel2CloudScorePlusMaxCloudProbability: 45,
  landsatCFMaskCloudMasking: 'MODERATE',
  landsatCFMaskCloudShadowMasking: 'MODERATE',
  landsatCFMaskCirrusMasking: 'MODERATE',
  sepalCloudScoreMaxCloudProbability: 30
}

AGGRESSIVE: {
  includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
  sentinel2CloudScorePlusBand: 'cs',
  sentinel2CloudScorePlusMaxCloudProbability: 35,
  landsatCFMaskCloudMasking: 'AGGRESSIVE',
  landsatCFMaskCloudShadowMasking: 'AGGRESSIVE',
  landsatCFMaskCirrusMasking: 'AGGRESSIVE',
  sepalCloudScoreMaxCloudProbability: 25
}
```

`CUSTOM` means the current values do not match either preset for those fields.
It does not mean every cloud-related field has been manually tuned. The simple
preset comparison does not include `sentinel2CloudProbability`,
`sentinel2CloudProbabilityMaxCloudProbability`, `landsatCFMaskDilatedCloud`,
`cloudBuffer`, `snowMasking`, `holes`, filters, date ranges, or source
selection.

The GUI default model also sets `landsatCFMaskDilatedCloud: 'REMOVE'`,
`snowMasking: 'ON'`, `holes: 'ALLOW'`, and `compose: 'MEDOID'`. Be careful
when using defaults as guidance: they are source facts, not always a policy for
every user request.

The English GUI tooltips are useful authoring material, but can lag behavior.
For example, the simple preset tooltip says the moderate preset relies only on
source QA bands, while the current preset values include SEPAL Cloud Score and
Sentinel-2 Cloud Score+. Prefer code-backed preset values over tooltip prose
when they disagree.

### Source-appropriate cloud methods

`includedCloudMasking` is a list of cloud-mask methods whose availability
depends on the selected source groups:

- `sepalCloudScore`: general cloud score.
- `landsatCFMask`: Landsat only; has separate cloud, shadow, cirrus, and
  dilated-cloud controls.
- `sentinel2CloudScorePlus`: Sentinel-2 only; has `cs` and `cs_cdf` bands plus
  a maximum-cloud-probability threshold.
- `sentinel2CloudProbability`: Sentinel-2 only; ancillary probability source
  with its own threshold.
- `pino26`: Sentinel-2-only and disabled by the GUI when SR is selected; it is
  not a generic default for "remove clouds".

Cloud score thresholds use 0-100 sliders where lower maximum cloud probability
means stricter masking. GUI preset values are useful reasonable anchors:
`sepalCloudScoreMaxCloudProbability` 30 for moderate and 25 for aggressive;
`sentinel2CloudScorePlusMaxCloudProbability` 45 for moderate and 35 for
aggressive. Very low values such as 5 are extremely strict and can remove too
many pixels; they should be reserved for explicit "be very aggressive" requests
or as a fallback after a more normal aggressive strategy.

For Landsat cloud complaints, the aggressive preset moves
`landsatCFMaskCloudMasking`, `landsatCFMaskCloudShadowMasking`, and
`landsatCFMaskCirrusMasking` to `AGGRESSIVE`. If Landsat is present and these
fields are still `MODERATE`, a broad "clouds remain" request should normally
include them in the focus/write set. `landsatCFMaskDilatedCloud: 'REMOVE'` is
already the default and is not part of the simple preset comparison, but keeping
or setting it to `REMOVE` is consistent with stricter Landsat masking.

Adding `sentinel2CloudProbability` can be a valid stricter Sentinel-2 move, but
it should not hide the simpler preset-like strategy. When adding this method,
preparation should surface the absent method and its
`sentinel2CloudProbabilityMaxCloudProbability` companion as writable handles so
the updater sets a complete value set rather than relying on patch mechanics.

### Cloud quality vs performance

Cloud masking method count is not itself the main Earth Engine performance
lever in MOSAIC. The cloud masking methods are folded into per-image cloud-band
work; the dominant cost drivers are more often candidate observation volume,
spatial operations, collection reductions, extra collection passes, heavy
per-image corrections, and source availability.

`cloudBuffer` is the opposite: it is a spatial neighborhood operation and can
be extremely expensive. The GUI presets are `0`, `120`, and `600`; use `0` for
fastest/reliable rendering. Increasing cloud buffer should be an explicit
quality choice for cloud-edge/haze artifacts, not a default answer to residual
clouds.

`snowMasking` should normally remain `ON`, even outside snowy regions, because
some clouds can be misclassified as snow. Turning it off can expose cloud
artifacts.

`holes: 'ALLOW'` is normal. `PREVENT` is a fallback when masking removes the
exact features the user cares about, such as bright built-up areas or deserts.
The usual first response to masked-out pixels is to add data, change the date
range, or reduce overly aggressive masking rather than preventing holes.

Filters are costly because each active filter adds a collection-level
percentile reduction and masking pass. They should not be introduced as a cloud
cleanup default unless the user's goal clearly maps to that filter. In MOSAIC
v1, expose filters as one whole-array handle so render-speed requests can remove
or avoid them, but do not expose per-filter item handles yet.

BRDF correction is expensive, especially for Sentinel-2 and large mosaics. It
is a render-reliability lever, but not a cloud-masking lever. Do not remove BRDF
as an answer to residual clouds unless the user's actual problem is render
failure or latency.

For example, tooltip/doc prose about Sentinel-2 tile overlap should become
enum-bearing field metadata such as:

```js
{
  handle: 'tileOverlap',
  internalPath: '/compositeOptions/tileOverlap',
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

- static picker prompt plus recipe handle catalog generated from recipe facts
- static generic updater prompt
- dynamic user request
- dynamic prepared handle packet
- dynamic update result

The static picker catalog should be stable and byte-identical across users for
a given recipe version. Runtime GUI state and current recipe values belong in
prepared packets and update results, not the cacheable catalog. The updater
prompt should be generic and cacheable across recipe types.

The prompt assembler must put each cacheable static prefix literally at the
start of the assembled LLM call, with dynamic request/context/tool-result
content appended after it. Dynamic preambles before the cacheable prefix silently
break provider prefix-cache hit rates.

For Nova 2 Lite, treat the prompt-cache budget as smaller than the context
window. The model may accept a very large prompt, but the cacheable repeated
prefix should fit within the Nova cache limits tracked in
`DESIGN_chat_specialists_v2.md`. As a practical target, the compact static
specialist package should stay below roughly 18K tokens, leaving room for base
instructions and cache marker overhead.

Prompt caching can reduce cost and latency for static recipe knowledge, but it
does not remove the model-attention cost of noisy prompts. The picker catalog
should therefore be compact and handle-first, not a full raw schema dump.

Cache accounting should be split by role:

- picker static prompt plus recipe handle catalog
- generic updater static prompt
- orchestrator static prompt
- orchestrator always-visible tool schemas
- dynamic runtime context, prepared packets, tool results, and conversation
  history

The orchestrator budget is a separate concern. Recipe semantics should not be
moved into orchestrator tool descriptions to make specialist prompts smaller.
For Nova-family profiles where tools are not cacheable, long tool descriptions
are a recurring per-round cost and a source of routing confusion.

## Rejected or deferred alternatives

### Full schema in every update prompt

Rich schema descriptions are useful source material, but raw JSON Schema is not
an ideal LLM catalog. It is verbose, local to properties, and awkward for
cross-field tradeoffs, operational profiles, and user-goal guidance. The
current MOSAIC schema also lacks most operational descriptions.

### User instruction passed to preparation tool

This would make the deterministic tool responsible for natural-language intent
recognition. That encourages brittle keyword matching and hides important
judgment outside the picker/updater specialists.

### Separate knowledge and closure tools in the updater loop

The concepts are distinct, but the LLM-facing round trip can be one
programmatic preparation step between picker and updater. Static reusable
knowledge should stay in generated picker catalogs and prepared packets, not
require an extra updater tool round trip. Internally, implementation can keep
field-fact lookup, operational-fact rendering, and dependency expansion
separate.

### Group handles in v1

Group handles such as `cloudMasking` or `performance` may be useful later, but
v1 should start with concrete field handles. Group handles require descriptions,
expansion rules, and another model choice; the picker can instead return
multiple concrete handles for broad requests.

### Implicit resume from the next chat message

When a workflow needs more information, do not infer by default that the next
free-text user message is the answer. That creates routing ambiguity and hidden
state. Prefer an explicit chat question panel tied to a pending action id; the
user either answers that panel or cancels the action.

## Open questions

- Should `update_recipe_values` add a preparation token/session for
  cross-process hardening beyond the in-process `writableHandles` check?
- How compact should the generated picker catalog be for large recipe types?
- Can GUI labels/tooltips and LLM facts share one source without making GUI
  translations harder?
- What is the minimum acceptable generated catalog for a recipe with no rich
  `llm` metadata yet?
- How should high-impact tradeoffs be surfaced back to the orchestrator for
  user confirmation?
- What purpose-specific renderings should reusable operational facts support
  first: update, describe, troubleshooting/advice, or UI hints?
- What is the minimal workflow-state model for pending actions: one per
  conversation, cancellation, conversation switching, stale handle checks, and
  stale `baseModelHash` recovery?
