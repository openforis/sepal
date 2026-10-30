# SEPAL workplan

The single backlog for SEPAL recipes, tasks, applications and infrastructure. Reports need reproduction;
proposals need bounded scope and acceptance criteria; research questions do not select an implementation.
No ordering, delivery date or deployment is implied. Server-preview readiness and the broader band-presentation
review remain explicitly deferred.

Technical documents retain current behavior, compatibility constraints and detailed target contracts.
Add and maintain planned work here; link to those documents for design detail instead of keeping parallel roadmaps.

| Technical reference | Scope |
| --- | --- |
| [Recipe architecture](recipes/data-sources.md) | Shared contracts and the design-document index. |
| [Recipe notes](../recipes/README.md) | Current behavior, compatibility and verification. |
| [Task architecture](tasks/orchestration.md) | Current task ownership and proposed durable execution contracts. |
| [Imagery workspace](imagery-workspace.md) | Proposed GIS integration mechanisms and acceptance criteria. |

## Recipe correctness

These are bounded assessments or contract gaps, independent of the larger architecture proposals. Code-confirmed
behavior is identified below; suspected symptoms still need reproduction. This list schedules no algorithm changes
or new release checks.

### Collection-output correctness

Assess Classification regression/probability encoding across Optical, Radar and Planet separately from source
planning. Confirmed in [Classification execution](../../lib/js/ee/src/classification/classification.js),
[temporal collection construction](../../lib/js/ee/src/timeSeries/collection.js) and
[family selection](../../lib/js/shared/src/recipe/collectionType.js):

- Classification produces floating regression values and per-class probabilities multiplied by 100 and cast to
  `uint8`.
- Optical then multiplies regression by 1,000 and those probabilities by another 100. Radar and Planet add the
  Classification outputs without those extra multipliers. All three collection branches finally cast to `int16`.
- Optical and Planet project the requested bands; Radar's collection branch has no equivalent final selection.
  Shared family selection sends non-radar/non-optical input to the Planet fallback, including empty/unknown input;
  that routing does not validate whether it can execute.

Still to reproduce: effects on stored values, fractional regression precision/range, chart interpretation and each
consuming algorithm/export, using supported classifiers and explicit/default requests. The branch differences alone
do not establish which user outputs are wrong or choose the intended common encoding. Inventory consumers and any
existing-data compatibility consequences before proposing a correction.

