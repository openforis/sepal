# Source resolution, dependencies and execution

Technical design for resolving recipe and Earth Engine asset sources into a coherent graph and freezing that
graph for execution. This document owns authorization and task atomicity. Live refresh policy belongs in
[source-freshness.md](source-freshness.md). Product identity, output-band description fields, declaration semantics
and the distinction between canonical output and map-only products belong in
[output-products.md](output-products.md). This document owns the traversal and evidence machinery that resolves
those declarations.

Structured dependency edges, authorized operation-scoped recipe reads and declaration-based producer resolution
are implemented. The explicit live/bundled graph API, coherent execution bundles, generalized capability discovery
and versioned provenance verification below describe the target design, not guarantees of current execution.

For the remaining classifier/readiness work, start with the [current delivery plan](#current-delivery-plan-2026-10-21).
The detailed audits and completed packet history below retain evidence and boundaries; they are not an open task list.

## Responsibilities

This subsystem owns:

- source-reference normalization;
- structured recipe dependency edges;
- explicit-principal, authorization-aware graph traversal;
- missing, forbidden, incomplete and cyclic dependency diagnostics;
- capability-provider lineage and capability preservation;
- resolving product declarations into descriptions from graph and runtime evidence;
- coherent execution bundles for Preview and Retrieve;
- observed Earth Engine asset revisions and drift handling;
- trusted verification of versioned provenance produced by SEPAL exports.

It does not own refresh timers, GUI cache storage, visualization editing or recipe-specific React synchronization.

## Explicit resolution contexts

Reference resolution must never depend on ambient behavior.

```js
resolveSourceGraph({rootRecipe, context: {mode: 'LIVE', principal, loadRecipes, describeAssets}})
resolveSourceGraph({rootRecipe, context: {mode: 'BUNDLED', recipesById, assetObservationsById}})
```

`LIVE` loads the current authorized source graph. `BUNDLED` can read only the recipes and observations supplied in
the bundle. A missing bundle member is an execution error; it must never fall back to loading the recipe live.

`RECIPE_REF` currently serves both interactive and task execution. Its eventual adapter must require one of these
contexts explicitly so Preview and Retrieve cannot drift back to different implicit resolution rules.

## Authorization boundary

Live recipe loading requires an explicit trusted SEPAL principal. It has no default and cannot read a principal
from a recipe model or other caller-controlled request field. The gateway or another authenticated server boundary
supplies it. Omitting the principal fails before any recipe is loaded.

The resolver remains JavaScript so recipe-type edge extraction and traversal have one implementation. A
caller-aware server boundary enforces access and returns authorized recipe records; it does not duplicate edge or
capability logic in a server endpoint. Recipe contents and their server-owned monotonic revisions are read
together. Graph-wide coherence additionally needs a consistent transaction or bounded revision-recheck protocol.
Whether the Node server exposes this as batch HTTP, an internal repository adapter or both is an implementation
decision, not a prerequisite for the pure contract.

GEE reads recipes without administrator credentials. A GEE job reads as the user the gateway authenticated
on the request that job was built from; for a task container's request that is the task's user, resolved from
its per-task key. A job carrying no user reads nothing, and there is no
service-credential fallback. Recipe applies its existing ownership policy, so a recipe another user owns is
answered exactly as a missing one.

### Operation-scoped recipe loading

One execution operation - one submitted GEE worker job, one task execution - owns both the reader it is
authorized with and the records it has read. Its `configure` task opens that operation on the request's own
worker state, every later task of the request runs inside it, and the finalize pass ends it however the
request ended. Concurrent references share the read in flight, and after a successful read every later reference
gets the retained record, so the several factories one operation constructs from one reference cannot derive
geometry, metadata and imagery from different revisions. A read that fails
is not retained, so a later attempt reads again rather than replaying the failure. Reads still resolve at
subscribe, and ancestry remains path-local: a shared record carries no ancestry from whichever branch read
it first. Ending the operation unsubscribes reads still in flight and releases the records; a later
operation starts fresh and may observe newer revisions.

This guarantees one version per recipe per operation. It does not establish a coherent snapshot across the
dependency graph - nothing rechecks revisions once the closure is resolved - it does not freeze Earth Engine
assets, and it is not an accepted Retrieve execution bundle.

As a bounded migration measure, a browser operation may complete its preflight graph through the existing
authenticated per-recipe GUI read. It starts with the exact unsaved root and the session's loaded records, requests
deduplicated missing frontiers under the current user, and retains returned records only for that operation. This
does not use administrator credentials and does not make browser evidence a coherent execution graph. Missing or
forbidden records still fail closed.

The Node Recipe service exposes authorized per-recipe reads; batch and closure endpoints are future work.
Neither endpoint shape alone would establish graph-wide coherence. The trusted bundle-acquisition and task-
acceptance boundaries must also enforce the snapshot protocol. Endpoints can orchestrate shared JavaScript
traversal, capability derivation and bundle construction without introducing a separate resolver.

Ambient SEPAL administrator credentials must not be reachable from generic recipe resolution. A separately
authorized administrative operation must remain explicit; acting on behalf of a user must enforce that user's
access rather than inherit service-account visibility.

Any server-side or shared recipe, description or resolved-graph cache includes the SEPAL principal in its key.
Asset metadata caches additionally include the linked Earth Engine identity or authorization context. Cache hits
must never broaden what the current principal can resolve.

## Structured source edges

Every recipe type owns one shared definition. That definition exposes its direct recipe and asset references as
role-bearing edges after normalizing the legacy shapes in that recipe's model:

```js
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'PRIMARY_IMAGE'}
{reference: {type: 'ASSET', id: 'asset-id'}, role: 'MASK_IMAGE'}
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'FILL_IMAGE'}
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'CLASSIFICATION_SOURCE'}
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'AOI'}
```

For a source adapter or temporal composer, the discovered command skeleton owns named references once and the
recipe definition projects these role-bearing edges from that structure. Do not let a caller supply both a command
reference and an independently maintained dependency list. Discovery and binding semantics are defined in
[output-products.md](output-products.md); the graph remains the sole authority for loading, authorization, closure,
cycles, diamonds and dependency paths. A planner declares direct references but never traverses or loads the graph.
After closure, the product resolver evaluates declarations bottom-up in graph order.

The definition that owns a recipe may inspect that recipe's raw model while resolving its node. A cross-recipe
binder receives only role-scoped child product declarations, capability declarations and evidence requirements for
its named references. It receives neither foreign recipe records nor the complete catalogue. After evidence
resolution, those declarations become resolved products and capability instances carrying provider paths. This
prevents adapter or composer code from reconstructing another recipe type's output or acquiring undeclared
dependencies.

The shared recipe catalogue only imports and indexes definitions by persisted type. It rejects duplicate and
incomplete definitions and contains no recipe-specific behavior. A recipe definition must explicitly expose its
direct sources or explicitly declare that it has none; absence fails closed. Generic reference and edge modules
know canonical shapes only. Legacy `RECIPE`, `EE_TABLE`, bare-ID and other model-specific forms are interpreted by
the definition that owns those fields rather than by a central normalizer.

Role identifiers are owned by recipe definitions and are opaque to generic traversal. A new role does not require
editing a central role registry. Cross-recipe behavior must be represented by an explicit shared contract rather
than by generic code switching on recipe-specific role names.

All edges affect execution fingerprinting. Recipe references participate in dependency closure and cycle detection;
asset references contribute observations and drift checks. Only roles declared to supply inherited capabilities
participate in capability-provider lineage. Mask and fill inputs affect pixels but do not supply the wrapper's
inherited capabilities. An `AOI` edge affects output extent and geometry but does not provide image semantics.

An absent AOI means "no restriction" to the shared geometry resolver. Whether absence is allowed belongs to the
recipe's operation contract: PyEO requires an AOI for image and geometry execution but can report static band names
without one. Required-input validation returns an actionable client error; it does not depend on GUI wizard state.
The resolver remains strict about malformed descriptors rather than treating them as unrestricted geometry. The
GUI must not request initial bounds for an unconfigured selection, including a saved empty AOI object.

Every inventoried recipe type declares every output-relevant recipe and asset reference, including references
outside image-input sections. Executable references use canonical source-reference shapes. A test-only structural
audit compares a representative persisted model with its definition: every canonical reference must be either a
declared edge or an explicitly classified non-edge snapshot. Fixtures are sanitized from real saved-recipe shapes
recorded during the inventory rather than invented from an ideal model.

The audit is a migration guard, not a claim that arbitrary legacy JSON can be understood by shape alone. Strict
runtime enforcement applies only to inventoried recipe types. For them, an undeclared canonical reference is a
controlled resolution error. Tests cover every representative model and reject adding a canonical reference
without declaring or classifying it.

The resolver memoizes recipes by ID, so diamond dependencies are resolved once. It keeps the dependency
path for diagnostics and rejects direct and indirect cycles. Any adapter that loads a closure around this resolver
also applies bounded depth, node-count, serialized-byte, loading-round and request-concurrency limits with
controlled errors. Limits are safeguards against malformed graphs, not tuning knobs for ordinary recipes; their
initial values require measured repository and production evidence.

The GUI should reject a newly selected reference when it would close a known cycle. Backend resolution performs
the same check because saved and programmatically submitted recipes can bypass the form.

## Deletion and movement

Recipe deletion never cascades. When known dependents exist, deletion warns and requires confirmation. After
deletion, saved dependents retain their reference and resolve to `MISSING_SOURCE`; new Preview and Retrieve
operations are blocked. A task whose execution bundle was already accepted continues to use its frozen recipe
contents.

Dependency warnings can initially be incomplete. Once edge declarations are indexed at save time, SEPAL can report
known direct and transitive dependents without rescanning opaque recipe JSON. Recipe rename and project movement do
not invalidate ID-based references; display metadata refreshes independently.

Earth Engine asset deletion is asymmetric: SEPAL cannot enumerate every external dependent and cannot warn before
the asset is removed. Observation refresh and execution-time drift handling are the detection mechanisms.

## Execution identity and capability providers

A resolved source separates its execution identity from capability-specific providers:

```js
{
    executionReference: {type: 'RECIPE_REF', id: 'masking-recipe'},
    chain: [/* role-bearing nodes from the selected source */],
    capabilities: {
        CCDC_SEGMENTS: [{
            providerReference: {type: 'RECIPE_REF', id: 'ccdc-recipe'},
            providerPath: [/* role-bearing path to this provider */]
        }]
    }
}
```

The execution reference always identifies the selected outer source. A capability records its own provider and
evidence path; a resolved output can carry capabilities from different providers or derive one at the outer node.
There is no single semantic reference or effective recipe type. Replacing the execution reference with any
capability provider is never valid.

Resolution and compatibility are separate:

1. Resolve every dependency edge.
2. Follow roles declared to supply inherited capabilities.
3. Derive source descriptions and capabilities bottom-up.
4. Validate the consumer's expectations against the complete execution chain.

Terminal recipe type alone does not prove compatibility.

Plan validity and compatibility are separate as well. A valid bound command may carry a partial declaration and
explicit evidence requirements. A consumer then classifies its operation-specific requirement as supported,
unsupported or unresolved. Runtime availability, such as whether the configured AOI and dates produce any
observations, remains execution evidence rather than a capability or planning diagnosis.

## Resolved descriptions and capability lineage

The output-band field contract and product-declaration semantics are owned by
[output-products.md](output-products.md). This section specifies how resolution carries that description through a
dependency graph, associates capabilities with providers and applies execution constraints. The resolved generic
image description uses an ordered band array. Order is part of image schema, but consumers match by name unless their
operation explicitly defines a positional contract.

```js
{
    name: 'class',
    dataType: {precision: 'int', arrayDimensions: 0},
    grid: {
        crs: 'EPSG:32636',
        crsTransform: [10, 0, 300000, 0, -10, 1100000],
        nominalScale: 10
    },
    pyramidingPolicy: 'mode',
    valueSemantics: 'CATEGORICAL', // CATEGORICAL, CONTINUOUS or UNKNOWN
    categories: [                  // optional, provisional and evidence-qualified
        {value: 1, label: 'Forest'}
    ]
}
```

Per-band grids are real and must not be replaced by the first band's projection. `valueSemantics` and `categories`
are provisional generic fields to be tested by migrated consumers. They may support decisions such as pyramiding
and categorical applicability, but must not absorb richer domain behavior merely to avoid a capability. Categories
remain optional because an image can be categorical without an exhaustive legend. `pyramidingPolicy` is an export
requirement, not a presentation preference: CCDC array bands require `sample`, while categorical and continuous
scalar bands may require different policies. Palette and stretch are visualization state, not band schema.

Array dimensionality is verified physical schema, not inferred semantics. When SEPAL must derive an export policy
from physical schema, every band with `arrayDimensions > 0` uses `sample`: spatial aggregation can require matching
array shapes and can reinterpret structured values even when shapes happen to match. This rule depends on neither a
recipe type nor a band name. A recipe may declare another policy only when it owns and guarantees the array's
fixed-shape aggregation semantics; no current recipe does. Physical scalar type alone does not determine `mean`,
`mode` or another policy. The scalar band's physical schema can still resolve; its pyramiding policy remains absent
until stronger evidence or an explicit coexistence policy supplies one. Missing operation-specific authority must
not erase otherwise verified band schema.

Export compatibility is also per selected band. Earth Engine asset export is the only supported destination for
array-valued bands; Drive and SEPAL raster-file exports require scalar bands. If any selected band has
`arrayDimensions > 0`, the resolved output permits only the Earth Engine asset destination. This is derived from the
selected output schema, not from recipe type. An empty selection meaning all bands is compatible only when every
described band is compatible. Consumers must reject an incompatible destination before submission, and execution
boundaries must retain their own validation rather than trusting the GUI.

Export validation considers only the selected bands. A scalar band with no known policy is valid for Drive or
SEPAL, where no Earth Engine asset pyramid is created, but cannot be selected for Earth Engine asset export until a
policy is known. Consequently, a mixed scalar/array image can resolve completely: an array-only selection can
export to Earth Engine with `sample`, while a scalar-only selection can use Drive or SEPAL. An all-band selection
must satisfy the requirements of every described band.

The current shared contracts include:

- the `IMAGE_OUTPUT` product: executable image, ordered output bands and per-band export requirements;
- the `CCDC_SEGMENTS` capability: stored CCDC bands, base-band derivation, available measures and date
  interpretation;
- `BAYTS_HISTORICAL_STATS`: the producer whose statistics BAYTS Alerts monitors against, and whose processing options
  it uses as defaults;
- `OPTICAL_COLLECTION_DEFAULTS`: imagery configuration available for panel prefill, independently of whether that
  imagery can execute.

The generic `providerStep(record, capability)` reads the capability's declaration key and returns `PRODUCES`,
`PRESERVES`, `UNSUPPORTED` or `MALFORMED`. A preserving step follows only the input filling its declared role.
The shared `discoverProvider(selected, records, capability)` walks records already held and returns the provider
with the way there (`chain`: each record followed and the role it was followed through) or where the walk stopped
(`at`); the GUI's `resolveProvider` adapts it for callers that treat every stop as a failure. Execution's segment
resolver loads records through the operation's reader. Both use that same step. A possible provider is not verified
asset content or a guarantee of compatibility with every operation: discovery says where to look, and a consumer's
requirement decides from evidence about what is there ([Change Alerts REF](#change-alerts-ref)).

### Current segment consumer contract

CCDC Slice and Change Alerts ask the GUI's segment capability adapter for a description. Registered producer
providers describe CCDC from its model and declared dependencies, or an asset from its metadata. The shared
evidence lifecycle owns watching and acceptance; consumers derive their bands, dates, presets and operation choices
from the accepted description. A saved Slice can supply a description to another recipe without first being opened.

Slice uses the shared mode-aware output-band derivation for its declaration, GUI and execution band reporting.
Segment slicing and interpolation/range modes retain their distinct harmonic behavior. Presets and Retrieve
selections are filtered against the bands the chosen operation actually produces. A map layer's selection whose
bands disappear is never rendered; it gives way to the first style offered, or is kept while none is. Stable preset
identities are reconciled against the selected source and the styles restored from saved layers.

Slice, Change Alerts and the segment chart resolve execution facts through
`lib/js/ee/src/timeSeries/segmentSource.js`. It obtains `{dateFormat, selectableBaseBands}` before the consumer
chooses image-construction arguments. A declared asset-backed producer names the asset whose properties supply
the date representation. Discovery and construction reuse the operation's recipe records, and construction
retains the selected outer reference and its ancestry: Masking supplies the image while its primary producer
supplies segment facts. Asset metadata and pixels are not frozen by that record sharing.

For a recipe source, the producer's declared date representation or asset property takes precedence over a legacy
copy beside the reference; a missing value may use that copy. For a directly selected asset, an explicitly
configured date format takes precedence, including zero. Slice retains its final zero default; Change Alerts does
not introduce one. Fresh descriptions are not copied into these consumers' models, and saved copies are not
rewritten. Changing the date-format override policy is a separate decision.

Unsupported and malformed sources fail before segment algebra with `UNSUPPORTED_SEGMENT_SOURCE` and
`MALFORMED_SEGMENT_SOURCE`. Preservation-chain cycles use the execution path's `CYCLIC_DEPENDENCY`; unavailable
recipe or asset reads propagate instead of falling back to a copy. The GUI additionally identifies unresolved
records as `UNRESOLVED_SEGMENT_SOURCE`. Runtime witnesses live under `modules/gee/test/jobs/ee/ccdc/` and
`modules/gee/test/jobs/ee/timeSeries/`; their external substitutes do not prove live Earth Engine pixel results.

`CLASSIFICATION_RESULT` remains a likely later capability for classification-specific contracts. Generic
categorical metadata must not be stretched into classifier behavior, reusable training data or other algorithmic
capabilities.

### Classification results and reusable classifiers

These are distinct candidate contracts, to define from their consumers. A classified result supplies pixels and
their categorical meaning. A reusable classifier supplies the behavior needed to classify another image, including
its training and input requirements. PyEO needs the baseline classified image and classifier behavior; CCDC, Time
Series and Phenology also apply a selected classifier to collection images. Band or legend availability alone
cannot establish compatibility for those operations.

Masking a Classification preserves values at the remaining valid pixels; it does not by itself establish how to
reuse that classifier. Before accepting such wrappers, decide whether the mask affects only the baseline, also
newly classified images, or the training footprint, and define preservation for each requested operation. Execution
must retain the selected wrapper wherever its output is consumed. Resolving a classifier provider cannot silently
replace that output with the unmasked Classification.

An optical input masked before Classification is a different composition from a Classification whose output is
masked. Support for the former does not prove the latter. Standardizing selector presentation is independent of
this design and should retain existing eligibility until the behavioral contract is established.

### Transformation and preservation

Recipe definitions describe their product transformations in terms of guarantees relevant across capabilities.
For example, Apply mask preserves ordered band schema and values at pixels that remain valid, changes the mask and
may change the effective footprint. It also preserves per-band export requirements because it does not change band
representation. A capability contract states which guarantees it requires and whether a transformation preserves,
decorates, derives or drops it. The resolver combines the contracts bottom-up.

Identity needs no per-band list. A subset or rename is different: it supplies the actual ordered input-to-output
mapping, not merely a `SUBSET` label. Generic resolution validates that every mapping refers to the stated input and
output products and is unambiguous. Capability-owned code receives the input capability, both products and the
transformation effects, then preserves, reduces or drops its capability description. Generic code never interprets
CCDC timing, measures or another domain contract.

The same mechanism applies to n-ary recipes. A Stack definition maps each input's bands into its output, carrying
schema, export requirements and capability evidence only for unchanged bands. It can expose several instances of a
capability from different inputs. A value-changing operation such as Band Math derives a new output and does not
inherit domain capabilities merely because one input supplied them.

Do not maintain a list of pass-through recipe types in each consumer, and do not require every pass-through recipe
to name every capability individually when its transformation guarantees already decide preservation. A recipe or
capability may still provide an explicit rule when generic guarantees are insufficient.

### Requirement and capability discovery

Compatibility is queried for a source instance's declarations or resolved description, not inferred from its recipe
type. The same Masking type can preserve `CCDC_SEGMENTS` when its primary input provides that capability, and lack it
for another primary input or operation. Capabilities are zero-or-more instances keyed by capability name; each
instance has a stable provider path and any output-band mapping needed to interpret it. A consumer expectation
includes cardinality or a persisted
instance selection when more than one match is meaningful. It receives one of three outcomes:

- `SUPPORTED`: current declarations or resolved evidence satisfy the operation requirement;
- `UNSUPPORTED`: the operation is not admissible under the current contract, whether contradicted or lacking
  permanently required provenance;
- `NEEDS_EVIDENCE`: a concrete authorized acquisition path could still decide the requirement.

`NEEDS_EVIDENCE` is not a runtime transport state. Before acquisition, supported requirements skip observation and
unsupported requirements stop. After acquisition, success yields supported or unsupported, transport or
authorization failure yields runtime `UNAVAILABLE`, and contradictory or malformed evidence yields runtime
`INVALID`. Once all declared acquisition paths are exhausted, final validation cannot remain `NEEDS_EVIDENCE`.
A permanently unknowable semantic requirement is unsupported with `INSUFFICIENT_PROVENANCE`.

Recipe selectors use this query rather than synchronous type predicates or blanket `sourceRecipe` checks. A
consumer such as Change Alerts declares `CCDC_SEGMENTS` and remains unaware of Masking and future pass-through
types. If several instances match an expectation requiring exactly one, the result is unsupported with a stable
ambiguity diagnosis until the consumer supports choosing one. Existing persisted selections are revalidated through
the same contract and remain visibly invalid rather than being silently replaced. Backend validation repeats the
required safety checks for legacy models, direct API submissions and stale clients.

The GUI can seed descriptions from recipes already loaded in the session and may complete one operation's declared
closure through the existing authenticated per-recipe read. This temporary loading is suitable for bounded
preflight of a known root, not for searching all saved recipes or establishing execution coherence. Complete
discovery across saved recipes requires the caller-authorized storage and session-catalogue boundary described
below. Asset capability discovery uses authorization-scoped metadata evidence and bounded inspection; an arbitrary
asset property is not proof of compatibility.

Selector integration is a later step after validation of a selected source. Recipe listings carry basic metadata,
not the configured dependency chain, and asset listings do not establish band structure. Opening a picker must not
load every recipe closure or issue an Earth Engine metadata request for every candidate.

- Use cheap candidacy rules first, retaining deliberate input-eligibility restrictions. These can rule out impossible
  types but cannot prove a particular source suitable.
- Refine candidates using current records and evidence already held by the shared runtime. Known unsuitable
  candidates may be excluded or disabled with a reason; unknown or temporarily unavailable candidates must not be
  treated as unsuitable merely because they have not been checked.
- Perform bounded validation when a candidate is selected, sharing the existing loading and evidence paths.
  Any later inspection of visible or searched candidates needs an explicit request budget and cancellation policy.
- Always retain the current selection visibly, with its diagnosis, even if it no longer qualifies for new selection.
- If efficient discovery needs richer recipe summaries or an index, design its authorization and dependency/version
  invalidation separately. Such summaries narrow candidates; final validation still checks current evidence.

Keep candidate discovery separate from suitability validation so a future storage implementation can query recipe
configuration and dependency relationships directly, for example with PostgreSQL JSONB. Do not make discovery
depend on loading the entire catalogue into the browser or duplicate capability rules in storage-specific queries.
Validation consumes supplied records and evidence regardless of how candidates were found; session drafts remain
part of final validation. This is a compatibility direction, not a scheduled database migration or a reason to add
a speculative storage abstraction to the current packet.

#### Requirement contract

A requirement is pure and shared (`lib/js/shared/src/recipe/requirement/`): a stable `id`, the capability it is over,
and `evaluate(facts, parameters)`, where `parameters` is plain data and `facts` describe the provider the capability
resolves to - never the recipe that selects it. It loads nothing, acquires nothing, translates nothing and holds no
UI state; without facts it answers `NEEDS_EVIDENCE`. Capability discovery (`discoverProvider`) stays separate: it
finds the provider over records, and a requirement judges that provider's facts. For CCDC segments the facts are
`{producer: COMPUTED, measures}` for a recipe computing its segments, whose layout CCDC guarantees by declaration, or
`{producer: ASSET, assetId, bands: [{name, arrayDimensions}]}` for segments stored in an asset, a rank undefined
where the metadata established none. Each consumer's GUI side adds what diagnoses mean (`describe`) and where facts
come from (`factsOf` on the capability).

Today loaded records supply discovery, and the observation the source runtime accepted supplies the facts: typed
asset metadata, or the producer's own description. A future index could supply both instead - per recipe its type and
declared source edges, per asset its typed-band summary - and the same `evaluate` would answer a query without full
recipe JSON. Facts from an index are no more current than facts read live: a summary must carry what makes it
trustworthy - the identity of the source it describes, the record revisions it was taken from, the asset versions or
update times it was read at, and the authorization scope it was read under - and be checked against the current
state as live evidence is. The live check compares a basis that includes object identity within one session; an index
needs equivalent semantics expressed in those durable terms, not that mechanism. Evaluating an old summary alone never
establishes current suitability.

#### Validation across model properties

General policy belongs to [validation across model properties](../../code-design.md#validation-across-model-properties),
not source resolution. Source-backed validation adds provider discovery and current evidence to that policy.

For Change Alerts, REF is refused when established facts show no supported monitoring source can use its segments.
When REF permits a valid configuration but the current monitoring settings do not, the reference replacement is
applied, Sources is marked and the actionable Sources field is invalid, saying what to change - the type of data, the
data sets or the band monitored. REF says nothing of it: a reference deliberately replaced is followed by Sources' own
validation, not warned of in advance, and Sources declares no advisory to REF.
Optional chart requirements gate the chart independently. [Change Alerts REF](#change-alerts-ref) describes how.

Date compatibility needs a separate execution-derived rule and adequate evidence. Preserve configured dates;
distinguish an incompatible selected period from a reference that cannot support any permitted period. Metadata
extents alone must not be assumed to establish per-pixel coverage.

### Change Alerts REF

Change Alerts is the first consumer to validate its configured source. A recipe declares what it needs; shared code
decides when the answer can be trusted and what it does to the UI.

- **Declaration** (`referenceRequirement.js`). Change Alerts' type declares four requirements over its reference,
  the selection by the role its source edge already has (`PRIMARY_IMAGE`), each with the section it belongs to and the
  requests that need it met. A section may name the form input that shows what its requirements find (`input`, a
  function of the panel's form values naming a form input, not a model location): REF names its asset or recipe input,
  and Sources names none, so its findings show on its toolbar button only. A requirement may name other sections whose
  status advises that it is not met (`advise`); none of Change Alerts' does, so REF gets no cross-section advisory:
  what Sources needs after a reference is replaced is said in Sources alone.

  | Requirement | Section | Gates | Required to apply |
  |---|---|---|---|
  | `ccdcSegments.sliceable` | REF | the alerts and their Retrieve (`IMAGE_OUTPUT`); the monitoring and calibration mosaics through the provider chain only (`providerOperations`) | yes |
  | `ccdcSegments.monitoredMeasure`, `{monitorable}`: the bands any monitoring data Sources offers observes | REF | the alerts and their Retrieve | yes |
  | `ccdcSegments.monitoredMeasure`, `{measure, available, observed}` from `sources.band`, the bands any data sets of the selected type observe, and those its selected data sets observe | Sources | the alerts and their Retrieve | yes, in Sources |
  | `ccdcSegments.chartable` | REF | the segment chart (`PIXEL_SEGMENTS`) | no (`requiredForSelection: false`) |

  Each is derived from what reads it. The alerts' slicer (`changeAlertsAlgorithm.js`) finds the segment nearest a date
  from `tStart` and `tEnd` and evaluates a measure from `<measure>_coefs` against `<measure>_rmse`, every band shaped as
  it masks it: a `_coefs` band as a two-dimensional array, any other as a one-dimensional one. The segment chart
  (`ccdcGraph.jsx`) also plots `tBreak`, `changeProb`, `numObs` and a measure's `_magnitude`. The mosaics resolve the
  segment source's geometry only. Which measure is monitored is a setting of Sources, so a reference that fits other
  measures is still a suitable reference; the alerts wait for Sources to name one it fits. A reference with no
  measure any monitoring data Sources offers observes could never be monitored, and is refused in REF. What the
  monitoring data observes comes from the band definitions Sources itself offers (`monitoringData.js`): any one data
  set of a type, top of atmosphere or corrected to surface reflectance.
- **Requirements** (`requirement/ccdcSegments.js`, shared; `segmentRequirements.js` for their wording). Segments read
  from an asset - selected directly or named by an asset-backed recipe - are judged from the dimensionality its
  metadata states for its bands; a recipe computing its segments guarantees the layout by declaration, so only its
  measures are asked of it. A band whose dimensionality was not established is insufficient evidence, kept apart from
  an observed incompatibility and never reported as a scalar, and refuses wherever the requirement is mandatory. The
  rules do not establish how many coefficients an array holds, whether dates are in the configured representation, or
  anything of an image collection beyond its first member. The monitored measure is judged against narrowing scopes,
  the widest that observes none of the segments' measures refusing them - any monitoring data, the selected type, the
  selected data sets - so the diagnosis names the setting to change. Diagnoses read as a summary naming a few
  representative problems, with every problem in their details; an asset without the time bands every requirement
  over segments needs is said, in one sentence naming the remedy, to provide no CCDC segments at all.
- **Facts.** The observation reads the asset's metadata (`/assetMetadata`), which states each band's array rank: for an
  image asset, the gee adapter restores the rank the Cloud record states (`dimensionsCount`) that the Earth Engine
  client's legacy conversion drops; a band whose rank was not established stays unknown. The segment description
  carries the ranks as `typedBands`; the capability's GUI side (`SEGMENTS`, `segmentCapability.js`) turns an accepted
  observation into facts - an asset's typed bands, and only those of the asset that establishes the capability, or a
  computing producer's measures. One observation answers all three requirements. Version polling stays a separate
  metadata read.
- **Trust** (`sourceRequirements.js`). Shared for every declaration: the selection by role, missing selections,
  `discoverProvider` and its generic diagnoses (not a producer, unfilled role, cyclic), and whether the evidence owner's
  answer counts - its live basis from the source runtime ([evidence watches](gui-source-runtime.md#evidence-watches))
  passing the owner's own rule for that selection, the evidence published by the observation that basis belongs to,
  and the asset that establishes the capability authorized by its asset evidence; a mask or AOI failing says nothing
  about it. A chain that cannot lead to the capability is refused from the held records alone, owner or not. A failed
  read settles to unavailable; nothing reading the source is unchecked, never waited on. Each read answers its verdict
  (`SUPPORTED`, `UNSUPPORTED`, `NEEDS_EVIDENCE`) apart from the state of its evidence (`UNCHECKED`, `CHECKING`,
  `CHECKED`, `UNAVAILABLE`, `EXPIRED`), and says whether its section selects the source: a section names the form
  panel editing the model at its id, so REF selects the reference and Sources configures something that depends on it.
- **Section status** (`selectedSourceStatus.js`). A section is held back by the requirements its
  selection must meet: a refusal before unavailable or expired evidence before checking. A section that only depends
  on the source is held back by what is established about its own setting; whether the source can be read is the
  selecting section's to say. Every other established problem over the same source is an advisory, said apart and
  never in place of what holds the section back: a requirement of one operation only (the chart, in REF), by what it
  says; and, while nothing holds the section back, one advisory naming each other section whose settings no longer
  suit the source and whose requirements name this section to advise (PRC, in BAYTS Alerts' REF), whose own status
  says why. A diagnosis is said once per section. Toolbar marks
  count only what holds a section back (REF and Sources alike). While a recipe's wizard sets it up, a section it has
  not reached is not marked yet (`SectionButton`, `PanelWizard`'s `reached`): a section is reached once its panel has
  been open, and every section is once the wizard is done. Only the toolbar mark waits; what holds the section back
  holds the recipe all along, and a panel says what it says once open.
- **Input feedback** (`sourceInputFeedback.jsx`, `inputFeedback.js`). Inside REF, the section's status is said on the
  input its source is selected in, which the section's declaration names (`input`: the asset or recipe input), as that input's
  field validation rather than messages of its own. What holds the section back is the input's error, in its short
  message alone - the problems behind it stay in the status, not in the tooltip - after the input's own required-field
  or loading error and never in its place, and it holds Apply back as an invalid field does.
  A check still running is the input's busy indicator, explained in its label's
  tooltip beside the tooltip it already has, and holds Apply back too; the label's content is left as it is.
  Advisories are its warning, hold nothing back, and show only while nothing holds the section back, so the input shows
  one indicator: a chart's problem waits until the reference itself is usable. Refresh, where reading the source again
  may help, is a button
  beside the label. The combos read this from the form they are in (`feedbackOf`), so a panel adds no code for it.
  Sources declares no input: its button choices cannot show feedback (`Form.Buttons` does not read it), keep their existing presentation, and a candidate it refuses holds its Apply
  back. What is wrong with its committed settings is said by its toolbar button's mark and tooltip, naming the
  setting to change - the type where no data of that type observes a measure of the reference, the data sets or
  pre-processing (an optical reflectance correction) where others of the type would, otherwise the band.
- **Validation before Apply** (`sourceCandidate.js`, `recipeFormPanel.jsx`). A recipe form panel whose id names a
  declared section judges its values before they are applied, with no panel code: over the recipe as it would be with
  the values applied - the candidate - by the same reads. Where the observation keeping the recipe's own evidence
  current holds for the candidate - its live basis passes for it, as when a Sources edit leaves the reference alone -
  that evidence answers, so changing the monitored measure is judged anew without another read. Otherwise the
  candidate is observed on its own while the panel is open (`watchCandidate$`): the evidence is held by the source
  runtime, never published to the recipe, and the recipe's configuration, evidence and drawing stay as they are until
  Apply. One object stands for an edit while it is the edit, and the recipe's own where the edit is what the recipe
  holds, so selections compare as the basis compares them: a same-asset edit of the date representation is read
  anew, and returning to the applied one reads nothing. An edit that changes, a Cancel and a closed panel let the
  candidate go, cancelling its read. Apply asks the form at that moment (`isInvalid`), so evidence a change of
  credentials, records, refreshes or tokens moved past refuses it however recently it was read. Refresh in the panel
  reads again what the candidate's own observation read - its assets, explicitly refreshed, or failing that the
  candidate observed anew - and never the source the recipe holds, unless that is the candidate's. A saved unsuitable
  reference stays visible with its diagnosis and never blocks applying a suitable replacement. Applying commits what
  the panel owns: a replacement fitting other measures is applied, Sources marked invalid, and the alerts waiting for it
  to be repaired. After Apply the recipe's evidence is read again through the normal lifecycle.
- **Authority.** A layer whose product a requirement holds says so on its area menu's visualization selector, as that
  selector's own feedback, without changing the menu's layout: a check in progress is its busy indicator, explained by
  its label. Why the requirement is not met is said in the recipe, on the section's fields and toolbar, so a layer of
  the recipe being edited adds nothing to them, and a layer of another recipe says only that it cannot be rendered and
  which section of that recipe to review. A product no requirement holds says nothing of it, and a selection not made
  holds what needs one. Retrieve decides from the same reads at submission: it waits while the source is
  being checked and otherwise blocks, naming the section; dependencies already known to be unsound refuse it for that
  instead. A new preview or segment-chart request is held by the reads of the requirements naming it (`requestGate`)
  while they are not known to be met, keeping what is already drawn; a source found missing or unsuitable also
  withdraws the drawing. The chart offers the measures the chart requirement establishes that its observations show
  ([operation availability](#operation-availability)), and replaces a charted band that is no longer one of them, but
  not while the reference is being checked again. Once none is left, an open chart cancels what it is reading, stops
  showing what it read and settles on saying it has no band to chart; it charts again once one returns. The consumer making a request
  watches what its operation needs wherever the recipe is shown. Absence from the listing is never called deletion.

Scalar-image and classification-input requirements, and execution parity for asset segment leaves, remain separate
packets. CCDC Slice ([below](#ccdc-slice-src)) and BAYTS Alerts ([below](#bayts-alerts-ref)) follow the same contract.

### CCDC Slice SRC

CCDC Slice declares two requirements over the source selected in SRC (`ccdcSlice/sourceRequirement.js`), by the role
its source edge already has (`PRIMARY_IMAGE`), and registers its existing observation (`sliceObservation`) so layers,
Retrieve and the chart check it outside the editor:

| Requirement | Section | Gates | Required to apply |
|---|---|---|---|
| `ccdcSegments.sliceSource` | SRC | the slice, its layers and Retrieve (`IMAGE_OUTPUT`) | yes |
| `ccdcSegments.chartable` | SRC | the segment chart (`PIXEL_SEGMENTS`) | no (`requiredForSelection: false`) |

Each is derived from what reads it:

- **The slice** (`lib/js/ee/src/timeSeries/ccdcSlice.js`, `temporalSegmentation.js`). Every mode - a date by segment
  or by interpolation, or a range - finds segments from `tStart` and `tEnd`, treats every `_coefs` band as a
  two-dimensional array and every other band as a one-dimensional one, and reads `tBreak`, `numObs` and `changeProb`.
  It reads every measure the source holds, not only the ones asked for: an asset is sliced whole, since an asset read
  takes no selection, and each `_coefs` band is read with its `_rmse` and `_magnitude` band, by name. A break's
  confidence divides the `_magnitude` bands by the `_rmse` bands pairwise in stored order. So one complete measure
  beside an incomplete one fails, as does a lone `_rmse` or `_magnitude` band; magnitudes stored in another order
  than their errors would be paired wrongly without failing, and are refused as well. At least one measure. Change
  Alerts' `ccdcSegments.sliceable`, which needs only `tStart`, `tEnd` and one measure with its RMSE, is unchanged.
- **The chart.** The segment endpoint reduces whatever bands the source has at the pixel, and the graph reads the
  segment bands and the one measure it plots, so incomplete extra measures do not fail it. It shares Change Alerts'
  `ccdcSegments.chartable`. A source the chart can plot but the slice cannot is refused in SRC, holds back Retrieve
  and leaves the chart available.
- **Computed segments.** CCDC fits complete measures by its own declaration, so only that it fits one is asked of
  it; Masking over CCDC is followed through its provider chain. Masking over anything else is refused from the held
  records, naming where the chain stopped.

Asset metadata does not establish how many coefficients an array holds (the slice pads them to eight), whether the
configured or declared date representation is right (Slice falls back to Julian days where neither says), anything of
an image collection beyond its first member, or whether a pixel has segments at all. A rank the metadata does not
state is insufficient evidence, never incompatibility; an asset that cannot be read is unavailable, with Refresh.
Options' break-analysis band naming a complete measure is not yet validated.

- **Evidence.** The shared segment-asset description carries the asset's typed bands, from the metadata response it
  already reads (`ccdc/segmentsAsset.js`). `resolveEvidence$` stays registered for Masking over Slice.
- **Saved-layer provenance.** The observation declares `savedLayerSource`: the source registry records the source
  the saved layers were styled for when the recipe is first observed, by whoever watches
  ([evidence watches](gui-source-runtime.md#evidence-watches)).
- **SRC.** The compact Asset/Recipe selector sits in the input's label row; changing the type clears the asset, the
  recipe and the date representation, and a recipe with nothing selected starts on Recipe. The picker offers recipes
  of types that may provide segments (`mayProvideSegments`) - Masking among them - and keeps a saved selection
  selected. The asset picker no longer judges band suffixes; it prefills the date representation from the asset's
  property when that asset is first selected, or when none is configured. SRC names its input (`input`), so a
  candidate it refuses is that input's error and holds Apply back; the toolbar marks SRC through
  `withSourceProblems`. Slice declares no cross-section advisory.
- **Chart and actions.** The chart watches what `PIXEL_SEGMENTS` needs, offers the measures the chart requirement
  establishes, holds new requests while the source is checked, withdraws what it drew once the source is refused,
  and charts again once one suits. Chart and Retrieve actions use the shared
  [availability](#operation-availability).

### BAYTS Alerts REF

BAYTS Alerts declares two requirements over the reference selected in REF (`baytsAlerts/sourceRequirement.js`), by
the role its source edge already has (`PRIMARY_IMAGE`), and registers its existing observation
(`baytsAlertsObservation`) so layers and Retrieve check it outside the editor:

| Requirement | Section | Gates | Required to apply | Advises |
|---|---|---|---|---|
| `baytsHistoricalStats.monitorable` | REF | the alerts, their layers and Retrieve (`IMAGE_OUTPUT`) | yes | - |
| `baytsHistoricalStats.monitoredPasses` | PRC (`options`) | the same | yes | REF |

They are derived from what reads the reference. The alerts (`lib/js/ee/src/bayts/bayts.js`, `baytsAlerts.js`) read it
whole. For each radar image of a pass they monitor, they select the bands whose names end in that pass's suffix
(`_asc`, `_desc`), strip it, and read `orbit` by name and the `_mean`, `_std` and `_speckle` bands each as a pair
matched against VV and VH by position; statistics of other passes are never read. A pass is held where any of its
statistics is, and usable where it has all seven - `VV_mean`, `VV_std`, `VH_mean`, `VH_std`, `orbit`, `VV_speckle`,
`VH_speckle` - as scalars, VV stored before VH, with no other band of that pass read as one of them. Each pass is judged
on its own:

- **REF** needs at least one usable pass. Where none is, a pass that may be usable but whose ranks are not stated
  leaves it insufficiently evidenced; otherwise the held passes' problems refuse it, and a reference holding none is
  refused as such.
- **PRC** needs every pass it monitors (`options.orbits`; both where none are stated, as execution does) to be usable.
  Passes saved as anything but a list of orbit passes are refused as malformed; otherwise a pass the reference does not
  hold is refused naming the usable ones, then an incompatible monitored pass, then one
  whose ranks are not stated. Passes not monitored are not judged. PRC has no input to show it on, so its toolbar
  button is marked; the requirement advises REF, whose status gains the aggregate warning while nothing else holds it
  back. Applying PRC judges the edited passes against the evidence already held for the reference, reading nothing.

A computed BAYTS Historical builds every statistic of the passes it is configured with, so only those passes are
asked of it; Masking over one is followed through its provider chain, and Masking over anything else is refused from
the held records. The first and last radar observations a layer can show build a radar mosaic over the reference's
geometry, masked by a direct asset reference's mask, and read none of its statistics, so neither requirement gates
them.

Asset metadata does not establish which pass's imagery the statistics were computed from, how they were filtered,
anything of an image collection beyond its first member, or per-pixel validity. An asset that cannot be read is
unavailable, with Refresh. The statistics come from the asset metadata response the observation already reads for the
processing options (`historicalStats`, `baytsAlerts/historicalStatistics.js`); no second lookup is made. Processing
options are not an execution requirement: options that cannot be parsed, or that state passes BAYTS Historical would
refuse (`baytsHistoricalRefusals`), seed nothing and leave the statistics to be judged.

REF does not own pass coverage: it would refuse a candidate before the prefill that follows Apply could align the
passes. Validity does not depend on that prefill; where the reference describes its passes, the prefill resolves the
mismatch PRC reports.

- **REF.** The compact Asset/Recipe selector sits in the input's label row; changing the type clears the asset and
  the recipe, and a recipe with nothing selected starts on Recipe. The picker offers recipes of types that may provide
  the statistics (`mayProvideHistoricalStats`) and keeps a saved selection selected. REF names its input (`input`): a
  candidate it refuses is that input's error and holds Apply back, a check is its busy indicator, and a reference that
  cannot be read is its error, with Refresh; the toolbar marks REF through `withSourceProblems`. The failure toast is
  gone. Only the selection is written: the bands, dates and visualizations an older GUI saved beside it are read by
  nothing, and are dropped when the reference is next applied.
- **PRC.** Where REF establishes the passes the reference supports - its verdict's usable passes
  (`supportedPassesOf`) - PRC's pass choices are limited to them: an unsupported pass cannot be chosen, and once for
  each answer the form keeps the passes chosen that are supported, or chooses every supported pass where none of them
  is. A choice made after that, clearing every pass included, is left as made; no pass chosen is the Orbits field's
  required error, shown beside its label (`Form.Buttons`' opt-in `errorMessage`), and holds Apply back. Passes saved as
  anything but a list count as none chosen. While the reference is checked, unreadable or refused nothing is inferred.
  This is the form's only: Cancel keeps the saved passes, and the PRC requirement still judges saved settings and
  changing evidence. BAYTS Historical's own panel is given no support, shows no required error, and is unchanged.
- **Prefill.** The processing options are applied as before, only while the editor watches; evidence a layer or
  Retrieve obtained configures nothing until the editor opens and processes it once.

### Operation availability

Whether an operation over a recipe may start is one shared assessment (`operationAvailability.js`), derived from the
type's declared requirements, the recipe's current configuration and the current evidence. It is not a separate
validation system and adds no rules: it reads the same requirement reads the request gates read. The action opening
an operation, the panel carrying it out and the requests it makes consume this one assessment, so they cannot
disagree. Availability is per operation; there is no recipe-wide validity flag.

Implemented for two operations:

- **Segment chart** (`pixelChartAvailability`): the `PIXEL_SEGMENTS` request gate, and the measures the chart
  requirement establishes, narrowed to the bands the chart's observations show. A type supplies those bands as a
  fact (`observedBands(recipe)`); Change Alerts names the bands its monitoring data observes (`monitoringData.js`).
  Established, but with none of its measures observed (`noChartableBand`), the chart is not available; while what
  can be plotted is still being checked, that is not known, and the gate alone holds the chart back. The chart
  panel takes its segment gate, band choices and `noChartableBand` from the same assessment, so the action and the
  open chart cannot disagree about whether there is a band to plot.
- **Retrieve** (`retrieveAvailability`): the `IMAGE_OUTPUT` source-requirement gate. Retrieve's submission decision
  (`retrieveOutput.js`) takes its source gate from the same assessment. Retrieve's other readiness - the recipe
  listing, unsettled drafts, asset authority and the output itself - does not hold the action back. Opening the
  panel is what renews the listing and starts watching the output that the asset authority is read for, so gating
  the action on them could keep it closed for good; and the panel is where their diagnosis is said. The panel and
  the submission decide from them as before.

The shared Chart and Retrieve toolbar actions are disabled while their operation's prerequisites are being checked or
are not met. They use the buttons' existing disabled state, which also takes them out of keyboard focus. They add no
tooltip, message or busy indicator: why a prerequisite is not met is said where the section's status says it. A pixel
selection started before the chart became unavailable is let go, a pending long press is cancelled and the coordinate
input is closed, and the input neither opens nor charts coordinates while the chart is unavailable, so a later map
click or coordinate cannot open the chart. The actions become available again by themselves as the evidence or configuration
recovers. Each action is held back only by its own operation: a chart that cannot plot leaves Retrieve available, and
a monitored measure the reference lacks leaves the chart available.

Disabling the opening action replaces no protection inside an already open panel: the chart still withdraws and
recovers what it shows, and Retrieve still decides at submission. The evidence the actions read is kept current by
whatever watches the recipe - its editor, an open panel or a layer - and the actions add no watch of their own. A type
that declares no requirements is never held back.

Requirements over a recipe's own configuration feed the same assessment ([local
requirements](data-sources.md#validation-boundary-review)): one not met refuses its operations with
`CONFIGURATION_UNMET`, naming its section, and withdraws what they drew, as a source found unsuitable does. Retrieve
refuses on it whatever the output reads as. Extending availability to other operations belongs to the
[declarative validation roadmap](data-sources.md#declarative-validation-across-model-properties), not to this
assessment's current scope.

### Execution readiness

Implemented for declared `IMAGE_OUTPUT`, `PIXEL_OBSERVATIONS`, `PIXEL_SEGMENTS` and `TRAINING_DATA` operations
(`lib/js/shared/src/recipe/output/readiness.js`). Coverage is operation- and recipe-specific; the
[current delivery plan](#current-delivery-plan-2026-10-21) separates remaining work from completed migrations.
It closes the gap [dependency-scoped descriptions](gui-source-runtime.md#reading-a-recipes-own-output)
leave open: a description that is `READY` over a `VALID` closure is not permission to run. One rule produces findings,
shared readiness combines them, and GUI declarations explain them; no rule is copied. It adds no validation framework:
it reuses the declarations, the closure, the output read and its acquisition, its caches, and the requirement reads
consumers already share.

**The gap it closes.** Read for its description alone, a Remapping over a Random Forest Classification with no
training data, and a Masking using that Classification as its mask, were `READY`. Remapping describes its class band
from its legend and reads no input, and Masking's preserving provider reads only its primary image. Both execute
their inputs, and Earth Engine failed training on an empty collection. A Masking whose mask is unselected has no mask
edge at all, and failed in Earth Engine (`lib/js/ee/src/masking.js`). Readiness refuses all of these, and adding
training data or a mask restores them.

#### Description and readiness

They answer different questions, and neither stands in for the other:

- **Description** - which bands a configured recipe provides, and what is established about them. Unchanged: only
  what its provider reads can fail it, and a refusal there means the schema itself cannot be stated.
- **Readiness** - whether one operation over the recipe can run. It combines:
  1. the recipe's own **configuration requirements** for that operation;
  2. its description, where the operation builds its image: a description refusal is also a readiness finding;
  3. the description and readiness of every dependency the operation needs an image from - whether or not the
     provider read it;
  4. structural soundness, `dependencyValidity`, unchanged and still required beside it.

A Classification without training data is described, with its classifier's bands, and is not ready. Its bands still
serve styling, presets and band choices, and nothing draws or exports it.

#### Result contract

Readiness is `{status, findings, needs}`, answered by the same read as the description and in the same vocabulary as
its acquisition:

| Status | Meaning | Who answers it |
| --- | --- | --- |
| `READY` | Every requirement is met, over everything the operation needs | the pure read |
| `NEEDS_EVIDENCE` | No finding, and some record or observation the operation needs is not held; `needs` names them | the pure read |
| `UNAVAILABLE` | No finding, and what it needs could not be had: a closure that failed, an observation that failed, an asset found missing | the settled read, the GUI runtime's terminal, or Task's settled read |
| `NOT_READY` | At least one confirmed finding | the pure read, kept by every later answer |

- `findings` are `{code, path, recipePath}`: the originating recipe is the tail of `recipePath`, the location its own
  model path, however far up the closure.
- A confirmed finding outranks missing or failed evidence and is never lost to it. `NOT_READY` keeps every finding
  established so far, and its `needs` still name what it waits for. Within one evaluation, evidence settling can only
  add findings. A finding lasts only while the records and evidence it was found in are current: a repair, an
  explicit refresh, a new revision or a changed asset version is another evaluation, and a finding it no longer
  establishes is gone.
- A failed read that settles nothing - a transient or inconclusive failure - blocks new execution as `UNAVAILABLE`.
  It is never a finding, and marks no section as wrong. Pending evidence is `NEEDS_EVIDENCE`, never a finding; an
  unknown stays unknown.
- A recipe or asset found definitively missing or inaccessible keeps what establishes that today. A change image's
  FROM/TO edge read as gone is marked on its section, and an asset found missing is named (`ASSET_UNAVAILABLE`); both
  withdraw the layer. Readiness's `UNAVAILABLE` for the same answer changes neither.
- `needs` joins the description's `needs`. The existing acquisition loop - the GUI runtime's DESCRIBE/EXPLAIN keys and
  Task's settled read - requests what either names. A read whose description is `READY` but whose readiness needs
  evidence still names its acquisition.
- A finding settles readiness as a definitive diagnosis settles a description: a settled read that finds one refuses at
  once, requesting nothing more for it, so an export names what it found first. An editor's question explains it as it
  explains a refused description: `EXPLAIN` loads the closure, observes once what readiness and the description still
  need, and adds the findings that evidence establishes beside those already found. A Remapping over a Classification
  without training data, of an asset lacking a band it selects, is explained with both findings.
- Readiness is recomputed from the current records and evidence. No flag is stored or cleared: adding training data
  restores every recipe over the Classification at the next read.

#### Rule ownership

A rule that execution needs lives once, in the type's shared definition (`lib/js/shared/src/recipe/type/`), and every
consumer reads its finding. It is not restated in a layer guard, a panel or Earth Engine. What else holds an execution
rule today:

| Kind | Examples | Direction |
| --- | --- | --- |
| Shared description refusal | band sets an input lacks; Stack mapping and names; Band Math output bands; Class/Index Change bands; LandTrendr and BAYTS product parameters | Stays. It is also a readiness finding. |
| GUI declaration over a shared finding | `inputImageryRequirements`, `changeImageRequirements`, `trainingDataRequirements`, `remappingRequirements`, Band Math's calculation declaration | Stays. It supplies messages, items, sections and editors, and no predicate. |
| GUI-only execution rule | optical scene selection | Becomes a shared configuration requirement, one type per packet; the guard then goes. |
| GUI rule duplicating a shared one | Classification's `canClassify` saved-data branch; Band Math's local output-image and output-name rules beside `NO_OUTPUT_BANDS`/`DUPLICATE_BAND_NAME`; Stack's band-name form rules | The shared finding is authoritative. A form rule may stay for drafts only, and must agree with it. |
| Earth Engine-only failure | Masking's unselected mask; a missing AOI where one is required; PyEO band set specs | Becomes a shared configuration requirement; the Earth Engine error remains a backstop. |
| Draft-only form rule | required fields while a panel is edited, such as a data set's reference data | Stays at the panel. It never changes the applied recipe's readiness. |
| Presentation policy, not validity | the collecting UI's two-class safeguard on the Classification layer | Stays a GUI rule over the editor's state. It is not readiness. |

"Has training data" is a configuration requirement of Classification and Regression for `IMAGE_OUTPUT`, not a
checklist item. Both declare it through `trainingDataRequirement` (`lib/js/shared/src/recipe/trainingData.js`), each
with its own condition, over one `noTrainingData` predicate.

A **configuration requirement** is part of the type's definition:

```js
configurationRequirements: [
    {code: NO_TRAINING_DATA, operations: [IMAGE_OUTPUT], findings: model => [{path: ['model', 'trainingData', 'dataSets']}]}
]
```

It returns located findings or none, and is evaluated whatever the provider reads. Most requirements read only the
recipe's model. A requirement over configured source references can additionally use `describedInputs(role)` from
the same readiness resolution pass: only successful current descriptions, resolved with the existing per-read
memoization. Missing evidence remains the traversal's pending/unavailable result, never an invented missing band.
This keeps evidence-dependent execution failures separate from output descriptions that are already known.
The declarations include:

- Classification's `NO_TRAINING_DATA`, for trained classifiers (`requiresTraining`, `noTrainingData`). The
  Classification stays described.
- Regression's `NO_TRAINING_DATA`, whatever its classifier (`noTrainingData`): its execution trains the classifier
  configured, and uses no supplied tree as given. The Regression stays described.
- Masking's `MISSING_ROLE` at `['model', 'imageMask']` when no mask is selected. The Masking is refused as incomplete,
  not turned into a pass-through recipe. Its MSK section says "Select a mask" (`maskRequirements.js`).
- PyEO Alerts' `MISSING_ROLE` at `['model', 'sources', 'classification']` when no classification is selected, and
  `NO_CHANGE_CLASSES` at `['model', 'sources', 'changeFromClasses' | 'changeToClasses']` for an empty class list:
  execution loads the classification and compares the two lists. Its report bands stay declared. SRC and the field
  concerned say so (`pyeoAlerts/sourcesRequirements.js`). The Classification stays a `REFERENCE` need. Its
  `UNSUPPLIED_CLASSIFIER_INPUTS`, at the data sets or the classification, requires the monitoring scenes
  (`sceneBands`) to carry what the Classification's classifier reads; `UNAVAILABLE_GATE_INDEX`, for an enabled gate
  only, requires its index of the scenes and of the Classification's input. They read the Classification record
  (`recordsOf`) and that input's description (`describedSourceInputs`, only with the gate on); an unobserved input is
  an observation needed, not a finding. AOI, band specifications and encoding are not migrated here.
- Class Change's `MISSING_LEGEND` at `['model', 'fromImage' | 'toImage', 'legendEntries']` for each image whose legend
  is not a non-empty list: execution codes transitions from both legends' entries. The rule is the editor's existing
  `notEmpty`; its ten-entry limit stays an editor rule, since execution does not need it. The Class Change stays
  described. Its FRM or TO section and its editor's legend say so (`classChange/legendRequirements.js`).
- `MISSING_ROLE` at `['model', 'inputImagery', 'images']` when the input list holds no image, for Classification,
  Regression, Unsupervised Classification, Stack, Band Math and Remapping (`inputImageryRequirement`,
  `source/inputImagery.js`): execution zips the images and builds nothing from none. Their descriptions stay as they
  are: Band Math keeps `NO_OUTPUT_BANDS` beside it.
- Remapping's `MISSING_CONSTRAINT_INPUT` and `CONSTRAINT_BAND_NOT_INCLUDED`, at each constraint
  (`['model', 'legend', 'entries', i, 'constraints', j]`) naming an input the list no longer holds, or a band its input
  does not include (`constraintInputRequirement`, `constraintBandRequirement`, `type/remapping.js`). The Remapping stays
  described.
- Remapping's `MISSING_INPUT_BAND`, at an included input band that a constraint reads but its successfully described
  source does not provide (`constraintSourceBandRequirement`). Unused selections are not checked by this rule.

#### Operation scope

Requirements and needs are declared per operation, and an operation inherits nothing:

- `IMAGE_OUTPUT` is the recipe's canonical image, which Preview draws and Retrieve exports.
- A named map product (LandTrendr's annual mosaic, BAYTS Alerts' radar observation, Change Alerts' collection mosaic)
  declares its own requirements and needs, reusing common declarations by reference where they apply. It does not take
  every requirement of the final image: an intermediate observation or mosaic may legitimately run before that image
  is configured.
- An operation a type does not declare readiness for keeps today's behaviour. The first slice declares `IMAGE_OUTPUT`
  only, so products are unchanged by it.

#### Dependency semantics

Edges stay `{reference, role, path}`; the graph stays the only authority for loading, closure and cycles. Each type
declares, per operation, what that operation needs from each role it emits:

```js
executionNeeds: {[IMAGE_OUTPUT]: {[PRIMARY_IMAGE]: IMAGE_OUTPUT, [MASK_IMAGE]: IMAGE_OUTPUT}}       // Masking
executionNeeds: {[IMAGE_OUTPUT]: {[INPUT_IMAGE]: IMAGE_OUTPUT, [TRAINING_DATA_SOURCE]: REFERENCE}}  // Classification
```

- `IMAGE_OUTPUT`: the operation builds the source's image. The source's description - its refusals included - and its
  readiness for `IMAGE_OUTPUT` count, as if the provider had read it. A recipe source that cannot yet be described
  makes the parent `NEEDS_EVIDENCE` and names what it needs. An asset source counts through its description - its
  observation, which also establishes that it exists - and a missing one is `UNAVAILABLE`.

  This can need evidence the parent's description never asked for. A Remapping over a Classification over an asset
  is not `READY` until that asset is observed and the Classification's band checks pass. The existing acquisition
  requests it and the runtime shares it. Correctness takes precedence over acquiring less.
- `REFERENCE`: only the source's resolution is checked, which `dependencyValidity` already does. This is an explicitly
  limited check during migration, and it does not establish readiness for what is read.

  A Classification trained from another recipe runs that recipe's `getSamples$()`. That builds the referenced
  recipe's input imagery and samples its points over it, unscaled. Its classified output need not be ready, but its
  imagery matters, and so do its points. That role is now `TRAINING_DATA`, which checks the provider's imagery (see
  "Reused training data" below). `NO_TRAINING_DATA` follows held providers recursively to establish configured
  absence of points; missing records never establish absence. An `AOI` edge is
  `REFERENCE` until geometry is an operation.
- **Unclassified roles.** A role must be classified for the operation it is evaluated in. When readiness evaluates an
  actual edge whose role the type does not classify, it is a definitive finding (`UNCLASSIFIED_ROLE`) at that edge. It
  is found once per edge, in the same memoized traversal, with no rescan per consumer. The structural audit over
  representative models stays as a migration guard. It cannot prove that a dynamically emitted role is classified;
  the check above does. Registration requires a type with an image to declare `executionNeeds.IMAGE_OUTPUT`.
- **As declared now.**
  - `IMAGE_OUTPUT`: every image-input role whose provider already reads it (the Classification family's, Stack's,
    Band Math's, the change recipes' images, CCDC Slice's and Asset Mosaic's sources, Masking's primary image), plus
    Remapping's inputs and Masking's mask.
  - `REFERENCE`, a recorded limitation: `AOI`; the collection recipes' `CLASSIFICATION_SOURCE` and `SOURCE_IMAGERY`;
    the training sources; the BAYTS Alerts reference, previous alerts and wetland mask; and Change Alerts' reference,
    whose segments and statistics its source requirements already judge.
- Editor-only and display-only references are not edges and never block. Classification's sampled provenance
  (`recipeIdToSample`, `assetToSample`), Masking's copied band snapshots, imported legends and Sampling Design's
  `displaySources` keep that status ([non-edges](#structured-source-edges)).

What a type needs of a source is its own declaration. A consumer never asks what type its source is.

#### Consumers

One read answers every consumer, so they cannot disagree:

- **Rendering.** `canPreview` requires readiness `READY` beside `READY` and `VALID`:
  - `NOT_READY` withdraws the layer, on its own map or another's;
  - `NEEDS_EVIDENCE` waits;
  - `NEEDS_EVIDENCE` and `UNAVAILABLE` withhold new drawing. A drawing already shown stays while nothing it was drawn
    from changed and the answer is transient: readiness being read again or not had for now, over dependencies not
    found invalid and no asset found missing. A finding, invalid dependencies or a missing asset take it away.
- **Request gates and Retrieve's action.**
  - Output declarations hold their operations as before.
  - Where no read a type declares holds `IMAGE_OUTPUT`, a confirmed finding still does (`OUTPUT_READINESS` in
    `sourceRequirements.js`). A Remapping is held whatever its type declares to explain it.
  - Pending or unavailable readiness does not hold Retrieve's action of a type that declares nothing over its output.
    The action is what starts watching the output, so holding it on evidence nobody watches would keep it closed.
    The layer and the submission still wait for that evidence.
- **Retrieve.** Availability and submission (`retrieveDecision`) require it:
  - `NOT_READY` is `BLOCKED`, naming the section or the upstream recipe;
  - `UNAVAILABLE` is `BLOCKED` as unavailable, not as a configuration error;
  - `NEEDS_EVIDENCE` is resolving.
- **Marks.** Output declarations (`sourceRequirements.js`) read the findings this recipe owns, from description and
  readiness alike, and mark its item and section. Within one recipe, dependent sections do not repeat an originating
  error (for example, CALC does not mark OUT). Across recipes, input-list declarations additionally mark IMG and each
  affected recipe-reference row with a short translated message naming the directly referenced recipe and the
  confirmed originating recipe(s). For B reading A: “A needs attention” when A owns the problem, or “A cannot run
  because Band Math needs attention” when Band Math owns it. Intermediate recipes are omitted; repeated findings
  from the same origin are deduplicated by ID, and multiple origins are all named. If both A and upstream recipes
  own findings, say “A needs attention. It also depends on Band Math, which needs attention.” Exclude A from that
  upstream list by ID, use plural wording for multiple upstream origins, and retain all attribution metadata. The detailed diagnosis stays in its originating recipe. The dependent's held status still names
  the owning recipe (`refusedBy`). Readiness's `UNAVAILABLE` and `NEEDS_EVIDENCE` add no
  mark, and leave definitive missing-source marks as they are. A declaration may leave its section's toolbar button
  unmarked (`toolbarMark: false`), a presentation choice: its finding still holds the operations, which still name the
  section, and the section's other declarations still mark it. Classification's `NO_TRAINING_DATA` is declared so
  (`unmarkedTrainingDataRequirements`); Regression's is not. `wizardStepMark: false` waits only while a set-up wizard has
  the section open as its step (`missingInputImageryRequirement`, Masking's missing mask). Meanwhile the declaration's
  editor, where it has one, says its finding only beside an input already showing its own validation error - as a field
  does once interacted with - so arriving at the step shows no error, while what holds Next or Done still holds it. A
  section not yet reached is not marked either. Outside set-up, toolbar and editor say it at once.
  Reference feedback (`referenceFeedback.js`) is a presentation-only output declaration: `upstreamReferences`
  names declared source roles, and `itemOf` maps their actual edge locations to rows. It has no operations.
  The feedback retains `referenceFeedback: {reference: {id, name}, origins: [{id, name}]}` in its diagnostic and
  item status, independent of translated text. The last hop of each confirmed `recipePath` establishes its origin;
  absent an established origin, the direct-reference message is used. The bridge matches every confirmed finding's
  first recipe hop to the declared recipe edges; it never
  guesses from the first diagnostic, uses an origin's field path as a local input path, or marks an asset with the
  same bare ID. Reads reuse the existing output-requirement memoization. The shared input helpers register this for
  Stack, Band Math, Remapping, Classification, Regression and Unsupervised Classification. Other source-section
  editors have not been opted into this feedback.
  The shared input-image editor binds the same declaration to its recipe selector through `OutputCandidate` and
  standard field feedback. It reads the draft input alone, using the existing explain query where other local
  configuration is already invalid. `blocksApply: false` makes this binding explanatory only; it adds no Apply rule.
  Panels combine output declarations so Classification's existing band-set validation remains active alongside it.
  Opening remains unedited; changing the draft selection or repairing an upstream recipe updates the explanation.
  Cancel preserves applied configuration, marks and gates. Pending or failed reads add no confirmed-reference error.

  Attribution limit: readiness visits each shared recipe once. In a diamond graph, a finding may contain only one
  route to the origin. Only the reported route is marked; other routes are not guessed. Complete feedback for all
  converging routes needs a separate attribution decision. This packet does not change readiness traversal or
  acquisition to manufacture those routes. All existing execution blocking remains in force.
- **Drafts.** An editor's candidate (`outputCandidate.js`) is read through the same rules, apart from the applied
  recipe. Its findings guide the panel and its Apply, and never change the applied recipe's availability. Form field
  rules stay entry-level.
- **Backend.** Task's image asset export (`modules/gee/src/jobs/task/export/imageOutput.js`, single images and image
  collections) resolves the closure itself and already requires `VALID` and `READY`. It requires readiness through the
  same shared function, from the same closure, and refuses the export otherwise. It builds the image beside that check
  (`forkJoin`), so a refused export may already have started Earth Engine work. What is promised is that the export is
  refused. The other recipe image exports pass the same check before they build anything, and build the image and
  its geometry only once the recipe is ready: CCDC's Segments asset export at `ccdcAssetSource$` (`ccdcAssetExport.js`,
  the source both its task and the asset-export sources in `assetSources.js` build from), and the Drive and SEPAL
  workspace image exports at their recipe-aware entry points (`imageDriveExport.js`, `imageWorkspaceExport.js`), before
  a Drive folder or workspace destination is prepared. Establishing readiness may still read Earth Engine for the
  closure and its evidence. Time Series downloads (`export/timeSeries.js`) are held to the same `IMAGE_OUTPUT`
  readiness, though they export an indicator of the collection rather than the `count` image: every requirement that
  operation declares (the classifier inputs) concerns the collection both build, and the indicator is not required to
  be an image band. Each of the three requests checks on its own - the tile ids (`timeSeriesTiles$`) before the AOI
  is resolved or tiled, a tile's date ranges (`timeSeriesChunks$`) before any imagery check, and a chunk's export
  (`startTimeSeriesChunkExport$`) before tiling, building the collection, preparing a destination or submitting -
  so calling the export without planning bypasses nothing. This does not validate the indicator itself.
- **Pixel observations.**
  - **What is judged.** A pixel chart's observation request (`/timeSeries/loadObservations`,
    `jobs/ee/timeSeries/loadObservations.js`) is held to the `PIXEL_OBSERVATIONS` readiness its recipe's type
    declares, before the pixel geometry or the collection is built or anything evaluated. This uses
    `requireExecutable$` in `jobs/executionReadiness.js`, over `settledReadiness$` and `readReadiness`.
  - **Time Series and CCDC** declare it, and the classifier-input requirement lists it.
  - **What the read describes.** Nothing of the recipe's own image is described: neither the Time Series count nor
    CCDC's catalogue. A requirement asking for its inputs' observed bands still has them acquired, and their failures
    reported, as any read's are.
  - **The point stands in for the AOI.** The recipe judged has its AOI replaced by the clicked point, without changing
    the one submitted. An AOI the chart does not read is no dependency of it.
  - **Undeclared types.** A typed recipe whose type declares nothing for the operation is refused
    (`UNDECLARED_OPERATION`).
  - **Change Alerts** asks with collection settings alone and is not judged.
  - **Limitation.** A `REFERENCE` dependency is still loaded with its own transitive dependencies, which then count.
- **Pixel segments.** A segment chart's request (`/ccdc/loadSegments`, `jobs/ee/ccdc/loadSegments.js`) is held to
  readiness before any segments image is built or anything is read at its pixel:
  - **A CCDC charted itself** is held to `PIXEL_SEGMENTS`, whose only requirement is the classifier inputs. It is
    judged and segmented as the same recipe: the submitted one with its AOI replaced by the clicked point, without
    changing what was submitted. A configured AOI that cannot be read, or refers back, holds nothing.
  - **A recipe selected as a source** (`RECIPE_REF`) is held to its own `IMAGE_OUTPUT` readiness, which covers its own
    requirements (a Masking's mask, say) and those of every recipe its image builds, over their own AOIs, before
    `withSegmentSource$` runs as before.
  - **Nothing it builds is described.** Read for readiness alone, a recipe it builds is judged without being
    described - no CCDC catalogue, no mask band evidence - while what a requirement reads is still acquired.
  - **An asset** is read as before, with no backend check of its segment layout.
  - **Errors** pass through unchanged: a finding is `cannot run: CODES`, a read failure is the read's own error.
- **Lower-level exporters.** The exporters the guarded exports hand a built image to (`toAsset.js`, `toDrive.js`,
  `toWorkspace.js`) know nothing of recipes and add no check; whatever calls them directly is held to nothing here.

**Outside the guarantee in this packet.** These build recipe images with no shared check, and still fail in Earth
Engine:
- Preview (`/preview`), guarded only by the client's `canPreview`.
- Bands, image JSON, histogram, distinct values, sample and geometry/bounds routes.
- The LandTrendr chart loader, an asset's segments through `/ccdc/loadSegments` (its layout unchecked), Change Alerts'
  observation requests through `/timeSeries/loadObservations`, and `nextReferenceDataPoints`.
- Sampling Design steps and stratum areas.

Preview and the LandTrendr chart route stay as they are for now. Server-side Preview validation waits on a
measured assessment of its cost.

#### Performance

- Readiness is computed inside the shared output read, after the description and with the same per-recipe and
  per-asset memoization, into a diagnostic list of its own. A source the description already resolved is not resolved
  again. It is not a second pass per consumer.
- The GUI keeps it in the session read already cached by records and identity (`readRecipeOutput`). Request gates,
  marks, layers and Retrieve read that one answer, and `readOutputRequirements` keeps its cache.
- Configuration requirements are pure over one record.
- Evidence a needed dependency requires is acquired by the runtime's existing operations and shared observations,
  never in `mapStateToProps`.
- Added acquisition:
  - A Masking observes its mask: an asset's typed bands, or a recipe's description.
  - A Remapping observes its inputs, and what their descriptions need.
  - A recipe's request gate now reads its output for every type, whatever it declares. It is the session read the
    layer reads already.
  - Recipes whose providers already read their inputs - the Classification family, Stack, Band Math, the change
    recipes, CCDC Slice - observe nothing more.

#### Located findings and other declarations

`sourceRequirements.js` drops a declaration's generic refused read (`outputState`) where another of the recipe's output
declarations locates the refusal at an item, so the gates name that item's section. It is dropped only where it would
add no protection: for each operation it actually holds - by the gate each operation asks (`reasonFor`), through
`operations` or `providerOperations` - a located read holds it too. A refusal does not hold a `providerOperations`
operation, which only a provider refusal does, so naming one is no reason to keep it. A generic read that is pending
or unavailable is never dropped.

#### Compatibility

- Classification's `NO_TRAINING_DATA` is a configuration requirement, not a description refusal. The Classification
  is described; a Stack over it is described and not ready, rather than `INVALID`.
- A Remapping or Masking over a recipe that is not ready, through any role its image needs, is withdrawn from the map,
  cannot be retrieved, and has its asset export refused. Before, all three failed in Earth Engine.
- Such wrappers wait for observations of inputs their description never read.
- A Masking without a mask is refused as incomplete.
- The asset export refuses a recipe that cannot run with `Recipe X cannot run: CODES`, or, where what it needs could
  not be read, `Recipe X cannot run: what it needs could not be read`.
- The Classification layer's `canClassify` saved-data branch is redundant with the read. The at-least-one-input layer
  guards are gone; the collecting safeguard stays.
- Saved recipes keep their model: readiness reads configuration and evidence, and stores nothing.
- A Regression whose data sets store no point, and read none from another recipe, cannot run, and its TRN section is
  marked. Before, its own layer was withheld only when it had no data set at all, and an empty one - an Earth Engine
  table read as empty, a sampled image with no samples - was drawn, retrieved and exported until Earth Engine failed
  to train.
- A recipe listing no input image cannot run, and its IMG section says "Please add at least one image." Before, its
  own layer was withheld by a GUI guard, while Retrieve, the asset export and every recipe over it ran until Earth
  Engine built nothing.
- Remapping now declares a requirement its output read judges, as the Classification family does, so while what its
  image builds is being read its Retrieve waits rather than offering its class, and its toolbar watches its output.
- A Remapping whose constraint reads a removed input or a band its input does not include has its asset export refused,
  and so has every recipe whose image builds it, which is withdrawn and cannot be retrieved. Before, only the Remapping's
  own layer and Retrieve were held, by a GUI local requirement: the export and every recipe over it ran, until Earth
  Engine failed on a removed input - or, for a band an asset input stores but does not include, built the image. Such a
  Remapping that exported before is now refused. Where its input list is empty too, Retrieve names Input imagery before
  Mapping.

#### First packet (implemented)

It covers the shared mechanism and the Classification → Stack, Remapping and Masking cases: evidence waiting, refusal
and recovery. It does not migrate every outstanding rule.

1. **Shared.**
   - `configurationRequirements` and `executionNeeds` per operation in `defineRecipeType`, for `IMAGE_OUTPUT`, with
     roles classified for every registered type;
   - readiness in `readImageOutput` and in the settled read, with its needs joining the description's;
   - `UNCLASSIFIED_ROLE` at evaluated edges;
   - Classification's `NO_TRAINING_DATA` as a requirement scoped to trained classifiers;
   - Masking's `MASK_IMAGE` needing `IMAGE_OUTPUT`, and its missing mask refused.
2. **GUI.**
   - `readRecipeOutput` carries readiness and names an acquisition while it needs evidence;
   - `canPreview` and `retrieveDecision` require it;
   - output declarations read its findings, with a message for Masking's missing mask;
   - the `outputState` filter covers `operations` and `providerOperations`.
3. **Backend.** `imageOutput.js` requires readiness.
4. **Tests.**
   - extended where they are today: `inputBandSets.test.js`, `outputRequirements.test.js`, `trainingDataChain.test.jsx`
     (Remapping and Masking beside Stack), `imageAssetExport.test.js`;
   - cases:
     - a Remapping waiting for its Classification's input observation;
     - a confirmed finding kept beside pending and failed evidence;
     - repair restoring the chain;
     - a `RECIPE` training set staying unknown;
     - a refused candidate leaving the applied recipe available;
     - an unclassified role.

#### Reused training data (first slice implemented 2026-10-21)

**What users can select.** A Classification's `RECIPE` training data set selects another Classification
(`recipeSection.jsx` filters to `CLASSIFICATION`), and a Regression's selects another Regression. Sampled data sets
(`SAMPLE_CLASSIFICATION`, `SAMPLE_IMAGE`) store their points when configured, so they are no runtime reference.

**What execution does.** A Classification consumer runs the provider's `getSamples$()`
(`lib/js/ee/src/classification/classification.js`); a Regression consumer runs its provider's `getTrainingData$()`
(`regression/regression.js`):
- It builds the provider's input imagery, each image as its `IMAGE_OUTPUT`, with the provider's auxiliary covariates.
  It does not apply the provider's normalisation: a normalising Classification consumer scales the reused samples by
  its own statistics (see "Reused Classification samples' normalisation").
- It samples the provider's stored points over that imagery.
- It puts the samples of the provider's own `RECIPE` sets, recursively and in configured order, before the provider's
  own.
- The provider's classifier is never trained, and its image is never classified.

**Implemented.**
- **Operation.** `TRAINING_DATA` (`output/readiness.js`), with an execution need of the same name: the edge's source
  is judged as its `TRAINING_DATA`, not as its image.
- **Declarations.** Classification and Regression declare:
  - `IMAGE_OUTPUT: {INPUT_IMAGE: IMAGE_OUTPUT, TRAINING_DATA_SOURCE: TRAINING_DATA}`;
  - `TRAINING_DATA: {INPUT_IMAGE: IMAGE_OUTPUT, TRAINING_DATA_SOURCE: TRAINING_DATA}`;
  - `inputImageryRequirement` for both operations.
- **Traversal** (`resolveImageOutput.js`).
  - A source is visited once per operation, keyed by recipe and operation, so a recipe needed both as an image and
    for its training data is judged both ways.
  - A source whose type does not declare a non-image operation it is needed for is refused (`UNDECLARED_OPERATION`).
  - Under `describesBuilt`, the provider is never described, because its image is not built. Its input images are,
    through their `IMAGE_OUTPUT` need.
- **Refused at the recipe each finding concerns:**
  - a provider whose input image cannot run;
  - a provider without input imagery, whose samples execution would silently drop;
  - the same for nested providers.
- **Unchanged:**
  - a mixed set with an empty provider stays ready, since `NO_TRAINING_DATA` stays `IMAGE_OUTPUT` only;
  - cycles stay `INVALID`;
  - a provider not held is pending, and the runtime reads it with the closure. The GUI's output read therefore
    withholds the consumer's bands until it has.
- **Provider band sets (implemented 2026-10-21).** `inputBandSetRequirements([TRAINING_DATA])` (`bandSets.js`) are
  declared by Classification and Regression. They apply the same refusals their image's description makes
  (`inputBandSetRefusals`) to producing training data, with one requirement per code so the codes and paths are kept:
  `MISSING_INPUT_BAND`, `UNDERIVABLE_INPUT_INDEX` and `INSUFFICIENT_INPUT_BANDS` at
  `model.inputImagery.images[i].bandSetSpecs`.
  - They read `describedInputs(INPUT_IMAGE)`, so the provider's input images are described and observed, but never
    the provider's own image.
  - An input not yet observed is pending, and one that could not be observed is unavailable; neither is a confirmed
    missing band.
  - `IMAGE_OUTPUT` keeps its description refusal alone, so it has no duplicate diagnostics.
  - Export readiness (`requireExecutable$`) now observes the provider's input bands too.
- **GUI.** The training-data section declares the existing `referenceFeedback` for `TRAINING_DATA_SOURCE`, and both
  training-data panels show each item's problem (`withItemProblems`). Classification's TRN button stays unmarked, as
  its other training-data declarations are; Regression's is marked.
- **Regressions:**
  - `lib/js/shared/test/recipe/output/trainingDataReadiness.test.js`, for both types;
  - `classification/reusedTrainingDataFeedback.test.jsx`, mounted: missing imagery, and a missing selected band,
    marked and cleared on repair;
  - existing tests updated where they pinned the old behaviour: a provider without imagery, a provider not loaded,
    and the readiness-needs validation message.

**Configuration-known absence of training data (implemented 2026-10-21).**
- **Context extension.** `recordsOf(role, of = recipe)` (`resolveImageOutput.js`) can be asked of a record the
  requirement already holds, over the same resolved graph. It is null while any selected record is not held.
  `declares(record, operation)` says whether that record's type declares an operation (`declaresOperation`,
  `output/readiness.js`), the same judgement `UNDECLARED_OPERATION` is made by.
- **Rule** (`trainingData.js`, beside `NO_TRAINING_DATA`). `noTrainingData(model, {recordsOf})` establishes absence
  only where:
  - no data set stores a point;
  - each `RECIPE` set resolves to a held record;
  - that record's type declares `TRAINING_DATA`, asked through the context's `declares(record, operation)`, which uses
    the traversal's own `readinessFor`;
  - and it establishes the same, recursively.
  - **Memoised per call.** A diamond's shared provider is judged once.
  - **Nothing else establishes absence.** A provider reached again while it is still being judged establishes
    nothing; a cycle stays the `dependencyValidity` problem. Nor do a missing or unreadable record (pending or
    unavailable, as before), a reference resolving to no record (malformed), or a provider whose type produces no
    training data, which keeps only its `UNDECLARED_OPERATION`, whatever its model holds.
  - **Without the read's records** (no context, as for the GUI's collection guard `hasTrainingData`), a reused recipe
    is never taken for none.
  - **Classification.** `missingTrainingData(model, context)` keeps the decision-tree exemption first.
  - **Role.** `TRAINING_DATA_SOURCE` now lives in `trainingData.js`, and both types re-export it.
- **Where it is found.** Absence is a finding of the consumer's `IMAGE_OUTPUT` only, at its training data. An empty
  provider's `TRAINING_DATA` stays ready, so no training-data item is marked.
- **GUI.** The existing `NO_TRAINING_DATA` declaration says it: Regression's TRN is marked and Classification's stays
  unmarked, while Retrieve, layers and recipes over it hold.
- **Backend.** `requireExecutable$` refuses an export with `NO_TRAINING_DATA` before building anything.
- **Regressions:**
  - `lib/js/shared/test/recipe/trainingDataAbsence.test.js`, both types: direct and nested empty chains, mixed
    branches, missing and malformed references, a diamond, a cycle, repair and reversal, an empty provider staying
    ready for `TRAINING_DATA`, the call without context, and the decision tree;
  - the unsupported-provider case in `trainingDataReadiness.test.js`, kept without `NO_TRAINING_DATA`;
  - `reusedTrainingDataFeedback.test.jsx`, mounted: Retrieve held, toolbar policies, no item marked, repair;
  - `imageAssetExport.test.js`: an export refused and then repaired upstream.
- **Boundary.** This establishes that configured points exist, not that they survive masking, cover the imagery or
  suffice for training.

**Sampled-feature compatibility (implemented 2026-10-21).** A consumer's reused training data must carry every
feature the consumer trains on.

- **Execution contract** (`classification.js`, `regression.js`):
  - **Assembly.** The consumer's `getImage$` trains on its own `getTrainingData$`. For a Classification, that is each
    reused recipe's raw samples (`getSamples$()`), in data-set order, scaled by the consumer's statistics where it
    normalises, then its own samples. A Regression takes each reused Regression's `getTrainingData$()` instead. The
    samples are flattened into one collection, with `band_order` set to the consumer's band names.
  - **Provider samples.** Each recipe samples its stored points with `sampleRegions`:
    - over its own image, after its own covariates, unscaled;
    - at its own `scale || 1`.

    Each sample carries every band of that image, plus `class` or `value`.
  - **Nesting.** Classification providers return raw samples without `band_order` or statistics. The final consumer
    sets `band_order` and, when normalising, applies its statistics once. Regression retains its `getTrainingData$()`
    path.
  - **Training.** `train` passes no `inputProperties`, so `band_order` decides the features (`temporalSegmentation.js`
    relies on the same default).
- **Rule** (`trainingFeaturesRequirement`, `trainingData.js`). `MISSING_TRAINING_FEATURES` is a finding of the
  consumer's `IMAGE_OUTPUT`, guarded in Classification by `requiresTraining`.
  - **Scope.** Each recipe in a `RECIPE` data set's reuse closure that stores a point must sample every consumer
    feature. A union across recipes proves nothing.
  - **Exempt.** A recipe storing none contributes no samples and requires nothing, though the recipes it reuses still
    count. Extra provider features are ignored.
  - **Where it is found.** At the consumer's data set (`model.trainingData.dataSets[i]`), with `provider` (the
    recipe whose samples lack them) and `features`. A recipe that two data sets reach is found at each.
  - **Walk.** It walks the closure as `noTrainingData` does (`recordsOf`, `declares`, memoised, cycle-safe).
  - **Consumer input.** The consumer's own input is asked for only where some recipe in the closure stores points.
- **Sampled names** (`sampledFeatures`, `bandSets.js`), for one input image with described bands `B`:
  - `IMAGE_BANDS` and `INDEXES`: what `availableSelections` provides;
  - `PAIR_WISE_EXPRESSION`: `${b1}_${b2}_${operation.toLowerCase()}` for each pair of included bands, ordered by `B`
    (`combinePairwise`, `extensions/image.js`), so the same selection over differently ordered inputs gives other
    names;
  - auxiliary covariates' bands (`auxiliaryBands`).

  Each name appears once, as execution merges band sets and covariates with overwrite.
- **Auxiliary covariates.** Their names have one owner, `lib/js/shared/src/recipe/auxiliaryImagery.js`.
  `lib/js/ee/src/auxiliaryImagery.js` builds them and selects those names; Classification, Regression and
  Unsupervised Classification use it instead of three copies.
- **Context.** `describedInputs(role, of)` (`resolveImageOutput.js`) can be asked of a record `recordsOf` handed out.
  That record is resolved under the chain it was first reached through, so a diagnosis upstream keeps its full
  `recipePath`.
- **Establishes nothing:**
  - a record not held, or whose type produces no training data;
  - an input not yet observed (pending) or not observable (unavailable);
  - a recipe refused for its own band sets, which is said there;
  - an input image without band sets;
  - band combinations of one set that share a name (`a_b` with `c`, `a` with `b_c`), which execution suffixes as it
    adds them. A name given by two band sets is overwritten, so it counts as one feature;
  - a consumer or provider over several input images.
- **GUI.** The training-data declarations (`trainingDataRequirements.js`) mark the data set, naming the recipe and the
  missing features (`process.classification.panel.trainingData.missingFeatures`). Classification's TRN button stays
  unmarked and Regression's is marked. Retrieve, layers and recipes over the consumer hold.
  - **Repair:** drop the features from the consumer, add them to the provider, or remove the data set. Readiness is
    recomputed from current records.
- **Backend.** `requireExecutable$` refuses an export with `MISSING_TRAINING_FEATURES` before building anything.
- **Regressions:**
  - `lib/js/shared/test/recipe/trainingFeatures.test.js`, both types:
    - compatible and incompatible providers, pair order and an auxiliary covariate;
    - per-recipe rather than union, nested, empty and shared providers;
    - repair, pending and unavailable evidence, upstream attribution, several inputs, and the decision tree;
  - `modules/gee/test/ee/classification/sampledFeatures.test.js`: the real executions over a band-tracking stand-in
    agree with `sampledFeatures`;
  - `reusedTrainingDataFeedback.test.jsx`, mounted: the data set is marked, Retrieve is held, and both clear on repair;
  - `imageAssetExport.test.js`: refused, then exported after repair.
- **Deferred, establishing nothing for now:**
  - several input images, and Earth Engine's suffix rule for names they repeat;
  - sampling-scale and raw value-encoding mismatches, which can give matching names over different values;
  - legend and value semantics;
  - points masked in only some bands;
  - Earth Engine's behaviour when training on a sample missing a `band_order` property: an error or a silently dropped
    sample. Either way the refusal stands, but the manual check below records which.

  Normalisation of prediction imagery and reused Classification samples is implemented, with the live numerical
  verification recorded below; it is no longer part of this deferred list.
- **Manual check before pushing:**
  1. A Classification `Provider` over an image, with `IMAGE_BANDS [red, nir]` and a few collected points. A
     Classification `Consumer` over imagery with `IMAGE_BANDS [red, nir]` and its own points, plus a `RECIPE` data set
     reusing `Provider`. The consumer can be retrieved.
  2. Remove `nir` from `Provider`'s band set. The consumer's `Provider` data set names `Provider` and `nir`, and
     Retrieve is held.
  3. Restore `nir`. The mark clears and Retrieve is available again.
  4. Repeat for Regression.

Sample counts after masking and sampling are known only to Earth Engine.

**Classification consumers' training readiness (audited 2026-10-21; PyEO and Phenology implemented).** Time Series
and CCDC reach their Classification through `CLASSIFICATION_SOURCE: REFERENCE`. That checks only that it resolves, so
none of the Classification's training checks apply to them. PyEO Alerts needs its Classification's `IMAGE_OUTPUT`.
Phenology needs its `CLASSIFIER` where its saved band is classified, and keeps `REFERENCE` for a native band.

- **Confirmed behaviour.** When the shared collection (`timeSeries/collection.js`) uses a Classification, it reads the
  record, calls `getTrainingData$()` with no bands and classifies each scene with `classifyImage`. `band_order` is
  therefore the Classification's own features. It uses one only for a requested `regression` or `probability_*` band,
  never for a decision tree (`supportRegression`, `supportProbability`), and never builds the Classification's image.

  | Consumer and operation | Uses the Classification when | Trains | Builds its image | Checked today |
  |---|---|---|---|---|
  | Time Series `IMAGE_OUTPUT` (count) | never (`bands: [0]`) | no | no | `UNSUPPLIED_CLASSIFIER_INPUTS` all the same |
  | Time Series pixel chart, Retrieve | the chart band or Retrieve indicator is classified | yes | no | classifier inputs; the band only at run time |
  | Phenology `IMAGE_OUTPUT` | `sources.band` is classified | yes | no | the Classification's `CLASSIFIER` readiness for a classified band, classifier inputs, `UNSUPPORTED_CLASSIFIED_OUTPUT` |
  | CCDC `IMAGE_OUTPUT`, `PIXEL_SEGMENTS` | classified `breakpointBands`, or a classified export or map band | yes | no | classifier inputs, breakpoint outputs; export bands only at run time |
  | CCDC `PIXEL_OBSERVATIONS` | the chart band is classified | yes | no | classifier inputs |
  | CCDC Slice, Change Alerts over a CCDC recipe | that CCDC's classified breakpoint bands, or a Slice base band | yes | no | through the CCDC, as above |
  | PyEO Alerts `IMAGE_OUTPUT` | always | yes, except a decision tree | yes (`getImage$`, its baseline) | the Classification's `IMAGE_OUTPUT` readiness, classifier inputs, gate index |
  | LandTrendr | never (no selector, an optical index) | no | no | nothing |

- **Gap.** A PyEO Alerts was `READY` over a trained Classification that had no points, that reused a recipe without
  input imagery, or that reused one sampling fewer features, though its run trains on that training data.
- **PyEO's need is `IMAGE_OUTPUT` (implemented 2026-10-21).** `CLASSIFICATION_SOURCE` is an `IMAGE_OUTPUT` need of
  PyEO's `IMAGE_OUTPUT` (`type/pyeoAlerts.js`). Its execution builds the Classification's image as its baseline, and
  classifies the scenes with the classifier that image trains.
  - **Reuse.** The Classification's own `IMAGE_OUTPUT` readiness supplies every check: input imagery, band sets through
    its description, `NO_TRAINING_DATA` with the decision-tree exemption, providers' `TRAINING_DATA` and
    `MISSING_TRAINING_FEATURES`. It adds no operation and no requirement.
  - **Attribution.** Findings sit at the recipe they concern: `NO_TRAINING_DATA` and `MISSING_TRAINING_FEATURES` at
    `[pyeo, classification]`, a provider's `MISSING_ROLE` at `[pyeo, classification, provider]`.
  - **Index gate.** Turning the gate off still avoids every index-specific check. The Classification's baseline imagery
    is validated either way, so its input is observed with the gate off too, and a band it lacks is refused there.
  - **Pending and unavailable.** The Classification's input, and its providers' inputs, are acquired as the
    Classification's own read acquires them. Pending holds PyEO and finds nothing; a failed observation makes it
    unavailable and finds nothing.
  - **Acquisition cost.** Records already in the closure need no further record discovery. Describing an input can
    still need evidence:
    - in the tested cases, an asset input is one band observation each, for the Classification and for each provider;
    - a Sentinel-2 mosaic input is described from its configuration and observes nothing;
    - another recipe input costs whatever describing that recipe costs, including its own evidence or catalogue reads,
      which these tests do not establish.
  - **GUI.** PyEO's Sources declares `referenceFeedback` for `CLASSIFICATION_SOURCE`, bound to the classification field
    (`blocksApply: false`). The field names the Classification, whose own sections say why, while Retrieve and the
    operations over PyEO hold.
  - **Backend.** `requireExecutable$` refuses the export with the Classification's code before building anything.
  - **Unchanged.** `UNSUPPLIED_CLASSIFIER_INPUTS` (the native-band policy), the gate check and the operation-specific
    output checks.
  - **Regressions:**
    - `lib/js/shared/test/recipe/pyeoTrainingReadiness.test.js`:
      - missing points, a provider without imagery and a provider lacking features;
      - the control, the decision-tree exemption and repair;
      - pending and failed observations, and a mosaic input observing nothing;
    - `readiness.test.js`: the gate cases now also observe and validate the baseline;
    - `pyeoAlerts/classificationFeedback.test.jsx`, mounted: explained beside the field, Retrieve held, cleared after
      repair;
    - `imageAssetExport.test.js`: refused, then exported once points are added;
    - `pyeoAlerts/sourcesRequirements.test.js`: its Classification fixtures are now trainable;
    - `modelDerivedOutput.test.js`: PyEO's output read waits for a Classification not yet loaded, naming it.
- **Remaining work and decisions.** The collection consumers below are part of the
  [current delivery plan](#current-delivery-plan-2026-10-21); native-band policy and multi-input expansion remain
  outside that plan.
  - **The collection consumers** train only for requested classified bands. Readiness has no requested-band input,
    and a static need would refuse configurations that never train.
    - Phenology's `band` now selects a conditional `CLASSIFIER` need (see "Phenology's configured classified band").
      CCDC's `breakpointBands` are configuration too and can follow the same design.
    - Time Series chart and Retrieve bands, and CCDC export, map and chart bands, are request parameters.
  - **Native-band policy.** It refuses a Time Series count image, which never reads its Classification, for
    unsupplied classifier inputs.
  - **Run-time-only band checks.** Requested classified bands are checked only at run time for the Time Series chart
    and Retrieve, and for CCDC export and chart bands.

- **Completed behaviour and retained policies.**
  - **Normalisation (implemented).** Prediction imagery and reused samples now use the consumer's transformation;
    see "Classifier normalisation on other imagery" and "Reused Classification samples' normalisation" below.
  - **Classified outputs of an unselected Classification (implemented 2026-10-21).** `selectedClassificationOfState`
    now lets the applied `model.sources.classification` decide whether there is a Classification. With none, it offers
    no classifier or legend capabilities, whatever `ui.classification` copy remains. With one, the precedence is
    unchanged: session record, resolved record, then the copy while unresolved. The Time Series and CCDC charts and
    Time Series Retrieve therefore offer no classified output after deselection. Stored copies are not deleted, and
    nothing is loaded for this.
    - **Regressions.** `unselectedClassification.test.jsx`, mounted over the real Sources panel, chart and Retrieve:
      - clearing the Classification through Sources and Apply stops the Time Series and CCDC charts (CCDC's breakpoint
        bands native) offering or requesting a classified band, and they chart a native one;
      - Retrieve stops offering classified outputs, drops the selection under its existing policy, and submits nothing
        until a native band is chosen;
      - controls: reselection offers the outputs again, and Cancel leaves the applied options;
      - `retrieveClassifiedOutputs.test.jsx` covers a selected Classification still pending.
  - **Retaining a broken choice is a separate matter.** Phenology deliberately keeps a classified band already chosen
    but no longer provided, so that `UNSUPPORTED_CLASSIFIED_OUTPUT` can say what is wrong beside the field and the user
    can repair it. That is a retained choice, explained and validated, not a new offer, and it is unchanged.

- **Outside this rollout.**
  - **Several input images** are refused only at run time (`classifyImage`, PyEO); the PyEO GUI prevents them.
  - **LandTrendr** declares `CLASSIFICATION_SOURCE` without a selector, and `landTrendr.js`'s comment about always
    resolving it is stale.
- **Manual check before pushing.** Add to the accumulated batch:
  1. A PyEO Alerts over a Classification that has input imagery and no training points. Sources' classification
     field names the Classification, and Retrieve is held.
  2. Add training points to the Classification. The explanation clears and Retrieve is available.
  3. Optionally turn the index gate off and on. Neither changes the hold while the Classification has no points.

**Classifier normalisation on other imagery (implemented 2026-10-21).** A Classification with an SVM or
minimum-distance classifier scales its features by its training imagery's per-band range, unless `normalize: 'NO'` is
set; `YES` is the GUI default. Prediction now scales the imagery the Classification is applied to by that same range.

- **Gap (confirmed by a numerical probe over the real execution).** The exported `classifyImage`, used by the Time
  Series collection (SVM `probability_*`) and PyEO's monitoring scenes (`class`), classified raw features with a
  classifier trained on scaled ones. PyEO's baseline, the Classification's own image, was scaled, so its baseline and
  monitoring scenes were classified on different scales. Normalising each scene by its own range would not be
  equivalent: the transformation is the training imagery's range.
- **One preparation owner** (`classification.js`).
  - `prepared(features)` takes the Classification's prepared imagery: `addCovariates` per input, so indexes, band
    combinations and auxiliary covariates come first, then the inputs combined. It computes the statistics once, with
    one `reduceRegion(minMax)` over that imagery at `scale || 30` (`bestEffort`, at most 1e6 pixels). It scales the
    imagery once, clipped to its footprint, its properties kept.
  - Training samples that image, and `getImage$` classifies it. `getImage$` now prepares once; it used to prepare
    again through `getTrainingData$`.
  - **Carrier.** The statistics are set as `feature_statistics` on the consumer's final training collection, beside
    `band_order`. A reused recipe's statistics, set on its own collection, do not survive flattening.
  - **Prediction.** The exported `classifyImage` scales only the features `addCovariates` derives from the given
    image, with the statistics of the training data it is given. Other bands of that image stay raw, and its callers
    are unchanged.
- **Formula, unchanged:**
  - `(x - min) / (max - min)`, or `x / max` where the range is one value;
  - values beyond the training range stay beyond it;
  - a band constant at zero is zero, since `ee.Image.divide` returns 0 for division by zero. That is documented Earth
    Engine behaviour, not verified live.
- **Preserved:**
  - native-only requests;
  - output modes;
  - masks;
  - scene properties;
  - output scaling;
  - the multi-input own path, scaled once;
  - `normalize: 'NO'` and the other classifiers, untouched.

  Readiness and settings are unchanged. Reused samples are scaled by the consumer, as described under "Reused
  Classification samples' normalisation".
- **Cost.** Classifying more scenes constructs no further reduction expression. The tests count constructed
  expressions, not Earth Engine evaluations: whether Earth Engine evaluates the shared statistics once per computation
  or once per tile is not established.
- **Expected change to existing outputs.** Settings stay as saved, but outputs change wherever such a Classification
  classifies other imagery: Time Series probabilities, CCDC's classified bands and PyEO's monitoring classification.
  Earlier exports differ from re-exports. The Classification's own image is unchanged.
- **Regressions.** `modules/gee/test/ee/classification/featureNormalisation.test.js`, over a numeric stand-in:
  - training and prediction agreeing for SVM and minimum distance;
  - values beyond the range left unclamped;
  - extra scene bands left raw;
  - derived features prepared before scaling;
  - constant and zero-constant bands;
  - the `NO` and Random Forest controls;
  - consumer-owned statistics with a reused provider;
  - one constructed reduction however many scenes are classified;
  - the multi-input own path scaled once.
- **Unresolved:**
  - how `bestEffort` coarsens the statistics' scale on real imagery;
  - how often Earth Engine evaluates them.
- **Manual check before pushing (live, controlled).** Steps 1 and 2, the numerical check, were run on 2026-10-21 and
  passed (see "Verification status"). Step 3's smoke tests are still pending.
  1. Run `modules/gee/verify/classifierNormalisation.mjs`:
     `docker exec -w /usr/local/src/sepal/modules/gee gee node verify/classifierNormalisation.mjs`.
     It applies the exported `classifyImage` to the Classification's own input scene with its own training data, for
     normalising SVM and minimum distance beside a non-normalising SVM and a Random Forest.
  2. Accept only a run whose every line is `PASS` and which exits 0:
     - training features: each training sample's class and features, compared as a whole row, equal the scene's raw
       features at its point, scaled by the carried `feature_statistics` with the transformation the script computes
       itself (within 1e-5); for the controls, raw with no statistics. This inspects what is trained on, not the
       features prediction is given;
     - predictions: those features are judged only through what prediction gives. Class, and the SVM's probability,
       must be identical pixel by pixel to the Classification's own image, with pixels valid in both;
     - footprint: the same bounded area;
     - mask: nothing classified where the scene is masked.

     A comparison without samples or jointly valid pixels fails. Before this change, the normalising cases' prediction
     check is expected to fail.
  3. As smoke tests (pending), open an ordinary Time Series `probability_*` chart and run a PyEO Alerts over an SVM
     Classification. Both should run and look plausible.

**Reused Classification samples' normalisation (implemented 2026-10-21).** A Classification trains on the samples of
the recipes it reuses, and those are now transformed by the consumer alone.

- **Gap (confirmed numerically over the real execution).** Reused samples arrived already normalised by each
  provider's own classifier: scaled by its own range for a normalising SVM or minimum-distance provider, raw
  otherwise. The consumer trained on them beside its own and never rescaled them. Every reuse case mixed feature
  spaces, including Random Forest reusing a normalising provider and nested chains. Controls without reuse matched.
- **Raw samples** (`getSamples$()`, `classification.js`). A Classification's samples for another recipe to train on
  are its reused recipes' raw samples, in configured order, followed by its own points sampled over its unscaled
  features (`addCovariates`) at its own points and `scale`. They carry no `band_order` and no statistics, and
  construct no reduction. Reuse keeps its meaning: each provider samples its own imagery, never the consumer's.
- **The consumer's transformation, applied once.**
  - `reusedSamples$` takes each reused recipe's `getSamples$()`.
  - Where the consumer normalises, `scaledSamples` maps every `band_order` feature of every reused sample with the
    consumer's statistics: `(x - min) / (max - min)`, or, where the range is one value, `x / max`, and 0 for a band
    constant at zero.
  - A feature a sample lacks, or holds as null, is left as it is. It is never made a number, so
    `MISSING_TRAINING_FEATURES` validation and Earth Engine's own refusal still apply.
  - Its own samples are sampled over its already scaled image, which is pointwise the same transformation.
  - Nested samples are raw all the way down, so they are transformed once, by the final consumer.
- **Order is unchanged at every level:** reused data sets in configured order, then the recipe's own samples.
- **Kept as they were:**
  - the consumer's `band_order` and `feature_statistics`;
  - labels and masks;
  - extra provider features, which stay raw and unused;
  - the public `getTrainingData$` that the Classification's own image, the Time Series collection and PyEO call;
  - the `TRAINING_DATA` operation, which describes what producing samples needs (comments updated), with no new
    operation;
  - Regression, sampling scale, readiness and saved settings.
- **Costs.** Acquisition is unchanged. No provider constructs a statistics reduction to serve samples. Reused samples
  gain a per-sample, per-feature map where the consumer normalises. The tests count constructed expressions, not
  evaluations.
- **Expected change to outputs.**
  - **Changes:** a Classification that reuses training data and either normalises itself or reuses a recipe that did,
    and what Time Series, CCDC and PyEO compute with it. A provider that itself reuses data may also change, since the
    correction applies to its own training too.
  - **Unchanged:** a Classification without reuse, and a chain in which none normalises.
- **Regressions.**
  - Gee tests over the numeric stand-in, now shared as `numericEarthEngine.js`, compare whole training rows in order
    (`reusedSamples.test.js`; `featureNormalisation.test.js` unchanged in substance):
    - consumer and provider transformations, including Random Forest beside normalising recipes;
    - nested chains transformed once;
    - order at every level;
    - an empty contributor;
    - no provider reduction;
    - an extra provider feature;
    - zero-constant statistics never manufacturing a missing or null property;
    - a constant band;
    - a provider's own no-reuse output unchanged;
    - controls.
  - `classifierNormalisation.mjs` (live) adds a provider over another date of the same path and row. Its two
    consumers, a normalising SVM and a Random Forest, must train on the provider's raw features scaled by the
    consumer's statistics (raw for Random Forest), then their own rows: both blocks non-empty, compared as whole rows
    in order. Prediction, footprint and mask are checked for them too.
- **Unresolved:**
  - small floating-point differences between scaling a sampled number and sampling a scaled image, absorbed by the
    live tolerance;
  - whether Earth Engine evaluates the shared statistics once;
  - whether Earth Engine keeps a flattened collection's order, which the live order check relies on;
  - what Earth Engine's training does with a reused sample lacking a feature, or holding null. Execution never fills it
    in, and `train` documents that every feature must hold every input property;
  - the explicit 0 for a band constant at zero, which the stand-in cannot tell apart, since it divides by zero to 0
    as `ee.Image` does.

**Phenology's configured classified band (implemented 2026-10-21).** When Phenology's saved
`sources.band` is a classified output (`regression` or `probability_*`), execution trains the selected
Classification's classifier: `getTrainingData$` builds its imagery and samples its training data, and `classifyImage`
is applied to every scene. It never builds the Classification's image. Readiness used to keep the Classification a
`REFERENCE`, so none of its training requirements applied. It is now a `CLASSIFIER` need for a classified band.

- **Gap (confirmed by a temporary readiness probe before the change).**
  - With `regression` or `probability_1` as the band, Phenology is `READY` over a Classification without points, one
    reusing a recipe without input imagery, and one reusing a recipe sampling fewer features. It acquires no evidence
    for any of them.
  - With native `ndvi`, the same Classifications are `READY`. These controls must stay so, with no training requirement
    and no new acquisition.
  - The existing checks still run either way: classifier inputs (`UNSUPPLIED_CLASSIFIER_INPUTS`) and output capability
    (`UNSUPPORTED_CLASSIFIED_OUTPUT`).
- **Alternatives considered.**
  - **`IMAGE_OUTPUT` need.** Rejected: it would describe, and refuse by, an image Phenology never builds.
  - **`TRAINING_DATA` need.** Insufficient: it deliberately lets an empty provider through, and `NO_TRAINING_DATA` and
    `MISSING_TRAINING_FEATURES` belong to `IMAGE_OUTPUT` alone.
  - **A Phenology configuration requirement walking the Classification itself.** Rejected: it would repeat the
    traversal, nested providers, acquisition and attribution that readiness already owns.
- **Implemented: a classifier-training operation and a conditional need.**
  - **Scope.** Phenology only. Conditional needs are flat, with both branches validated as known
    needs at registration; they are not a general policy language. `CLASSIFIER` does not describe the Classification's
    output, while the existing requirements explicitly acquire the input evidence they need. Preserve PyEO's
    explanation-only editor policy for upstream problems (`blocksApply: false`) in the corresponding Phenology
    reference feedback, alongside the existing local output-capability validation.
  - **Operation.** `CLASSIFIER` (`output/readiness.js`): training a Classification's classifier to apply to other
    imagery. Its training data is produced and trained on, its image is not built.
    - Classification declares `CLASSIFIER: {INPUT_IMAGE: IMAGE_OUTPUT, TRAINING_DATA_SOURCE: TRAINING_DATA}`, the same
      needs as `TRAINING_DATA`, shared as one constant.
    - It extends the `operations` of the requirements that already own these rules: `inputImageryRequirement`,
      `inputBandSetRequirements`, `trainingDataRequirement` (with `requiresTraining`'s exemption) and
      `trainingFeaturesRequirement`. `inputImageryRequirement`'s operations are extended in Classification's own
      declaration, so the other types sharing it are unchanged. `trainingDataRequirement` and
      `trainingFeaturesRequirement` take an `operations` argument defaulting to `[IMAGE_OUTPUT]`, so Regression and every
      other caller keep their behaviour.
    - Regression declares nothing for it. A source that does not declare it gets `UNDECLARED_OPERATION`.
  - **Conditional need.** `conditionalNeed({when, then, otherwise})` (`output/readiness.js`) is a role's need that
    follows the saved model. Phenology declares
    `[CLASSIFICATION_SOURCE]: conditionalNeed({when: model => isClassifiedOutput(model?.sources?.band), then: CLASSIFIER, otherwise: REFERENCE})`.
    - **Validation.** `validateReadinessDeclarations` accepts a need or a conditional need, but only one whose `then`
      and `otherwise` are needs and whose `when` is a function. Malformed declarations still fail at registration.
    - **Resolution.** `executionNeed(definition, operation, role, model)` resolves it. Its one caller, the traversal in
      `resolveImageOutput.js`, passes the recipe's model.
    - **Traversal.** It visits any need that is an operation (`need !== REFERENCE`), not only `IMAGE_OUTPUT` and
      `TRAINING_DATA`. `declaresOperation` and the static needs of every other type are unchanged.
  - **One owner per decision:**
    - the classified-band predicate (`isClassifiedOutput`, already shared with execution and
      `classifiedOutputRequirement`);
    - each training rule (its existing requirement);
    - the closure walk, evidence and attribution (the traversal);
    - need resolution (`executionNeed`).

    Nothing new validates, resolves, caches or subscribes. The one repetition is Classification's `CLASSIFIER` needs
    map, identical to `TRAINING_DATA`'s and declared from the same constant.
- **Behaviour.**
  - **Classified band:**
    - findings sit at the recipe they concern: `NO_TRAINING_DATA` and `MISSING_TRAINING_FEATURES` at
      `[phenology, classification]`, a provider's `MISSING_ROLE` at `[phenology, classification, provider]`;
    - a Classification not held is a record need;
    - unobserved inputs are pending, and a failed observation is unavailable;
    - a supplied decision tree is already refused as `UNSUPPORTED_CLASSIFIED_OUTPUT`, and `requiresTraining` exempts it
      from training rules.
  - **Native band:** today's `REFERENCE` behaviour exactly.
  - **Acquisition,** only for a classified band: the Classification's input observations and its providers'. A recipe
    input costs what describing it costs.
  - **GUI.** `classificationReferenceFeedback(sources)` (`collectionClassifierRequirements.js`) declares
    `referenceFeedback` for `CLASSIFICATION_SOURCE`, bound to the Sources `classification` field with
    `blocksApply: false`. Phenology and PyEO both use it, replacing PyEO's inline copy. Retrieve, layers and recipes
    over the recipe hold.
  - **Backend.** `requireExecutable$` refuses the export with the Classification's code.
  - **Preserved:**
    - normalisation;
    - Phenology's retained unsupported choice, and its `UNSUPPORTED_CLASSIFIED_OUTPUT` explanation;
    - the native-band classifier-input policy.
- **CCDC later.** Its `IMAGE_OUTPUT` and `PIXEL_SEGMENTS` declare the same conditional need, with
  `when: model => (model?.sources?.breakpointBands || []).some(isClassifiedOutput)`, because every segmentation fits
  the breakpoint bands. Request-dependent outputs are deferred, and no request contract is added: the Time Series
  chart and Retrieve, and CCDC's chart, export and map bands.
- **Regressions.**
  - **Shared:**
    - `recipeType.test.js`: `conditionalNeed` validation. A predicate that is not a function, a branch that is no need,
      a missing branch or a nested condition are refused at registration, while a valid one is retained.
    - `phenologyClassifier.test.js`, Phenology with a classified band over:
      - no points, a provider without imagery, a provider lacking features, an input lacking a selected band (refused
        once, without describing the Classification's image), and a working Classification;
      - a type that trains no classifier (`UNDECLARED_OPERATION`), and a decision tree (only
        `UNSUPPORTED_CLASSIFIED_OUTPUT`);
      - repair, pending and unavailable evidence, and a record not held;
      - native-band controls over the broken Classifications, `READY` and observing nothing.
    - `classifiedOutputs.test.js`: its fixture Classification is now trainable and its input observed, so its cases
      still pin output capability alone.
    - The Classification's own `IMAGE_OUTPUT` and `TRAINING_DATA` tests are unchanged.
  - **GUI (mounted):** `phenology/classificationFeedback.test.jsx`: the classification field explained, Retrieve held,
    cleared on repair, and the native control. `collectionClassifierRequirements.test.js`'s output-capability fixture
    is now trainable and over a mosaic described from configuration, so its controls still pin output compatibility
    alone.
  - **gee:** `imageAssetExport.test.js`: a Phenology export with a classified band refused with `NO_TRAINING_DATA`, then
    accepted after repair; a native band exports.
  - **Witnesses:**
    - Phenology's need reverted to `REFERENCE`, or the traversal visiting only `IMAGE_OUTPUT` and `TRAINING_DATA`, fails
      every classified case; the native controls and the decision tree pass either way.
    - Validation accepting any condition fails the four malformed-declaration cases.

**Verification status of the readiness and normalisation changes (2026-10-21).** Checked against commits up to
`3ea2e7f04`, plus two fixes to the verification script, which were defects in the script itself.

- **Automated.**
  - Full GUI suite with two workers: 309 files and 4475 tests passed (326 s).
  - gee focused tests and the verify helper tests: 212 and 55 passed.
- **Live Earth Engine.** `modules/gee/verify/classifierNormalisation.mjs` passed all 24 checks and exited 0 (66 s).
  - **Training rows.** The provider was `LC08_231062_20170730`. Each reusing consumer trained on 15 rows: 6 from the
    provider, then 9 of its own. Each non-reusing case trained on its 9.
  - **Predictions.** They were identical over 213,507 jointly valid pixels per band, and the footprints were identical.
  - **Mask.** With the scene masked, 0 pixels were valid where it was masked and 106,711 elsewhere.
  - **Witnesses.** `classification.js` from `23f230f5f`, before the normalisation fix, failed 7 checks: the
    normalising cases' training rows and predictions, and every reuse row check. From `0a84dd54c`, before the reuse
    fix, only the 2 reuse training-row checks failed.
  - **Script fixes during the run.** The comparison area was built before Earth Engine was initialised, and
    `isUnbounded()` was negated with an unavailable `.not()`. Both are now evaluated as other verify scripts do.
    Acceptance criteria are unchanged.
- **Browser batch: pending.** It needs a signed-in SEPAL session with linked Earth Engine access, which was not
  available. To run it:
  1. **Reused features (Classification, then Regression).**
     - Set up Provider and Consumer, both over imagery with `IMAGE_BANDS [red, nir]` and collected points. Consumer
       adds a `RECIPE` data set reusing Provider. Confirm Consumer previews and can be retrieved.
     - Open Provider and remove `nir` from its band set. Consumer's Provider data set names Provider and `nir`, and
       Retrieve is held.
     - Restore `nir`. The mark clears, and the preview renders.
  2. **Empty chain.**
     - Give Consumer only the data set reusing Provider, and Provider points.
     - Delete all of Provider's points. Consumer is held: Regression's TRN says "Add training data", and Retrieve is
       held for both.
     - Restore Provider's original working point set, not a single point: clearing `NO_TRAINING_DATA` does not
       establish that enough samples or classes exist to train. Consumer is released, and its preview renders.
  3. **PyEO.**
     - Set up a PyEO Alerts over a Classification that has imagery but no points, with the index gate off. Sources'
       classification field names the Classification, and Retrieve is held.
     - Add points to the Classification. The explanation clears, Retrieve is offered, and a preview renders.
     - Repeat with the gate on.
  4. **Charts.**
     - Open a Time Series pixel chart over a Classification-backed band, with the Time Series monitoring optical data.
     - Make a compatible upstream edit, such as adding a point: the chart reloads with data.
     - Make an incompatible one: switch the Classification's input from optical to radar features, keeping the Time
       Series monitoring optical. (Removing a feature usually leaves it compatible.) The chart closes or is held, with
       an explanation.
     - Repair it by switching the input back. The chart is offered again and returns data.
  5. **Classified outputs.**
     - Use a Time Series over an SVM Classification (C_SVC). Chart `probability_<class>`: it returns values without a
       regression error.
     - Retrieve offers only outputs the Classification supports: probabilities, and no regression for SVM.
  6. **Working execution.** For each step above that releases a hold, confirm an actual response, not only an enabled
     button: a preview tile for Classification, Regression and PyEO (these have no pixel charts), and a chart response
     for the Time Series and CCDC charts.

#### Regression training data (implemented)

- **Shared.** `trainingData.js` holds `noTrainingData` and `trainingDataRequirement`. Classification uses them with
  `requiresTraining`; Regression uses `noTrainingData` alone. A `RECIPE` data set counts as training data unless the
  recipes it reuses are known to store none (see "Configuration-known absence of training data"). Every other data set - an Earth Engine table, image samples - runs on the points
  it stores, so none stored is none at all. Whether enough points survive masking, or lie within the imagery, is not
  judged.
- **GUI.** Regression declares `trainingDataRequirements` beside `inputImageryRequirements`, its TRN button is a
  `SectionButton` saying "Add training data", and its layer's `dataSets.length` guard is gone: the output read withholds
  the layer. The data set editor keeps its own draft rules (a name, a table or image, reference data), which never
  change the applied recipe's readiness; the data set list's Apply stays held while it lists no data set.
- **Tests.** `regression.test.js` (shared), `trainingDataReadiness.test.jsx` (TRN, layer and Retrieve agreeing, a
  Remapping of the predictions, a reloaded table cancelled and applied), `imageAssetExport.test.js`.

#### Required input imagery (implemented)

- **Shared.** `inputImageryRequirement` finds an empty input list, for `IMAGE_OUTPUT` and `TRAINING_DATA`. A
  Classification or Regression whose training data another reuses is judged by it as a provider: producing that
  training data samples over its input images, and with none its samples are silently dropped (see "Reused training
  data"). A named map product is not judged by it. An input selected but not yet read, failing, gone or
  lacking a band it selects is not this finding: the closure, the description and the input's evidence say what it is.
- **GUI.** `missingInputImageryRequirement` (`panels/inputImagery/inputImageryRequirements.js`) says it on IMG for
  every type listing input images - through both input imagery declarations, and Remapping's own - with the list's own
  wording, "Please add at least one image." It is `wizardStepMark: false`: while the set-up wizard has IMG open as its
  step, where the list's form holds Next and Apply until it lists an image, the toolbar does not say it; a section not
  yet reached is not marked either, and once the wizard moves on it is marked. Band Math's and Remapping's toolbars use
  `SectionButton`, so their marks follow the wizard as the others' do. The layers' at-least-one-input guards are gone.
  The outline of a recipe without an area of interest of its own (`RecipeGeometryLayer`) is its first input image's
  geometry, so it is withdrawn, its request cancelled, while the list holds none - not while it cannot run for another
  reason, such as missing training data.
- **Tests.** `inputImageryRequirement.test.js` (shared), `outputRequirements.test.js` (IMG, Retrieve and previews
  agreeing for each type, a Remapping over an empty Classification, a missing asset said as that),
  `recipeImageLayer.test.js`, `wizardSectionMarks.test.jsx`, `inputBandSets.test.jsx` (the last input removed, one
  added in the editor, cancelled and applied), `imageAssetExport.test.js`.

#### Remapping constraint references (implemented)

- **Shared.** `constraintInputRequirement` and `constraintBandRequirement` (`type/remapping.js`) carry the rule the GUI
  held as a local requirement, with the same semantics: a constraint's `image` must be the `imageId` of a listed input,
  and its `band` one that input's `includedBands` names. Each finding is located at its constraint. They read the
  configuration alone: an input not yet loaded or unreadable is never a broken reference. The later source-band
  requirement below checks source descriptions separately, without repeating these configuration diagnoses.
- **GUI.** `remappingRequirements` is an output declaration over both codes: each finding's legend entry is its item,
  named with the first problem and the others listed, each once in constraint order, as the local read said them. The
  local predicate is gone. The constraint editor keeps its own draft check of the inputs and bands it offers, which never
  changes the applied recipe's readiness; Cancel writes nothing, and a repair can be applied while the applied recipe is
  refused. The outline (`RecipeGeometryLayer`) is not held by it.
- **Tests.** `type/remapping.test.js` (shared), `remappingRequirements.test.js` (entry messages, gates, Retrieve, a
  Remapping of it held and restored), `constraintReferences.test.jsx` (including automatic reconnection on applying the
  same source again, saving/reopening, source changes, missing bands, ambiguous legacy references and Cancel), `remappingLayer.test.jsx` unchanged,
  `recipeGeometryLayer.test.jsx`, `imageAssetExport.test.js`.

#### Validation and source recovery roadmap (2026-10-15)

The source-recovery audit reported mounted GUI probes, including save/reopen and downstream checks; it did not run
live Earth Engine or browser tests. Both Band Math packets and the used-source-band Remapping packet below are implemented; the remaining follow-ups are listed
separately:

1. **Band Math calculation references in shared readiness (implemented).** The audit found that successful synthetic
   observations could make a broken Band Math and its dependent report READY. That demonstrated a validation gap,
   not successful Earth Engine execution. `INVALID_CALCULATION` findings now locate
   the originating calculation and carry the existing reference/syntax details. The shared analyzer and scope rules
   check expression variables and physical bands, reducer input IDs and bands, removed calculations, self/forward
   references, syntax, function arity and whole-image band counts. Cycles remain invalid through their self/forward
   references. The editor and synchronization reuse those same utilities; the parser versions match the existing GUI.
   GUI calculation declarations now present shared findings instead of evaluating local applied predicates. Only
   originating problems are diagnosed; dependent outputs and recipes are blocked through readiness without copying
   that diagnosis. Dependent input-list recipes now mark their declaring reference with the upstream recipe's name,
   as described under Marks above. Descriptions remain available where known, and pending/failed source evidence is never a
   fabricated missing-reference finding. Repairs restore downstream rendering, Retrieve and the existing asset-export
   path. Draft edits remain isolated until Apply; Cancel changes nothing. Asset exports with broken references are
   now refused deterministically, including exports of a Remapping over Band Math.
   Verified by shared reference/readiness tests, GUI marks and Apply/Cancel tests, a downstream preview layer and
   Retrieve checks, and the mocked asset-export path. Output-selection validation beyond existing shared checks and
   additional backend routes remain separate work.
2. **Band Math recovery of preserved input references (implemented).** Applied input changes/removal retain
   `imageSource` on calculations' existing `usedBands`, using `inputSourceKey` and Remapping's reconciliation helper.
   The existing input ID, variable name and band IDs supply the remaining identity; no historical-input registry is
   added. Existing working references acquire metadata before removal or on input Apply, and source changes refresh
   it. Valid expression snapshots use the existing shared analysis, including bands added by whole-image derivation;
   unresolved snapshots stay intact. Metadata survives save/reopen.
   An unambiguous returning source is offered its former variable name only while unused by inputs/calculations and
   not claimed by conflicting retained references. Other sources keep the name-allocation guard; explicit draft names
   are respected. Apply reconnects reducer/expression reference IDs atomically with the input, without rewriting
   expression text or calculation settings. Referenced band IDs are retained so Sync preserves calculated output
   selections and custom names. Missing selected bands still block shared readiness until included and applied.
   Cancel changes no applied references. Occupied names are not stolen; unresolved reducer IDs remain invalid.
   Expressions keep their existing variable-name semantics, including any explicit reassignment the user already made.
   Older orphans without retained identity require explicit repair; ambiguous legacy sources are not chosen arbitrarily.
   Mounted add/remove/apply tests cover both source kinds, save/reopen, source changes, missing bands, Cancel, collisions,
   whole-image expressions, calculated output stability, downstream preview recovery and Retrieve/readiness agreement.
   Deleted direct outputs, their custom names, deleted calculations and Stack aliases are not restored.

3. **Remapping used source bands (implemented).** `constraintSourceBandRequirement` uses the existing readiness
   traversal's successful input descriptions. A constraint reading an included band its source no longer provides
   produces `MISSING_INPUT_BAND` at the input's included band. Existing missing-input/not-included findings stay
   distinct. The output's known `class` description is unchanged; rendering, Retrieve and existing asset exports
   are blocked for the Remapping and its consumers. Returning bands clear the finding on current evidence without
   changing constraints or automatic recovery metadata. Pending, failed and superseded evidence produces no missing
   band. No new acquisition type, cache, saved validity or assessment work type was added.
   The existing input requirements bridge supplies concise row/IMG feedback. The constraint modal reads its actual
   draft through `OutputCandidate` and presents the shared finding beside the selected band; no error is copied to
   MAP or downstream sections. A repair is applicable independently of other entries; draft edits and Cancel leave
   applied readiness unchanged. Tests cover assets, upstream recipe output removal, downstream preview/availability,
   asset exports, evidence currency and repair. A live read-only EE probe confirms used-band failure downstream and
   the differing unused-selection cases below.

#### Source-reference editor audit (2026-10-16)

Mounted GUI tests use mocked source responses, not live Earth Engine or browser appearance checks. The shared input
fix and the Masking and Change Alerts Sources field explanations are implemented; the remaining notes below are
reported for a separate decision, not changed here.

| Callers | Editor behaviour and evidence | Smallest next action |
| --- | --- | --- |
| Stack, Band Math, Remapping | Shared reference explanation now appears beside the recipe selector. Mounted tests cover opening unchanged, a healthy draft replacement, Cancel, and Remapping upstream repair while open. Existing input-band tests cover selected unavailable bands. | Implemented through the existing output-candidate binding; no new validation. |
| Classification, Regression, Unsupervised Classification | Same selector binding, mounted for each caller. Existing Classification band-set tests retain the separate field/chip validation and repair flow. | Implemented; retain both declarations in the editor. |
| Class Change / Index Change FROM and TO | `changeImageRequirements` already binds source disappearance to the source field and missing bands to their band fields. Mounted cases cover repair/Apply, Cancel, pending and transient errors. | No presentation fix identified for these existing marks. General upstream-reference messages are not registered here. |
| Masking | The mask editor binds the existing `MISSING_ROLE` declaration (`maskRequirements.js`) to the selector of the kind its draft shows, asset or recipe. A draft choosing no source of that kind is judged as selecting no mask, so an empty selector of a set-up Masking says "Select a mask"; it clears once a mask is chosen and returns when the draft switches to a kind with nothing chosen. At the wizard's mask step it is `wizardStepMark: false`: arriving shows no error and leaves MSK unmarked, and the explanation follows the selector's own error after interaction. Presentation only: the selector's own required rule still holds Apply and the wizard's Done. Both selectors, IMG's and MSK's, time that rule as agreed for new required fields: the panel opens with the selector focused and neutral; leaving it empty says it is required, and focusing it again keeps that; choosing a source clears it at once; using the picker's options counts as staying in the field; switching Asset/Recipe focuses the selector now shown, neutral (a programmatic reset, `set(value, {validate: false})`, `form.jsx`). Next, Done and Apply stay held while a source is missing, shown or not. Verified in Chromium against a fixture page and in `maskEditor.test.jsx`; other forms keep their timing (shared form validation consistency, below). `maskEditor.test.jsx` covers opening, the recipe kind, draft repair, Cancel, Apply, a set-up Masking with a mask and the wizard. The primary image still uses a plain activation button. Opening IMG or MSK reloads its saved source and leaves the panel unedited, Apply not offered: `ImageForm` (`masking/panels/inputImage/imageForm.jsx`) clears `bands` only when a source other than the one they describe starts loading, and writes an answer back only when the form is edited or the answer differs from the copied snapshot. A source changed under the recipe can still offer Apply; an answer for a source no longer selected is ignored. Covered by `maskEditor.test.jsx` (IMG and MSK reopening) and `imageForm.test.js`. | Implemented. |
| Change Alerts REF | Existing `SourceCandidate` and `sourceInputFeedback` put confirmed capability problems on the recipe/asset field; mounted tests cover replacement, Refresh, Cancel and pending versus unavailable responses. | No gap identified in REF. |
| Change Alerts Sources | The Sources section names the field from the draft's refusal (`SourceCandidate.refusal()`, passed to `section.input`): `NO_AVAILABLE_MEASURE` on the type of data, `NO_OBSERVED_MEASURE` on the data sets, `MONITORED_MEASURE_ABSENT` and `MONITORED_MEASURE_UNOBSERVED` on the band, each as its message asks. A refusal naming none of these settings stays on the toolbar button. Pending or unreadable reference evidence is REF's to say: Sources says nothing of it. `referenceRequirement.test.jsx` covers each field, opening unedited, draft repair, Cancel, Apply and pending versus unavailable; Apply policy unchanged. | Implemented. |
| BAYTS Alerts REF (and dependent PRC) | REF already uses standard source-field feedback, with mounted replacement, pending, Refresh and Cancel tests. PRC deliberately reconciles unsupported orbit selections to supported ones in the draft, offers Apply and preserves applied passes on Cancel; its toolbar diagnosis is not repeated on the orbit field. | No missing corrective action in PRC; any added explanation should describe the existing draft reconciliation, not duplicate validation. |
| CCDC Slice Source | Existing source-field binding explains capability problems and separate chart advisories; mounted tests cover repair, pending/unavailable, Refresh and Cancel. | No gap identified. |

Transient failures in capability editors have explicit unavailable/retry feedback, distinct from a confirmed
unsuitable source; pending checks show busy feedback. This audit does not equate every red field-feedback icon with
configuration invalidity. It does not opt additional recipe types into upstream-reference presentation, change their
validation coverage, or change existing seeding/reconciliation of drafts. Temporary probes were removed after recording
these results; permanent tests retain the implemented shared editor cases.

#### Current delivery plan (2026-10-21)

This is the remaining plan for the current classifier/readiness round. The completed histories that follow are
reference material, not additional slices to implement. A shared backend helper accepting a Classification is not,
by itself, a reason to expand a recipe's validation or GUI.

| Order | Remaining work | Status and next step | Estimated implementation slices |
| --- | --- | --- | --- |
| 1 | Phenology's configured classified band needs the Classification's training readiness. | Complete (2026-10-21): the `CLASSIFIER` operation and a conditional need, reusing the existing training rules without describing the Classification's output; see "Phenology's configured classified band". | 0 |
| 2 | CCDC's classified breakpoint bands need the same training readiness. | Follow the reviewed Phenology design for `IMAGE_OUTPUT` and `PIXEL_SEGMENTS`; keep native breakpoint controls unchanged. | 1 |
| 3 | Training readiness and output compatibility for classified bands requested by Time Series charts/downloads and CCDC charts/exports. | Design needed. Request bands are not currently arguments to readiness. GUI capability options and execution refusals already exist; introduce request-aware readiness only where it closes the remaining execution gap. | 2–4 |
| 4 | Change Alerts' observation request needs an explicit server-side operation boundary. | Design needed. The bare `{model}` request is unguarded; use the real consumer and the collection it runs without bringing in unrelated segment-production dependencies. | 1 |

**Planning estimate: 4–6 implementation slices** for the three remaining work items, plus the browser verification
checkpoint below. This is an estimate, not a count of proven defects or a promise of one commit per slice. Reassess the
split after the request-dependent design. Design reports, review corrections and focused
refactoring are not new rollout items.

**Finish this round when:** the reviewed dependencies and requirements cover the training and collection work these
operations actually run,
pending and unavailable evidence stay distinct from findings, repairs recover through the existing runtime, and the
focused regressions and browser checks pass. Preserve the current native-band classifier-input policy unless a
separate decision changes it. Broader coverage listed under "Deferred beyond this round" is not required to finish.

**Verification checkpoint before push:**

- The full GUI suite and live numerical normalisation checks passed at the baseline recorded under "Verification
  status of the readiness and normalisation changes". The later deselection fix has focused GUI coverage; do not
  describe the earlier full-suite run as testing later commits.
- The signed-in browser batch and GUI smoke tests are still pending. Use the checklist in that verification entry,
  and include clearing and reselecting a Classification in Time Series/CCDC charts and Time Series Retrieve.
- Check actual preview tiles or chart responses, as appropriate, after repair. Enabled buttons alone are not an
  execution check. Complete this browser checkpoint before pushing the accumulated changes.

**Already completed:**

- shared classifier-input and configured output-capability checks;
- readiness for recipe image exports, Time Series downloads, direct observation/segment charts and referenced
  segment charts, with the documented route boundaries;
- chart cancellation, recovery, compatible upstream reloads and band choices from the resolved Classification;
- Time Series Retrieve's current capability options, pending/save holds and submission guard;
- reused training-data imagery, band sets, recursive absence and sampled-feature checks;
- PyEO's Classification image dependency and its training checks;
- consistent normalisation for prediction imagery and reused Classification samples, with live numerical witnesses;
- removal of incidental Change Alerts Classification dependencies, stale deselected capabilities, and the bounded
  operation/lifecycle/field-binding consolidations.

**Deferred beyond this round:**

- multiple-input sampled-feature names, suffix collisions and collection-classifier input-count validation;
- sampling-scale, raw value encoding and legend/value compatibility, and sample survival/sufficiency after masking;
- changing the native-band classifier-input policy;
- geometry, named map products and other unguarded routes, asset segment-layout validation, and the cost assessment
  before server-side Preview checks; LandTrendr remains outside the classifier rollout;
- `REFERENCE` closure over-reading and runtime refresh-policy changes;
- shared form defaults, duplicated input editors, reference-feedback navigation and tab-indicator experiments.

These are recorded boundaries or future decisions, not automatically scheduled fixes. Promote one into a new round
only for an agreed need or a confirmed failure. The detailed follow-ups below retain their context.

#### Completed follow-up packets (2026-10-21)

**Delivery approach: iterate between focused fixes and bounded consolidation (2026-10-21).** Do not wait for the
whole roadmap to be implemented before improving the structure, and do not start a broad redesign ahead of confirmed
behaviour. Finish a small set of fixes, use their regressions to consolidate repeated contracts or lifecycle code,
then implement the next set on that structure. The packet history below records coverage; it is not the remaining
execution order.

The sequence below records completed delivery, with remaining boundaries stated explicitly:

1. **Change Alerts inherited-settings correction: implemented.** Monitoring uses native imagery,
   incidental copied settings do not create dependencies, and the referenced producer retains its genuine dependencies.
2. **Operation wiring and chart lifecycle: consolidated.** Delivered as separate slices:
   - **Operation wiring (consolidated 2026-10-21).** Each direct pixel chart declares its operations once, as its
     panel's `CHART_OPERATIONS`: `PIXEL_OBSERVATIONS` for Time Series, plus `PIXEL_SEGMENTS` for CCDC. Its action
     and open chart gate on that list through `pixelOperationsAvailability`, and both watch it through
     `watchOperations`. `recipeForOperation` remains the one pixel/AOI projection, shared by readiness reads,
     acquisition and the runtime's asset interest. Referenced images keep their own AOIs. CCDC Slice and Change
     Alerts adopted the wiring in the next packet; LandTrendr remains unchanged.
   - **Chart lifecycle (consolidated 2026-10-21).** One pure decision, `pixelChartUpdate`
     (`recipe/pixelChartUpdate.js`), says what an open Time Series or CCDC chart does on each update: close, let go,
     replace the band, or read a band. Each panel applies the answer through its own `close`, `clearData` and
     `loadData`. The precedence is explicit: a withdrawing gate closes the chart before its band is reconciled, so the
     chosen band is kept (CCDC used to replace it first, and stayed open when no band remained). A band no longer
     offered is replaced before anything is read. A changed computation, pixel or band reads once the gate allows. A
     gate appearing lets go, and its clearing reads again; whether to resume is derived from the previous gate, which
     replaces the panels' `held` flags. Time Series now also decides on mount, as CCDC did.
     Remaining duplication, deliberately per panel: request construction (CCDC's paired segment and observation
     streams), `clearData` over each chart's own state, `close`, the five-line application of the decision, mounting and
     unmounting, band settings and rendering.
   - Prefer extracting the existing shared behaviour to introducing another resolver, cache, subscription system or
     general-purpose framework. Success means the next operation needs fewer independently coordinated changes,
     not merely fewer lines.
3. **Align referenced segment-chart GUI availability with backend readiness** for CCDC Slice and Change Alerts,
   using the consolidated operation wiring; retain their segment-structure checks. **Implemented (2026-10-21).**
   - **Declaration.** Both consumers declare `PIXEL_SEGMENTS` with `{PRIMARY_IMAGE: IMAGE_OUTPUT}`. Change Alerts
     also has `SOURCE_IMAGERY: REFERENCE`, which matters only for Planet assets, and has no configuration
     requirement for the operation. In readiness-only mode, the shared resolver judges a selected recipe by its own
     `IMAGE_OUTPUT` requirements and by those of every image it builds, without describing any of them. This is
     the same judgement `/ccdc/loadSegments` makes of a `RECIPE_REF` through `requireExecutable$`. An asset
     reference asks for nothing.
   - **Guarantee.** For an applied recipe reference, the chart action and the open chart are both held by
     `pixelOperationsAvailability` over the consumer's `CHART_OPERATIONS` (`[PIXEL_SEGMENTS]`), which the toolbar
     passes to the action and the panel watches through `watchOperations`. This sits beside the
     `ccdcSegments.chartable` source requirement, which is unchanged.
     - A finding of the selected recipe, or of anything it builds (such as a Masking's missing mask), disables the
       action. It also closes an open chart before its band is reconciled, cancelling its request.
     - Pending or unavailable readiness holds the request. Losing readiness lets go of an in-flight request, and
       recovery requests once. A draft dependency waits for its save, as for direct charts.
     - The consumer's own configuration never gates the chart; for example, a classified monitored band holds back
       only Retrieve.
     - The referenced recipe keeps its own AOI. Only the consumer is projected, and neither consumer has an AOI.
     - An asset reference still follows only its segment-structure checks.
   - **Limitations.**
     - The backend still judges the reference record directly, not the consumer's declaration. The two agree by
       construction, and shared tests pin the GUI side (`referencedSegments.test.js`).
     - Reloading on compatible upstream changes followed in item 4.
     - Losing readiness also re-reads the Change Alerts observations, which share the chart's cancellation.
4. **Reload referenced segment charts on compatible upstream changes.** **Implemented (2026-10-21).**
   - **Comparison.** Each panel's change comparison gains one entry: the `PIXEL_SEGMENTS` computation of the
     consumer, less its own first entry (`sourceBuild`, `referenceBuild`). That entry is the `recipeContent` of every
     record the reference's closure holds, its AOI included. The consumer's model, selected band, pixels and
     description stay compared as before.
   - **Guarantee.** A change to what the applied reference executes reloads an open chart through the existing
     change path, even when it leaves the band description and asset identities unchanged (such as a CCDC
     segmentation parameter). That path cancels the obsolete request, so its late answer draws nothing, and makes
     one request when no gate holds. Change Alerts re-requests its observations with the segments, as on any change.
     - An edit whose save is pending or unsaved holds the chart through the draft gate; it requests once storage
       agrees.
     - Titles, layout, `ui`, unrelated recipes, and a draft selection in SRC/REF that is then cancelled reload nothing.
     - An asset reference adds no records, so its freshness (`pixels`) is unchanged.
     - A source re-check alone still keeps drawn segments.
   - **Limitations.**
     - A build change clears drawn segments at once, as a pixel or model change does. It does not wait for a
       re-check that happens at the same time. For a CCDC that re-check is synchronous; for an asset-backed
       source the same edit already changes `pixels`.
     - A refreshed record whose content is unchanged does not reload the chart. Asset contents are followed only
       through `pixels`, as before.

5. **Classified-output choices in charts and Retrieve: implemented (2026-10-21).** The resolved-record view fixed
   the stale-option defects without a band-aware request contract. Request-dependent readiness remains in the
   current delivery plan; the native-band policy decision stays separate.
   - **Gap fixed.** A Time Series' or CCDC's chart offered bands from the Classification record when the session
     held it, and otherwise from the copy Sources took (`ui.classification`). The source runtime read the stored
     record for readiness but kept it private, and readiness judges no band. So a stale copy could offer
     `regression` of a Classification storage holds as an SVM, and the chart requested it; execution refused it
     (`UNSUPPORTED_CLASSIFIED_OUTPUT`).
   - **Read boundary.** `readOperationReadiness` answers `recordOf(id)`, scoped to that operation read. It
     returns the session graph's record where the session holds it, otherwise the record in the `basis` of the
     `COMPLETE` answer `heldFor` returns, otherwise null. An unavailable answer, or one `heldFor` no longer returns,
     supplies nothing.
     - `pixelOperationsAvailability` passes `recordOf` on.
     - `selectedClassificationOfState(state, recipe, recordOf)` gives both charts a legend and classifier: the
       session's, then the resolved one, then the copy.
     - Components never read `basis`. Nothing is installed into the session, loaded, cached or watched for it.
   - **Guarantee.** While the runtime holds a current answer for the chart's operations, the band options follow
     the stored Classification. The existing band reconciliation (`pixelChartUpdate`) replaces a band it does not
     provide before any request, so that output is never requested and stays unoffered while that Classification
     is current.
     - A record the session holds wins, so its edits are seen at once.
     - A newer listed revision supersedes the answer. The runtime reads the record again and the options follow
       what it now holds.
     - Retention is the runtime's own (`outputRegistry.js`). An answer reopened within the grace period after
       its question is released still resolves, and one past its deadline does not.
   - **Limitations.**
     - While the first read is pending, and during a re-read after supersession, the options are the copy's.
       Requests are held meanwhile, and the band is reconciled before the first request.
     - Unchanged: execution's refusal (the backstop), the native-band classifier-input policy, and bare `{model}`
       observation requests.
   - **Time Series Retrieve (implemented 2026-10-21).**
     - **Source of the record.** Retrieve offers its indicators from the same `selectedClassificationOfState`. Its
       `recordOf` comes from the recipe's `IMAGE_OUTPUT` readiness (`readOperationReadiness`), the readiness of what
       it downloads, over its configured AOI, and Retrieve watches that question through `watchOperations` while
       open. That readiness reads records only; nothing of the Classification is built, trained or observed.
     - **Not checked against the count image.** The indicator is still a measure of the collection.
     - **Shared-panel contract.** `MosaicRetrievePanel` gains `pendingRequestOptions` on its `requestOptions` path:
       the options not yet established. They are given while the Classification is known only by its copy, or by a
       session draft storage does not yet agree with (`draftDisagreementsOfState`), since the download runs from
       storage's copy.
       - Meanwhile the band control keeps what is selected, even a selection its options do not carry, and does
         not drop it.
       - A selection naming a pending option or an unoffered one is held, both at Apply and in the submission
         itself, however the form is submitted. A selection of the images' own bands is submitted as before.
       - No validation error is shown while pending.
       - Once settled, the existing control lets go of an unsupported selection. The required-band rule then holds
         Apply until the user chooses another; nothing is substituted.
     - **Unchanged:** destination, scale, tiling and submission.
   - **Deferred.** Band-aware operation readiness (`request: {bands}`, with request-distinct questions and keys) is
     kept for an operation that genuinely needs request parameters.

**Field-binding consolidation: completed (2026-10-21).** `recipe/fieldRequirement.js` replaced repeated path
matching, diagnostic selection, candidate construction and editor binding in the classifier-input and classified-output
declarations. Field controls keep their explicit error presentation. Broader shared-control defaults and duplicated
input-image editors remain under "Later: shared form validation consistency" below.

- **`fieldRequirement({id, section, code, path, message, editor})`** provides:
  - the requirement's `describe` and the section `summary`, from the first diagnostic;
  - `outputDiagnostics` for one code at an exact path, its item identified by the declaration id;
  - the editor binding: the panel, the message beside the input, and the recipe's own editor policy (`blocksApply`,
    `quietWhileEdited`) merged in;
  - the image output's operations.
- **`sourcesFieldRequirement({field, ...})`** adds the Sources path, input and candidate, the candidate being
  `model.sources` replaced by the panel's values.
- **`listed(items, andMore)`** is the shared truncation.
- **What each recipe keeps:** CCDC, Time Series and Phenology (`collectionClassifierRequirements.js`) and PyEO Alerts
  (`pyeoAlerts/sourcesRequirements.js`) declare only their ids, codes, paths, messages, `andMore` keys and policies
  (`wizardStepMark`, `blocksApply`, `quietWhileEdited`).
- **The one identity change:** collection declarations' item id is now their declaration id, as PyEO's already was.
  Nothing reads those items by id.
- **What remains:** field controls keep their explicit error wiring (`form.getErrorMessage(input)` in each Sources
  panel). That is presentation and is unchanged here. Other declaration families keep their own builders, since
  their item enumeration and editors differ: segment requirements, Band Math, input imagery and Change Alerts'
  reference.

Further delivery follows the current plan; geometry and named map-product coverage need a separate scope decision.
Preview validation remains conditional on measured cost. Refactoring slices preserve behaviour and use the relevant
existing regressions plus focused static checks; add tests for new contracts or uncovered behaviour, not for an
extraction alone. The focused verification and two-worker limit below still apply.

**Packet history and coverage:**

1. **PyEO compatibility: done.** Shared classifier-feature and conditional index-gate requirements decide
   readiness, and OPT's index choices, explanation and draft Apply validation follow the same execution-based rules. A
   direct asset baseline calculates the index from spectral bands; a recipe baseline supplies the index by name.
   Pending evidence is not judged against bands cached for a previous Classification. Explicitly saved indexes and
   unchanged reopening are preserved; a new configuration prefers NDVI, then a supported alternative. With no
   supported gate index, OPT explains why On is unavailable and stays usable; an incompatible saved gate stays visible
   with Off available as a repair. A radar classifier over Landsat is refused before execution.
2. **Classifier compatibility for the GUI-supported consumers: implemented.** The common rule is
   `lib/js/shared/src/recipe/classifierInputs.js`: the features the selected Classification's single input's band sets
   include, against what each image carries where `lib/js/ee/src/timeSeries/collection.js` classifies it - an optical
   scene's common bands, tasseled cap and indexes (`sceneBands`), a radar scene's `VV`, `VH` and `orbit` (the ratio is
   derived afterwards), a Planet image's renamed bands with the brightness and date bands
   `lib/js/ee/src/planet/collection.js` adds to every image (`PLANET_GENERATED_BANDS`; indexes are added afterwards; a
   band only eight-band Daily imagery carries is not refused) - plus the indexes the classifier computes itself. It reads the Classification record
   (`recordsOf`), not its image output. CCDC, Time Series and Phenology declare `collectionClassifierRequirement`
   (`source/collectionSources.js`): `UNSUPPLIED_CLASSIFIER_INPUTS` at the data sets where an optical data set or the
   radar collection would carry the features, otherwise at the classification; no selection requires nothing. PyEO
   reuses the rule, keeping its optical-only monitoring and its separate drop-index requirement. In the GUI
   (`recipe/collectionClassifierRequirements.js`) SRC is marked, the field says why, the classification shows outside
   More while it carries the problem, and a refused draft cannot be applied. Enforced by map previews and the Retrieve
   button (GUI readiness gates), by the server's recipe image exports - the generic image-to-asset export
   (`imageAssetExport.js`), CCDC's Segments asset export (`ccdcAssetSource$` in `ccdcAssetExport.js`, shared by its
   task and `assetSources.js`) and the Drive and SEPAL image exports (`imageDriveExport.js`,
   `imageWorkspaceExport.js`), the last three building the image only for a ready recipe - and by Time Series
   downloads (`export/timeSeries.js`: tile ids, a tile's date ranges and each chunk's export, each checked before its
   own work), and by Time Series' and CCDC's pixel observations (`/timeSeries/loadObservations`, `PIXEL_OBSERVATIONS`,
   judged at the clicked point before the pixel or collection is built), and by a CCDC's own segment chart
   (`/ccdc/loadSegments`, `PIXEL_SEGMENTS`) and a segment source's image (`IMAGE_OUTPUT`, readiness alone). Not
   enforced, and not migrated here: Change Alerts' observations, which reach Earth Engine without consulting
   readiness. A Classification with several inputs is
   not judged, though `classifyImage` refuses it.
3. **Diagnostic-code ownership: done.** `lib/js/shared/src/recipe/output/diagnostic.js` keeps the output and
   resolution contract (`INCOMPLETE_IMAGE_OUTPUT` to `CONFLICTING_OBSERVATION`), `MISSING_ROLE`, and the band codes
   several rules share: `MISSING_INPUT_BAND` and `NO_OUTPUT_BANDS`. Each other code is declared beside the rule
   emitting it: `NO_TRAINING_DATA` in `trainingData.js`; `UNDERIVABLE_INPUT_INDEX` and `INSUFFICIENT_INPUT_BANDS` in
   `bandSets.js`; `INVALID_CALCULATION` in `bandMath/calculationReferences.js`; `UNMAPPED_INPUT` in `type/stack.js`;
   `MISSING_CONSTRAINT_INPUT` and `CONSTRAINT_BAND_NOT_INCLUDED` in `type/remapping.js`; `MISSING_LEGEND` in
   `type/classChange.js`; `NO_CHANGE_CLASSES` and `UNAVAILABLE_GATE_INDEX` in `type/pyeoAlerts.js`; and
   `UNSUPPLIED_CLASSIFIER_INPUTS` in `classifierInputs.js`. Strings and behaviour are unchanged; importers name the
   owning module, with no registry, barrel or re-export.
4. **Chart readiness: audited (2026-10-20); pixel observations implemented on the backend and in the GUI; pixel
   segments implemented on the backend.**

   Findings at audit time (the implemented slices below supersede the shipped-guard defects):
   - **The readiness pass is bound to describing `IMAGE_OUTPUT`.** In `resolveImageOutput.js` the root is described
     first; for each `IMAGE_OUTPUT` need, the target is described too. A CCDC root is therefore described from its
     catalogue (`ImageFactory(...).getBands$()`), which reads the Classification's bands and, for Planet Daily, runs an
     Earth Engine evaluation over the configured AOI. A pixel chart needs neither.
   - **The closure is transitive, and every edge counts.** It follows every direct source of every record, including
     edges an operation calls `REFERENCE`. Any unsound edge makes `dependencyValidity` refuse.
   - **The shipped Time Series chart guard over-requires.** A probe confirmed it: the chart uses the clicked point,
     yet it is refused for an AOI recipe that cannot be read, or an AOI that is incomplete or cyclic. A readable AOI
     recipe is read with its own dependencies.
   - **Change Alerts' observation request carries no recipe.** It sends a bare `{model}`: its own sources and
     options, with dates from the shared `monitoringDates`. Change Alerts declares no classifier requirement: it
     monitors native imagery bands and uses no Classification (`docs/recipes/change-alerts.md`).
   - **`/ccdc/loadSegments` builds one of three things:**
     - a direct CCDC is segmented at the point, with its AOI replaced;
     - an asset is read as stored;
     - a recipe reference is resolved through `withSegmentSource$` to its producer. For example, Masking stands for
       its CCDC, and an Asset Mosaic's segments asset is read for its date format. The referenced recipe's image is
       then built with its own AOI, so it is that recipe's `IMAGE_OUTPUT`.
   - **`PIXEL_SEGMENTS` was GUI-only.** It named a consumer's request over its source's segment structure
     (`ccdcSegments.chartable`), not a configuration requirement. It is now shared (`output/readiness.js`), and the
     GUI re-exports it unchanged.

   Implemented (first slice):
   - **A readiness-only read.** `resolveReadiness`, `readReadiness` and `settledReadiness$` read the same
     declarations, closure, attribution and evidence acquisition for one `operation`. They describe nothing of the
     root. What a requirement asks of its inputs is acquired and fails as any read's is. A source the operation builds
     the image of is judged by its own `IMAGE_OUTPUT` requirements without being described (since the segments
     slice). A root whose type declares nothing for the operation is refused (`UNDECLARED_OPERATION`).
   - **`PIXEL_OBSERVATIONS`.** Time Series and CCDC declare it, needing only that their Classification and source
     imagery resolve, and the classifier requirement lists it.
   - **A gate of its own.** `requireExecutable$` (`modules/gee/src/jobs/executionReadiness.js`) shares the closure,
     acquisition and errors with exports. Exports keep `resolveImageOutput$` and its description-plus-readiness
     contract and messages.
   - **The point stands in for the AOI.** `/timeSeries/loadObservations` judges a typed recipe at the clicked point,
     with its AOI replaced immutably. This fixes the over-requirement above, and CCDC's observations are now guarded.

   GUI (Time Series and CCDC charts):
   - **Availability.** Each chart declares the operations it runs at its pixel once, as its panel's `CHART_OPERATIONS`.
     Its action (`ChartPixelButton` with `operations`) and the open chart are both judged on them by
     `pixelOperationsAvailability` (`operationAvailability.js`), over `readOperationReadiness`
     (`recipe/operationReadiness.js`), which wraps `readReadiness`. Both watch them through `watchOperations`. They are
     never judged by the image output's answer.
   - **Gate outcomes:**
     - a finding, or dependencies known unsound, withdraws, naming the section that the type's declarations say it in
       (Sources, for the classifier inputs);
     - a record still to be read waits;
     - a read that failed is unavailable.
   - **The AOI is left out.** The recipe is judged without its AOI, since any clicked point stands in for it; no point
     is assumed.
   - **Acquisition.** Records the session does not hold are read by the source runtime under a `READINESS` key naming
     the operation. `assessReadiness$` completes the closure and then settles `settledReadiness$`, asking Earth
     Engine only for what a requirement observes, so the classifier check asks for nothing. The question is a watch
     naming its `operation`, so an image-output answer never answers it. The assets it keeps current are those of the
     recipe the operation runs, so the ignored AOI is not read.
   - **Lifecycle.**
     - A pixel being chosen is no longer chosen once the action is withdrawn.
     - An open chart requests nothing while waiting. Once readiness stops being known - a Classification no longer
       held, the chart's recipe unchanged - it lets go of what it was reading, ignoring a late answer, and reads again
       once the gate clears.
     - Once withdrawn, the chart closes, cancelling its requests, so a late answer draws nothing.
     - **Reloading.** An open chart reads again - observations, and CCDC's segments with them - whenever what it is
       computed from changes. That is the `recipeContent` of every record in the operation's graph (`computation`,
       `operationReadiness.js`), the same comparison a map layer draws by. An earlier read is cancelled.
     - **What does not reload it.** Titles, layout, `ui`, unrelated recipes and the AOI the observations ignore.
     - **Saved dependencies only.** A dependency the session edits is executed from storage's copy. The chart waits
       while that copy is not the session's (`draftDisagreementsOfState`, shared with Retrieve), and reads once it is.
     - **Band options.** The legend and classifier the band options offer come from the Classification record while
       the session holds it (`selectedClassification.js`), and otherwise from the copy taken when it was selected.
     - **CCDC's segments.** CCDC's chart is also held to `PIXEL_SEGMENTS`, judged at the clicked point as its
       observations are (the AOI projection, and the runtime's asset interest, cover both). A breakpoint band its
       Classification stops providing closes an open chart, cancelling its requests, and withdraws the action until
       repaired. Both operations wait on the same records, so no state holds the segments alone.
   - **Unchanged:** CCDC Slice, Change Alerts and LandTrendr charts, `/ccdc/loadSegments`, Retrieve, previews and
     section marks.
   - **Limitation.** The runtime's `READINESS` work does not refresh records the listing has moved past (the image
     output's `REFRESH`); the backend check stays authoritative.

   Implemented (segments, backend):
   - **Direct CCDC.** CCDC declares `PIXEL_SEGMENTS`, needing only that its Classification and source imagery
     resolve, and the classifier requirement lists it. The request is judged and segmented as the submitted record
     with its AOI replaced by the clicked point, immutably; the old in-place `_.merge` is gone.
   - **Recipe reference.** The selected record is read (`loadRecipe$`, shared with the operation's reads) and held to
     its `IMAGE_OUTPUT` readiness through `requireExecutable$`, before `withSegmentSource$`.
   - **Readiness alone describes nothing it builds.** `readinessOf` describes built sources only for the image
     output read (`describesBuilt`); `resolveImageOutput` and exports are unchanged.
   - **Asset.** Unchanged.
   - **The pixel** is built only once segments are available.

   GUI segment coverage (implemented):

   - CCDC's own chart action and open chart are held by both `PIXEL_OBSERVATIONS` and
     `PIXEL_SEGMENTS` (`pixelOperationsAvailability`, the panel's `CHART_OPERATIONS`), each judged at the clicked
     point and watched through the runtime. CCDC Slice's and Change Alerts' charts are held by their
     `ccdcSegments.chartable` source requirement and by their own `PIXEL_SEGMENTS`. That judges a recipe reference
     as its `IMAGE_OUTPUT`, over its own AOI (completed follow-up packet 3).

   Remaining boundaries:

   - **Asset segments.** An asset's segment layout is checked only by the GUI's source requirement.
   - **Change Alerts' observation route stays unguarded.** Its chart's observations are a bare `{model}` request,
     and `/timeSeries/loadObservations` judges nothing for a request without a recipe type. Only its segments are
     held to readiness (completed follow-up packet 3). The observation boundary is item 4 of the current delivery
     plan; see "Remaining boundary" below.
   - **Limitation.** The transitive reads behind `REFERENCE` remain an acknowledged limitation.

5. **Classification output compatibility: implemented for the outputs a configuration chooses (2026-10-20).**
   The collection compatibility rule checks input
   features, not whether the selected Classification can provide the outputs an analysis needs. Validate the required
   outputs through one shared capability declaration, rather than a consumer-specific classifier blacklist:
   - per-class probabilities require `MULTIPROBABILITY`; confidence in the predicted class (`PROBABILITY`) is not a
     substitute;
   - regression requires regression output support;
   - judge the outputs actually required by the analysis, without rejecting a Classification everywhere because one
     consumer cannot use it. Account for classifier configuration, including SVM subtype, where support differs.
   Use the same declaration for offered outputs, GUI candidate feedback, operation readiness and execution. Read
   capabilities from the Classification record without constructing or observing its image. Establish each GUI-supported
   consumer's needs from execution before extending validation; Change Alerts' inherited-settings policy stays separate.
   **Execution: fixed (2026-10-20).** `timeSeries/collection.js` no longer requests regression and probabilities
   unconditionally; that request had been exposed by SVM `C_SVC` refusing `REGRESSION`.
   - It classifies each image only for the outputs a request names, among those the Classification declares
     (`classificationBands`, which reuses `supportRegression` and `supportProbability`).
   - It refuses one the Classification does not declare with `UNSUPPORTED_CLASSIFIED_OUTPUT`, before evaluation.
   - A request naming only native bands reads nothing of the Classification.

   **What each consumer requires, from execution:**
   - **Time Series** requires no classified output. Its chart and download offer regression and probabilities as
     optional choices (`ui`), which the collection builds or refuses per request.
   - **CCDC** fits its breakpoint bands (`model.sources.breakpointBands`) in every segmentation, so a classified one
     is required; measures an export or chart adds are optional choices.
   - **Phenology** reads one band (`model.sources.band`), so a classified one is required.
   - **PyEO** reads only the categorical `class`, which every classifier provides, so it has no output requirement.
     Its baseline still builds the Classification's default outputs (`getImage$()` without a selection).

   **Capabilities: shared, by configuration.** `supportRegression` and `supportProbability`
   (`type/classification.js`) take the classifier's configuration (`model.classifier`); a type alone stays accepted,
   with that type's defaults. They follow Earth Engine's table of output modes
   (https://developers.google.com/earth-engine/guides/classification, "Classifier output modes"):
   - REGRESSION: Random Forest, Gradient Tree Boost and CART. Minimum distance's REGRESSION is a distance, not offered.
   - MULTIPROBABILITY: those three, Naive Bayes, and SVM `C_SVC` and `NU_SVC`. SVM `ONE_CLASS` offers only
     CLASSIFICATION; an SVM without a type is Earth Engine's default `C_SVC`.
   - A supplied decision tree is not in the table and offers only `class`. PROBABILITY is not used.
   `classificationBands` derives from them, so Classification's declared outputs, its preset visualizations, the GUI
   band choices (`sources.js`, given `classifier`) and execution's per-request refusal all follow the configuration.

   **Validation.** `classifiedOutputRequirement` (`recipe/classifiedOutputs.js`) is declared by CCDC
   (`breakpointBands`, for `IMAGE_OUTPUT` and `PIXEL_SEGMENTS`) and Phenology (`band`, for `IMAGE_OUTPUT`):
   - a classified output the selected Classification's record does not declare is `UNSUPPORTED_CLASSIFIED_OUTPUT`, at
     that field, naming `unsupported`;
   - so is one chosen with no Classification selected;
   - a record not yet held finds nothing, and its waiting is the closure's;
   - in the GUI (`classifiedOutputRequirements`), SRC is marked, the field says why (`form.getErrorMessage` on CCDC's
     breakpoint bands and Phenology's band), and a draft choosing one cannot be applied;
   - a saved choice the Classification does not provide stays shown as made (`withChosenClassifiedOutputs`,
     `sources.js`). Otherwise the form would drop it on its next render, unseen and as an edit. It can be taken back
     there, and opening the panel leaves it unedited. A native band no longer offered is still dropped as before.

   **Copied metadata.** `ui.classification` and the Sources panels now copy `model.classifier` beside its type, and
   open charts read it from the held record.

   Remaining boundaries:

   - **Old copies.** `ui.classification` copies taken before this change carry the type alone, interpreted as that
     type's defaults. Charts and Time Series Retrieve now prefer the held or resolved record; copied metadata is a
     fallback while unresolved, with classified requests held. Clearing the applied selection offers no capabilities
     from an old copy. Other metadata readers retain their documented copy policy.
   - **Optional choices.** Charts, downloads and exports offer only supported outputs, but a requested unsupported one
     is refused by execution alone. Request-dependent readiness is in the current delivery plan; its argument
     contract still needs design.
   - **PyEO's baseline** builds outputs it does not read.
   - **Uncertain types.** SVR types are not offered by the GUI. A supplied decision tree's output modes are not
     documented.
   - **Native-band readiness.** Readiness still judges the classifier inputs of a native-band request that no longer
     classifies anything. Making it band-sensitive would change the agreed policy and needs band-aware readiness
     arguments, so it is a separate decision.

**Change Alerts inherited settings: implemented (2026-10-21).** Change Alerts monitors only bands its imagery observes
natively, and uses no Classification.

The audit found:
- **The incidental copy.** `referenceObservation.js` merged the producer's whole `sources`, so `classification` and
  `breakpointBands` were copied as well as the monitoring settings.
- **No reachable classified output.** No reachable configuration monitors one: Sources offers native bands, and
  `MONITORED_MEASURE` judges against native observed measures.
- **It still blocked.** The copied Classification was still a dependency, so one the user could not read - a shared
  segments asset's `recipe_sources` naming another user's - refused the export
  (`Recipe could not be read: <id>`) and held previews and Retrieve.

Implemented:
- **Dependencies.** CHANGE_ALERTS' `directSources` are its reference and, for Planet, its source assets;
  `executionNeeds` drop `CLASSIFICATION_SOURCE`. A referenced recipe's own dependencies still count through the
  reference's closure, so a referenced CCDC's unreadable Classification still refuses it. A segments asset needs none
  of its producer's.
- **Prefill.** It no longer proposes `classification` or `breakpointBands`. The other monitoring settings, and the
  rule that unchanged producer settings observed again leave user edits alone, are as before. Whether they changed is
  judged on the same monitoring-only projection, so a producer changing only its Classification or breakpoint bands
  leaves user edits alone. Saved copies are kept,
  inert; no migration or cleanup.
- **A Change Alerts-owned rule.** `CLASSIFIED_MONITORED_BAND` (`type/changeAlerts.js`, using `isClassifiedOutput`) is
  found at `['model', 'sources', 'band']` for a monitored band a Classification computes. Execution
  (`timeSeries/changeAlerts.js`) refuses it with the same code, and builds the monitoring collection without
  `classification`.
- **GUI.** The saved band stays shown as chosen (`withChosenClassifiedOutputs`). `MONITORED_MEASURE`'s refusal at the
  band says that Change Alerts cannot monitor a classified band (`process.source.segments.measureClassified`), and
  choosing a band of the imagery repairs it. No output declaration was added for the code: Change Alerts' editor drafts
  are judged without the runtime's answers (`sourceCandidate.js`), which such a declaration would require.

Remaining boundary:
- **Observation requests.** The GUI's bare observation request (`changeAlertsRecipe.js`) no longer names the copied
  Classification. That is no server-side guarantee: `/timeSeries/loadObservations` judges nothing for a request
  without a recipe type, and does not take every bare `{model}` for Change Alerts' collection. Redesigning that route
  is separate.

**LandTrendr is excluded** from
the classifier-validation rollout: its current Sources GUI does not offer a Classification, despite the shared
backend accepting that field. Do not add work solely for hypothetical or legacy configurations.

Use failing witnesses and nearby tests while editing, then one focused verification campaign and static checks,
with at most two workers. Do not broaden into repeated suite sweeps without a concrete unresolved concern.

The following detailed decisions and limitations are deferred beyond the current delivery round. They are not a
second execution queue:

- **Remapping unused selections: source-type policy.** The new check covers bands constraints read. Live sampling in
  `remappingSourceBands.mjs` shows an unused missing asset selection executes, as does one through Stack (requested
  names filter its mappings). An Asset recipe explicitly selects all requested names and fails for the same unused
  selection. Decide that compatibility policy before adding broader validation or changing execution. Do not revive
  the rejected editor-assessment framework merely to mark unused selections.
- **Reference-feedback navigation.** Both the directly selected recipe name and each originating recipe name should
  eventually be links, each with a small open icon as part of the link. Put those actions in persistent error details
  or a suitable interactive popover, not an ordinary tooltip. IDs and display names are already retained separately.
  Links, popovers and modal changes are deferred; do not infer additional routes through diamond graphs.
- **Recipe-tab readiness indicator experiment (2026-10-19).** Try a small standard indicator on open recipe tabs for
  confirmed execution problems, including upstream blockers, and evaluate how it feels with several recipes open
  before deciding to keep it. Reuse current readiness answers; tab decoration must not start extra acquisitions.
  Pending or temporarily unavailable evidence is not an invalid-recipe mark. Suppress error marks during initial
  setup, and distinguish normal unfinished work such as Classification awaiting collected training data from errors,
  preserving the existing presentation policy. Describe readiness as the result of implemented checks, not a complete
  validity or Earth Engine success guarantee. Keep this as a deferred UI experiment; no implementation is scheduled.
- **Refresh scope.** An explicit source-asset refresh restores all dependent questions even when the asset token is
  unchanged. Refreshing only a downstream output refreshes its question, not independently held upstream output
  questions. That existing refresh policy was observed during this packet and was not broadened.
- **Stack aliases and Band Math deleted outputs: policy decision, not reference repair.** The audit found Stack
  excludes removed inputs from output immediately and discards their unreachable mappings on the next input Apply;
  re-adding a source can replace `custom_red` with `red`, leaving downstream consumers of the alias blocked.
  Band Math deletes direct output selections and custom names when their input, band or calculation is removed,
  while dependent calculations survive. Restoring discarded configuration requires an explicit retention policy.
  Neither behaviour is covered by reconnecting preserved references, and no restoration policy is agreed yet.
- **Other constraint editors: no reconnection work identified.** Inspection found Index Change targets fixed
  comparison bands, Asset Mask targets the current image, and Asset Filter targets its properties. They do not
  reference removable input UUIDs. Missing-band/property compatibility is a separate question; no mounted audit
  was performed for these callers.

- **Source-editor consistency audit (2026-10-19): no confirmed defect; the date-format policy is aligned.** The
  shared input editors (`panels/inputImagery` for Stack and Remapping, its Band Math copy,
  `panels/inputImageryWithDerived` for Classification, Regression and Unsupervised Classification), Change Alerts REF,
  BAYTS REF and CCDC Slice Source open
  an unchanged source unedited, keep a saved band its source lost, marked, keep saved configuration through pending
  and failed reads, and keep separate Asset/Recipe drafts or start the other kind over as each documents. Their kind
  switches show no premature required error: cleared fields are either not shown or skipped for the kind now shown.
  - *Date representation of a newly chosen asset.* Decided: an asset chosen that declares one, `0` included, sets it;
    one declaring none keeps what is configured, which is no claim that it matches; with neither, it stays unset and
    Apply held. Change Alerts REF (`changeAlerts/panels/reference/assetSection.jsx`, `referenceRequirement.test.jsx`)
    now does as CCDC Slice's source already did (`ccdcSlice/panels/source/assetSection.test.jsx`).
  - *Section switching from the derived input imagery list.* Fixed: `panels/inputImageryWithDerived/inputImagery.jsx`
    now permits only its image editor (`{inputImage: 'allow'}`), as `panels/inputImagery` does. It no longer
    overrides the fallback with `{_: 'allow'}`. Over a clean list another section opens and closes it, and the wizard
    keeps other sections closed (`inputImageryPolicy.test.js`). The composed policy is `recipeFormPanelPolicy`.
  Open items:
  - *Duplication to fold into the form consistency work below:* Band Math's input editor copies
    `panels/inputImagery` with `name` for `band`; Class and Index Change each keep their own cleared-selection flags;
    `panels/inputImageryWithDerived/imageForm.jsx` relies on picker cancellation for late answers rather than the
    explicit selected-source check the other editors make (covered by `inputImageLifecycle.test.jsx`).

Remapping's source-identity recovery and shared constraint-reference validation are complete, including manual
verification of blocking and recovery through a second Remapping. Already-broken constraints with no retained
identity still need one explicit repair; this is an accepted limitation, not a request for historical reconstruction.

**Broader coverage, deferred beyond this round:**

- geometry operations and readiness for named map products;
- other GUI-only and Earth Engine-only rules, subject to a separate audit and scope decision;
- whether Preview and the LandTrendr chart route adopt the check, with Preview's cost measured first.

`TRAINING_DATA` and CCDC's pixel-observation operation are already implemented. Remaining classifier-training
coverage and Change Alerts' observation boundary are in the current delivery plan, not additional follow-ups here.

**Later: shared form validation consistency.** Defer the broader review and refactoring until after the current
validation/readiness work and nearer-term UI fixes. The immediate Masking correction can establish the intended
behaviour without migrating other forms. Review shared controls and panel workarounds to separate validity from error
visibility: new required fields remain neutral through first focus, show errors after leaving them, retain errors on
refocus and clear them promptly when corrected. Distinguish user edits from initialization and programmatic resets;
verify autofocus and treat interaction with a picker's options as staying within that field. Preserve immediate
explanations for broken saved configurations and keep invalid actions blocked independently of visible errors.
Simplify the shared defaults so callers inherit consistent behaviour, with explicit exceptions only where needed.
Inputs to that work: the per-editor cleared-selection flags (Class and Index Change), candidate feedback's
`quietWhileEdited` opt-in (`recipeFormPanel.jsx`), and the duplicated input editors listed above.

## Source description

Names remain open, but the contract needs these separations:

```js
{
    reference: {type: 'ASSET', id: 'projects/project/assets/image'},
    executionReference: {type: 'ASSET', id: 'projects/project/assets/image'},
    observedAt: 1780000000000,
    fingerprint: 'canonical-whole-source-fingerprint',
    output: {kind: 'IMAGE', bands: [/* ordered schema and export requirements */]},
    presentation: {
        productPresets: [],
        transformationTemplates: []
    },
    capabilities: {},
    evidence: [],
    status: 'READY'
}
```

Use one conservative fingerprint of the whole resolved description and recipe graph to invalidate that description
initially. A forgotten field must over-invalidate rather than leave stale pixels or schema silently valid. A
consumer with an explicitly named product derives its narrower operation-input fingerprint at that product boundary;
it does not use the whole-description fingerprint as proof that an expensive result changed. Fine-grained
data/schema/presentation revisions require measured evidence before introduction.

Stable diagnoses include a code and dependency path. At minimum distinguish pending, transiently unverifiable,
missing, forbidden, incomplete, cyclic and incompatible.

## Coherent execution bundles

Execution bundles are a later milestone, not a prerequisite for Masking dependency safety, Apply-mask
stabilization, constant Fill or direct asset Fill. Caller-authorized loading and recipe revisions returned
atomically with content already exist. Bundles additionally require coherent graph acquisition and a trusted
task-acceptance boundary.

The current recipe `update_time` is a plain second-resolution SQL `TIMESTAMP`. Two saves in one second are therefore
indistinguishable, so it must not be used as a coherent-build revision or cache key, and equal timestamps never
establish unchanged content. The Recipe service persists a server-owned monotonic `revision` atomically with
recipe content and enforces optimistic concurrency on save. That revision also provides ordering evidence for
future websocket events and cache invalidation. It is distinct from `typeVersion`, the recipe schema-migration
version.

Recipe list, load and save expose the committed revision, and the same revision always returns the same
execution-relevant content. Future batch or closure operations must preserve that contract. Coherent construction
uses the ordinary load, which returns content and revision from one committed row, plus the graph-wide snapshot
protocol. A save carries an expected revision and returns the committed one. `update_time` remains useful for
display and audit only.

Websocket revision events and semantic no-op saves are future work. An event must be published only after commit
and carry at least recipe ID and revision, allowing clients to ignore duplicate or out-of-order events before
fetching changed content. A no-op save should return the existing revision and publish no event.

Semantic no-op detection compares normalized content, which requires defined normalization — transient UI state
excluded, key order irrelevant, meaningful array order preserved, value types preserved, migration and default
semantics versioned. Raw gzip or JSON byte equality is not authoritative. Where no-op detection is phased in after
the initial revision implementation, spurious increments only over-invalidate: consumers re-resolve, and an
unchanged product fingerprint still preserves their results. The complete storage contract is owned by
[source-freshness.md](source-freshness.md).

A content digest is not required for this protocol. It may be added later for a concrete provenance, integrity,
cross-record deduplication or immutable-content requirement. If introduced, its bytes and canonicalization belong
to the trusted persistence or bundle boundary; browser freshness must not serialize large recipe models to
manufacture storage identity.

An execution bundle is a resolved recipe graph, not a cache entry:

```js
{
    bundleSchemaVersion: 1,
    rootRecipe: {/* submitted outer recipe without UI state */},
    recipesById: {/* transitive referenced recipes, deduplicated */},
    assetObservationsById: {/* authorization-scoped metadata evidence */},
    fingerprint: 'canonical-resolved-graph-fingerprint',
    verification: {
        state: 'VERIFIED',
        observedAt: 1780000000000
    }
}
```

Bundle construction happens server-side under the caller's authorization. Missing and forbidden targets are
reported without disclosing details the caller is not allowed to learn.

The trusted boundary discovers and binds source-adapter and temporal-composer commands from the authorized bundle,
or revalidates a server-built frozen command under the exact supported contract version. A browser-built plan is
preflight evidence only and is never accepted as task authority: a client must not be able to alter entries,
references, adapter parameters, planner-owned encoding or named operations after validation. Direct dependencies
come from the command skeleton consumed by both graph construction and execution.

Loading the graph sequentially is not itself atomic. The builder records each recipe revision, resolves the full
closure, then rechecks those revisions. If any changed during construction, it retries the complete build a
bounded number of times or reports a changing-source error. The accepted bundle contains complete recipe models,
not references that the task worker later reloads.

Bundle construction is the coherent form of the request-scoped snapshot cache that
[source-freshness.md](source-freshness.md) requires at every execution boundary: one snapshot and revision per
recipe ID per operation, so a single build can never mix two revisions of the same recipe. The snapshot cache is
useful before bundles exist and remains correct alongside them.

### Preview

Each Preview request builds a fresh ephemeral bundle and evaluates that bundle. It is coherent for that request
but is not pinned for later use. A subsequent source edit should update the preview; it should not mutate a preview
already in flight.

### Retrieve

Retrieve builds a new bundle when the task is accepted and stores it with the task payload. Task execution resolves
recipe references only from that bundle. The UI records which preview fingerprint was last shown and can indicate
when the submitted bundle differs; it must not imply that an old preview and a later export are identical.

SEPAL recipe authorization is checked when the bundle is constructed. A later recipe deletion or loss of SEPAL
access does not revoke an accepted task. Earth Engine assets are not pinned: their permissions and availability
remain live and may still fail or drift during execution.

### Bundle compatibility and limits

Execution accepts only `bundleSchemaVersion` values the worker explicitly supports. An unsupported schema fails with
a controlled resubmission error; it is never interpreted using the current schema and does not fall back to live
resolution. Supporting an older bundle schema requires an explicit parser. Adapter, composer and measurement
contract versions are validated separately and do not preserve known algorithm defects; corrected behavior is the
only supported behavior for those cases.

Depth, node count and serialized bytes are independent safeguards:

- depth bounds traversal and diagnostic paths;
- node count bounds graph complexity and repeated work;
- serialized bytes bound database, HTTP, worker-transfer, latency and memory cost, including a single unusually
  large recipe model.

Initial values are derived from the complete storage and transport path plus measured serialization, transfer
latency and peak worker memory. Declared database and HTTP maxima alone are not practical limits. Oversized bundles
fail during submission with a controlled graph-too-large diagnosis. External manifest storage is considered only
if valid measured graphs cannot fit a conservative task-payload limit.

## Earth Engine assets

Assets remain `ASSET` sources even when produced by SEPAL. A `recipe_id` property is provenance, not a dependency
edge.

Earth Engine does not report the pyramiding policy used to create an asset. Asset observation therefore obtains
ordered band names and array dimensionality from the current image's band-type metadata. Array-valued bands receive
the physical-schema `sample` requirement above; scalar bands do not acquire a policy from `recipe_type`, naming
conventions or visualization properties. An asset containing any still-unresolved required band remains unavailable
rather than returning a partial executable description.

Earth Engine image assets expose `system:version`, which is useful as a change token when normalized as an opaque
string. It is invalidation evidence, not a promise that later execution is pinned to those pixels; bundle
construction therefore still stores observations rather than claiming to pin the asset. `updateTime` remains
weaker display and fallback evidence. ImageCollection observations follow each consumer's explicit policy: first
member, homogeneous collection, union, intersection or another bounded rule. Until verified against the live API,
do not assume every membership change relevant to such a policy advances the collection's `system:version`.

For execution:

1. Observe and validate required asset metadata while constructing the graph.
2. Record the observations in the execution bundle and task audit data.
3. Observe them again after execution where practical.
4. If they changed, report drift and apply an explicit output policy; do not claim which version Earth Engine
   evaluated.

Possible policies for a drifted completed export are fail-and-delete, retain-but-mark-suspect, or require user
acceptance. The policy must account for GEE, Drive and SEPAL destinations and is an open product decision.

## Provenance evidence

Use three evidence tiers:

1. **Verified physical schema**: authoritative for bands, types and grids Earth Engine reports.
2. **Versioned SEPAL provenance**: interpretation evidence for verified bands.
3. **Legacy provenance and naming conventions**: contract-specific compatibility evidence only where an explicit
   adapter defines and validates that legacy format; never generic compatibility authority.

Record authority with the individual fact or evidence item. A resolved description can combine observed physical
schema, producer-declared semantics and unresolved fields, so one source-wide confidence enum would hide important
differences.

Provenance may interpret only a band verified to exist. This still does not make mutable properties authoritative:
incorrect date formats or categorical meanings can change calculations even when the named bands exist. Semantics
that cannot be verified physically require trustworthy declared or versioned evidence. Otherwise they remain
insufficient for semantic and relational requirements.

New exports should write a minimal provenance schema version, execution-bundle fingerprint, source-observation
summary and relevant adapter, composer, algorithm or capability contract versions. These versions describe
deliberate supported contracts; they are not a history of implementation defects. Do not generalize the current
practice of exporting the entire recipe model. Detailed manifests belong in task audit storage unless an explicit
sharing policy allows them on the output asset.

Mutable asset properties cannot establish trusted provenance by themselves. The eventual verification record lives
at a trusted boundary and binds at least:

- the Earth Engine asset ID;
- asset revision or replacement evidence;
- the accepted task or execution-bundle fingerprint;
- a digest of the observed exported physical schema;
- a digest of the bounded, canonically serialized presentation envelope;
- relevant capability, transformation, adapter, composer and algorithm contract versions.

Verification reads current asset evidence and requires every bound value to agree. An asset replacement or metadata
edit cannot retain authority merely because the ID is unchanged. `system:version` is useful revision evidence but
is not scientific provenance and does not replace schema and envelope verification. The exact trusted storage,
canonicalization, digest algorithm and post-export verification protocol remain implementation decisions.

A structured presentation envelope can be parsed without trusted provenance, but its transformation templates
remain presentation data and cannot establish or activate a capability. An unsupported declared envelope version is
invalid; it never silently acquires authority through the legacy parser.

CCDC Segments assets have an established pre-envelope format that must remain readable. The CCDC capability owner
may recognize that format from the observed segment-band structure and required CCDC metadata, including its date
representation. Once that structural asset contract is admitted, legacy `visualization_*` records with logical
`baseBands` are interpreted as `CCDC_SEGMENT_SLICE` templates. They configure a known transformation; they are not
the evidence that admitted the capability. No generic asset adapter infers CCDC semantics from visualization names.

Known defects are corrected before the affected contract is declared. Resolution does not branch on asset creation
date, invent a legacy algorithm version or reinterpret an old asset to work around a historical bug. Physical asset
observation can verify bands, dimensions and other reported structure, but cannot recover the formula or
preprocessing that produced existing pixels. Affected historical assets remain the user's data and may need to be
recreated when correctness matters.

The operational disposition is explicit:

- physical-schema-only operations may use verified bands, dimensions and types;
- semantic or relational operations without sufficient provenance are unsupported with
  `INSUFFICIENT_PROVENANCE`;
- known-bad provenance blocks the affected semantic operation;
- recreating the asset under the current corrected contract is the normal remediation.

These provenance restrictions apply to facts the operation actually requires. CCDC Slice can operate from the
validated structural CCDC asset contract and does not require proof of the original recipe or execution bundle.
Relational consumers such as Change Alerts may require stronger measurement and observation-protocol provenance;
acceptance by CCDC Slice does not automatically satisfy those requirements.

Do not introduce `USER_ASSERTED` or another generic provenance override until a separate design establishes its
trust boundary, audit record and user experience. An unverified assertion never becomes verified evidence merely
because a user supplied it.

Sampling Design's focused algorithm version and reproduction metadata are useful precedent, but its Earth
Engine-specific module is not the common source-contract owner.

## Legacy policy

Saved source snapshots and unversioned asset provenance may populate an initial display while current evidence is
loading. They never prove compatibility and are never silently rewritten.

- A successful refresh replaces runtime evidence, not the user's selections.
- A removed requirement remains visible and invalid.
- Known-bad state blocks Preview and Retrieve.
- Transient runtime failure remains `UNAVAILABLE`; it does not become compatibility evidence or satisfy a semantic
  requirement.
- Newly edited recipes migrate to the current model schema deliberately; opening a recipe does not rewrite it.

Tightening validation will expose recipes that only partly work today. Each activated recipe path must measure this
before strict enforcement expands to another family.

CCDC Slice migration must preserve existing working Earth Engine assets. Legacy assets do not carry an adapter ID,
so the CCDC capability owner provides a narrow structural recognizer rather than a generic metadata guess. It
validates the required segment bands, dimensionality, date representation and other inputs Slice actually consumes.
Compatible `visualization_*` and `baseBands` fields then supply transformation-template configuration.

The same admitted capability and templates pass through Masking when its explicit transformation effects preserve
the CCDC structure. This supports both a direct asset and a CCDC asset behind a Masking recipe without teaching
Masking about CCDC. A subset or value-changing transformation can reduce or drop them. New structured provenance
may strengthen later consumers, but it is not a prerequisite for CCDC Slice and does not replace the legacy reader.

## Implementation boundary

Extend the existing generic `IMAGE_OUTPUT`, producer-step and observation contracts one consumer at a time. Keep
an explicit coexistence boundary for unmigrated Retrieve paths. Adding a capability must not introduce another
resolver or type checks in Masking. Constant Fill needs no dependency; direct asset Fill uses the linked Earth
Engine identity. Recipe Fill must define its acquisition and execution requirements over caller-authorized loading,
without presenting browser preflight as trusted execution evidence.

The current segment consumer contract above does not yet provide coherent bundles or structural admission of all
legacy assets. Use CCDC Slice as a witness for those extensions, covering:

- direct CCDC recipes;
- existing and new CCDC assets satisfying the validated structural CCDC asset contract;
- CCDC assets behind Masking and other transformations that preserve that contract;
- the optional Classification dependency of a CCDC recipe;
- Asset wrappers and explicitly supported decorators;
- exact physical-to-semantic-to-Slice-output band derivation;
- Preview and Retrieve through live and bundled resolution contexts.

The `CCDC_SEGMENTS` capability will advertise only measures supported by verified stored bands. For example, break
confidence requires both magnitude and RMSE. CCDC Slice derives its own `IMAGE_OUTPUT` product from this capability
and its local date mode and options. `CCDC_SEGMENT_SLICE` also owns transformation-template validation, derivation of
required physical timing and measure evidence, and materialization into concrete Slice output visualizations.

## Observability

Emit low-cardinality Prometheus metrics and access-controlled structured logs for:

- resolution duration, graph depth, node count and serialized bundle size;
- bundle retries caused by changing recipe revisions;
- missing, forbidden, cyclic, incomplete and incompatible outcomes;
- live versus bundled resolution;
- verified execution and fail-closed handling of insufficient evidence;
- asset drift detected after task execution;
- provenance tier used and capability version.

Do not use recipe IDs, asset IDs or usernames as metric labels. They may appear in access-controlled structured
logs where operationally necessary.

Once the corresponding paths are activated, the following counters represent contract violations and should
remain zero: resolution without an explicit principal, unauthorized cross-owner resolution, missing recipe
definitions, invalid or undeclared edges in inventoried recipe types, bundled execution attempting a live load,
and unsupported bundles being interpreted. Any non-zero value requires investigation. Latency, retry, graph-size
and user-diagnosis alert thresholds are set by the first production consumer of each mechanism rather than guessed
globally.

## Verification

Pure shared tests own traversal, diamonds, role handling, cycle paths, capability preservation, canonical
fingerprints, explicit band mappings, capability reduction, bundle limits, coherent-revision retry decisions,
legacy evidence and expectation validation.

GUI, GEE and Task each need one environment-level import/execution witness for the shared contract. Masking adds
focused boundary tests for its activated traversal and execution behavior. The later bundle slice proves that
Preview uses an ephemeral bundle, Task uses only its stored bundle, and missing bundle members cannot fall back to
live loading.

Temporary browser closure-loading tests prove frontier deduplication, diamond reuse, direct and indirect cycle
termination through the shared graph builder, exact-root and session-record precedence, rejection of extra or
duplicate returned records, controlled graph limits, cancellation of outstanding reads, and fail-closed handling of
missing or forbidden dependencies. A second operation after the session catalogue changes takes a new snapshot;
an operation already in flight never mixes catalogue versions.

Live verification covers representative recipe and asset graphs, actual CCDC bands, asset replacement during
execution and every supported export destination. A permanent two-user authorization test proves that an owner can
resolve a fixture recipe, another user cannot resolve the same ID, and neither a cache nor administrator service
credentials bypass the requested principal.

## Open decisions

- Exact initial capability shapes and versioning after the provisional generic categorical fields are exercised.
- Measured bundle depth, node and serialized-byte limits across the complete task path.
- Coherent-build retry count and the optional integrity/provenance requirements, if any, that would justify a
  persisted content digest.
- Normalization rules behind semantic no-op detection, websocket event ordering and dirty-draft conflict behavior.
- Batch recipe endpoint transport details in the Recipe service.
- Whether and where detailed task manifests are retained.
- Output handling when asset drift is detected after completion.
- ImageCollection membership behavior of `system:version` and the fallback evidence required when it is
  insufficient.
- Trusted provenance storage, canonical serialization, digest algorithm, size limits and post-export verification
  protocol for semantics that physical asset schema cannot verify.
- User-facing distinction between a preview fingerprint and a later submitted bundle.