Include unknown/empty/mixed selections, default versus explicit output, GUI omissions such as optical date bands,
and Planet Daily mixed members in that bounded inventory. Planet's four/eight-band cases and histogram-matching
narrowing are described by [the current output catalogue](recipes/output-products.md#declaration-and-description); they do
not establish temporal-collection homogeneity. Require an explicit selection/filter/missing-band policy before
promising it. Do not make this assessment wait for an adapter/composer refactor.

**Requested output projection.** Audit producer `selection`/`outputBands` behavior, including internal callers and
unselected defaults, then consolidate final export projection and remove redundant per-producer projection.
Preserve established output order and producer-specific internal selection semantics.

### Validation and execution coverage

- **Removed or inaccessible assets.** Audit the reported EE "asset not found" errors against
  [current asset freshness](recipes/source-freshness.md#asset-freshness-and-drawing-currency). Active consumers already claim
  assets, poll metadata, invalidate known mutations and recheck recognized asset/schema failures. Reproduce deletion
  in this session, externally and while a consumer is closed; include direct assets, nested recipes and collection
  members. Check missing interest, failure classification, evidence propagation and operation guards. A read may
  race deletion, and a missing/inaccessible response must not be presented as proven deletion. Establish a located
  diagnosis, affected-operation hold and repair/refresh recovery without replacing saved references. Generic server
  preview readiness remains the separately deferred work below.
- **Operation coverage.** Inventory remaining GUI-only/EE-only prerequisites, geometry and product routes against
  the shared declaration contract. Keep the Time Series/CCDC selected-Classification policy scoped; extending it
  to other families is a product decision.
- **Raster-file exports.** CCDC Drive/workspace execution must validate the selected scalar/array shape itself,
  independent of the existing GUI destination check.
- **Unused Remapping selections.** Decide whether to retain current source-specific selection semantics, add
  requirements for them, or make execution select only used bands. A missing unused asset selection differs from
  an actually used missing constraint band.
- **Band Math draft evaluation.** Reuse the shared item requirements to judge just the edited/added item before
  Apply, with an explicit prerequisite policy. Preserve independent draft repair and entry-level validation.
- **Change Alerts dates and impossible choices.** Derive reference/calibration coverage from actual execution
  requirements and sufficient evidence; metadata extents alone do not establish per-pixel coverage. Preserve
  explicit choices. Enabling/disabling type/dataset choices must distinguish unknown evidence from incompatibility.
- **CCDC breakpoint selection during empty dataset editing.** Check Landsat → none → Sentinel-2; retain selections
  while options are unsettled and reconcile once options exist. No datasets must still block Apply.
- **Empty-input geometry requests.** Reproduce remove-all/add-again across shared image-input workflows. Withhold
  requests for incomplete inputs, ignore superseded answers and require a controlled diagnosis for missing imagery.
- **BAYTS export processing metadata.** Record Historical settings from the recipe actually executed, including
  supported Masking/Stack paths. Keep legacy parsing and labelled editable fallbacks; current GUI-supplied
  `recipe_options` are not server-derived provenance.
- **CCDC Slice.** Validate the configured break-analysis band and assess server checks against the segment structure
  actually consumed. Preserve structurally compatible existing assets and legacy templates.
- **Radar DEM assessment.** The terrain-correction implementation currently reads `COPERNICUS/DEM/GLO30`
  (`lib/js/ee/src/radar/terrainCorrection.js`). Investigate the suspected outdated DEM against actual coverage,
  product/version and correction requirements before selecting a replacement; compare resulting pixels and masks.
  Dataset age alone does not establish that this processing input is wrong.

### Classification and training data

- **Explain the classifier.** Define whether the request is algorithm/parameter help, explanation of the trained
  model, or both. Inventory existing outputs and expose supported explanations with their limitations.
- **Validation.** Separate configuration/readiness, training-sample adequacy and predictive evaluation. Identify
  missing checks and define evaluation data/metrics before promising model quality; account for spatial leakage
  and reused training data. Extend existing shared requirements where applicable.
- **Polygon training data.** Assess one labelled feature row built from statistics over each training polygon,
  rather than implicitly treating every EE polygon pixel as an independent training point. Define per-band
  statistics, scale/projection, masks, empty polygons, feature naming and matching training/prediction transforms.
  Preserve point-based workflows and decide how polygon-derived features apply to prediction imagery.

Remapping's proposed [default class](#default-or-fallback-class) is specified below.

## Recipe usability

| Item | Scope and acceptance |
| --- | --- |
| Charted-pixel map marker | Follow the chart recipe/pixel; remove or hide it on closure/tab change. Decide marker interaction separately from chart validity. |
| AOI redraw efficiency | Measure unrelated geometry/redraw work; avoid it without suppressing real changes or stale-response cancellation. |
| Cycle diagnostics | Carry structured cycle paths through shared layer-error presentation, using known names and a safe fallback. Preserve execution rejection. |
| Standalone asset visualization selection | Reconcile to the first candidate only after a successful current read; preserve intent through pending/failed/empty answers and never delete local styles. |
| Large categorical default palettes | Assess shared interpolation by entry position/count. Preserve saved colors and verify Class Change's one-based codes. |
| Radar RGB preset range | Audit the ratio range against its x1000 encoding, separate from VV/VH's x100. Keep this a presentation correction with unchanged pixel encoding. |
| Optical Mosaic CMP opening | Reproduce Apply being offered immediately on opening Composite options. Inspect mount-time defaulting of cloud buffer and overlap controls; opening/closing an unchanged panel must not silently persist defaults or make the recipe dirty. Check new and older models, More/Less and Cancel. |
| Chart zoom handles | Reported: CCDC initially draws correctly but dragging is extremely slow; Time Series handles are usually absent, or one disappears when dragged. Other charts are untested. Reproduce through shared chart controls; verify responsive dragging, retained range, tab return and cleanup for representative chart families. |
| Chart CSV export | Inventory existing chart downloads, then define export of the displayed series, timestamps, missing/masked values, units/encoding and fitted versus observed data. Decide full versus visible range and use shared serialization/download behavior. |
| Interactive multi-sensor time series | Assess comparison of multiple sensors with explicit time alignment, units/encoding, processing differences and missing observations. Reuse chart/collection contracts; separate this feature from repairing zoom controls. |
| Categorical class visibility | Assess class disable/mask controls and treatment of unlisted pixel values under the [policy below](#categorical-class-visibility). |

- **Source-recovery retention policy.** Decide whether deleted Stack aliases and Band Math output selections/custom
  names should be restored when an input returns. Recovery must not steal occupied names or guess ambiguous old
  identities. Existing calculation-reference and used-source-band checks stay authoritative.
- **Training-data feedback.** Decide how an explicitly selected empty Provider is presented when other branches
  provide enough points. Do not invalidate an otherwise trainable Consumer merely because a branch is empty.
  Sampling scale, unit/encoding compatibility, legend/value compatibility and post-mask sample adequacy need
  separate requirements before any stricter promise is made.
- **Form interaction consistency.** Separate validity from error visibility; new required fields stay neutral
  initially, report errors after interaction and clear promptly on repair. Review autofocus, picker interaction,
  programmatic resets, duplicated input editors and field/group accessibility. Broken saved configurations still
  explain themselves immediately, and invalid submission stays blocked regardless of visible error timing.
- **Feedback attribution.** Decide whether all routes of a diamond should be marked. Current readiness reports
  established paths without fabricating alternate routes.
- **Draft/close interaction.** Warning about unapplied drafts on browser close and revisiting the current recipe-tab
  close guard remain separate decisions. A "Use reference settings" copy-again button is not planned; creation
  seeding and automatic ownership cover its useful purpose.

### Stack automatic names

Separate generated defaults from explicit `outputName` overrides. Compute one effective-name rule for description,
execution and forms. Reserve explicit names first, allocate unique defaults in Stack order and retain overrides by
source-band identity. Clearing an override opts back into automatic naming; explicit collisions fail validation.

Existing saved names have no provenance and must be treated as explicit, not guessed from suffixes. Defaults
recompute on input changes, not panel opening or metadata refresh. Preserve local style/selection identity where
possible and never silently bind an old name to a different source. Downstream missing-name repair remains explicit.
Check add/remove/reorder, clear/duplicate overrides, save compatibility and affected dependent references.

### Categorical class visibility

Assess a reversible disable/hide control for categorical legend entries instead of requiring their deletion.
Removing a color/label is not necessarily a pixel mask. Decide how disabled classes and pixel values absent from
the legend render, including whether unlisted values should be masked in preview; no automatic policy is adopted.

Keep this a presentation decision unless the user explicitly requests a computational mask. Preserve asset pixels,
saved class identities and locally edited styles; exports and downstream recipes must not silently inherit a
preview-only filter. Verify map tiles, cursor values, legends, histograms, Copy/Paste and re-enabling classes agree
with the chosen policy, including unknown categories and genuinely masked pixels.

## Deferred recipe architecture

These remain unscheduled target designs. Correctness and usability slices above do not require adopting them.

### Server preview readiness

Assess acquisition cost and operation/product identity before adding a shared guard to generic preview. Bands,
histogram, distinct values, geometry/sample routes, the LandTrendr chart and direct asset-segment layout validation
need their own boundary inventory. A disabled GUI action does not establish server protection. This review remains
explicitly deferred.

### Current-input dependency evaluation

Extend the existing pure requirement declarations, not a second rule engine. Local configuration, calculation
outputs and described external inputs use the same evaluation boundary with different acquisition owners.
Band Math's input → calculation → output chain is the bounded reference case; retain current shared reference
analysis and remove only synchronization a replacement actually supersedes.

Sampling Design's edit-driven planner remains until its result-evidence migration. Review actual compatibility,
normal invalidation/recalculation and user decisions separately; an AOI change alone is not reason for another
warning. See [declarative evaluation](recipes/source-freshness.md#declarative-dependency-evaluation).

### Sampling Design derived-result freshness

Migrate areas, then probabilities, under the [generic evidence contract](recipes/source-freshness.md#persisted-derived-result-evidence).
[Sampling Design's notes](../recipes/sampling-design.md#derived-result-freshness) own current flags/caches and the
target calculation dependencies, sidecars, propagation and compatibility rules. Replace the old mechanism rather
than keeping parallel freshness implementations.

### Capability projection and visualization ownership

Follow [transformation contracts](recipes/output-products.md#transformation-and-capability-projection) and
[visualization ownership](recipes/visualizations.md#target-design), retaining selected outer execution identity and explicit
band mappings. Reduce/drop capabilities and templates when required bands disappear. Define `CCDC_SEGMENT_SLICE`
from actual segment structure and recheck it on the server.

Define classified-result versus reusable-classifier mask semantics before admitting wrapped Classifications to
PyEO, CCDC, Time Series or Phenology; see [the distinct contracts](recipes/source-resolution.md#classification-results-and-reusable-classifiers).
Consolidate [structured band selection](recipes/output-products.md#structured-band-selection-deferred) across CCDC, Slice and
preserving wrappers without deciding defaults or automatic inclusion implicitly. Inherited band presentation belongs
to the later broader presentation review, not another Masking Retrieve patch.

### Mask and Fill

The [Mask and Fill design](recipes/mask.md#target-design) defines the sequence: stabilize the remaining Apply mask behavior
and explicit mask-band selection, add constant Fill, then asset Fill, then recipe Fill under declared authorized
acquisition/execution rules. Constant Fill requires no new source edge, bundle or domain-capability system.
Do not duplicate unmasking in Asset, Band Math or Stack.

### Source planning and temporal collection composition

Follow [the target adapter/composer boundary](recipes/output-products.md#source-planning-and-collection-composition):
source-owned acquisition/normalization, one closed temporal composer and consumer-owned requirements. Replace family
switches and fabricated foreign models only through a bounded consumer. Keep shared planning browser-safe, EE
mechanics in EE and presentation in the GUI; derive references once and bind role-scoped declarations.
The [collection correctness assessment](#collection-output-correctness) stands independently of this refactor.

### Reference layers and acquisition

**Load map sources only when needed.** Listing metadata can supply names without full recipe reads. Acquire an
additional source through runtime/cache claims only when a displayed layer or another active consumer needs it.
Retain entries and assignments; selecting an unread source must load and validate it. Incidental loads must not
serve as dependency checking.

**Executed-edge acquisition and request propagation.** Reduce conservative `REFERENCE` closure over-reading only
after declaring which dependencies execution reads. Propagate selected-output questions through Masking, Stack,
Band Math and Slice without reintroducing retired request-dependent training gates.

**Persisted reference index.** Derive references from definitions at save time, consistent with the committed
revision. Distinguish execution edges from display references, support access-controlled direct/transitive "used by"
queries and deletion warnings, and define how existing records are indexed. Never cascade deletion. Do not rewrite
saved references merely because a listing omits them or a load returns 404.

### Task-driven asset invalidation

The [asset-mutation audit](#asset-mutation-notifications) below owns export reporting, partial effects,
settlement and notification. Feed confirmed mutations into the existing asset-evidence owner; keep polling
and explicit refresh for external changes and missed events.

### Storage and execution coherence

- Add explicit live/bundled contexts and trusted coherent acquisition/acceptance as described in
  [source resolution](recipes/source-resolution.md#target-design). Operation record retention alone is insufficient.
- Define semantic no-op normalization at the Recipe service; compare normalized equality before conflict rejection.
  Identical committed payloads should converge, while conflicting remote writes never receive blind retries.
- More recipe WebSocket updates are an optional latency improvement after the correctness contract. Publish
  committed revisions, ignore duplicate/out-of-order events and retain reload/reconnect recovery. Inventory
  listing, save and dependency consumers before adding event types; patch transport is a separate choice.
- Choose batch-by-ID versus closure transport based on consumers without duplicating graph/authorization logic.
- Stronger trusted provenance, post-execution asset drift policy and product-specific AOI projections remain target
  architecture, not promises of current exports.

### Future: consistent band presentation across recipes

This review is deliberately deferred to a substantially later round. Inventory all viewing, picking, mapping,
renaming and expression contexts before implementation: input imagery, Remapping/Masking, Stack, Band Math,
Sources, charts/legends, visualizations and Retrieve. Include assets, native/classified/derived/custom bands.

The agreed direction is reliable display labels for viewing/choosing, raw names as fallback; actual identifiers
for editable output names and expressions. Show both where a mapping needs them. Preserve raw names in saved
values/keys, requests, expressions and exports. Duplicate labels must stay distinguishable, and relabelling must
never change selection or computation.

Extend shared band/presentation/picker APIs so callers inherit the correct behavior; recipes provide domain
metadata rather than reconstructing another producer's labels. Establish propagation through renames and
transformations. Missing/pending/unavailable labels must never remove bands, hold operations or require access to
an exported asset's private producer. Check localization, casing, accessibility and keyboard/filter behavior.
Deliver shared defaults first, followed by coherent consumer groups, without another label cache or copied snapshot.

### Physical-value presentation

General physical-unit legends, charts and inspection remain deferred beyond the
[stored encoding contract](recipes/output-products.md#band-encoding). Convert at one explicit boundary, preserving saved
ranges and unchanged pixels. Encoding describes representation, not semantic bounds or scientific comparability.

Index Change's default difference style should eventually use trustworthy compatible-unit input bounds:
`[toMin - fromMax, toMax - fromMin]`. For two probabilities in [0, 1], this is [-1, 1]. Preserve user styles and
choose an explicit unknown-range fallback rather than treating an encoding multiplier as a display range.

### Map inspection

Deferred exploration; scope and interaction remain undecided. General inspection reads raster values/feature
attributes across layers, grouped by layer. Specialized actions require the selected layer/product's capability:
a Masking output preserving CCDC could offer its segment chart, as could a CCDC layer added to an Optical map.
The owning recipe type must not determine every layer action. Resolve interpretation through the capability
provider while reading the selected outer layer's pixels, retaining its mask and other transformations. A Stack
may preserve several instances; CCDC-derived names alone do not establish a usable one. Original observations
alongside fitted segments need evidence a segments asset may not supply.

Decide action placement and layer/instance selection; all versus visible layers and feature-hit matching; which
named product/parameters are queried; scalar/array/unit/encoded-value presentation and distinct masked/no-match/
unavailable/failed states; and cancellation, refresh and reuse when layer, capability or location changes.
Use existing [product](recipes/output-products.md), [provider](recipes/source-resolution.md#execution-identity-and-capability-providers),
[runtime](recipes/gui-source-runtime.md), [freshness](recipes/source-freshness.md) and [style](recipes/visualizations.md) owners. These scenarios
do not commit to a toolbar or tool-registration framework; physical-value presentation remains deferred separately.

### Recipe packages and supporting work

Recipe packaging remains unscheduled: one package would own shared rules, GUI and EE behavior/tests, with separate
runtime entry points. Establish discovery, cross-package dependencies, compatibility and build/deployment ownership
using a simple recipe and Change Alerts before adding a framework. Independent deployment is a separate decision.

Retain shared recipe verification-script authentication as tooling work. Persistent/distributed metadata caching
and finer data/schema/presentation fingerprints need measured recipe-consumer justification.

## Recipe-specific follow-ups

These assessments are unscheduled. Shared validation, projection and recovery work above applies across types;
the entries below retain the concrete differences and local policy questions.

### Band Math

The declaration refuses repeated final names, while direct EE construction renames a second `x` to `x_1`.
Include that discrepancy in requested-output/server-boundary assessment. Deleted-output retention remains
under the shared source-recovery policy above.

### BAYTS Alerts

Audit unknown wire modes: execution treats a `visualizationType` other than `alerts`/`last` as the first
radar observation, whereas the GUI refuses an unknown product. Preserve the contextual observation semantics
in the [recipe contract](../recipes/bayts-alerts.md#radar-observation).

### Change Alerts

- Unknown visualization modes fall through to calibration; a non-`latest` mosaic type becomes median.
  A layer saving `mosaicType: undefined` instead names no product. Establish one boundary policy.
- Saved `sources.dataSetType` selects map mosaics, while `sources.dataSets` selects alert collections;
  mismatched models can therefore compare different families. Include in collection/monitoring assessment.
- A new empty `reference: {}` can pass preview preflight although execution raises `MALFORMED_SEGMENT_SOURCE`.
  Include in the separately deferred server-preview readiness work.
- Chart highlights still call `monitoringDates` for malformed applied periods. Execution permits overflowing
  calendar days, fractional durations and years that product validation refuses; settle compatibility explicitly.

### Phenology

`calendarRange(month, month + 1, 'month')` is inclusive: January uses January/February and December requests
12–13. Decide whether composites should cover their named month alone before changing calculated pixels.

### Planet Mosaic

- Daily processing without histogram matching adds an image containing its own bands again through `addDates`, creating
  `blue_1` and equivalent working duplicates. Assess removal against default/internal selections.
- Mixed four/eight-band Daily imagery fails at pixel evaluation without histogram matching; matching first
  narrows to four bands. Establish an explicit homogeneity policy in the collection assessment.
- Temporal choices omit `kndvi` and PSB.SD-only bands that CCDC declares. Reconcile eligibility and offered choices.
- State NICFI encoding only after authoritative evidence for that exact product establishes it.

### PyEO Alerts

- **Classification-input ancestry.** `loadClassificationInputs$` in `lib/js/ee/src/pyeo/pyeoAlerts.js` uses
  `loadRecipe$` directly before building the classification's input image, rather than following that read through
  `recipeRef`. Audit cycle detection on this path separately. The main classification read already uses `recipeRef`;
  the concern is limited to the input-loading path and has not been reproduced end to end.
- **Uniform index acquisition.** Use a provided index when its meaning and encoding are known; otherwise
  calculate it from suitable spectral bands, for either a recipe or asset. Preserve the selected image and its
  masks. This would replace the recipe/asset branch and its wrapped-asset limitation. Shared output and encoding
  contracts come first; no PyEO-specific resolver or encoding convention should compete with them.
- **Threshold ranges from the result.** UoL asked for the detection sliders to end at the largest
  `post_fcd_change_count`, `from_class_count` or `to_class_count` in the area. That needs an area-wide reduction of
  the full classification on every change of AOI, dates or classes before OPT can draw its sliders, and a moving
  maximum can cut a saved value. The ranges stay fixed until there is a cheap, stable bound.
- **Index choices and names.** Account for supplied indices as well as computable ones on both baseline and
  monitoring inputs. Unique case-insensitive matching is a possible convenience, retaining the actual band
  name for execution. Ambiguous matches need an explicit outcome; sensor aliases and value semantics cannot
  be inferred from case folding.

### Radar Mosaic

- Time scans reduce per-image harmonic terms selected by `VV.*`/`VH.*`, then discard them; assess the wasted work.
- Missing dates surface EE's DateRange error rather than a controlled configuration diagnosis.
- The Orbits constraint names undefined translation `process.recipeMosaic.panel.options.form.orbits.required`;
  literal `msg()` checks do not cover constraint messages. Repair that gap alongside the message.
- Remove or justify unmatched `constant` in `radar/visParams.js`. Offering point-in-time `unixTimeDays`
  remains a separate output-product decision.

### Regression

The panel offers `DECISION_TREE`, which execution does not construct. Resolve that unsupported option.
A `RECIPE` training dataset currently counts as data without assessing what its provider supplies; extend
operation-scoped `TRAINING_DATA` requirements before claiming that reuse is validated.

### Remapping

Used-band checks and automatic source recovery are implemented. Unused-selection policy remains above.
Direct preview/image routes can still build broken constraints differently from guarded exports; include
those concrete paths in the shared operation/server-boundary audit.

### Default or fallback class

Proposal: assign a configured default class where no rule matches. Execution currently mosaics the constrained
class images; it has no separate fallback-class setting. Prefer preserving genuinely masked/no-data pixels rather
than converting them to the fallback, but confirm that policy before implementation.

Define the valid domain across multiple inputs and rule dependencies: "no matching rule" differs from a rule
that cannot be evaluated because required pixels are masked. Specify priority, numeric type/range, legend and
export behavior, then verify matched, unmatched and partially/fully masked cases. Explicit unmasking belongs to
[Mask and Fill](recipes/mask.md#fill-semantics), whose footprint policy must remain separate.

### Stack

A selected input contributing no mapped bands can supply an empty clip geometry when other selected inputs
are unbounded; selecting no mapped output fails similarly. An empty Stack emits no image. Include these cases
in empty-input geometry and output-projection assessment. Discarded aliases follow the shared retention decision.

### Time Series

Empty periods can fail as `Image.reduce: Unable to reduce an image with 0 bands` before a no-scenes diagnosis;
unknown requested bands still return `count`. Include controlled errors and request handling in operation coverage.

### Time Series cloud cover

- **Scene cloud cover.** Time Series offers no control for `sources.cloudPercentageThreshold`, the percentage of cloud
  an optical scene may have to be included; a recipe that states none includes every scene. Expose it: new recipes save 75%
  explicitly, a recipe that states none keeps including every scene and shows 100%, and a saved value is kept.

### Sampling Design deferred scope

- **Letting recipes declare their own source grid.** A recipe source defaults to `EPSG:4326` at 30 m because a
  recipe declares no preferred grid. Where a recipe has exactly one unambiguous source grid it could declare
  one, without forcing evaluation and therefore at no cost. Two assumptions to measure first: a single-asset
  classification may already propagate the projection, since per-pixel operations preserve it and only
  compositing loses it; and it is unconfirmed whether a declared projection surfaces in the band metadata the
  GUI reads. Until then `/bands` returns band names and nothing is invented.
- **Collection uniformity detection.** Priced and rejected: the check almost never changes the decision, since
  the first member's grid is weakly better than a default even when members differ.
- **Structured errors from the area and proportion calculations.** They throw a plain error where the task
  boundary produces a renderable structured message. Latent, because both call sites supply a default. Not a
  fix in passing — those jobs have no structured-exception plumbing, and the GUI consumes their failures
  through a different path from task errors.
- **Tiled candidate and final exports**, until real workloads justify the complexity.
- **Promising sample retention** across enlarged, restratified or annual designs, until deterministic tests
  establish the overlap contract.

## Tasks and exports

Technical contracts: [task orchestration](tasks/orchestration.md#proposal).

### Durable workflow slices

These are possible scopes from the current container model, not a scheduled delivery sequence.

- **Durable engine and admission:** begin with operations without file steps (`image.DRIVE`, `image.GEE`,
  `ccdc.GEE`, `samplingDesign.GEE`). Durable acceptance requires the unimplemented
  [Retrieve execution bundle](recipes/source-resolution.md#retrieve).
- **Recoverable file steps:** `image.SEPAL`, `timeseries.download`, `samplingDesign.SEPAL`, including repeatable or
  discoverable external effects and cleanup obligations.
- **Compute steps:** runner, task environments and a first compute workload, with sessions acquired only for its
  resource-intensive steps.

### Asset mutation notifications

Audit the existing lifecycle boundary before integrating task writes with recipe asset freshness:

- Export operations in `modules/task/src/runner/operations` receive concrete asset IDs and, for collections, tile
  IDs from gee. Collection preparation can delete/create assets before tile exports finish; failure or cancellation
  is not evidence that nothing changed. Sampling Design also creates and cleans up temporary assets.
- `runTask` currently returns terminal state/status, and progress reports carry status plus local-slot release.
  The container writes `result.json`; task-manager's `ContainerSupervisor` reads it on exit, settles the task row and
  removes the workspace. Reconciliation can settle an interrupted task without a usable result file.
- Repository changes emit `taskChanged$` for a username. The task websocket re-queries the listing; it supplies status
  and submitted `taskInfo`, not an authoritative affected-asset manifest. That listing notification does not feed
  recipe source evidence.

The unresolved boundary is how actual written/replaced/deleted IDs, collection parents/members and partial effects
survive failure, cancellation, lost results and workspace removal, then reach the
[shared asset-evidence owner](recipes/source-freshness.md#asset-freshness-and-drawing-currency).
Audit reporting, settlement and notification together; do not infer effects from a successful terminal state or a
requested output path alone. Notifications must cause real re-reads, not fabricate tokens or edit catalogue facts.
Transport, replay/deduplication and missed-event recovery remain to be chosen; no `user-assets` route or integration
is assumed available. Polling and explicit refresh remain necessary. This audit is independent of adopting the
whole durable-workflow proposal and is not scheduled here.

### Scheduled recipe execution

Support a recipe export with date-template parameters resolved for each scheduled run. Define the timezone,
window boundaries, relative dates and when current recipe revisions are accepted; record the concrete dates,
inputs, destination and execution identity with each task. Decide overlap, missed runs, retries, duplicate
prevention, cancellation and ownership when credentials expire or the recipe/account becomes unavailable.
Use task acceptance and authorization rather than a browser timer. A schedule must not imply that current tasks
already freeze their dependency graph or resume durable steps.

### Raster-file layout and resolution

- **Merged exported GeoTIFFs.** Offer or assess one merged raster alongside the current tiles/VRT. Establish
  classic TIFF/BigTIFF and consumer size limits, peak temporary disk, cancellation and overwrite behavior.
  Reuse the [materialization/COG proposal](imagery-workspace.md#a-viewer-friendly-sepal-export) for band metadata,
  nodata and overviews rather than another conversion pipeline.
- **Optical export hyper-resolution.** Clarify whether this means a finer output grid/resampling or an actual
  super-resolution algorithm. State native information limits, projection/resampling and storage/runtime costs;
  do not promise added spatial detail from an export-scale change alone. Define validation and compatibility
  before choosing an implementation.

### Task design questions

- **Recovering lost launch responses.** Stable EE request ids prevent duplicate exports, but recovery must also
  find an accepted export whose launch response was lost. A reliable mechanism remains to be validated.
- **Main-instance capacity.** Which file work is cheap enough to stay on the main instance at current task volumes,
  and when the orchestrator needs an instance of its own.
- **Compute environments.** How task-specific runtime requirements are defined and provided on task instances.

## GIS workspace evaluation

GIS tools in the sandbox are assessed against the [imagery-workspace design](imagery-workspace.md#evaluation-brief).
Other required tools can use the same workflow evaluation; no application has been selected for production.

### GeoLibre Stage 0

The smallest experiment proving that imagery opens, a polygon is processed, GeoLibre's own Save writes into home, and
the project reopens after sandbox replacement. It uses no plugin. Its only change to GeoLibre's files is the start-up
script with the adapter, served from an overlay through the widget's private `serve_app`.
1. A notebook creating `Map(server_proxy=True, layout="full", height="100vh")`, registered in a dev catalog.
2. **Imagery:** add a SEPAL export's `.vrt` by its `/files/` URL, and try `metadata.bandNames`. Record sibling
   resolution, low-zoom behaviour, bytes transferred and memory.
3. **Polygon:** draw one; a temporary button runs statistics on the `.vrt`, including a scaled band, writing a CSV and
   adding the polygon.
4. **Save and Open through the adapter:**
   - Ctrl+S and Project › Save write into home;
   - Cancel leaves the project unsaved;
   - a failed write (a read-only target, or a write refused by the server) shows the error, stays unsaved and
     downloads nothing;
   - Download happens only when chosen;
   - Open reads the project back.
5. **Reopen in a new sandbox:** imagery, styling, the polygon and an edit are restored.

Also recorded: the tiles' layout (`gdalinfo`), masked-pixel values, and whether map activity is seen.

**Early gates:** the plugin is built only after Stage 0 shows that a failed write stays unsaved without downloading,
and that a project saved through GeoLibre's own Save reopens through its own Open after sandbox replacement. These test
the central assumption; if either fails, the design is revisited.

**Recording:** results are recorded in the app repository against the pinned versions: the gates, memory, transfer,
band names and the observations above.

### GeoLibre later stages

1. **The patched web build:** policy, start-up script, history off, policy failing closed, empty plugin, with tests that
   each patch applied. Verify against earlier browser state and a slow `deployment.json`.
2. **SEPAL files in GeoLibre's interface:** the plugin's dialog, Add Data › SEPAL, the adapter for all saves, opens and
   exports, and "Locate…", in Chrome, Firefox and Safari.
3. **The job service and workflows:** preparation, mosaics and statistics, with disk, quota and overwrite checks.
4. **Upstream requests,** each retiring a patch or custom piece:
   - an option disabling history;
   - a fail-closed policy;
   - a document-relative sidecar URL;
   - a storage provider hook for Open, Save and Save As;
   - plugin entries in the Project menu;
   - add-by-URL for FlatGeobuf and GeoParquet;
   - band names from `.vrt` files and on `addCogLayer`;
   - saves that report failure instead of downloading;
   - a widget language parameter.

### RustGIS prototype

Bounded, built on `main` at a pinned commit:
1. **Build** the integration code (recording its size and copied parts) with self-hosted assets, served from a Voilà
   notebook showing only a frame.
2. **Prepare** a real multi-gigabyte export from its `.vrt`, recording time, peak disk and the result's layout.
3. **Display** it by URL, choosing bands and range, and record memory, transfer and frame times over a scripted path,
   for a three-band, a pixel-interleaved 10-band and a band-separate COG.
4. **Statistics** on a drawn polygon from the `.vrt`, checked independently.
5. **Save:**
   - **stock hook:** show that a failed write is reported as saved;
   - **patched hook:** a failed write stays modified and downloads nothing; a cancellation changes nothing; an edit
     during a save stays unsaved; an interruption between sidecar and project leaves the previous project openable;
     re-preparing with new settings and interrupting the save still lets the previous project open and regenerate the
     previous image.
6. **Reopen** after a kernel restart and in a new sandbox: two COG layers with bands and range, the statistics layer
   and an edit are restored. Deleted COGs regenerate independently; a changed source tile is reported, not
   regenerated.
7. **Styling:** record the band, stretch and colour choices users can reach in the interface, against the gate.

**To settle:**
- whether the integration code can draw its own windows cleanly;
- whether a separate crate's WebAssembly build needs extra configuration;
- how prepared COGs draw;
- whether unknown project keys really are dropped.

**Production prerequisites:** demonstrated asynchronous save success/failure/cancellation, reachable COG styling,
immutable prepared paths, consistent sidecar/project commit, and maintainable integration code. Feasibility
remains unproven until the prototype passes; source inspection is not a runtime result.

### Common evaluation and maintenance

Each app repository needs a maintainer, pinned inputs, automated transport/fingerprint/save/restoration tests
and recorded dev-SEPAL acceptance at upgrades. A fingerprint must detect changed tiles behind an unchanged VRT.

The runtime experiments must establish:

- Authenticated ranges/suffix ranges, VRT siblings, contents writes and durable URLs.
- Large-image memory/transfer/navigation, conversion time/peak disk and bounded statistics reads.
- Save failure/cancellation, reopened styles/edits and interrupted sidecar/project commits.
- Nodata, scale/offset, CRS transformations and zones captured at submission against an independent oracle.
- Job lifetime after kernel closure, cancellation cleanup, account changes across tabs and nested-frame activity.
- Actual patch/copy burden and achievable upstream prerequisites.

Check the deployed proxy version, kernel environment, Voilà CSP/shutdown beacon, orphaned failed-render kernels
and EE tile authentication. Run GeoLibre Stage 0 first and the bounded RustGIS prototype under the same evaluation;
choose production only from measured results.

## Storage and credentials

- **Relocate EE credentials.** Inventory writers, readers, permissions and lifecycle before choosing a path.
  Include account link/refresh/revoke, sandbox Python/JavaScript tools, app environments and existing sessions.
  Separate user credentials from service-account keys; migrate or remove the old file without leaving stale copies.
- **SEPAL-managed user S3 storage.** Assess FUSE mounts separately from the current home filesystem. Establish
  supported read/write operations, rename/locking semantics, caching, failure recovery, quotas and cost ownership
  before promising filesystem compatibility to applications.
- **Bring your own cloud bucket.** Assess supported providers, per-user mount authorization, credential renewal/
  revocation and session cleanup. "Keys in secure cookies only" is an open suggestion, not an adopted design:
  establish how server-side mounts authenticate and what secrets, if any, need browser storage. Preserve account
  isolation across reconnects, logout and concurrent sessions.
- **Simultaneous file downloads.** Clarify workspace/browser downloads versus parallel chunks within export tasks.
  Inventory current limits; define bounded concurrency, per-file progress/cancellation and retry behavior.

## Discovery, help and analysis tools

- **Community link.** Add a discoverable Google Groups link after confirming the intended group and UI location.
- **Tool overview.** Review catalogue grouping, search and descriptions so users can find and compare tools.
  Keep documentation/tooltips with their owning feature and end-user guides in `sepal-doc`.
- **Onboarding.** Evaluate guided onboarding versus videos or contextual help against actual first-use workflows;
  no tutorial framework is selected.
- **Peatland analysis.** Identify priority workflows, required datasets and reusable existing applications before
  selecting new tools or recipe types.
- **Global products on the map.** Clarify whether this means background layers, overlays, source choices or a
  product-driven map workflow. Assess catalogue, coverage, styling and selection behavior once the use is defined.
- **Recipe to GEE script.** Assess which recipes can produce a runnable Earth Engine script, dependency expansion,
  private-asset access, credentials exclusion and equivalence with SEPAL processing. Unsupported steps must be explicit.

## Platform and development research

- **OS upgrade.** Inventory host, worker AMI and container bases separately; identify the intended target and
  compatibility work for Docker, GPU drivers and geospatial binaries. Define upgrade/rollback and data retention.
- **Single processing server.** Clarify whether the goal is topology consolidation, centralized scheduling or one
  processing worker. Assess capacity, isolation, failure impact and the [current task model](tasks/orchestration.md#current-implementation-and-limits).
- **Applications on workers: Solara and sandbox.** Evaluate Solara-hosted apps alongside existing sandbox apps;
  define packaging, routing, session lifetime, environment isolation and saved-state ownership before migration.
  Relate GIS application requirements to the imagery-workspace evaluation above.
- **Codespaces-like SEPAL environments.** Research reproducible per-user workspaces, environment/image selection,
  editor access, persistence, startup time, lifecycle and resource controls. Compare with existing sandboxes and
  app environments before proposing another environment service.
- **Sentry MCP for Claude.** Investigate the intended debugging workflow, available integration, access scope and
  treatment of event data/secrets. This records research only; no connector, account or tool access is enabled.

## Maintaining the workplan

Keep one entry per decision or delivery slice. Merge overlaps; distinguish confirmed behavior, reported symptoms,
proposals, deferred scope and rejected approaches. Remove completed entries and update the owning technical
contract. Verification logs, implementation steps and superseded variants belong in the change/Git history.
