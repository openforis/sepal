# Source resolution, dependencies and execution

Technical design for resolving recipe and Earth Engine asset sources into a coherent graph and freezing that
graph for execution. This document owns authorization and task atomicity. Live refresh policy belongs in
[source-freshness.md](source-freshness.md). Product identity, output-band description fields, declaration semantics
and the distinction between canonical output and map-only products belong in
[output-products.md](output-products.md). This document owns the traversal and evidence machinery that resolves
those declarations.

[Recipe behavior contracts](behavior-contracts.md) defines the user-facing design guidance for configuration,
validation, repair and recovery. It separates operation prerequisites from deliberate analysis policies and provides
the behavior questions to answer before extending these declarations or their presentation.

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
- **Analysis prerequisites** are the exception to inheriting nothing: what the configured analysis needs whatever runs
  it (`analysisPrerequisites: {needs: {[role]: need}, requirements: [{code, findings}]}`, `output/readiness.js`). Every
  operation the type declares and every map product it names is held to them; an operation adds its own needs and
  requirements and may not name a role the prerequisites need, so it cannot weaken them. A named product is read as an
  operation by its name: the prerequisites, the `executionNeeds` and `configurationRequirements` naming it, and
  `REFERENCE` for any other role. Its readiness is read beside its configuration-only description (`readReadiness`),
  never through the canonical image, so a product neither describes nor builds that image to be judged; the read
  acquires only the evidence its needs name. A product of a type declaring none of these is not judged
  (`judgesMapProduct`) and its layer draws from its description alone, as before. Time Series and CCDC declare the
  selected Classification so (S3); CCDC's count adds the breakpoint bands' classified-output requirement, since it
  collects them. Phenology keeps its operation-scoped, conditional policy. LandTrendr's annual mosaic, BAYTS Alerts'
  radar observation and Change Alerts' collection mosaic declare none and are unchanged.

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
    `jobs/ee/timeSeries/loadObservations.js`) is held to the readiness its recipe's type declares for observations of
    the requested bands, before the pixel geometry or the collection is built or anything evaluated. It is judged as
    `PIXEL_OBSERVATIONS`, and, where a requested band is an output the Classification computes, then for that output's
    capability and as `CLASSIFIED_COLLECTION` (`requireRequestedBands$`, `jobs/requestedBands.js`; see "CCDC's
    requested chart bands"). This uses `requireExecutable$` in `jobs/executionReadiness.js`, over `settledReadiness$`
    and `readReadiness`.
  - **Time Series and CCDC** declare both operations, needing the Classification's `CLASSIFIER` readiness for the
    stage (`CLASSIFIED_COLLECTION_NEEDS`), and the classifier-input requirement lists both.
  - **What the read describes.** Nothing of the recipe's own image is described: neither the Time Series count nor
    CCDC's catalogue. A requirement asking for its inputs' observed bands still has them acquired, and their failures
    reported, as any read's are.
  - **The point stands in for the AOI.** The recipe judged has its AOI replaced by the clicked point, without changing
    the one submitted. An AOI the chart does not read is no dependency of it.
  - **Undeclared types.** A typed recipe whose type declares nothing for the operation is refused
    (`UNDECLARED_OPERATION`).
  - **Change Alerts (implemented 2026-10-21).** Its chart sends the applied Change Alerts recipe. The job derives the
    collection it monitors with `observedCollection` (`lib/js/shared/src/recipe/changeAlerts/observedCollection.js`),
    beside `mosaicRecipe.js`. That is a `TIME_SERIES` recipe, keeping the Change Alerts id, built from:
    - its Sources without the copied `classification`;
    - its options;
    - the calibration start to monitoring end from `monitoringDates`.

    That recipe is held to Time Series' `PIXEL_OBSERVATIONS` at the clicked point, before the pixel or collection is
    built, and is what `getCollection$` builds. So the request names its real consumer, and is judged by declarations
    that already describe that collection.
    - **Not read:** the reference, whose segments the chart plots beside the observations and which observations never
      execute, is not in that recipe, so its closure is not loaded. Neither is a Classification the Sources copied.
    - **Not over-read:** passing the whole Change Alerts recipe with its existing declarations would not do. The
      closure loads every declared edge, so it would read the reference and its own dependencies. A witness at the
      previous job showed a typed Change Alerts request refused for an unreadable reference.
    - **Refusals:** an incomplete monitoring period is refused before any chart work, and so is a Planet Sources entry
      that names no asset (`MALFORMED_REFERENCE`). Settings naming no recipe type are refused with a 400 instead of
      bypassing readiness.
    - **Compatibility:** Time Series and CCDC requests, which name their recipe, are unchanged. A browser tab running
      the previous GUI, which sent the bare settings, is refused until it reloads.
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
  - Earth Engine's behaviour when training on a sample missing a property named by `band_order`: an error or a silently
    dropped sample. The browser check below establishes the preflight refusal, not that execution behaviour. Establishing
    the latter needs a separate controlled Earth Engine probe and is deferred, not a browser acceptance criterion.

  Normalisation of prediction imagery and reused Classification samples is implemented, with the live numerical
  verification recorded below; it is no longer part of this deferred list.
- **Manual check before pushing:**
  This is included in the consolidated browser batch, check 1 under "Verification status"; its recovery must produce
  an actual preview, not merely enable Retrieve.
  1. A Classification `Provider` over an image, with `IMAGE_BANDS [red, nir]` and a few collected points. A
     Classification `Consumer` over imagery with `IMAGE_BANDS [red, nir]` and its own points, plus a `RECIPE` data set
     reusing `Provider`. The consumer can be retrieved.
  2. Remove `nir` from `Provider`'s band set. The consumer's `Provider` data set names `Provider` and `nir`, and
     Retrieve is held.
  3. Restore `nir`. The mark clears and Retrieve is available again.
  4. Repeat for Regression.

Sample counts after masking and sampling are known only to Earth Engine.

**Classification consumers' training readiness (audited 2026-10-21; PyEO, Phenology, CCDC's breakpoint bands and
Time Series' chart band implemented).** Time Series' image and Retrieve, and CCDC's chart observations, reach their
Classification through `CLASSIFICATION_SOURCE: REFERENCE`. That checks only that it resolves, so none of the
Classification's training checks apply to them. PyEO Alerts needs its Classification's `IMAGE_OUTPUT`. Phenology, for its image, and CCDC, for its image
and segments, need its `CLASSIFIER` where a saved band - Phenology's `band`, CCDC's `breakpointBands` - is classified,
and keep `REFERENCE` for native bands.

- **Confirmed behaviour.** When the shared collection (`timeSeries/collection.js`) uses a Classification, it reads the
  record, calls `getTrainingData$()` with no bands and classifies each scene with `classifyImage`. `band_order` is
  therefore the Classification's own features. It uses one only for a requested `regression` or `probability_*` band,
  never for a decision tree (`supportRegression`, `supportProbability`), and never builds the Classification's image.

  | Consumer and operation | Uses the Classification when | Trains | Builds its image | Checked today |
  |---|---|---|---|---|
  | Time Series `IMAGE_OUTPUT` (count) | never (`bands: [0]`) | no | no | `UNSUPPLIED_CLASSIFIER_INPUTS` all the same |
  | Time Series pixel chart | the chart band is classified | yes | no | the Classification's `CLASSIFIER` readiness for a classified band (`CLASSIFIED_COLLECTION`), classifier inputs; output capability before training, refused as execution refuses it |
  | Time Series Retrieve | a Retrieve indicator is classified | yes | no | `IMAGE_OUTPUT` as before; then requested capability and `CLASSIFIED_COLLECTION` over the indicators each request builds |
  | Phenology `IMAGE_OUTPUT` | `sources.band` is classified | yes | no | the Classification's `CLASSIFIER` readiness for a classified band, classifier inputs, `UNSUPPORTED_CLASSIFIED_OUTPUT` |
  | CCDC `IMAGE_OUTPUT`, `PIXEL_SEGMENTS` | classified `breakpointBands`, or a classified export or map band | yes | no | the Classification's `CLASSIFIER` readiness for classified breakpoints, classifier inputs, breakpoint outputs; for export bands, requested capability and `CLASSIFIED_COLLECTION` over the measures they fit; map bands only at run time |
  | CCDC pixel chart (`PIXEL_OBSERVATIONS`, `PIXEL_SEGMENTS`) | the chart band is classified, or for segments a breakpoint band | yes | no | classifier inputs; the configured breakpoints' findings; then requested capability and `CLASSIFIED_COLLECTION` over the bands each request builds |
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
    - Phenology's `band` and CCDC's `breakpointBands` now select a conditional `CLASSIFIER` need (see "Phenology's
      configured classified band").
    - Time Series' and CCDC's chart bands add `CLASSIFIED_COLLECTION` (see "CCDC's requested chart bands").
    - Time Series Retrieve indicators add it too (see "Time Series Retrieve's classified indicators").
    - CCDC's export bands add it too: to Earth Engine assets (see "CCDC's requested export bands") and to Drive and
      SEPAL (see "CCDC's Drive and SEPAL image exports"). Map bands, which previews request, are still request
      parameters readiness does not see.
  - **Native-band policy.** It refuses a Time Series count image, which never reads its Classification, for
    unsupplied classifier inputs.
  - **Run-time-only band checks.** Requested classified outputs are checked for capability only at run time, for every
    request-parameter consumer; for Time Series Retrieve and CCDC export and chart bands, training is too.

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
  - **Several input images** are refused only at run time (`classifyImage`, PyEO). PyEO's Sources panel checks this
    when proposing a selection, but that does not guard an applied selection after its Classification changes. The
    2026-10-23 browser recheck reproduced an internal layer error; the active S2 follow-up below calls for a shared
    single-input finding at SRC, acquired by client and server readiness.
  - **LandTrendr** declares `CLASSIFICATION_SOURCE` without a selector, and `landTrendr.js`'s comment about always
    resolving it is stale.
- **Manual check before pushing.** Add to the accumulated batch:
  Included in consolidated browser check 3 under "Verification status"; check 9 adds the SVM normalisation smoke run.
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
  passed (see "Verification status"). Step 3 belongs to the browser batch the user reported complete on 2026-10-23;
  unmentioned checks are passing under the user's reporting convention. Keep that report separate from the detailed
  numerical evidence and recheck affected smoke paths after execution changes.
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
  3. As browser smoke tests, open an ordinary Time Series `probability_*` chart and run a PyEO Alerts over an SVM
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
    follows the saved model. Phenology declares `[CLASSIFICATION_SOURCE]: classifiedOutputNeed('band')`, the
    `conditionalNeed` choosing `CLASSIFIER` where `band` is a classified output and `REFERENCE` otherwise (see "CCDC's
    breakpoint bands").
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
- **CCDC's breakpoint bands (implemented 2026-10-21).** CCDC's execution adds its `breakpointBands` to the collection
  bands of every segmentation: its image for exports and maps (`timeSeries/ccdc.js`) and its segments at a pixel
  (`loadSegments.js`). A classified breakpoint therefore trains the Classification for `IMAGE_OUTPUT` and
  `PIXEL_SEGMENTS`. `PIXEL_OBSERVATIONS` reads only the chart band and keeps `REFERENCE`.
  - **One owner for the need.** `classifiedOutputNeed(field)` (`classifiedOutputs.js`) is the conditional
    `CLASSIFIER` need of a recipe choosing classified outputs at `field`. It reads that field as
    `classifiedOutputRequirement` does, through the same helper, so need and output check agree on which bands count.
    Phenology declares `classifiedOutputNeed('band')` and CCDC `classifiedOutputNeed('breakpointBands')` for both
    operations. Phenology's inline condition is gone.
  - **Over a CCDC recipe.** CCDC Slice and Change Alerts reach it as their segment source, so they inherit the
    readiness through the traversal.
  - **GUI.** CCDC's Sources declares `classificationReferenceFeedback`. Its local breakpoint-output validation and
    retained invalid choices are unchanged.
  - **Unchanged and deferred:**
    - optional chart, export and map bands, which are request-dependent and add no request contract;
    - `PIXEL_OBSERVATIONS`;
    - the native-band policy;
    - normalisation.
  - **Regressions:**
    - `classifiedOutputTraining.test.js`, which replaces `phenologyClassifier.test.js`, runs every case above for
      Phenology's `IMAGE_OUTPUT` and CCDC's `IMAGE_OUTPUT` and `PIXEL_SEGMENTS` (42 tests). Reverting CCDC's need
      fails its 17 classified cases; the Phenology rows and the native and decision-tree cases pass either way.
    - `referencedSegments.test.js`: its SVM fixture stores points, so a classified breakpoint over it is refused for
      the output alone.
    - Mounted (GUI):
      - `ccdc/classificationFeedback.test.jsx`: the field explained, Retrieve held, Apply available, repair, a native
        control, and a retained invalid breakpoint;
      - `ccdc/panels/classifiedBreakpointChart.test.jsx`: an open chart closes, cancels its segment request and disables
        its button when training becomes invalid. Repair re-enables it, a new pixel requests segments again, and native
        breakpoints keep it open;
      - `chartPixelButton.test.jsx` and `pixelObservationsChart.test.jsx`: their Classification fixtures, under a
        classified breakpoint, now store points over a mosaic described from configuration.
    - gee:
      - `ccdcAssetExport.test.js`: an export refused with `NO_TRAINING_DATA` before anything is built, then exported
        after repair, with a native control. The file now stubs Earth Engine for its asset reads;
      - `loadSegmentsReadiness.test.js`: segments refused before any collection is built or evaluated, then read after
        repair, with a native control.
- **Regressions.**
  - **Shared:**
    - `recipeType.test.js`: `conditionalNeed` validation. A predicate that is not a function, a branch that is no need,
      a missing branch or a nested condition are refused at registration, while a valid one is retained.
    - `classifiedOutputTraining.test.js` (formerly `phenologyClassifier.test.js`), Phenology with a classified band over:
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

**Time Series' classified chart band (implemented 2026-10-21).** A band a Time Series chart observes that its
Classification computes (`regression`, `probability_*`) trains that Classification and applies it to every image at the
pixel (`collection.js`). The operation below, `CLASSIFIED_PIXEL_OBSERVATIONS` chosen by `pixelObservationsOperation`,
has since been generalised as the stage `CLASSIFIED_COLLECTION` (see "CCDC's requested chart bands"); this entry keeps
the names it was implemented with.

- **Gap (confirmed by failing witnesses before the change).** The request was judged as `PIXEL_OBSERVATIONS`, whose
  `CLASSIFICATION_SOURCE` need is `REFERENCE`. So `/timeSeries/loadObservations` built and evaluated the collection,
  and the GUI requested it, over a Classification that stores no points, one reusing a recipe without input imagery,
  or one reusing a recipe that samples fewer features than it trains on. Native bands over the same Classifications
  read none of their training data, and are rightly answered.
- **Why the request has to count.** The band is a request argument: unlike Phenology's `band` and CCDC's
  `breakpointBands`, no model holds it, and readiness reads only records and evidence. A static `CLASSIFIER` need would
  refuse native-band charts that never train, which would change the native-band policy. Stale capability options are
  no reason: the resolved-record view already fixed those.
- **Alternatives compared.**
  - *Request arguments to readiness* (`executionNeed(…, request)`, `when(model, request)`, scoped to the root). Every
    place that identifies a question by operation would also carry the bands: the GUI's session-read cache, the
    acquisition key, `watchOutput$`, the runtime's asset interest and `requireExecutable$`. Yet readiness depends on the
    request by one fact, whether any band is classified. Keying by bands would split one question per native band, and
    keying by that fact is a second operation in disguise.
  - *The bands saved in the model.* Request parameters are not recipe configuration.
  - *A check of the Classification in the loader.* A parallel validator, outside the GUI's holds and attribution.
  - **Chosen: an operation the request chooses.** `CLASSIFIED_PIXEL_OBSERVATIONS` (`output/readiness.js`) is reading
    the observations of a band the Classification computes. `pixelObservationsOperation(bands)` (`classifiedOutputs.js`,
    with `isClassifiedOutput`) is the one place the bands decide. Readiness, the traversal, evidence acquisition, the
    server gate and every GUI identity are unchanged, since they already key by operation.
- **Declarations.**
  - Time Series: `CLASSIFIED_PIXEL_OBSERVATIONS: {CLASSIFICATION_SOURCE: CLASSIFIER, SOURCE_IMAGERY: REFERENCE}`. The
    Classification's own `CLASSIFIER` readiness supplies every training rule. `collectionClassifierRequirement` lists
    the operation, so the classifier-input policy is the same for both operations.
  - CCDC declares it with its `PIXEL_OBSERVATIONS` needs, so a classified CCDC chart band is not refused as undeclared.
    Holding it to training is CCDC's follow-up.
- **Server.** `loadObservations.js` judges `pixelObservationsOperation(bands)` over the recipe and bands it builds: at
  the pixel, and for Change Alerts the collection it monitors.
  - **Order and the capability contract.** A classified band is judged in the order execution finds things:
    `PIXEL_OBSERVATIONS` (closure, classifier inputs), then output capability, then `CLASSIFIED_PIXEL_OBSERVATIONS`.
    Capability uses the existing rule over the Classification's record (`unprovidedClassifiedOutputs`). It is read
    once per request, since the recipe scope caches it. An output not provided is refused with execution's own error
    (`unsupportedClassifiedOutput`, `lib/js/ee/src/timeSeries/classifiedOutputRefusal.js`, which `collection.js` now
    shares): a `ClientException`, 400, `UNSUPPORTED_CLASSIFIED_OUTPUT`. That holds whether or not the Classification
    can be trained.
  - **Cost.** A classified request settles readiness twice over one closure, and the second settling observes the
    Classification's inputs. Native requests are unchanged.
- **GUI** (`timeSeries/panels/chartPixel.jsx`).
  - **The action.** It and `CHART_OPERATIONS` stay `PIXEL_OBSERVATIONS`, so the action is band-independent and stays
    offered for native bands.
  - **The open chart.** While a classified band is charted at a pixel, the chart also reads and watches that band's
    operation (`BAND_OPERATIONS`) through `pixelOperationsAvailability` and `watchOperations`.
  - **Holds.** That band's gate holds the band without closing the chart: it reaches `pixelChartUpdate` with
    `withdraw: false`. So the existing hold, cancellation and recovery apply. Pending or unavailable evidence requests
    nothing, and a finding lets the request go and is said in the chart (`classifiedBandWithheld`). Another band can
    be chosen, and repair reads the band again. A finding of `CHART_OPERATIONS` still closes the chart.
  - **Unchanged machinery.** `recipeForOperation` treats the operation as a pixel operation. The draft gate holds the
    request until the Classification's save is acknowledged.
- **Abstraction cost.** One operation, one selection function and two declarations, plus, in the chart, a second
  availability read, a watch and a message. Nothing new for readiness to take, cache or load. The pattern costs an
  operation per request-dependent consumer, and does not extend to `IMAGE_OUTPUT`. CCDC's export and map bands are
  requested of its `IMAGE_OUTPUT`, which is also how other recipes consume a CCDC. The operation is a local answer to
  one binary distinction: assess a broader operation-context design before extending the pattern to Retrieve or
  exports.
- **Regressions.**
  - `classifiedOutputTraining.test.js` (shared): a Time Series row beside Phenology and CCDC. It covers every
    training finding at the recipe it concerns, a type training no classifier, repair, pending and unavailable
    evidence, a record not held, and native controls. A supplied decision tree is refused for nothing by readiness: the
    route refuses output capability.
    - Its `settle` helper used to settle `IMAGE_OUTPUT` whatever operation it was given, so the CCDC `PIXEL_SEGMENTS`
      row's unavailable case passed through CCDC's image. It now settles the operation itself. Reverting that need
      fails the case.
  - `loadObservations.test.js` (gee):
    - each training finding is refused before any chart work, and the request is answered after repair;
    - unobservable input fails as a read;
    - an unprovided output is refused with the 400 `UNSUPPORTED_CLASSIFIED_OUTPUT` client error before any chart work,
      over a trainable and over a point-free Classification, but only after unsupplied classifier inputs, as before;
    - native bands over each broken Classification are answered without observing its input;
    - a CCDC classified band is answered.
  - `timeSeries/panels/classifiedBandChart.test.jsx`, since moved to `recipe/classifiedBandChart.test.jsx` (GUI,
    mounted over the real runtime, chart and action):
    - a classified band over a Classification without points is never requested, the chart says why, stays open at
      another pixel, and its action stays offered;
    - a request in flight is cancelled when points are removed;
    - repair reads the band again, and a repair waits for its save to be acknowledged;
    - pending imagery holds the band until it is observed, and unavailable imagery holds it without a finding;
    - a native band is read instead, and without waiting.
  - **Witnesses.** Every native control passes either way.
    - With Time Series' classified need at `REFERENCE`, today's need, 5 gee and 9 shared cases fail.
    - With the GUI chart and `operationReadiness.js` restored from `HEAD`, 7 of the 8 GUI cases fail.
    - Without the capability step, both capability cases fail: the point-free one with a plain `NO_TRAINING_DATA`.
      Judging capability before the classifier inputs fails the order case.
- **Remaining.**
  - Time Series Retrieve: `timeseries.download` is held to `IMAGE_OUTPUT`, and its classified indicators need the
    same training readiness.
  - CCDC's chart: its classified observations, and the segments it fits to the chart band, which `PIXEL_SEGMENTS`
    judges by `breakpointBands` alone. The GUI hold is the same.
  - CCDC export and map bands.

**CCDC's requested chart bands (implemented 2026-10-21).** Slice 1 of the architecture checkpoint's sequence: the
stage generalised, the band hold shared, and the CCDC chart integrated.

- **Gap (confirmed by failing witnesses).** A CCDC chart band the Classification computes trains it in both requests:
  segments fit `[band]` with the breakpoint bands (`fittedMeasures`), and observations build `[band]`. The segment
  request was judged by `PIXEL_SEGMENTS`, whose need follows `breakpointBands` alone. The observation request's
  classified operation needed only `REFERENCE` for CCDC. The GUI chart read the band without holding it. With native
  breakpoints, a Classification without points, with an unusable reused provider, or with reused features missing,
  was trained on at execution.
- **The stage** (`CLASSIFIED_COLLECTION`, `output/readiness.js`) is the collection classified by its Classification,
  wherever its images are read.
  - Its needs are declared once, `CLASSIFIED_COLLECTION_NEEDS` (`collectionSources.js`): the Classification's
    `CLASSIFIER`, which reuses its existing training requirements, and the source imagery resolving. Time Series and
    CCDC both declare it, and the classifier-input requirement lists it.
  - It is AOI-independent. Routes judge it over the recipe without its AOI (`withoutAoi`), and the GUI lists it among
    the operations `recipeForOperation` strips the AOI for. Only the consumer's AOI goes: the Classification's own
    imagery keeps its AOIs.
- **Effective bands** are each execution owner's. Observations build the bands requested. CCDC's segments build
  `fittedMeasures(model, requested)`, which `ccdc.js` now also uses for the collection's bands instead of repeating the
  union inline. `requestStages(effective)` (`classifiedOutputs.js`) is the one selector: constant lists, the stage or
  none, so watchers tell them apart by identity. There is no type switch: each caller passes its own bands.
- **Server sequence** (`requireRequestedBands$`, `modules/gee/src/jobs/requestedBands.js`), extracted from
  `loadObservations.js`:
  1. the base operation and every configured finding, a classified breakpoint's training and capability included;
  2. the capability of the outputs the request names, by `unprovidedClassifiedOutputs`, refused with execution's
     `unsupportedClassifiedOutput` (400, `UNSUPPORTED_CLASSIFIED_OUTPUT`);
  3. the stages the effective bands add.

  A native request runs the first alone, reading nothing more. `loadObservations.js` and the direct CCDC branch of
  `loadSegments.js` use it before anything is built. The recipe-reference and asset segment branches are unchanged.
- **GUI** (`operationAvailability.js`).
  - `pixelBandAvailability({operations, bandOperations})` is the shared hold. A finding of the chart's own operations
    closes the chart, as before. The band's gate holds that band without closing: it is passed to `pixelChartUpdate`
    as non-withdrawing, so obsolete requests are cancelled, pending or unavailable evidence holds without a finding,
    the draft gate waits for saves, and clearing reads once. A finding of the band is explained
    (`process.chartPixel.classifiedBandWithheld`, shared by both charts).
  - `BandOperationWatch` watches the band's operations while they are the band's, and releases them on another band or
    on unmount.
  - Time Series passes `requestStages([band])`. CCDC passes `requestStages(fittedMeasures(model, [band]))`, which covers
    both its streams, so they are held, cancelled and resumed together.
- **Decisions consolidated:**
  - the stage order, from `loadObservations.js` into one server helper;
  - the band hold and its watch, from Time Series' panel into two shared GUI helpers;
  - which bands make a request classified, into one selector;
  - the stage's needs, into one declaration;
  - CCDC's fitted bands, into `fittedMeasures` for execution and route alike.
- **New abstraction:**
  - one stage operation, replacing an operation-specific variant;
  - one server helper and two GUI helpers, each used by both charts;
  - nothing new for readiness to take, cache or load.

  The pixel projection is still defined three times (the GUI's `recipeForOperation`, the routes' `atPixel` and
  `withoutAoi`); a shared projection remains optional.
- **Preserved:**
  - native requests succeed without training;
  - CCDC's native observations don't depend on classified breakpoints;
  - configured breakpoint findings take precedence over everything a request adds;
  - Time Series' chart behaves as before; only its message key moved to the shared one, with the same text.
- **Regressions.**
  - `loadSegmentsReadiness.test.js` (gee):
    - each training finding refused before anything is segmented, with native controls answered, fitting `ndvi` and
      observing nothing of the Classification's input;
    - repair, fitting the band with the breakpoint bands;
    - unobservable input failing as a read;
    - the four combinations where several things are wrong: a classified breakpoint's `NO_TRAINING_DATA` before an
      unsupported requested output; the 400 before training; a configured unsupported breakpoint's finding before the
      requested one; unsupplied classifier inputs before anything request-added.
    - Readiness's own evidence evaluation is now told apart from chart work in its Earth Engine stand-in. Repair runs
      each request in its own recipe scope.
  - `loadObservations.test.js` (gee): a CCDC classified band refused over a Classification without points, and native
    observations answered over classified breakpoints without observing the input.
  - **Guard agreement.** Both gee files record the operations each request is judged by, through the real readiness:
    native requests their base operation alone, classified ones `CLASSIFIED_COLLECTION` after it.
    `classifiedBandChart.test.jsx` records the runtime's actual watches: the chart's operations, plus
    `CLASSIFIED_COLLECTION` while a classified band is charted, released on a native band and on unmount. That is the
    union of the two routes' guards.
  - `classifiedOutputTraining.test.js` (shared): Time Series and CCDC rows for the stage. They cover every training
    finding, pending and unavailable evidence, repair and native controls.
  - `recipe/classifiedBandChart.test.jsx` (GUI), moved from `timeSeries/panels` and run for both charts:
    - each case for Time Series and CCDC;
    - CCDC holding and cancelling both streams together;
    - a classified breakpoint's finding closing the chart rather than holding the band;
    - a classified band read over an AOI the session cannot resolve.
- **Witnesses.**
  - CCDC's stage at `REFERENCE`: the CCDC observation case and 9 shared cases fail.
  - `loadSegments.js` from `HEAD`: 7 gee cases fail (training, repair, unavailable, the coded refusal, the judged
    operations). The precedence cases where configured findings win pass, as they did before.
  - The CCDC chart panel from `HEAD`: 9 GUI cases fail, while the Time Series cases and native controls pass.
  - The stage removed from the GUI's AOI-free operations: the unresolved-AOI case fails.
- **Focused campaign** (two workers at most):
  - shared `test/recipe`: 1270 passed;
  - gee `test/jobs`, `test/ee/timeSeries` and `test/ee/classification`: 1198 passed;
  - GUI: 75 files and 1408 tests passed, covering every top-level recipe test, Time Series, CCDC, CCDC Slice, Change
    Alerts, Phenology, the source runtime and translations.

  The full GUI suite was not repeated.
- **Outside this slice:** preview gating, propagated requests, dependency-loading changes, and the Retrieve and export
  integration.

**Time Series Retrieve's classified indicators (implemented 2026-10-21).** Slice 2 of the architecture checkpoint's
sequence.

- **Gaps (confirmed by failing witnesses).**
  - **Server.** The three download requests were held to `IMAGE_OUTPUT` alone, which needs only `REFERENCE` of the
    Classification. A classified indicator over a Classification without points, with an unusable reused provider or
    with reused features missing was tiled, built and exported, and trained at execution. Capability surfaced only at
    the chunk, after planning.
  - **Open panel.** Retrieve's request path never consulted the image output's readiness once open. The toolbar
    button holds on it, but an open panel submitted a native download after the Classification's features stopped
    suiting the scenes. Only classified options awaiting the Classification's record or save were held.
- **Server** (`modules/gee/src/jobs/task/export/timeSeries.js`).
  - Each entry point runs `resolveImageOutput$`, unchanged: the description and `IMAGE_OUTPUT` readiness over the
    download's AOI, with its configured findings. Then `requireRequestStages$` (`jobs/requestedBands.js`, split out of
    `requireRequestedBands$`) runs: the requested capability (400, `UNSUPPORTED_CLASSIFIED_OUTPUT`), then
    `CLASSIFIED_COLLECTION` without the AOI. This all happens before tiling, building, preparing a destination or
    submitting an export.
  - Tiles and date ranges judge every indicator (`image.indicators`, or the single `image.indicator` older tasks send).
    A chunk judges its own `image.indicator`, so a native chunk of a mixed download does not train. Native-only
    requests run `resolveImageOutput$` alone, as before.
- **GUI.**
  - `MosaicRetrievePanel`'s request path gains a two-prop contract:
    - `requestGate(state, selected)`, which returns `null` or `{wait, message}`. It is judged in the panel's
      `mapStateToProps` for Apply and the explanation, and again from the store's current state when a submission
      arrives, by Apply or the form alike.
    - `onRequestSelection(selected)`, which tells the owner each selection.
  - Without a `requestGate`, the panel behaves as before for every other recipe.
  - Time Series Retrieve implements the gate with `requestedBandAvailability`, the chart helper renamed now that it
    holds requests generally: `[IMAGE_OUTPUT]`, plus `requestStages(selected)`. It watches that selection's stage with
    `BandOperationWatch`, so selecting only native indicators releases it.
  - Base findings are said with Retrieve's existing `configurationUnmet` message. A classified-only finding, pending
    evidence and evidence that can't be read each get a message of their own. The existing pending-options hold, and
    its capability resolution from the Classification's record, are unchanged.
- **Behaviour change.** A native indicator is now held while the image output's readiness is being read, or while a
  dependency's save is unacknowledged: the toolbar button and the image-output path already hold then. Two
  `retrieveClassifiedOutputs.test.jsx` cases that pinned submission in those states now pin the hold and its release.
  Its Classification fixture stores points, and its input is observable, so classified cases still pin capability
  alone.
- **Consolidation versus coordination.**
  - **Consolidated:** the download's stage order now runs through the routes' shared helper, and its hold reuses the
    charts' availability and watch helpers.
  - **Coordination added:** one owner/panel contract of two props. It removes the panel's blind spot rather than
    adding a mechanism. The gate is the existing operation-readiness read, so there is still one readiness mechanism.
  - **Still repeated:** the AOI projection, now in `withoutAoi` for both the chart and download routes.
- **Regressions.**
  - `task/export/timeSeries.test.js` (gee):
    - the three training findings refused before tiling, with native controls planned without observing the input;
    - mixed downloads refused in full;
    - an earlier release's single indicator judged;
    - date ranges refused before any imagery check;
    - each chunk judging its own indicator;
    - repair, and unobservable input failing as a read;
    - the coded 400 over trainable and point-free Classifications, after unsupplied classifier inputs.
  - `retrieveTrainingReadiness.test.jsx` (GUI, mounted):
    - a held, explained classified selection, by Apply and the form;
    - a mixed selection released by deselecting its classified indicator;
    - repair, and save agreement through the save coordinator;
    - a submission made before the panel re-renders, refused from current state;
    - pending imagery holding without a finding, then submitting; unobservable imagery held;
    - a native indicator not waiting for training evidence;
    - a base finding arising after Retrieve opened, held and explained by Apply and the form, then released by repair;
    - the operations watched: `IMAGE_OUTPUT` alone, plus `CLASSIFIED_COLLECTION` while a classified indicator is
      selected, released on deselection and on unmount. These match the routes' guards.
- **Witnesses.**
  - The export route from `HEAD`: 11 cases fail; native, own-chunk and inputs-first controls pass.
  - The GUI from `HEAD` (the owner, the panel and the availability helpers): 7 of the 10 new cases fail, including the
    open-panel gap and the late submission.
  - A submission judged from the last render's props, not current state: that case fails.
- **Focused campaign** (two workers at most):
  - gee `test/jobs`, `test/ee/timeSeries` and `test/ee/classification`: 1214 passed;
  - task `timeSeriesExport.test.js`: 9 passed;
  - GUI: 100 files and 1954 tests passed. That covers every GUI test that mentions Retrieve, every top-level recipe
    test, Time Series, CCDC, Mosaic, the source runtime and translations.

  The full GUI suite was not repeated.
- **Legacy single indicator (fixed 2026-10-21).** An earlier release offered one indicator and saved it as the value
  itself (`"ndvi"`), which the multi-select control dropped as no list, leaving Apply disabled until it was chosen
  again. On the request path - Time Series Retrieve's form, its only user - the panel now selects that value as a
  list when it opens (`selectSavedSingleRequest`, `retrievePanel.jsx`), before the control reconciles it. Lists are
  kept as they are, and the gate, holds and submission are unchanged.
  - **Settled options reconciled by the panel.** Selecting it as a list exposed an existing gap for lists: once Sources
    applied no Classification, a saved `["regression"]` was no longer offered but stayed selected until the request
    control next updated, and Apply submitted it meanwhile. A legacy string had escaped that only because the control
    dropped it as no list. Once the options are settled, the panel now lets go of a selection they no longer offer
    (`reconcileRequest`), as the image path does (`reconcileBands`).
  - **Offer judged at submission.** Reconciling after a render cannot cover a submission in the same batch as the change.
    Time Series Retrieve's gate now derives what is offered from the state it is given, as the render does
    (`requestOffer`, `retrieve.jsx`): indicators not offered hold, naming them (`bands.unavailable`), and indicators of
    a Classification not yet established wait, before readiness is judged. The panel asks the gate again at submission
    from the store's current state, so Sources applying no Classification, or a classifier that does not compute the
    indicator, refuses a submission made before the panel re-renders.
  - **Regressions.** `retrieveTrainingReadiness.test.jsx` opens native and classified legacy selections: the native
    one submits `["ndvi"]`; the classified one is held while untrainable, or while its imagery is pending, keeps its
    selection, and submits once released. Two cases change the session and submit in the same batch: Sources applying
    no Classification, and its classifier changed to SVM C_SVC, which does not compute `regression`; neither submits,
    and the native indicator is then submitted alone. `unselectedClassification.test.jsx` clears the Classification
    over a regression saved as a list and as a single indicator.
  - **Witnesses.** With the panel from `HEAD`, the 3 legacy cases and the list case fail. Without the reconciliation,
    both clearing cases fail. With the owner from `HEAD`, or its gate not judging the offer, both same-batch cases fail.
    The existing cases pass either way.
  - **Focused campaign** (two workers): Time Series, CCDC, the shared, Masking and CCDC Slice Retrieve panels,
    `retrieveOutput`, the chart band tests, `unselectedClassification` and `wizardSectionMarks`, 28 files and 348
    tests passed. The full GUI suite was not repeated.
- **Outside this slice:** CCDC exports, previews, propagated requests and dependency loading.

**CCDC's requested export bands (implemented 2026-10-21).** Slice 3 of the architecture checkpoint's sequence.

- **Gap (confirmed by failing witnesses).** The two asset-export routes were held to `IMAGE_OUTPUT` alone. CCDC's need
  there follows `breakpointBands`, so a requested classified measure with native breakpoints was built and trained at
  execution. This held over a Classification without points, with an unusable reused provider, or with reused
  features missing. `imageAssetExport` also built the image beside its check, so even a configured refusal had
  already constructed the product.
- **One derivation.** `requestedMeasures({selection, outputBands, visualizationType})` (`type/ccdc.js`) is how execution
  reads a request: the measures the physical bands are built from (`measuresFor`), otherwise the selection, and none
  for the count product. Segment timing bands come from no measure, and an unknown band throws as before.
  - `timeSeries/ccdc.js` now uses it, and fits `fittedMeasures(model, requestedMeasures(...))` for its collection.
  - The routes call the same function, so a route can't read a request differently from the image it guards.
  - No physical-band string is matched for being classified: measures are derived first, then judged.
- **Routes.** `requireCcdcImageStages$(recipe, request)` (`jobs/requestedBands.js`) runs `requireRequestStages$` with
  `requested = requestedMeasures(request)` and `effective = fittedMeasures(model, requested)`. Each route runs, in
  order:
  1. `resolveImageOutput$`, unchanged: the description and `IMAGE_OUTPUT` over the export's AOI, including the
     configured breakpoint findings;
  2. the capability of the requested measures, as the coded 400;
  3. `CLASSIFIED_COLLECTION` without the CCDC's AOI.

  How each route uses it:
  - `ccdcAssetExport.js` passes its `bands`, which are measures, as the selection.
  - `imageAssetExport.js` passes `withOutputBands(bands)` for a direct CCDC root, and builds only after the check, from
    the image output already resolved (resolved once).
  - Any other root keeps building beside its check. A Masking or other wrapper over a CCDC is a downstream request,
    still outside.
  - Native effective bands run the first step alone, and never train.
- **Drive and SEPAL image exports.** Not guarded by this slice; they run the same sequence now (see "CCDC's Drive and
  SEPAL image exports").
- **GUI preflight.** Not in this slice; CCDC Retrieve now holds the measures chosen too (see "CCDC Retrieve's classified
  measures").
- **Consolidation.**
  - `requestedMeasures` removes a repeated decision: execution's reading of the request now has one owner, shared with
    the routes.
  - `requireCcdcImageStages$` is a two-line composition shared by both routes; on its own it consolidates nothing
    further.
  - The generic image exports recognise CCDC by its type, in one place (`judgesRequest`, `imageOutput.js`). That is
    one type check in the generic export path, rather than a new recipe-type declaration with a single user. CCDC's
    own export judges every recipe as a CCDC, whatever type it states.
- **Regressions.**
  - `ccdcAssetExport.test.js` (gee):
    - the three training findings refused before the segments are built, with native measures exported without
      observing the Classification's input;
    - repair, and unobservable input failing as a read;
    - a classified breakpoint refused whatever native or unsupported measure is requested;
    - the coded 400 over trainable and point-free Classifications, a configured unsupported breakpoint's own finding,
      and unsupplied classifier inputs first;
    - the asset's `sample` pyramiding, region, date metadata and visualization properties after repair.
  - `imageAssetExport.test.js` (gee), for a direct CCDC root:
    - each finding for a coefficient band, refused before any product factory, build or export;
    - RMSE, magnitude and mixed selections refused;
    - timing-only and empty selections exported over an untrainable Classification;
    - a classified breakpoint refused for a native band;
    - repair, preserving the built image, region, empty encoding, pyramiding policy and visualization metadata;
    - unobservable input, the coded 400 and inputs first.
    - Its factory stand-in now tells readiness's catalogue read apart from product construction.
  - `type/ccdc.test.js` (shared): `requestedMeasures` and `fittedMeasures`, covering physical, timing, selection, count
    and unknown bands.
- **Witnesses.** With both routes from `HEAD`, 19 cases fail. They include the ordering cases, where a configured
  finding refused after the image was built. The configured-precedence controls on the CCDC route pass, as before.
- **Focused campaign** (two workers at most):
  - shared `test/recipe`: 1275 passed;
  - gee `test/jobs` and `test/ee`: 1307 passed;
  - task export tests: 49 passed;
  - GUI CCDC, CCDC Slice, Change Alerts, `retrieveOutput` and the chart band tests: 26 files and 356 tests passed.

  The full GUI suite was not repeated.
- **Outside this slice:** the Drive and SEPAL image exports of a CCDC and CCDC Retrieve's preflight (both since done,
  below), previews, downstream request propagation and dependency loading.

**CCDC's Drive and SEPAL image exports (implemented 2026-10-21).** The image exports to Drive and the SEPAL workspace
of a direct CCDC root, held as its asset exports are.

- **Gap (confirmed by failing witnesses).** `imageDriveExport.js` and `imageWorkspaceExport.js` went from
  `resolveImageOutput$` straight to product construction. A requested classified measure with native breakpoints was
  built, a destination prepared and an export started, over a Classification without points, with an unusable reused
  provider, or with reused features missing.
- **One sequence.** `resolveRequestedImageOutput$(recipe, request)` (`imageOutput.js`) resolves the image output once,
  then, for a direct CCDC (`judgesRequest`), runs `requireCcdcImageStages$` over the request the image is built with.
  It emits the description. The generic image exports use it:
  - Drive and SEPAL pass `withOutputBands(bands)`, the request `ImageFactory` builds with, and build only after it;
  - `imageAssetExport.js` uses it for a CCDC and keeps building any other recipe beside `resolveImageOutput$`.

  `ccdcAssetExport.js` does not: it builds segments as a CCDC's whatever type the recipe states, so it runs
  `requireCcdcImageStages$` unconditionally after `resolveImageOutput$`. A regression holds a `TIME_SERIES` root with
  CCDC settings, asking for a classified measure over a point-free Classification, to `NO_TRAINING_DATA` before
  anything is built; with the type-conditional helper there, it reached the exporter.

  The order is the asset exports': the image output and configured findings over the export's AOI, the requested
  capability as the coded 400, `CLASSIFIED_COLLECTION` without the CCDC's AOI, then product construction, destination
  preparation and submission. Referenced imagery keeps its own AOIs. Non-CCDC roots are unchanged.
- **Readiness, not destination support.** CCDC's bands are arrays. These routes now refuse an export that cannot be
  trained. They do not establish that a Drive or SEPAL raster file can hold array bands, and do not validate that
  (see the export-compatibility rule under "Resolved descriptions and capability lineage", and the deferred list). The
  CCDC Retrieve panel offers only Earth Engine assets, so these routes are reached by direct requests alone, and there
  is no browser check for them.
- **Regressions** (`ccdcImageFileExport.test.js`, gee), each run against both routes:
  - the three training findings for a coefficient band, refused before any product factory, build, destination or
    export, with native bands exported without observing the Classification's input;
  - RMSE, magnitude and mixed selections refused; timing-only, empty and absent selections exported over an
    untrainable Classification;
  - a classified breakpoint refused before a native band and before an unsupported one;
  - repair releasing the guard, over the CCDC's own region; unobservable input failing as a read;
  - the coded 400 over trainable and point-free Classifications, and unsupplied classifier inputs first.

  Its Earth Engine substitute accepts any image: a started export there shows readiness released it, nothing about the
  file. The existing Drive and SEPAL tests' CCDC fixture now names `ndvi_coefs`; it named `ndvi`, which CCDC does not
  build and execution's derivation refuses. Their authentication, destination and non-CCDC cases are unchanged.
- **Witnesses.** With both routes from `HEAD`, 20 of the 38 cases fail. The 18 that pass are the native, timing-only,
  default-selection, configured-breakpoint and classifier-input controls. Judging the stages before the image output
  fails the classifier-input order case on both routes.
- **Focused campaign** (two workers): gee `test/jobs` and `test/ee`, 1346 passed. Lint and `git diff --check` are
  clean. Shared, task and GUI code are unchanged, and the full GUI suite was not repeated.
- **Outside:** destination compatibility for array bands, CCDC Retrieve's preflight (since done, below), previews,
  propagated requests and dependency loading.

**CCDC Retrieve's classified measures (implemented 2026-10-21).** The panel now holds what the server refuses.

- **Gap (confirmed by failing witnesses).** CCDC Retrieve took the image-output path alone (`ccdcMeasureSelection`),
  held by the retrieve decision. Nothing judged `CLASSIFIED_COLLECTION` for the measures chosen, so a classified measure
  over an untrainable Classification was offered Apply and submitted, and the server refused the task.
- **Panel contract, extended narrowly.** `MosaicRetrievePanel`'s optional `requestGate(state, selected)` and
  `onRequestSelection(selected)` now work on the image-output path too, with no new prop:
  - the hold sits beside the retrieve decision, which still alone judges the description, capability, destination
    and submission;
  - it holds Apply, is said under the measures, and keeps the selection;
  - `retrieve` asks the gate again from the store's current state before it reads the output, so a submission the
    gate holds sends nothing and remembers no destination, however the form is submitted.

  On the request path nothing changes.
- **CCDC's gate** (`ccdc/panels/retrieve/retrieve.jsx`) judges only what the measures add, as the server derives it:
  `requestStages(fittedMeasures(model, requestedMeasures({selection})))`, read with `pixelOperationsAvailability`.
  - There is no second `IMAGE_OUTPUT` read or watch; native effective bands add nothing and release the hold.
  - A finding says `classifiedWithheld`; evidence or a Classification draft's save still awaited says `checking`;
    evidence that could not be read says `uncheckable`.
  - A `BandOperationWatch` follows the selection, and the applied breakpoint bands on every update, and is released
    on unmount.
  - A classified breakpoint band adds the stage whatever is selected, as on the server. The image output's own check
    still holds it first and says where (`source.unsuitable`).
- **Coordination.** The gate is a second hold beside the retrieve decision, but not a second authority: it judges
  only the stage, which `IMAGE_OUTPUT` cannot express (see the architecture checkpoint). The panel now has one gate
  contract for both paths rather than one per path. CCDC and Time Series Retrieve share the stage, the reads, the
  watch and the messages; each keeps a short local mapping of its gate to those messages. No loader, cache, validator or
  framework was added.
- **Regressions** (`ccdc/panels/retrieve/retrieveTrainingReadiness.test.jsx`), the real panel, runtime and submission
  with storage, Earth Engine, tasks and the asset check substituted:
  - a classified measure over a point-free Classification kept, explained and held through Apply and form submission,
    with the project's destination untouched;
  - a mixed selection held, and the native measure submitted alone once the classified one is deselected;
  - repair, submitting the measures to the asset with its type, sharing, strategy, scale and tile size, and
    remembering the destination;
  - a Classification draft's save awaited; imagery pending (`checking`, selection kept) and unavailable (`uncheckable`);
    a native measure submitted without waiting;
  - points lost just before submission refusing it;
  - a classified breakpoint held by the base check, for a native measure;
  - watches following the selection and the breakpoint bands, and released on unmount.

  The unusable-provider and missing-feature findings take the same withdraw path as missing points here. Their rules
  are covered by the shared stage and server route tests, so no GUI case was added for them. The session's save
  coordinator outlives a test, so the harness forgets each recipe's save state afterwards (`forgetRecipeSaveState`).
- **Witnesses.** With the panel and CCDC Retrieve from `HEAD`, 6 of the 10 cases fail. The 4 that pass are controls:
  native submission, the classified-breakpoint base check, repair's outcome, and save agreement, which the image
  output already awaits because the Classification is in its graph. With only the panel from `HEAD`, 5 fail. Without
  the submission recheck, the form-submission and last-moment cases fail. A watch that ignores configuration changes,
  or measures fitted without the breakpoint bands, fails the watch case.
- **Focused campaign** (two workers): CCDC, CCDC Slice, Change Alerts, Time Series, Classification, the shared and
  Masking Retrieve panels, `retrieveOutput`, the chart band tests and the other mounted Retrieve and requirement tests,
  50 files and 756 tests passed. ESLint and `git diff --check` are clean. The full GUI suite was not repeated.
- **Outside:** previews, downstream request propagation, dependency loading and file-format compatibility.

**Verification status of the readiness and normalisation changes (2026-10-21).** Checked against commits up to
`3ea2e7f04`, plus two fixes to the verification script, which were defects in the script itself.

- **Automated.**
  - Full GUI suite with two workers: 309 files and 4475 tests passed (326 s).
  - gee focused tests and the verify helper tests: 212 and 55 passed.
  - **Later pre-commit GUI run (2026-10-21), including classified Time Series chart readiness and the origin merge:**
    314 files, 4506 tests, 4503 passed and 3 failed (309 s, two workers). All three failures are in
    `recipeGeometryLayer.test.jsx`: a Classification without input imagery still requests an outline, and removing or
    restoring its last input does not cancel or resume as expected. The same three failures reproduce against committed
    `2d1590763`, using temporary read-only source overlays, so they predate this chart slice. The geometry guard checks
    `inputImageryRequirement` by object identity; the Classification declaration copied it when extending its operations
    in `e8f8d8253`. Correct this before push, preserving geometry availability when only training data is missing.
  - **Outline correction (2026-10-21).** The geometry guard now recognises the requirement by its rule:
    `isInputImageryRequirement` (`source/inputImagery.js`) compares a declaration's `findings` with the shared
    requirement's. Its stated operations can be extended; Classification's local `CLASSIFIER` extension and every
    other type's list are unchanged. That was the only consumer relying on requirement-object identity, and
    Classification's is the only copied declaration.
    - Before editing, the 3 failures reproduced in `recipeGeometryLayer.test.jsx` (3 failed, 2 passed). After it, all
      5 cases pass with their assertions unchanged:
      - a Classification without points still has an outline;
      - removing the last input cancels the request and notifies nothing;
      - restoring an input requests and shows the outline again.
    - Nearby: the map's AOI and geometry layers, the table layer and the Classification recipe tests, 9 files and 96
      tests, passed, and so did the shared recipe tree (1256).
    - **Full GUI suite rerun (two workers): 314 files and 4506 tests, 4505 passed and 1 failed (312 s).** The failure
      was `remapping/panelActivation.test.jsx`, "opens with no panel open", which timed out at the 5 s default under
      suite load. Run alone, the file passed 15 of 15, twice.
  - **Full GUI suite at `8d04b160b` (2026-10-21, two workers): 316 files and 4547 tests passed, none failed (310 s).**
    The tree was clean at that commit. It includes the request-dependent Retrieve work through the legacy-indicator and
    submission-offer fixes, and the `panelActivation` timeout above did not recur.
  - **Request-dependent export guards (2026-10-21).** Verified by focused campaigns only, recorded with each slice; the
    gee one, for "CCDC's Drive and SEPAL image exports", ran `test/jobs` and `test/ee` (1346 passed); the GUI one, for
    "CCDC Retrieve's classified measures", 50 files and 756 tests. The Drive and SEPAL routes have no browser check:
    CCDC Retrieve offers no Drive or SEPAL destination.
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
- **Browser batch: completed by the user, with reported issues (2026-10-23).** The user has finished the manual tests
  and reported all issues; unmentioned tests are passing under their explicit reporting convention. The feedback,
  subsequent decisions and implementation slices below are the correction work, not an unfinished initial test run.
  This is user-reported browser evidence, not an agent-observed run; deployed build/browser details and per-case task
  or asset ids were not supplied. The consolidated inventory below is retained as reference, including fixture-based
  variants; it is not an instruction to repeat the whole batch or a claim of individual evidence for every variant.
  After fixes, recheck the affected paths and nearby controls. Do not mark the batch clean until reported issues are
  resolved or explicitly scoped out. The earlier lack of a signed-in agent browser no longer makes this batch pending.
  - **Run record:** date, SEPAL URL/build, deployed GUI and gee git commits, browser/version, and tester. Confirm the
    tested deployment contains the fixes; a local commit alone does not establish what the browser or worker runs.
    Reload the app before starting, so an old tab does not keep the earlier untyped Change Alerts request contract.
  - **Fixtures:** use a test project, small AOIs and short periods with known imagery. Keep working copies and the
    original point sets for repair. Classification examples need enough points in at least two classes; Regression
    examples need a working spread of values. Use a Random Forest where regression is requested, and SVM C_SVC only
    in the capability and normalisation cases that name it. Keep training inputs compatible with the scene collection.
  - **Evidence:** for every subcase record pass, fail or untested, recipe/asset ids and the actual result. For a failure
    include the reproduction, message, network response and console error where relevant. Record completed task ids and
    output paths for downloads/exports. An enabled button, accepted task or automated pass does not pass an execution
    check. A missing fixture or a pending/cancellation state too brief to observe is untested, not passed.
  - **Network checks:** keep DevTools open. Use throttling where needed to observe an in-flight read or unacknowledged
    save. Check that an obsolete response does not restore old chart data after cancellation or closure. Wait for save
    acknowledgement before judging settled behaviour, except where the subcase explicitly tests the save wait.

  To run it (record subcases separately, including Classification/Regression and Time Series/CCDC variants):
  1. **Reused features (Classification, then Regression).**
     - Set up Provider and Consumer, both over imagery with `IMAGE_BANDS [red, nir]` and collected points. Consumer
       adds a `RECIPE` data set reusing Provider. Confirm Consumer previews and can be retrieved.
     - Open Provider and remove `nir` from its band set. Consumer's Provider data set names Provider and `nir`, and
       Retrieve is held.
     - Restore `nir`. The mark clears, and the preview renders.
     - Keep Provider's points but remove its last input image. List removal updates the model immediately; do not
       expect to Apply an empty list. Consumer's reusing data set names Provider's problem, Retrieve is held, and
       adding the original imagery back restores the preview.
     - With an upstream image recipe supplying a band already selected by Provider, remove or rename that band
       upstream. The problem is attributed to Provider and its band-set field, not to absent training points. Restore
       the upstream band or repair Provider's saved selection, and confirm Consumer renders again. The picker need
       not let a user select a band that was already unavailable.
  2. **Empty chain.**
     - Give Consumer only the data set reusing Provider, and Provider points.
     - Delete all of Provider's points. Consumer is held: Regression's TRN says "Add training data", and Retrieve is
       held for both.
     - Restore Provider's original working point set, not a single point: clearing `NO_TRAINING_DATA` does not
       establish that enough samples or classes exist to train. Consumer is released, and its preview renders.
     - Repeat through an intermediate recipe that reuses Provider and has no points of its own. Absence and repair
       must propagate through the nested chain, for Classification and Regression.
     - Add a separate empty provider with valid input imagery beside the working branch. The empty branch alone must
       not block training. When every branch has no points, the explanation belongs to Consumer's training-data
       section, not an error on an otherwise valid empty provider item. Classification's TRN stays unmarked by policy;
       Regression's is marked.
  3. **PyEO and Phenology.**
     - Set up a PyEO Alerts over a Classification that has imagery but no points, with the index gate off. Sources'
       classification field names the Classification, and Retrieve is held.
     - Restore a working point set to the Classification. The explanation clears, Retrieve is offered, and a preview
       renders.
     - Repeat with the gate on.
     - **Phenology:** choose a supported classified band over a working Classification and confirm its preview renders.
       Remove the Classification's points and save: the classification field names it, and Retrieve is held. Restore
       the original working point set: the explanation clears, Retrieve is offered, and the preview renders again.
       With a native Phenology band, removing those points must not add a training restriction.
  4. **Charts.**
     - Open a Time Series pixel chart over a Classification-backed band, with the Time Series monitoring optical data.
     - Make a compatible upstream edit, such as adding a point: the chart reloads with data.
     - Make an incompatible one: switch the Classification's input from optical to radar features, keeping the Time
       Series monitoring optical. (Removing a feature usually leaves it compatible.) The chart closes, its action is
       disabled, and Sources explains the incompatible classifier inputs.
     - Repair it by switching the input back. The chart is offered again and returns data.
     - **CCDC breakpoints.** Open a CCDC with breakpoint bands `ndvi` and a classified `probability_<class>` over a
       working Classification, with its pixel chart open on segments.
     - Remove the Classification's points: Sources' classification field names it, Retrieve is held, the open chart
       closes, and the chart action is disabled.
     - Restore the original point set: Retrieve is offered, and reopening the chart returns segments.
     - With native breakpoints and a native chart band, removing the points adds no training restriction. Classified
       chart bands have their own hold, tested below.
     - **CCDC classified export measure.** With native breakpoint bands (`ndvi`), open Retrieve over a Classification
       without points and select `ndvi` and `probability_<class>`. Both stay selected, the panel says the
       Classification cannot be trained for them, Apply is held, and pressing Enter in the form submits no task.
     - Deselect `probability_<class>` and export `ndvi` alone while the Classification has no points: it completes.
     - Restore the original point set, select both again and export. The task must complete, and the asset must exist
       with the `probability_<class>` coefficient, RMSE and magnitude bands: an accepted submission is not enough.
     - **Time Series classified band.** Open a Time Series over a working Classification, also open in its own tab,
       with its pixel chart on `probability_<class>`. Observation data points show.
     - Remove the Classification's points. Once the save is acknowledged, the chart shows no data and says the
       classification cannot be trained to compute this band. It stays open, and the toolbar's chart action stays
       enabled. In the network panel, no further `loadObservations` request names the classified band.
     - Choose `ndvi`: data points show. Choose the classified band again, close the chart and chart another pixel: it
       opens and says why again, rather than closing.
     - Restore the original point set. Until the save is acknowledged no request is sent; then the classified band's
       data points show again.
     - **CCDC classified chart band.** Open a CCDC with native breakpoint bands (`ndvi`) over a working Classification,
       also open in its own tab, with its pixel chart on `probability_<class>`. Segments and observation data points
       show.
     - Remove the Classification's points. Once the save is acknowledged, the chart shows neither, says the
       classification cannot be trained to compute this band, and stays open; the toolbar's chart action stays
       enabled. In the network panel, no further `loadSegments` or `loadObservations` request names the classified
       band.
     - Choose `ndvi`: segments and observations show. Restore the original point set and choose the classified band
       again: until the save is acknowledged nothing is requested, then both show again.
     - With a classified breakpoint band instead, removing the points closes the chart and disables its action, as
       before.
     - **Pending/unavailable evidence, both direct charts.** If a Classification input-evidence read can be kept pending
       or made unavailable, the classified band sends no chart-data request and shows no confirmed training finding.
       Restore the evidence: current data returns once, after save agreement. Distinguish that evidence request from
       `loadObservations`/`loadSegments` themselves, whose request errors close the chart. Record this subcase as untested
       if the evidence state cannot be isolated in the browser.
     - **Change Alerts observations.** Open a Change Alerts over a CCDC reference, monitoring Landsat, with its
       pixel chart open. The observations series must show actual data points for the selected band, not only an
       empty chart. In the browser's network panel, the `loadObservations` request names the recipe:
       `type: CHANGE_ALERTS` and its id.
     - Edit the referenced CCDC so its own segments cannot run, for example a classified breakpoint over a
       Classification without points. The chart closes, as it does for any reference that cannot run.
     - Restore the CCDC, and reopen the chart at the same pixel. Observation data points and segments show again.
     - The server's independence from the reference is covered by the gee tests, since the GUI closes the chart while
       the reference cannot run. So are its refusals, an incomplete period or a Planet entry naming no asset, which
       the editors do not let through.
     - **Pixel versus export AOI.** For direct Time Series and CCDC charts, choose a pixel just outside the consumer's
       small configured AOI but within known scene coverage. Native observations, and CCDC segments, still return at
       the clicked pixel. This does not establish the separate referenced-recipe AOI contract; do not remove or change
       the Classification's own input AOIs to make the test pass.
  5. **Classified outputs.**
     - Use a Time Series over an SVM Classification (C_SVC). Chart `probability_<class>`: it returns values without a
       regression error.
     - Retrieve offers only outputs the Classification supports: probabilities, and no regression for SVM.
     - Clear the Classification through Sources and Apply. Time Series and CCDC charts and Time Series Retrieve offer
       no classified outputs; obsolete selections cannot be requested. For this CCDC check, use native breakpoint
       bands so clearing the Classification does not leave an invalid classified breakpoint.
     - Reselect the Classification and Apply: supported outputs return. Clearing it and then cancelling instead must
       preserve the applied choices. In Time Series Retrieve, clearing it drops the obsolete classified selection and
       submits no task until a native band is chosen.
  6. **Multiple-indicator Time Series Retrieve (origin merge).**
     - Over a small AOI with known imagery, select two native indicators and retrieve them. The task finishes and its
       files contain both indicators in their respective directories.
     - Select a native indicator and a supported class probability together. A pending Classification save holds that
       selection; once storage agrees, both remain selected and one retrieval produces both indicators.
     - If enabling the additional SITS output, confirm it produces SITS files alongside the ordinary outputs.
     - **Classified indicators and training.** Open Retrieve over a working Classification and select `ndvi` and
       `regression`. Remove the Classification's points and save. Retrieve holds the selection, says the
       classification cannot be trained, Apply stays disabled, and Enter submits no task.
     - Deselect `regression`: Apply is enabled and `ndvi` alone retrieves.
     - Restore the original point set and select `regression` again. Until the save is acknowledged Retrieve holds;
       then retrieve. The task must finish and produce actual files for both indicators: an enabled Apply or a started
       task is not enough.
     - With Retrieve open on a native indicator, switch the Classification's input to radar features. Retrieve holds and
       says the settings need attention; switch back, and the native download runs.
     - With only a native indicator selected, an unacknowledged Classification save still holds Retrieve under the
       existing base dependency policy; once storage agrees it downloads. On a cold open, an unresolved selected
       Classification's record also holds the native selection until it is read, without adding training evidence.
     - **Scalar UI-state compatibility (automated, not an old-recipe manual fixture).** Retrieve accepts a scalar
       indicator already present in session UI state and normalizes it to a list. `recipe.ui` is excluded from saved
       recipe content, so finding an old saved recipe with this selection is not a required browser check. The
       scalar-selection and classified-hold paths have mounted regression coverage.
  7. **Working execution.** For every recovery in this batch, confirm an actual response, not only an enabled
     button: a preview tile for Classification, Regression, PyEO and Phenology (these have no pixel charts), and a chart
     response for the Time Series, CCDC, CCDC Slice and Change Alerts charts. Download checks need completed tasks and
     actual files; asset-export checks need completed tasks and an asset with the requested bands.
  8. **Classification outline.** Open a Classification with one input image and no training points: its outline
     shows on the map. Remove that last input: the outline disappears, the network panel shows the pending geometry
     request cancelled and no new one, and no error notification appears. Add the input back: the geometry is
     requested again and the outline shows.
  9. **Normalisation smoke tests (part of the completed user batch).**
     - Use an SVM C_SVC Classification with normalisation `YES`, compatible optical imagery, a working two-class point
       set and a rendering own-image preview. A Time Series using it returns `probability_<class>` observations, with
       values in the displayed probability range and no regression error.
     - Run a PyEO Alerts using that SVM Classification, with valid monitoring imagery. Its preview returns actual
       tiles. Repeat a preview with the index gate on and off. An all-masked result or an empty chart is not evidence
       of a working computation; use a fixture with known coverage.
     - These are application smoke checks, not a numerical equality test between different scenes. The controlled
       `classifierNormalisation.mjs` check already passed all 24 checks on 2026-10-21, including reused samples,
       predictions, masks and footprints. It is not pending browser work. If rerun, record its deployed commit,
       command, exit code and all results separately; do not overwrite the earlier evidence.
  10. **Stored Classification versus the Sources copy.**
      - Start with a working Random Forest selected by Time Series and CCDC, and charts last on `regression`; CCDC's
        breakpoint bands stay native. Keep a regression selection in Time Series Retrieve too. In a second browser
        session, change the Classification to SVM C_SVC and save it, leaving the consumers' stored Sources copies old.
      - In the consumer session, close any Classification tab and reload/reopen the consumers without opening that
        Classification. Once the stored record has been read, both chart pickers and Time Series Retrieve offer
        probabilities and no regression. Charts replace regression with a native band before requesting data; Retrieve
        drops the unsupported selection and submits nothing until another band is chosen.
      - Change the stored classifier back to Random Forest in the other session. Once the newer revision is listed
        (refresh/reopen if needed), regression becomes offered again. This checks stored-record refresh, not just a
        record already open in the same session.
      - With the Classification open in the consumer session, an edited classifier's options follow that session
        record. If its save can be kept pending, classified chart/Retrieve requests stay held until storage agrees,
        keeping an otherwise supported selected measure. Record an unobserved save window as untested.
  11. **Change Alerts' inherited settings and native-only monitoring.**
      - Over a working CCDC recipe, let Change Alerts propose monitoring settings, then edit and apply its own data
        sets/options. Change only the producer's native breakpoint bands, then only its selected Classification
        (keeping the producer runnable). Re-observation must not overwrite the user's monitoring edits.
      - Change a real producer monitoring setting, such as its data sets or corrections. The existing prefill policy
        still updates the proposal. Observing those same producer settings again leaves subsequent user edits alone.
      - Repeat the ignored-settings check with a re-exported segments asset whose `recipe_sources` metadata changes
        only its breakpoint bands or Classification. Record this asset variant separately if no replacement fixture
        is available.
      - With an accessible shared segments asset naming an inaccessible producer Classification in its metadata,
        native monitoring and its chart work without loading that Classification or producer recipe. A referenced
        recipe's genuine dependencies still count, unlike the shared asset's producer history.
      - If a legacy Change Alerts fixture has a copied Classification or breakpoint bands, reopening it neither
        requires them nor cleans them out of the saved model. If it has a classified monitored band saved, the chosen
        band stays visible with the Sources explanation and Retrieve is held; choosing a native monitored band repairs
        it. The segment chart remains available for a native chart band when its reference is sound. These legacy and
        sharing cases require fixtures; mark them untested if unavailable rather than editing production data by hand.
  12. **Referenced segment charts: CCDC Slice and Change Alerts.**
      - For each consumer, chart a working CCDC recipe through a Masking with a valid mask. Make the Masking
        unrunnable, for example by removing the input imagery of a recipe supplying its mask. The action is disabled,
        the chart closes, and any in-flight request is cancelled. Repair that input and reopen: segments return, and
        Change Alerts also shows observations. An old response must not redraw after closure. Testing a missing mask
        itself needs a saved fixture if the mask editor prevents applying that state; do not count editor prevention as
        observing the downstream refusal.
      - Change a compatible upstream segmentation setting, such as CCDC's `lambda`, keeping the offered measures and
        assets the same. The open chart cancels obsolete work and requests the updated segments after save agreement;
        Change Alerts re-requests its observations too. Record the request sequence, not only a similar-looking graph.
      - Change only a producer title/layout, or an unrelated recipe. No new chart request should be sent. A draft
        reference choice in SRC/REF followed by Cancel also leaves the applied chart and requests unchanged.
      - Open each consumer over an accessible segments asset instead. It charts without reading the producer's recipe
        closure. If source evidence can be held pending, confirm it holds new requests without reporting a confirmed
        configuration problem; recovery requests current data. Keep unobservable timing cases marked untested.
  13. **Field feedback and saved invalid choices.**
      - Save a CCDC regression breakpoint and a Phenology regression band over a trainable Random Forest, then change
        the Classification to SVM C_SVC. Each saved invalid choice stays shown, with the unsupported-output explanation
        beside its own field. Reopening Sources unedited still explains it; Cancel preserves the applied choice.
      - Repair to a native measure and Apply: the field explanation clears, and CCDC segments / the Phenology preview
        return. Check that upstream training feedback does not prevent opening Sources or applying a repair.
      - For Time Series and PyEO, an incompatible classifier-input selection is explained beside the classification
        field. Cancel preserves the applied configuration; applying compatible inputs clears the explanation and the
        corresponding chart or PyEO preview works. Pending evidence must not appear as a broken-field validation error.
  14. **Shared-runtime control smoke checks.** Open existing working Masking, Stack, Band Math and Remapping recipes
      over compatible inputs, save/reopen, and confirm previews plus a small supported Retrieve still work. These are
      controls for the shared traversal and panel changes, not acceptance of deferred classified-band propagation
      through wrappers. Record missing fixtures as untested.

  **Result format for targeted rechecks:** record affected subcases (including both recipe types/consumers) as
  `check/subcase | pass/fail/untested | recipe ids | response/task/output evidence | notes`. Record the final deployed
  commit again after fixes. The initial batch is complete with the user-reported issues below; the remaining browser
  work is targeted verification of corrections, not a second full manual campaign. Explicitly untested fixture/timing
  variants remain visible rather than being invented as individually verified evidence.

  **Not additional acceptance work for this batch:** direct map-preview training gates, request propagation through
  wrappers, executed-edge dependency loading and CCDC array-file destination compatibility remain deferred. The generic
  Drive/SEPAL CCDC guards have mocked server coverage; CCDC Retrieve offers no such destination, and those tests do not
  establish that array bands can be written to raster files. The unknown Earth Engine outcome for missing/null sample
  features needs a separate controlled probe; the GUI now refuses known missing features before it can expose that
  outcome. The completed live numerical check above and the user's browser results are different evidence.

#### Browser feedback: partial results (2026-10-22)

User-reported results from the shortened browser checklist, not an independently observed run. Deployment/build and
recipe ids were not supplied. The user says to treat unmentioned checks in the supplied batch as passing; the rest of
the batch will be supplied later. These results do not mark the whole browser batch complete. No production behaviour
has been changed in response to this feedback.

- **Reused training data (short checklist 5), Classification and Regression:**
  - Removing Provider's `nir` shows "Provider samples no nir, which this recipe is trained on" on Consumer's training
    data item. Regression marks TRN; Classification does not. Opening the item's editor shows no explanation or repair
    guidance and offers Apply; applying again leaves the finding. The lack of editor feedback is a reported UX gap.
  - Removing Provider's last input image shows an item finding for both types, and a TRN mark only for Regression.
    Neither item's editor explains the problem. Both recover correctly when the input is restored.
  - **Correction to schedule:** Classification suppresses all training-data toolbar marks, including broken-provider
    and missing-feature findings. Replace that blanket suppression with marks for actual applicable findings,
    consistently with Regression; an operation requiring training is already held by readiness. Preserve the
    decision-tree exemption and distinguish pending/unavailable evidence from configuration findings.
  - **Sampling direction clarified with the user:** reused Classification points must still be sampled over Provider's
    input imagery, not Consumer's. The proposed change is to derive Consumer's required features over that imagery,
    independent of Provider's own selected training features. Removing `nir` from Provider's band selection should
    therefore work if its underlying imagery can still supply `nir`; an imagery source that genuinely cannot supply a
    Consumer feature remains incompatible. This is a design direction, not implemented. Nested providers must retain
    their own imagery and points; do not silently change Consumer's selected features to remove a finding.
  - **Collection cost constraint (user-confirmed):** assemble the reused samples and Consumer's training data once per
    collection computation, outside the per-scene classification loop, and reuse them across scenes. The current
    `collection.js` calls `getTrainingData$()` before constructing its mapped collection; preserve that boundary.
    Add one-scene versus many-scene coverage, including reused/nested points, when implementing the feature-selection
    change. This is not a cross-request cache or a claim about Earth Engine's internal evaluation count.
  - Provide an understandable repair from the item editor, whether through opening the offending Provider, replacing
    or removing the reuse selection, or explaining the Consumer feature change needed. The final interaction is not
    yet agreed; Apply must not be presented as though re-applying an unchanged reference repairs its upstream recipe.
- **Referenced charts and Change Alerts (short checklist 6):**
  - CCDC Sources should show its advanced ("More") view when a Classification is selected, so that selection is visible.
  - Switching CCDC from compatible Optical to Radar shows classifier-input incompatibility beside the data-set field;
    the user expects attribution beside the Classification field. The declaration currently binds this code to both
    fields; review presentation ownership rather than adding a new validator.
  - With Change Alerts monitoring Optical `nbr`, switching its CCDC producer to Radar reports "The selected source has
    no segments for band nbr. Choose a band it has segments for: VV, VH, ratio_VV_VH and 1 more." Opening Sources shows
    Radar automatically selected and no corresponding field explanation. The user reports that the recipe remains
    chartable. Investigate the applied-model/editor mismatch and the actual bands the chart chooses. The follow-up
    direction is to disable/close this analysis chart while its configured monitoring band cannot be supplied, rather
    than silently chart another reference band. Do not turn that into a full alerts-image readiness requirement.
  - **Sync policy:** the user questions automatic Optical-to-Radar switching. CCDC PRC changes also overwrite
    Change Alerts overrides for properties the producer did not change. Code inspection confirms that a changed
    monitoring snapshot merges all supplied Sources/options, rather than only changed fields. Preserve this observed
    behaviour as a reported issue. The user's direction is less implicit syncing: if a setting must equal the source,
    show the effective source value as read-only in the consumer, with its ownership explained. An editable consumer
    setting belongs to the consumer and must not be silently overwritten by unrelated source edits. Identify which
    processing settings actually must match before disabling controls; no concrete mandatory-setting list has yet been
    established. For asset references, linked values must come from the asset's recorded settings, not require access
    to its producer recipe. Do not implement this merely by greying out a stale copied value; execution and the shown
    effective value must use the same ownership rule. No production sync behaviour is changed yet.
- **Quick regression controls (short checklist 7):** reported passing.
- **Additional feature request:** copy/paste visualization parameters between layers; recorded separately from readiness
  regressions and not implemented.
- **Checklist correction:** `recipe.ui` is stripped from persisted recipe content and recipe exports. The earlier
  instruction to find a saved Time Series with a string `ui.retrieveOptions.bands` is not a valid ordinary saved-recipe
  acceptance case. Scalar UI-state normalization has automated coverage; do not require an old saved recipe fixture.
  For Change Alerts, leftover Classification/breakpoint fields under `model.sources` are persisted but ignored, with
  automated regressions; no separate legacy fixture is required in addition to an ordinary existing-recipe smoke test.
  A saved classified monitoring band is a distinct, explicitly refused configuration. Shared segments-asset checks
  simply mean using a CCDC segments asset as the source of CCDC Slice and Change Alerts. Isolated slow/failed evidence
  checks may be left to automated coverage when they cannot be reproduced naturally.

#### Browser feedback: further results (2026-10-23)

Further user-reported results from the shortened checklist. Unmentioned checks in the submitted portions are treated
as passing, as requested; the unfinished remainder is not implicitly passed. No deployed build, recipe ids or network
captures were supplied with this report. These observations are not independently reproduced and no production fix is
claimed by recording them.

- **Working baseline:** starting a chart, switching to another recipe tab, waiting for completion and switching back
  leaves the layout squeezed into the top-right corner. Investigate hidden-tab measurement and reactivation, without
  assuming the graph or panel is the cause. Direct CCDC/Time Series charts return data outside the consumer AOI;
  referenced CCDC Slice/Change Alerts charts do not. That AOI distinction is expected: direct pixel operations replace
  the consumer AOI, while references retain their own computation AOIs. Do not "fix" it by stripping upstream AOIs.
- **Missing Classification points, Time Series:** the classified-band-only chart hold appears as designed, but the
  user prefers closing/disabling the chart and marking Sources, consistently with CCDC's classified-breakpoint case.
  Retrieve always shows "These bands are no longer available from this recipe: . Select from the bands offered
  above", even in working configurations. This is a reported independent bug, not a valid empty missing-band finding.
  The selected Classification should be visible on opening Sources ("More" enabled/expanded) and its problem explained
  beside the classification field. Highlighting individual broken bands was considered, but a whole-selected-source
  validity policy is the user's preferred direction for assessment.
- **CCDC:** with classified breakpoints, the chart closes, Retrieve is held and Sources explains the Classification
  problem. Classified bands remain selectable and recovery works after repairing the Classification; the user prefers
  retaining that selection/recovery behaviour. The proposed change is to apply the source hold even when breakpoints
  and requested bands are native. Phenology and PyEO training-hold behaviour is reported correct in the tested cases.
- **Incompatible inputs:** PyEO marks both SRC and OPT. The user questions OPT because the reported incompatibility
  cannot be repaired there. Determine whether this is the same upstream fault presented twice or a distinct enabled
  index-gate requirement, and locate each explanation where it is actually repairable. Do not assume both codes are
  duplicates or remove all OPT validation; see F10.
- **Capabilities and stale copies:** reported good. WebSocket notification of upstream recipe updates is a separate
  future feature, not required to pass these manual checks.
- **For later:** CCDC Slice displays raw chart-band names even for a recipe reference; AOI layers redraw on recipe
  changes that should not alter their geometry; show the charted location on the map. These are captured below as
  follow-ups, not silently included in the readiness-policy implementation.

**User completion confirmation (2026-10-23):** "I've been through the manual tests now - I've reported all the issues."
This supersedes the earlier partial/pending status. Under the user's instruction, unmentioned tests pass; reported
issues remain open until corrected. S2's later browser feedback also covers the misleading TRN absence message,
removal of Open Provider from the modal, simpler repair wording, and the agreed PyEO SRC/OPT prerequisite behaviour;
the agreed CCDC family/view heights and keyboard band-add improvement are recorded with their own scope. There is no
further initial manual-test report expected. Preserve these results and ask only for focused rechecks after fixes.

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

#### Request-dependent readiness: architecture checkpoint (2026-10-21)

A design assessment of the remaining request-dependent work, Time Series Retrieve and CCDC's optional chart and export
bands, against the current readiness model. It made no production change. Caller flows were traced from the code.

**Verdict.** The pieces are one contract, with one kind of fact missing and three decisions repeated.

- **The contract.** An operation names what is built. Configured edges and per-operation needs say what that reads.
  A projection gives the recipe that operation runs: the pixel for charts, `observedCollection` for Change Alerts'
  observations. The routes enforce it before building; the GUI holds the same questions.
- **The missing fact.** Readiness cannot see bands a request adds to what execution trains on. The collection
  classifies whenever the bands it is asked for include a classified output (`collection.js`). Which bands those are
  depends on the operation: observations build only the requested bands, while CCDC's segments and image fit the
  requested measures together with `breakpointBands` (`fittedMeasures`).
- **Which callers have the gap.** For Time Series' chart that request fact is now judged. It is still unjudged in:
  - Time Series Retrieve, whose chunk export builds `[indicator]`;
  - CCDC's chart segments and observations, which build `[band]`;
  - CCDC's own export and image exports of a CCDC, which build the requested measures;
  - direct map previews of a Time Series or CCDC, which build `visParams.bands` with no server gate;
  - downstream requests: wrappers asking a CCDC source for classified measures, such as Slice base bands, Masking
    pass-through, Stack and Band Math.
- **Consolidation.** A bounded one is warranted, below. A general operation context is not, for this round.

**1. What identifies the computation.**

- **Today.** A question's identity is `(recipe, operation)` everywhere:
  - the GUI's session-read cache, per graph and operation;
  - the acquisition key `{kind: READINESS, operation, content}`;
  - `watchOutput$({recipeId, operation})`;
  - asset interest `recipeId:operation`;
  - `requireExecutable$({recipe, operation})`.

  The draft gate and currency follow the computation (`recipeContent` of the graph), so they need no request.
- **For the training checks, the request contributes one fact:** whether the effective bands include a classified
  output.
  - The effective bands are each execution owner's to derive, and only they are passed to the common stage selector.
    Time Series' and CCDC's observations use the requested bands; CCDC's segments and image use
    `fittedMeasures(model, requested)`.
  - Using `fittedMeasures` for CCDC's observations would hold native observations wherever a breakpoint is
    classified, though they never train.
  - Capability needs the band list itself. It is judged from the request and the Classification's record by its own
    rule, outside readiness, so it adds nothing to identity.
- **Alternatives, by caller.**

  | | Explicit variant per operation | Context `{recipe, operation, request}` | One collection-training stage (recommended) |
  |---|---|---|---|
  | Shape | `CLASSIFIED_PIXEL_SEGMENTS`, a classified download operation, `CLASSIFIED_IMAGE_OUTPUT`… | `executionNeed(…, request)`, `when(model, request)`; the request normalised, root-only or propagated along edges | `CLASSIFIED_PIXEL_OBSERVATIONS` generalised to an AOI-independent stage, "the collection classified": `CLASSIFICATION_SOURCE: CLASSIFIER` plus classifier inputs. A route whose effective bands are classified runs its own operation with its configured findings, then the capability of the requested outputs, then this stage |
  | Time Series Retrieve, mixed native and classified | A download operation and its classified variant. Each GUI and route site picks one | The request is keyed by its normalised fact. The same holds, with every identity widened | The GUI holds submission on the stage while any selected indicator is classified. `task/timeseries/tiles` judges the union (`image.indicators`, falling back to `image.indicator` from older runners), and each chunk judges its own indicator. Native chunks are unchanged |
  | CCDC chart (segments, observations) | `CLASSIFIED_PIXEL_SEGMENTS`. Observations flip to `CLASSIFIER` | The request applies to the root. The traversal is changed | Segments run the stage over `fittedMeasures(model, [band])`, observations over `[band]`. CCDC declares the stage. The GUI chart reuses Time Series' band hold, extracted rather than copied |
  | CCDC export and image exports of a CCDC | `CLASSIFIED_IMAGE_OUTPUT` must also be a description, so it changes `resolveImageOutput`, the product questions and every `IMAGE_OUTPUT` need site | Fits root exports | The exports run `IMAGE_OUTPUT` as today, then capability over the requested measures, then the stage, before building |
  | Direct preview of a Time Series or CCDC | Variants at the preview's gate | Fits | The same root stage over the preview's effective bands. Deferred for cost and scope: the preview has no server gate yet |
  | Downstream requests: wrappers asking a CCDC source for measures | Variants with conditional needs on each consumer, but Masking passes its request through | **Needed:** the request propagates along `IMAGE_OUTPUT` edges | Not covered: needs propagation (deferred) |
  | Identity, currency, cancellation, save agreement | Unchanged: keyed by operation | Each of the five identity sites gains the request. Without normalisation, one question per native band | Unchanged. The stage is one more operation. The draft gate covers its computation. Cancellation and recovery reuse `pixelChartUpdate`; Retrieve holds submission only |
  | Estimated change | 3–4 operations, 8–12 files, with `IMAGE_OUTPUT` special cases | 15–20 files across shared readiness, the server gate, the GUI runtime and routes | 3 slices of 6–10 files; no new identity |

- **Why the stage rather than variants.** Every remaining caller needs the same check: the Classification trains.
  That check depends on neither the operation nor the AOI; only whether it applies does, through the effective bands
  each execution owner derives. One stage removes the need for a variant per operation, and the ordering lives in one
  helper instead of each route.
- **Why not a context yet.** For root requests the context would carry only the same fact, at the cost of widening
  every identity. It becomes necessary only when a request propagates to a source, as when a wrapper asks a CCDC
  source for classified measures its configuration does not fit. A direct preview is a root request and needs no
  propagation. Neither is in this round, and the stage does not resolve the propagation gap or the dependency-loading
  gap below.
- **Precedence.** The base operation's configured findings come first, as today. CCDC's `IMAGE_OUTPUT` and
  `PIXEL_SEGMENTS` already require training for classified breakpoints (`classifiedOutputNeed`), and their capability
  (`classifiedOutputRequirement`). Next, the capability of the outputs a request adds (400,
  `UNSUPPORTED_CLASSIFIED_OUTPUT`). Last, the additional training stage. So capability precedes training only among
  the checks a request adds; it never displaces a configured finding.
  - Tests should combine invalid conditions. A classified breakpoint over an untrainable Classification, with an
    unsupported requested band, keeps the configured `NO_TRAINING_DATA`. Native breakpoints with an unsupported
    requested band over an untrainable Classification get the 400. An unsupported breakpoint with an unsupported
    requested band keeps the configured `UNSUPPORTED_CLASSIFIED_OUTPUT` finding. Unsupplied classifier inputs precede
    everything request-added.

**2. Which dependencies belong to it.**

- **Configured graph and executed reads differ.**
  - The closure descends every recipe edge (`dependencyGraph.js`, `completeRecipeClosure.js`). Readiness skips
    `REFERENCE` edges (`resolveImageOutput.js`).
  - `dependencyValidity` is all or nothing over the whole closure. So a cycle, a malformed reference, a deleted record
    or a node-limit breach anywhere under a `REFERENCE` Classification refuses a native-band chart or export. Such a
    request never reads that Classification's inputs or providers (`collection.js` reads nothing of it for native
    bands).
  - The GUI judges Change Alerts' `PIXEL_SEGMENTS` over the alerts root's closure; the server judges only the
    reference.
  - `imageOutput.js` states the over-read policy for exports.
- **Not necessary for these callers.** The new checks apply only to classified bands, where the Classification and
  what it trains on are executed: `CLASSIFIER` reads exactly that subgraph. Native requests keep today's over-read,
  which is also where the native-band classifier-input policy reads the record.
- **Keep separate.** It stays under "`REFERENCE` closure over-reading" (deferred). A later fix would scope validity to
  edges reached through executed needs, plus each `REFERENCE` target's own resolution. It would change closure loading
  and the runtime's caches.

**3. How declarations stay aligned with execution.**

Repeated decisions found:

- **The pixel projection, three times.** The GUI's `recipeForOperation` drops the AOI; `loadObservations.js` and
  `loadSegments.js` each set the clicked point. These are equivalent today: neither emits an AOI edge.
- **Which operation a request runs.** Per-panel `CHART_OPERATIONS`, plus Time Series' `BAND_OPERATIONS`, against
  per-route constants.
  - CCDC's GUI chart omits the classified step the server runs.
  - For CCDC Slice and Change Alerts charts, the GUI judges the wrapper as `PIXEL_SEGMENTS`. The route judges the
    referenced recipe as `IMAGE_OUTPUT`, hard-coded beside the types' `PRIMARY_IMAGE: IMAGE_OUTPUT`.
- **The stage order.** Configured findings, then requested capability, then training: only `loadObservations.js` has
  it.
- **Effective bands.** `fittedMeasures` is the shared owner, but `ccdc.js` repeats requested ∪ breakpoints inline for
  the collection.
- **Capability, three checks over two derivations.** `classifiedOutputRequirement` and `provided$` use
  `unprovidedClassifiedOutputs`; `collection.js` uses `getBands$`, which is `classificationBands`. The GUI's options
  use `supportRegression`, `supportProbability` and the legend (`sources.js`).
- **Change Alerts' observed collection.** Server only. The GUI judges no observations for it.
- **Gate before build.** `imageAssetExport` builds the image in parallel with its check (`forkJoin`), and the preview
  has no server gate. `ccdcAssetExport` and the chart routes gate first.
- **Retrieve's holds.** Hand-wired. The open panel takes the `requestOptions` path, which skips `authorityGate` and
  `retrieveAvailability`. Reported by the trace and still to be confirmed by a witness. The server refuses anyway.

Coverage checks proposed, each detecting a class of drift rather than one case:

1. **Training implies a guard** (gee, per route × band shape). Run each real route over stubbed Earth Engine and a
   Classification that stores no points. Bands: native, classified, mixed, and configured-classified breakpoints.
   - Where the effective bands require classification, assert a refusal before product computation or training: no
     product evaluated, no export started and no `getTrainingData$` call. Native requests over the same
     Classification succeed, without training. Either way, readiness may still acquire its evidence, input
     observations included.
   - Routes: `loadObservations`; `loadSegments`, the CCDC itself and a reference; the three time-series task routes;
     `ccdcAssetExport`; `imageAssetExport` of a CCDC with classified `outputBands`.
   - Direct preview is listed as a known unguarded route.

   Each slice adds its routes' rows. The check passes only once a route's guard exists, so no row records a known
   failure.
2. **The projection agrees** (shared). For each pixel operation over Time Series, CCDC and Change Alerts, the
   judged recipe's edges equal those of the recipe the route builds. Trivial once the projection is one shared function
   (optional step below); until then it pins the three copies.
3. **The capability derivations agree** (GUI and shared). For each classifier type, SVM type and legend, the
   classified outputs `sources.js` offers equal `classificationBands(model)`.
4. **Charts and routes agree on operations** (shared helper). The GUI's operations for a band equal the stages the
   route runs for that band, since both call the one helper.
5. **A route inventory** (gee). Every `routes.js` entry that builds a recipe names its gate, or appears in an explicit
   unguarded list. A new route fails until classified.

**Recommended sequence.**

- **Necessary for this round:**
  1. **CCDC chart, with the stage helpers extracted: implemented (2026-10-21; see "CCDC's requested chart bands").**
     Its second use was the moment to extract
     from Time Series' chart:
     - a shared stage selector, taking the effective bands each execution owner derives: requested bands for
       observations, `fittedMeasures` for CCDC's segments;
     - a server helper running, after the base operation's configured checks, the requested capability with
       execution's error and then the stage;
     - the GUI band hold.

     The stage is generalised in this slice, since segments already make `CLASSIFIED_PIXEL_OBSERVATIONS` the wrong
     name. It is renamed for "the collection classified", and is AOI-independent: judged over the recipe without its
     AOI, since training reads none. CCDC declares it as `CLASSIFIER`, and `loadSegments.js` and `loadObservations.js`
     run it. The CCDC chart holds the band for both streams. Checks 1 and 4 are added for these routes, including the
     invalid combinations above. About 10 files plus tests; Time Series' chart behaviour is unchanged.

     The stage generalisation, the shared hold and the CCDC integration land together. Preview gating, propagated
     requests and dependency-loading changes stay outside this slice.
  2. **Time Series Retrieve: implemented (2026-10-21; see "Time Series Retrieve's classified indicators").**
     - The stage generalised in step 1 applies as is: the download keeps its AOI for `IMAGE_OUTPUT`, and the stage is
       judged without it.
     - The GUI holds submission while a selected indicator is classified and the stage is not `READY`, with findings
       said in the panel.
     - The tiles route judges the union of indicators; each chunk judges its own. Native-only downloads are unchanged.
     - Precedence: `IMAGE_OUTPUT`'s configured findings as today, then requested capability with its 400, then
       training.
     - Confirm or fix the open-panel gate there.
  3. **CCDC export bands: implemented (2026-10-21; see "CCDC's requested export bands" and "CCDC's Drive and SEPAL
     image exports").** `ccdcAssetExport`, `imageAssetExport` and the Drive and SEPAL image exports run the stage over
     the requested measures, before anything is built.
- **Optional, any time after:**
  - one shared projection, `operationRecipe(recipe, operation)`, for the GUI and routes, which would also let the GUI
    judge Change Alerts' observations;
  - coverage checks 2, 3 and 5;
  - the executed-edge validity fix;
  - direct previews of a Time Series or CCDC, through the same root stage, once the preview gets a server gate;
  - a propagated operation context, for wrappers requesting classified measures of a CCDC source.

**Preserved throughout:**

- the native-band classifier-input policy;
- referenced recipes judged over their own AOIs;
- configured findings first. Requested capability is refused with `ClientException`, 400,
  `UNSUPPORTED_CLASSIFIED_OUTPUT`, before the additional training stage;
- pending and unavailable never being findings;
- training rules owned by Classification's `CLASSIFIER`, and capability by `unprovidedClassifiedOutputs` and
  `classificationBands`.

#### Next steps from browser feedback (updated 2026-10-23)

These follow-ups come from the partial manual results above and the subsequent discussion. They are the next work,
not completed fixes or a reason to reopen every deferred architecture item. The user's direction is Provider imagery
with Consumer features, sampling outside the collection's per-scene loop, visible repair paths, and less implicit
settings syncing. Remaining product choices are called out below instead of being treated as accepted designs.

| Order | Follow-up | Status / boundary |
| --- | --- | --- |
| F1 | Training-data toolbar marks and item-editor explanations/repair | Concrete GUI fixes; both Classification and Regression. |
| F2 | CCDC Sources: expose the selected Classification and locate incompatibility beside it | Concrete GUI fixes; retain the shared compatibility rule. |
| F3 | Change Alerts: consistent applied/editor diagnostics and monitoring-band chart hold | Reproduce the reported Optical-to-Radar case; reuse the existing monitored-measure requirement. |
| F4 | Reused training samples: Consumer features over Provider imagery, once per collection computation | Agreed semantic direction; execution and shared readiness must change together after tracing the sampling contract. |
| F5 | Audit ownership of Change Alerts Sources/PRC settings | Technical prerequisite: identify, with reasons, which fields actually must match the reference. No mandatory-field list is established yet. |
| F6 | Replace whole-group automatic syncing with explicit ownership | Depends on F5. Required matches are source-owned/read-only. Recommend copying editable defaults on initial creation only, preserving them on replacement, with an explicit copy action; not yet agreed. |
| F7 | Copy/paste visualization parameters between layers | Separate requested feature; independent of the readiness corrections. |
| F8 | Chart layout after tab return; Time Series Retrieve's unconditional empty unavailable-bands warning | Concrete browser bugs to reproduce and fix independently of the source-validity policy. |
| F9 | Treat a selected Classification as required for Time Series and CCDC, including native requests | User-proposed direction, recommended for assessment; explicitly changes the previous native-control policy and should remove redundant request-stage coordination. |
| F10 | PyEO: put incompatibility feedback in a section that can repair it | Trace the reported SRC/OPT combination; retain genuine local index-gate validation. |

Prioritise reproducing the concrete F8 failures and assessing F9 before further work on request-band gates. F9 may
supersede some of that machinery; do not implement another band-highlighting system first. F1/F2 and the independent
chart/feedback corrections remain useful. F4 and F5 still need their technical contract/ownership reviews.

**Implementation grouping after reviewing the complete feedback so far (2026-10-23).**

F1-F10 identify issues, not ten required commits. Group implementation into the six correction slices below. Each
slice includes its focused regressions and the relevant combined browser recheck; do not postpone all testing until
the end. These are review boundaries, not exact file/commit counts. New results or a genuinely unresolved technical
contract can change the split; they must not silently expand it.

| Slice | Work grouped together | Covers | Completion evidence / dependency |
| --- | --- | --- | --- |
| S1: Chart layout on tab return | Implemented: defer graph drawing while disabled and make Panel visibility follow the enabled context in the same render. | F8 layout | Focused tests and independent review passed; user reported "Looks good" after the manual checklist and approved committing on 2026-10-23. Detailed per-case browser results were not supplied; see below. |
| S2: Feedback where repairs happen | Consistent Classification/Regression training-data feedback, item-editor explanations and replacement/removal; visible Classification selection in Time Series/CCDC Sources; classifier-input attribution at Classification; repair-oriented PyEO SRC/OPT feedback; correct the empty Retrieve warning. | F1, F2, F10, F8 warning | The single-input selection check passes. Confirmed findings now hold Apply while replacement, Cancel and unchanged Close remain available; the user confirmed Classification's browser recheck passed. The separate Stack Require drop fix passed the user's actual-preview and remove/restore browser check on 2026-10-24. Empty-Provider refinement and S3/S4 remain separate. |
| S3: One selected-Classification validity contract | Require a selected usable Classification for Time Series/CCDC base operations, independently of requested/breakpoint bands; common SRC explanation/action hold; remove redundant band-training stage/watch/messages/server settling. | F9; consumes S2 presentation | Implemented and independently reviewed. User confirmed Retrieve closure/reopen and the already-broken CCDC/count-preview repair checks passed on 2026-10-25. Shared analysis prerequisites cover every operation and named map product. The timing-dependent keyboard check was not attempted in the browser; automated coverage passed. No requested browser recheck remains. |
| S4: Reused samples with Consumer features | Sample each contributing Provider's imagery at its points using Consumer's feature definition; preserve sampling scale, nesting/order and Consumer normalisation; update shared readiness to the same derivability contract. | F4 | Trace the feature-plan/readiness identity before coding; do not split execution from its corresponding refusals. Depends on the S3 base contract for consumer coverage. Whole-row numeric and controlled live checks plus a one-scene/many-scene witness of no per-scene sampling; recheck S2 repair feedback against the new semantics. |
| S5: Change Alerts settings ownership | Audit Sources/PRC fields, then implement source-owned read-only required matches versus consumer-owned editable values; replace whole-group observation syncing and define initial/explicit copying. | F5, F6 | Audit first; agree the editable-copy policy below. UI and backend use the same effective values for recipe and asset references. Fresh reopen, overrides, reference replacement, Cancel, late metadata and asset metadata are mandatory cases. No automatic overwrite of editable settings. |
| S6: Change Alerts validation and chart agreement | Retain invalid applied choices with field explanations; hold Retrieve and close/disable the analysis chart for an incompatible configured monitoring band; remove redundant panel validation. | F3 | Build on S5's ownership/effective-values contract so the form and operations judge the same configuration. Reproduce Optical-to-Radar, repair, cancellation, valid native controls and recipe/asset reference cases. Preserve operation scope rather than installing full image readiness on the chart. |

**S1: Chart layout on tab return (implemented 2026-10-23; user feedback received).**

- **Cause (reproduced in a mounted test, for Time Series and CCDC).** A recipe tab not selected leaves its layout in
  place (`tabContent.module.css`: opacity only), but its panels are not displayed: `Panel` adds `.disabled`
  (`display: none`) while the enabled context of the tab is false. Data arriving then made `Graph` build its Dygraph
  inside that hidden panel. Dygraph sizes a chart by its element when it builds it: a hidden element has no size, so it
  takes the defaults, written as inline `width: 480px; height: 320px` (`dygraphs/src/dygraph.js`, "assume the user
  will call resize"), and keeps them. Returning to the tab displayed the panel around a chart fixed at that size.
  Nothing resized it: the window did not change, and `Graph` neither watched its element nor rebuilt. A second,
  ordering cause: `Panel` displayed itself again only after the render that enabled it, through the enable detector's
  `onChange` and `setState`, so a child acting on being enabled still found it hidden.
- **Fix, in the two shared owners.**
  - `widget/graph.jsx`: `Graph` reads the enabled context (`withEnabled`). While disabled it draws nothing; once enabled
    it draws what it was last given, building the chart or redrawing it as before, compared with what it last drew. A
    chart already drawn is neither rebuilt nor redrawn by a tab switch alone.
  - `widget/panel/panel.jsx`: `Panel` renders `.disabled` from the enabled context itself (`withEnabled`), so it is
    hidden and displayed in the render that changes the context. A panel mounted inside a context that is already
    disabled is now hidden too. Its tab is invisible either way, and `Graph` waits until it is shown.
  - No data is requested again, and nothing is discarded, delayed or resized by a new mechanism. Chart data, the
    selected pixel and band, and cancellation are owned by the charts and unchanged.
- **Regressions.**
  - `recipe/chartTabReactivation.test.jsx`: the real Time Series and CCDC charts in a real `TabContent`, with Earth
    Engine and Dygraph substituted. Data arriving while the tab is not selected builds no chart. Selecting the tab
    builds one, outside a hidden panel, with the data received and no further request. A chart drawn while selected is
    neither rebuilt nor requested again across a tab switch.
  - `widget/graph.test.jsx`: drawn once enabled, from the data last given while disabled; new data while disabled
    redrawn once enabled without rebuilding; an unchanged chart not redrawn.
  - `widget/panel/panel.test.jsx`: content finds its panel hidden in the render that disables it, and displayed in the
    render that enables it.
- **Witnesses.** With both files from `HEAD`, 5 of the 12 cases fail, including both charts' hidden-arrival cases.
  With only the `Graph` fix, the charts are built while their panel is still hidden (and the panel case fails). With
  only the `Panel` fix, they are built while the tab is not selected (and the graph cases fail).
- **Focused campaign** (two workers): the widgets, the Time Series, CCDC, CCDC Slice, Change Alerts, LandTrendr,
  Mosaic, Masking, Remapping, Classification and Band Math recipes, the chart band and Retrieve tests, and the map,
  152 files and 1966 tests passed. ESLint and `git diff --check` are clean. The full GUI suite was not run for this
  slice.
- **Shared Panel risk review:** this changes visibility timing, not placement, portal targets, panel activation,
  mounting/unmounting or form state. Hidden/visible changes now happen in the enabling render rather than a later
  state update; a panel mounted already disabled now starts hidden. Remaining browser risks are content measuring
  itself while hidden, focus on reactivation and overlay behaviour. A Graph-only solution could instead wait for
  actual element dimensions, but the current enabled-only Graph fix demonstrably needs the Panel ordering change.
  Independent review with old Panel mounted read-only and current Graph fails both hidden-arrival cases while the
  already-drawn controls pass. Independently, the focused chart/graph/panel/tab set passes 50 tests, and unrelated
  form-panel, Stack and Remapping activation/Apply/Cancel tests pass another 32; these do not establish browser layout.
- **Browser feedback (2026-10-23):** after receiving the manual checklist, the user reported "Looks good" and approved
  committing S1. No deployed build or per-case outcomes were supplied, so this is overall user feedback, not a claim
  that every optional graph/Panel variant was individually verified. Retain the checklist for any outstanding cases.
- **Browser checklist:** DOM tests do not establish rendered layout. For Time Series and for CCDC, open a pixel
  chart, switch to another recipe tab before it loads, let it finish, and return. The chart must fill its panel at its
  normal size, without a further segments or observations request in the network panel. Repeat the switch a few times,
  and resize the window once. Also open a chart and switch tabs after it has loaded, and check a LandTrendr chart and
  a layer histogram (the other `Graph` users). As a small unrelated-Panel smoke check, keep an edited Sources/Retrieve
  panel open across a recipe-tab switch, confirm its values, focus and scrolling still work on return and Cancel/Apply
  behave normally; open and dismiss a modal/confirmation as well.

**S2: Feedback where repairs happen (implemented 2026-10-23; Classification's Apply-hold browser recheck passed; separate Stack index-derivation browser check passed 2026-10-24; Stack layout and the empty-Provider refinement remain separate).** Presentation and repair paths
over the existing findings; training semantics and the selected-Classification policy are unchanged (S3/S4).

- **Training data (F1).**
  - *Cause.* Classification registered every training-data declaration with `toolbarMark: false`
    (`unmarkedTrainingDataRequirements`), so its TRN said nothing that Regression's says. Neither data-set editor was
    bound to the findings: the reused-recipe `RecipeSection` rendered a bare `RecipeInput`, so the editor explained
    nothing and offered nothing to repair.
  - *Change.* Classification uses the same `trainingDataRequirements` as Regression, and the unmarked copy is removed.
    Decision trees are exempt by the shared rule (`requiresTraining`), and TRN, which is not a wizard step, is not
    marked while the wizard leads (`panelWizard.reached`); pending evidence marks nothing, as before. The reused-recipe
    reference feedback and missing-features declarations bind the data-set editor through the existing `editor`
    mechanism (`REUSED_RECIPE_EDITOR`: panel `trainingDataSet`, input `recipe`, `blocksApply: false`, `explain: true`),
    judging the recipe built from the edited data set alone: a newly chosen recipe is judged afresh, another data set's
    finding stays on its own item and the toolbar, and nothing is held, so
    replacement, removal and Cancel stay open. `ReusedRecipeInput` (both editors) offers "Open {recipe}" for the
    recipes at fault - `referenceFeedback.origins`, the recipe further up a chain of reuse where it is that one, or the
    missing-features providers, now given as ids - and says that applying the same recipe again does not repair it.
    `openRecipeInTab$` (`recipe.jsx`) selects the recipe's tab where it is open, opens a tab on the session's draft where
    it is closed with its saves unsettled (the cache rules: no storage read replaces a draft), and otherwise reads it
    from storage, deciding again from the session when the read answers, composing the existing tab actions.
  - *Regressions.* `classification/reusedTrainingDataEditor.test.jsx`, for both types over a Provider with no input
    imagery: explanation, Open and hint, nothing held; Open selects a new tab and leaves the Consumer's; a working
    replacement clears it and Apply saves it; left unchanged it still marks TRN; Cancel keeps the applied recipe; a
    chain names and opens the recipe at fault. `reusedTrainingDataFeedback.test.jsx`: both TRN buttons say so. The TRN
    expectations of `outputRequirements`, `wizardSectionMarks` and `trainingDataChain` were updated to the marked
    contract; the wizard-step cases are unchanged, and the unnamed-data-set case now has points, so it still shows its
    own finding.
- **Time Series and CCDC Sources (F2).**
  - *Cause.* Sources opened on Less unless More had been saved, hiding a selected Classification. The shared rule
    locates `UNSUPPLIED_CLASSIFIER_INPUTS` at `dataSets` where another collection would feed the classifier - the
    Optical-to-Radar edit - and the binding said it there.
  - *Change.* Both panels open on More while a Classification is selected, decided once when opened; More/Less toggles
    as before and saves `advanced` as before. `collectionClassifierRequirements` keeps both located findings and their
    own messages but says both beside the Classification (`editor.input`), which Sources show while it cannot be used;
    the data sets' own validation is unchanged. Phenology shares the binding and gets the same location; its policy
    (a refused draft cannot be applied) is unchanged.
  - *Regressions.* `sourcesClassifierInputs.test.jsx` (moved from `timeSeries/.../sourcesCompatibility.test.jsx`, now
    over both panels): opening view and toggling; Optical-to-Radar explained beside the Classification, the data sets'
    own `notEmpty` still theirs, repaired by Optical again; Cancel; an unusable Classification refused, then replaced;
    repair by Radar with Apply; a saved unusable selection explained on opening. `unselectedClassification.test.jsx`
    now reopens Sources after Apply, as Apply closes it.
- **PyEO SRC/OPT (F10).**
  - *Findings, reproduced.* Optical-to-Radar Classification input with Landsat monitoring: gate off, SRC alone
    (`UNSUPPLIED_CLASSIFIER_INPUTS` at the classification); gate on NDVI, also OPT (`UNAVAILABLE_GATE_INDEX`,
    `BASELINE`), whose message offered "choose another index", though no index the gate offers can be computed of radar
    bands.
  - *Change.* The shared rule locates a `BASELINE` gate finding at the classification where its imagery supplies none
    of `GATE_INDEXES` (moved into the shared type, one list for rule and panel); otherwise at the gate index, OPT's
    genuine choice. Sources say it beside the Classification (`noGateIndex`, `explain: true`). `MONITORING` findings and
    OPT's own panel validation are unchanged.
  - *Regressions.* `pyeoAlerts/inputIncompatibility.test.jsx`: radar with the gate off and on, SRC marked and OPT not,
    explained beside the Classification and repaired by optical imagery; imagery feeding the classifier but offering no
    gate index, SRC with the gate on and nothing with it off; an index the imagery cannot provide while it provides
    another, OPT marked until NDVI is chosen. The shared `readiness.test.js` radar case asserts the new location.
- **Time Series Retrieve's empty warning (F8).**
  - *Cause.* The panel's `selectedValues` turned the form's empty value `''` into `['']`, which the Time Series gate's
    offer check named as unavailable: "These bands are no longer available from this recipe: .".
  - *Change.* `selectedValues` drops the empty value; the gate, holds, reconciliation and submission rechecks are
    unchanged, and an empty selection meets the field's own `atLeastOne` rule.
  - *Regressions.* `retrieveTrainingReadiness.test.jsx`: opened with nothing selected, over a working and a point-free
    Classification, no warning and Apply held; a native indicator then submits.
- **Consolidated.** One training-data declaration set for both recipe types (the unmarked copy removed); one gate-index
  list for the shared rule and the panel; one classifier-input explanation location for Time Series, CCDC and
  Phenology. No validator, loader or navigation framework was added; the editor feedback uses the existing `editor`
  binding and `referenceFeedback` metadata.
- **Witnesses.** With each part's files from `HEAD`: training data 9 of 34 fail (editor binding alone 6, recipe
  sections alone 6; TRN marks, by mutation, 3); Sources 6 of 14 (binding 4, panels 2); PyEO 2 of 7 (shared rule alone 2,
  SRC binding alone 2); Retrieve 2 of 17.
- **Focused campaign** (two workers): GUI recipe suites for Classification, Regression, PyEO, CCDC, Time Series,
  Phenology, CCDC Slice, Change Alerts, Remapping, Masking, Band Math and Stack, the shared Retrieve panels and
  requirement/section-mark tests, the process panels, `recipeInput` and autosave, 102 files and 1410 tests; shared
  `test/recipe` 1275 and gee PyEO 12. ESLint and `git diff --check` are clean. The full GUI suite was not run.
- **Independent review: two corrections, applied.** The normal focused GUI cases passed (58) and the shared
  readiness/PyEO checks passed (78), but three added review scenarios failed for both Classification and Regression
  (six failures). Temporary review probes were removed; production code was not changed by the reviewer.
  - **Item isolation:** with one healthy reused data set open for editing, add another data set referring to a Provider
    with no input imagery. The healthy item's Recipe field shows the other Provider's error and Open action.
    `REUSED_RECIPE_EDITOR.candidate` keeps every data set, and `OutputCandidate.findings()` takes the first matching
    read without restricting it to the edited item. Scope the candidate or returned feedback to that data-set identity;
    a genuine problem on another item still belongs in the applied list/toolbar, not this editor.
  - **Navigation/draft safety:** delay Open Provider's storage answer; open that Provider elsewhere and edit it before
    the answer arrives. The late answer overwrites the edited model and creates a second tab with the same recipe id.
    Separately, opening a closed cached Provider with an unacknowledged save also replaces its draft with storage.
    `openRecipeInTab$` checks whether it is open only before starting the read, then calls `openRecipeRevision`
    unconditionally. Preserve held drafts using the existing cache/save rules and recheck current tab/record state
    when the read completes. Add regressions for both cases plus repeated/concurrent Open actions; do not introduce a
    parallel navigation cache or let repair navigation discard edits.
  - **Corrections.** The editor's candidate is the recipe built from the edited data set alone, as an editor candidate
    is (`recipeFormPanel.jsx`), so only its own findings reach the editor. `openRecipeInTab$` decides from the session
    before reading and again when the read answers: an open tab is selected, a held draft opened as held, and only
    otherwise is storage's record opened, in one tab. No navigation cache was added.
  - **Regressions** (`reusedTrainingDataEditor.test.jsx`, both types): the editor of a healthy reused data set beside a
    broken one says nothing and offers no Open, while the toolbar still marks TRN; a Provider opened and edited while
    its read is pending keeps its edit and one tab; two Opens before the read answers open one tab; a closed Provider
    whose save is unacknowledged opens as held, reading nothing. The harness forgets each recipe's save state after a
    test, as the session's save coordinator outlives it.
  - **Witnesses.** With the pre-review `openRecipeInTab$`, the three navigation cases fail for both types (6); with the
    candidate keeping every data set, the isolation case fails for both (2). The editor file passes 20 of 20.
  - **Correction review:** no further code findings. An independent run of the editor, recipe opening/closing,
    save-coordinator, listing and cache-claim tests passed 92 tests in six files. ESLint on the corrected files and
    `git diff --check` passed. Browser verification remains separate.
- **Subsequent browser feedback and scope correction (2026-10-23):**
  - **Open Provider: remove, user decision.** The action switches recipe tabs from inside a modal and is broken in the
    browser; the user wants recipe-scoped modals handled separately, with generic recipe-opening in the selector later.
    Remove the action from both training-data editors rather than repairing modal ownership or building a special
    navigation route for this slice. This supersedes the earlier Open Provider requirement and its browser checks.
    `openRecipeInTab$` and its new `showHeld` helper currently have only this caller: remove them, their now-unused
    imports, the Open/open-error translations and tests dedicated to the removed operation. Preserve the item-isolation
    correction and its tests, along with the rest of S2. Earlier navigation review/witness results above are historical.
  - **Repair wording:** the user found "Applying this recipe again does not repair it..." awkward. Recommended wording
    is "Fix the problem in {recipe}, or select another recipe." The located finding should say what is wrong; the hint
    should not discuss re-applying implementation mechanics or imply a direct Open action still exists.
  - **Empty training data versus a broken data set:** the user questions a red TRN instruction "Add training data",
    since collecting points on the map is another valid route. The recommendation is neutral setup guidance for no
    points yet ("Collect points on the map or add a training data set"), while retaining readiness holds and marking
    TRN for a genuinely unusable configured data set. Do not restore blanket suppression of broken-Provider feedback.
    This recommendation is recorded separately from the explicit decision to remove Open Provider.
  - **PyEO OPT still shows an upstream fault:** the user confirms SRC marks the Classification, but opening OPT still
    gives an index validation error for the radar-feature Classification versus optical monitoring case. The whole
    PyEO analysis is already invalid through classifier-input compatibility, independently of the gate; switching the
    gate off cannot repair that. `Options.explainGateIndex()` still derives and sets its own field error regardless of
    the failed source prerequisite, so moving the toolbar finding alone was insufficient.
    **Agreed form behaviour (2026-10-23):** one actionable compatibility explanation at SRC/Classification; retain the configured gate,
    index and threshold visibly but disable the gate controls while source compatibility is invalid or not yet
    established, with neutral guidance to resolve SRC (or a checking state). Do not automatically clear the gate or
    replace its index. Independent alert controls may remain editable. No duplicate red index error for that upstream
    fault. When the source is compatible again, resume normal local gate editing/validation. Implemented under
    "Browser corrections" below; see revised F10. A compatible Classification with an unsupported optional gate is OPT's own
    repair case, including turning the gate off when none of its indexes can be supplied.
- **Browser corrections, applied (2026-10-23):**
  - **Open Provider removed.** `ReusedRecipeInput` renders the reused recipe's `RecipeInput` with no label action.
    `openRecipeInTab$` and `showHeld` are removed (`recipe.jsx` is as at `HEAD`), with the `reusedRecipe.open` and
    `process.recipe.openError` translations and the editor test's five Open cases and their harness (delayed answers,
    held draft, save-state cleanup). The single-data-set candidate, explanation, replacement, removal, Cancel and the
    isolation case are kept.
  - **Repair hint.** "Fix the problem in {recipe}, or select another recipe." ("Fix the problems in ..." for several),
    naming `referenceFeedback.origins`.
  - **No training data versus a broken data set.** `NO_TRAINING_DATA` is declared `toolbarMark: false` for both types
    (`classificationTrainingDataRequirements`, `regressionTrainingDataRequirements`: one factory, differing only in the
    guidance). It still holds Retrieve, layers and dependent recipes; the shared rule, decision-tree exemption, wizard
    and pending semantics are unchanged. The Training data panel shows its message as neutral guidance - an info
    message above the list, or the empty list's own message - read from the list's item (`TRAINING_DATA_LIST`):
    Classification "Collect points on the map or add a training data set."; Regression, which collects nothing on its
    map, "Add a training data set." Missing-features and reused-recipe findings still mark TRN, the item and its editor.
  - **PyEO gate.** Shared rule: `UNAVAILABLE_GATE_INDEX` is judged only where `UNSUPPLIED_CLASSIFIER_INPUTS` finds
    nothing - an analysis the monitoring data cannot classify has nothing to gate - and is always located at the gate
    index, naming as `alternatives` the other offered indexes both the baseline and monitoring may supply. S2's
    relocation of a no-index `BASELINE` finding to the classification, and its `noGateIndex` SRC declaration and
    message, are removed. OPT binds `options.gateIndex` as its editor, so the draft's index is judged by that rule;
    `Options.explainGateIndex` and `gateIndex.unsupported` are removed. With no alternative, the message says to turn
    the gate off (`gateIndex.noAlternative.*`). OPT reads `gateDependencyOf` over the recipe's output requirement reads
    (`withOutputRequirementReads`, `selectedSource.jsx`): `INCOMPATIBLE` where SRC's classifier-input declarations hold
    a located finding, `CHECKING`/`UNAVAILABLE` where their output read is that. Meanwhile the gate's on/off, index and
    threshold stay shown as saved and disabled, with neutral guidance (`useIndexGate.dependsOnSources.*`); the
    detection count stays editable and nothing is cleared. The offered index list and default index followed Sources'
    last read of the classification's bands until the freshness correction below.
  - **Regressions.** `reusedTrainingDataFeedback.test.jsx`, both types: no training data says how to add some in the
    panel, marking neither TRN nor a data set, Retrieve held; a reused recipe storing no point likewise; a Provider
    without input imagery still marks TRN and gives no such guidance. `reusedTrainingDataEditor.test.jsx`, both types
    (12): explanation and the new hint, no action in the recipe field's label, nothing held; replacement and Apply;
    unchanged; Cancel; isolation; a chain naming the recipe at fault. `regression/trainingDataReadiness.test.jsx`: the
    guidance in the mounted panel and an unmarked TRN, through the editor's reload, Cancel and Apply.
    `wizardSectionMarks.test.jsx`: a Regression without training data unmarked through its wizard; its wizard-reach
    cases now use an unnamed data set. `outputRequirements` and `trainingDataChain` are back to the unmarked contract.
    `pyeoAlerts/panels/options/options.test.jsx`, rewritten over the real runtime and recipe types (12): incompatible
    source (controls disabled with guidance, choices kept, no index error, detection count editable), recovery with
    choices kept, checking then answered, unavailable, an unsupported index repaired by another, no alternative repaired
    by gate-off, Cancel, On disabled where no index is offered, default-index selection.
    `inputIncompatibility.test.jsx`: radar gate on/off marks SRC alone with one explanation; visible-band imagery with
    the gate on marks OPT ("turn the gate off"), not SRC. Shared `readiness.test.js`: radar refused at the
    classification alone; `alternatives` named, and none.
  - **Witnesses.** With the pre-correction S2 files (`recipe.jsx`, `reusedRecipeInput.jsx`,
    `trainingDataRequirements.js`, both recipe types, both panels), 20 of 136 training-data tests fail. Restoring an
    Open-style label button fails the label-action case for both types (2); a candidate keeping every data set fails
    isolation for both (2). With the pre-correction shared rule, PyEO declarations, OPT panel and `selectedSource.jsx`,
    7 of 79 PyEO GUI tests and 3 of 71 shared readiness tests fail.
  - **Verification.** Focused GUI campaign (two workers): Classification, Regression, PyEO, Time Series, CCDC,
    Remapping, Masking, Stack, Band Math, Change Image, Change Alerts, `sourcesClassifierInputs`,
    `unselectedClassification`, `wizardSectionMarks`, `outputRequirements`, recipe opening/closing, save-coordinator,
    listing, autosave, cache claims and `recipeInput`: 93 files and 1278 tests passed; translations 2. Shared
    `test/recipe` 1277; gee PyEO, model-derived bands and asset export, 4 files and 137 tests. ESLint and
    `git diff --check` are clean. The full GUI suite was not run.
  - **Earlier policy: empty Providers stay neutral; questioned again in the subsequent browser recheck below.** A data set reusing a recipe that stores no point is also `NO_TRAINING_DATA` alone, so it is now
    unmarked and guided like an empty list; the shared finding does not tell the two apart.
    **Review recommendation:** keep this neutral. An empty Provider is valid beside another data set contributing
    points; a wholly empty chain needs recipe-level setup guidance, rather than declaring each Provider broken. No
    extra detail on the shared finding is needed for that policy.
  - **Independent correction review (2026-10-23): PyEO index choices still use stale evidence.** The shared gate
    validation now follows the current Classification, but `Options.gateContext()` still reads
    `ui.classificationBands`, which only Sources refreshes. Two temporary mounted probes changed the Classification's
    input without changing that UI copy: visible-only imagery repaired to red/NIR leaves the gate's On button
    disabled; red/NIR changed to NIR/SWIR leaves NBR absent from the offered repair choices. Both probes fail on the
    current code. The existing recovery test's `holdInput` also updates the UI copy, so it does not cover an upstream
    repair alone. Derive the offered/default indexes from the same current resolved evidence as the gate rule, keep
    selected choices through checking/unavailability, and add regressions that do not write Sources' UI copy. Do not
    require reopening Sources or add another loader/cache. This remaining repair gap is not a claim that the stale
    UI copy was introduced by the browser corrections.
    **Independent checks:** the six focused GUI files (`options`, reused-data editor/feedback, PyEO input
    incompatibility, Regression readiness and wizard marks) passed 86 tests; shared readiness and PyEO passed 80.
    ESLint on the reviewed changed sources and OPT tests, and `git diff --check`, passed. The two failing freshness
    probes were removed; the reviewer changed only this roadmap, not production code or permanent tests. No browser
    recheck or full GUI suite was run.
  - **Freshness correction, applied (2026-10-23).** OPT offers, and turns the gate on with, the indexes the shared gate
    rule finds readable now: `GateIndexCandidates` (`pyeoAlerts/gateIndexCandidates.js`) judges the recipe as applied
    with the gate on each of `GATE_INDEXES` through the existing `OutputCandidate` and the exported gate declaration
    (`GATE_INDEX_REQUIREMENT`), each watched while OPT is open and sharing the runtime's observations; one refused is
    not offered, one still being judged is not ruled out. NDVI is preferred, then the first readable. OPT no longer
    reads `ui.classificationBands` (its `mapRecipeToProps` and `gateContext` are removed); Sources' first-set-up
    proposal still uses its own read through `gateIndexes.js`. No loader or cache was added, and Sources need not be
    reopened. Choices are kept through checking and unavailability as before.
    **Regressions** (`options.test.jsx`, 14): the fixtures no longer hold the UI copy, and `holdInput` changes only the
    Classification. Visible-only imagery changed to red/NIR enables On, which takes NDVI and Apply saves it; red/NIR
    changed to NIR/SWIR, gated on NDVI, says so beside the index and offers NBR, which repairs it and Apply saves it.
    **Witness:** with the copy-based choices restored and the copy seeded at opening, those two fail as reproduced (On
    stays disabled; no NBR option); the other 12 pass. **Checks:** PyEO GUI 9 files and 81 tests; with Classification,
    Time Series, CCDC, `sourcesClassifierInputs`, `outputRequirements` and `wizardSectionMarks`, 39 files and 428
    tests (two workers). ESLint on the changed files and `git diff --check` are clean. Shared code is unchanged since
    its 1277-test run. No browser recheck or full GUI suite was run.
    **Independent correction review:** no further code findings. The offered/default indexes use the same gate
    declaration and current candidate-read evidence as validation, with all three candidate watches stopped when
    OPT unmounts. The two reported freshness failures are covered without a UI copy. Independent GUI runs passed
    214 tests in 14 files: PyEO and `sourcesClassifierInputs` (95), then the runtime, output registry, output
    requirements and training-data editor (119). ESLint on the four correction files and `git diff --check` passed.
    The reviewer changed only this verification record. The targeted browser recheck remains pending; no full GUI
    suite was run.
- **Further browser recheck feedback (2026-10-23; user reported, not independently browser-observed).** The user
  reports the checks below completed; unmentioned behaviour is treated as passing, as requested. This supersedes
  "browser recheck pending" above for that run, not the historical automated results or the need to recheck fixes.
  Production code and tests have not been changed in response to this new feedback.
  1. **Unchanged data-set editor offers Apply.** Reported for Classification. Reproduce opening an existing reused
     data set without editing it, including an upstream error, and keep Close rather than Apply when its applied
     settings are unchanged. Inspect mount-time initialization (`PanelSections` sets the wizard step; `RecipeSection`
     loads the selected recipe and sets the name) and distinguish real edits from acquired metadata/defaults. No root
     cause is confirmed yet. Do not change the shared form's dirty contract merely to hide this one symptom. Cover
     Classification and Regression, a genuine replacement/edit, Cancel and a delayed recipe answer.
  2. **One actionable editor explanation.** The blue "Fix the problem in Provider, or select another recipe" repeats
     the existing red "Provider needs attention" feedback. Consolidate the repair instruction into the existing
     field feedback, retain correct upstream-origin names and any useful cause, and remove the duplicate blue hint.
     Keep list/toolbar feedback, editor isolation and replacement/removal/Cancel. This may remove the need for the
     dedicated `ReusedRecipeInput` wrapper; do not expand every generic reference message for this local repair.
  3. **Empty selected Provider: policy question reopened.** Neutral guidance for a recipe with no training data passed.
     The user asks whether explicitly selecting a point-free Provider should instead mark that data set invalid.
     Revised recommendation: retain neutral guidance where no training data has been configured; where a Consumer
     explicitly selects a Provider and its entire training closure is known empty, locate the absence at the selected
     data set so the user can repair it. Do not refuse a Consumer that has points from its own data or another branch
     solely because one branch is empty; that branch can be explained without blocking valid training. Reuse asks for
     samples, not the Provider's trained image; a Provider with no own points can also reuse a non-empty chain. The
     Consumer must still be held when its whole closure is known empty. This refines the earlier blanket neutral
     presentation and requires detail on the existing absence finding, not another recursive validator. Agree the
     item-level presentation/strict policy before implementation; checking the Provider's `IMAGE_OUTPUT` is not the
     appropriate substitute.
  4. **PyEO redundant SRC guidance and terminology.** With a confirmed SRC error, the neutral sentence explaining that
     the index gate depends on SRC is redundant; retain the disabled dependent controls and their values without a
     second explanation of that fault. Short checking/unavailable status can still explain an otherwise unexplained
     disabled group. User-visible messages should call the option "Require drop", as its field does, rather than
     "index gate"; internal identifiers need not change. Treat these as wording/presentation corrections.
  5. **PyEO single Classification input is an operation prerequisite.** The user supplied a server trace from
     `pyeoAlerts.js:72`: "the classification must have exactly one input image", surfaced as "Failed to load layer /
     Internal error". Code confirms execution always requires one input, with Require drop off or on. Sources only
     rejects a newly proposed multi-input selection (`onClassification(..., proposing)`); applied selections and
     upstream edits bypass that check. Declare this in shared PyEO readiness, bind it to SRC/Classification, and hold
     client actions and server execution before product work. Reuse the held Classification record; pending/unavailable
     records establish no cardinality finding. Suppress dependent index errors while this prerequisite fails. Test
     one-to-two inputs and repair, gate off/on, an initially saved unsupported selection, and server refusal.
  6. **Require drop reads imagery, not training-feature selections.** The user's correction is right: whether a
     spectral index can be obtained depends on the Classification's baseline input image and the monitoring scenes,
     independently of which of those bands its classifier selects. The prior browser instructions did not make that
     distinction or the input-type distinction below clear enough. Keep index availability separate from classifier
     feature compatibility, and test changing the source output rather than only `bandSetSpecs.included`.
  7. **Recovery through Stack remains unresolved.** Adding nir back to an optical Stack over an EE asset did not
     re-enable Index/Require drop in the user's browser. Current tests use direct `ASSET` inputs; they do not prove
     this recipe-reference path. Code tracing establishes a relevant distinction: `baselineSuppliesIndex` accepts raw
     red/nir for an asset, but a `RECIPE_REF` must currently expose a band literally named `ndvi`; execution likewise
     asks a recipe input for that named band instead of deriving it from raw bands. A local call confirms raw
     red/nir => true for ASSET, false for RECIPE_REF; adding a named ndvi => true for RECIPE_REF. This could explain
     availability without establishing the entire cause of the reported disabled controls. Reproduce the real
     Asset -> Stack -> Classification -> PyEO chain, including Stack mappings, current evidence, saves and gate
     on/off. Distinguish a genuinely unavailable index from a stale/pending read before changing freshness again.
     Recommended product direction, not implemented: allow deriving Require drop's index from suitable raw baseline
     bands for recipe inputs too, preserving index units/masks and existing provided-index behaviour, rather than
     requiring users to add a redundant ndvi output to a Stack. Change execution and shared availability together;
     merely enabling the UI while execution still asks for a missing named band is insufficient. This is a separate
     bounded execution/readiness correction if it cannot remain within S2's presentation scope.
  **Next correction order:** finish the unchanged-editor/duplicate-message and PyEO presentation corrections; add the
  shared single-input prerequisite; reproduce and decide the Stack/index derivation correction. Keep S2 uncommitted
  until those intended corrections are reviewed. Do not silently include the still-open empty-Provider policy or the
  independent Stack layout work as an agreed semantic change.
- **Corrections from that feedback, applied (2026-10-23).** Items 1, 2, 4 and 5 above; items 3, 6 and 7 and the Stack
  layout stay separate follow-ups, unimplemented. The Stack recovery failure is unresolved: the tests below use direct
  `ASSET` inputs and establish nothing about the Asset -> Stack -> Classification -> PyEO path.
  - **Unchanged editor offered Apply (item 1).** *Cause:* `PanelSections` sets the wizard step to 0 when it mounts,
    and Classification's `modelToValues` gave `wizardStep` no value, so its initial "" differed and the form was
    dirty on opening - for every Classification data set, working or broken; Regression's editor has no step. A
    second cause, independent of it: `RecipeSection` renamed the data set after the reused recipe's loaded title on
    every load, so a saved name differing from that title was an edit too. *Change:* `wizardStep: 0` in Classification's
    `modelToValues`; both `RecipeSection`s keep the saved name while the recipe loaded is the one the data set was saved
    with, and name it after the recipe otherwise. A recipe chosen while the saved one is still being read keeps its
    name: `RecipeInput` already cancels the earlier read. The shared form's dirty contract is unchanged.
  - **One explanation (item 2).** The editor bindings say their findings through a new optional `editor.message`
    (`recipeFormPanel.jsx`, string-input editors only; others say the requirement's message as before):
    reference feedback as "Fix the problem in {recipe}, or select another recipe." naming the origin recipe at fault,
    the actual upstream recipe in nested reuse; missing features as their cause, then that instruction. Lists, toolbar
    and other reference messages are unchanged. `ReusedRecipeInput` and its blue hint are removed; both
    `RecipeSection`s render `RecipeInput` directly again.
  - **PyEO presentation (item 4).** With a confirmed SRC finding OPT says nothing more; Require drop, Index and the
    threshold stay disabled with their values, and the detection count editable. Only `CHECKING`/`UNAVAILABLE` keep a
    short status. User-facing PyEO messages say "Require drop" instead of "index gate"/"the gate" (OPT's messages,
    including `useIndexGate.unavailable`); identifiers are unchanged.
  - **Single input (item 5).** Shared `MULTIPLE_CLASSIFICATION_INPUTS`, judged on the held Classification record
    (`recordsOf`), located at `sources.classification` with its `count`; a record not held or unreadable establishes
    nothing, and one with no input is that recipe's own refusal, said as before. While it holds, PyEO judges neither
    classifier inputs nor the gate, so one SRC explanation stands, gate on or off. GUI: bound beside Classification
    in Sources (`multipleInputs`) and part of `gateDependencyOf`, so OPT's gate waits on it as on an incompatible
    classifier. Server: exports to Drive and Workspace are refused by the same readiness before anything is built.
    Sources' selector-only refusal (`singleInputRequired`) is removed: a newly chosen classification of several
    inputs is now refused by the shared rule like a saved one, holding Apply.
  - **Regressions.** `reusedTrainingDataEditor.test.jsx` (22, both types): unchanged editors over a broken and a working
    Provider offer Close; a saved name is kept; another recipe offers Apply and names the data set; a recipe chosen
    while the saved one is being read stays chosen when that read answers; one explanation, no blue hint, no label
    action; missing features with their cause; the nested origin; isolation, Apply, Cancel.
    `inputIncompatibility.test.jsx`: one input to two and back, gate off and on; saved with two (one radar), saying
    only the count; chosen in Sources, Apply held. `options.test.jsx`: two inputs keep the gate disabled as saved with
    no index error or SRC sentence, and repair restores it; a confirmed incompatibility shows no sentence. Shared
    `readiness.test.js`: two inputs refused at the classification alone, gate off and on; no record held, no finding.
    gee `imageDriveExport.test.js`: a PyEO export over two inputs refused, gate off and on, before any build, folder or
    export.
  - **Witnesses (targeted mutations, each restored).** `wizardStep` default removed: 4 editor cases fail
    (Classification); saved name not kept: 2; `editor.message` hook removed: 6. Shared rule removed: shared 2, gee 2,
    GUI 5; its SRC binding/OPT dependency removed: GUI 5; OPT's SRC sentence restored: 2; selector-only refusal restored:
    1.
  - **Verification (two workers).** GUI: Classification, Regression, PyEO, Time Series, CCDC, Remapping, Masking,
    Stack, Band Math, Change Image, Change Alerts, `sourcesClassifierInputs`, `unselectedClassification`,
    `wizardSectionMarks`, `outputRequirements`, recipe/close/autosave/cache claims, `recipeInput` and translations, 92
    files and 1254 tests. Shared `test/recipe` 1280. gee PyEO and image exports, 5 files and 111 tests. ESLint and
    `git diff --check` are clean. No full GUI suite or browser run.
  - **Slip during witnessing:** a restore script ran a bare `git checkout -q`, which with no paths changes nothing; the
    working tree and index were confirmed unchanged.
  - **Independent review of these corrections (2026-10-23):** no further code findings. The unchanged-editor fixes
    initialize the existing step and preserve the saved name without changing shared dirty tracking; the optional
    message hook preserves the default for other editors. The shared multi-input rule uses the held record, with
    client feedback and dependent-control handling bound to that finding. Independent runs passed 189 GUI tests in
    14 files (editor, PyEO, Regression readiness, Sources, wizard marks and output requirements), 83 shared
    readiness/PyEO tests, and 15 Drive/Workspace export tests. ESLint on the reviewed changed files and
    `git diff --check` passed. The reviewer changed only this verification record. No browser run or full GUI suite;
    Stack recovery and the other separate follow-ups remain unverified by these checks.
- **Latest browser recheck result and editor-policy correction (2026-10-23; user reported).**
  - **Training-data editor:** the user reports the remaining issue is selecting a Provider that samples no nir, seeing
    the combined cause/repair validation, and still being able to Apply. Code confirms `REUSED_RECIPE_EDITOR` is
    `blocksApply: false`, inherited by the missing-features editor; this was intentional in the earlier presentation-only
    policy. **New user requirement:** a confirmed finding on the edited reused data set must hold Apply. Use the
    existing candidate/form blocking mechanism for both Classification and Regression; no second validator. Keep
    choosing another recipe, removal, Cancel and Close for an unchanged item available. A compatible replacement
    clears the finding and enables Apply. Preserve item isolation, and do not turn pending/unavailable evidence into
    a confirmed error. Cover the disabled Apply and direct form submission, repair, an unchanged broken item's Close,
    and a healthy item beside a broken one. This supersedes earlier S2 acceptance that deliberately allowed applying
    a known-broken selection. Other items in this training-editor recheck were not reported as failures.
  - **PyEO multi-input check:** choosing a Classification with two input images now gives the correct validation,
    confirmed by the user. This is evidence for that browser case, not a claim of an independently observed run.
  - **PyEO same-asset versus Stack comparison:** Require drop/Index work for the optical asset directly but remain
    unavailable when the Classification uses a Stack containing a subset of the same asset's bands, including red
    and nir. With Require drop already on, selecting the Stack-based Classification gives the no-alternative NDVI
    error. This matches the traced ASSET/RECIPE_REF asymmetry: recipe inputs are asked for a named ndvi band rather
    than calculating it from raw red/nir. The existing validation matches current execution, so changing only the
    dropdown is insufficient. Next bounded follow-up: reproduce this exact chain, then align shared availability
    and execution so recipe inputs can derive the index from suitable raw bands, preserving existing index output
    units/masks and the provided-index path. Test actual Stack output/mapping changes, not only direct assets or the
    Classification's selected training features. A PyEO layer rendering with Require drop off is expected because
    the optional drop requirement is not executed; with it on, an unavailable index must hold execution.
  - **Scope:** finish the confirmed-finding Apply hold before committing S2. Keep the Stack execution/readiness
    correction as the next separate fix; the other deferred policies and layout work are unchanged. No production
    code or tests changed while recording this feedback.
- **Browser recheck instructions used for that run:**
  1. Classification and Regression: open an existing reused data set, working and broken, and leave it untouched:
     Close, not Apply. Choose another recipe: Apply. Cancel keeps the applied one.
  2. Over a Provider with no input imagery: the recipe field says only "Fix the problem in Provider, or select another
     recipe."; no blue hint. In nested reuse it names the recipe at fault.
  3. PyEO over a radar-feature Classification: SRC explains it; OPT shows Require drop, Index and threshold disabled
     with their values and no extra sentence. All OPT messages say "Require drop".
  4. PyEO: add a second input image to its Classification in that recipe's tab: SRC says so beside Classification, gate
     off or on, OPT's gate disabled; layers and Retrieve held. Remove it again: repaired. Choosing a two-input
     Classification in Sources is refused, Apply held.

- **Editor-policy correction, applied (2026-10-23).** A confirmed finding on the edited reused data set now holds
  Apply. `REUSED_RECIPE_EDITOR` no longer sets `blocksApply: false`, so it - and the missing-features editor built on
  it - holds Apply through the existing candidate/form blocking (`recipeFormPanel.jsx` `blocked()`, `inputFeedback`),
  which `Form.Panel.apply()` refuses on every submission path, Enter and form submission included. Close of an
  unchanged item is unaffected: it is offered whenever the form is clean, valid or not. Pending or unreadable evidence
  holds nothing, as `OutputCandidate` refuses only confirmed reads; isolation is unchanged, the candidate being the
  edited data set alone. This supersedes S2's earlier explanation-only acceptance for these editors. No validator,
  loader, cache or operation was added; shared dirty tracking is unchanged.
  - **Regressions** (`reusedTrainingDataEditor.test.jsx`, now 32, both types): in a healthy data set's editor,
    choosing a Provider sampling no nir, or one without input imagery, shows the one explanation (cause and repair,
    or repair), disables Apply, and a submitted form saves nothing; repairing that Provider upstream clears it and
    Apply saves it; a compatible replacement saves; Cancel keeps the applied recipe. Existing cases kept: an unchanged
    broken item closes; a broken item's compatible replacement saves; isolation; nested origin. The name and
    delayed-answer cases now choose a compatible spare recipe instead of the broken Provider.
  - **Witnesses.** With `blocksApply: false` restored, the six refusal/recovery cases fail (three per type). With
    `Form.Panel.apply()`'s invalid guard removed and the binding blocking, the four submitted-form cases fail.
  - **Verification (two workers):** Classification and Regression suites, `wizardSectionMarks`, `outputRequirements`,
    `unselectedClassification`, `widget/form` and `recipeInput`, 15 files and 214 tests. ESLint on the changed files
    and `git diff --check` are clean. No shared code changed, so nothing broader was run; no full GUI suite or browser
    run. The PyEO multi-input browser result above stands; the Stack Require drop derivation, empty-Provider
    refinement, Stack layout, S3/S4 and Sources sizing remain untouched.
  - **Independent review (2026-10-23):** no further code findings. Both editor declarations now use the existing
    candidate/form blocking; the form's invalid guard covers direct submission and clean Close remains available.
    Independent editor, feedback, Regression readiness and form runs passed 87 tests in seven files. ESLint on the
    binding and editor test, and `git diff --check`, passed. The reviewer changed only this roadmap; no production
    code or tests, no full GUI suite or browser run.
  - **Browser result (2026-10-23):** the user reports "Classification verified - all good" for the latest Apply-hold
    recheck. Record Classification as passed; Regression was not explicitly included in that confirmation. The PyEO
    Stack Require drop issue remains separate and unresolved by this result.
  - **Browser recheck (pending):** Classification and Regression, in a working data set's editor: choose a Provider
    sampling no nir - the cause and repair show, Apply is disabled, Enter applies nothing; choose one without input
    imagery - likewise; choose a working recipe - Apply saves it; Cancel keeps the applied one. Open a broken data set
    unchanged: Close works. Mounted tests cover upstream repair; recipe-modal navigation remains a separate follow-up.

- **Require drop over a Stack input: index derivation, applied (2026-10-23; separate execution/readiness fix).**
  - **Cause, confirmed in code and tests.** Readiness (`baselineSuppliesIndex`) and execution agreed, but only for
    assets: an `ASSET` input's index was calculated of its spectral bands, while a `RECIPE_REF` input had to output a
    band literally named after the index, which execution then selected (`imageFactory(input, {selection: [index]})`).
    A Stack exposing red and nir but no ndvi was therefore refused - in OPT as "no alternative", by readiness, and it
    would have failed in execution - while the same asset used directly was accepted. With the old rule restored,
    the Stack regressions below fail and the direct-asset controls pass. Not reproduced in a browser by the agent.
  - **Derivation contract.** One shared decision, `baselineIndexSource(baseline, index)`
    (`lib/js/shared/src/recipe/type/pyeoAlerts.js`), over the input's type and output band names: `PROVIDED` where a
    recipe outputs a band of the index's name; otherwise `CALCULATED` where it outputs every band
    `REQUIRED_BANDS_BY_INDEX` names (an asset always takes this path, as before); `null` where neither; `undefined`
    while the bands are not known, which refuses nothing. `baselineSuppliesIndex` (readiness, OPT's choices and its
    candidates, Sources' set-up proposal) and execution's `baselineGateIndex$` (`lib/js/ee/src/pyeo/baselineGateIndex.js`)
    both follow it. A recipe's names are those its declaration outputs - a Stack's mapping (`stackOutputNames`) - not
    the asset beneath or the Classification's selected training bands.
  - **Execution.** An asset's index is calculated of the whole asset as before. A recipe providing the index is
    selected as before, already stored at ×10000 int16, never scaled again. A recipe otherwise is asked for only the
    required bands (`selection`), and the index calculated with the existing `calculateIndex` - which divides by
    `OPTICAL_STORED_PER_UNIT` - then ×`INDEX_SCALE` (10000) and int16, as monitoring stores its indexes, so the
    threshold scaling is unchanged. A masked input pixel stays masked; the Stack's own footprint is that of the image
    it builds. Built once, outside the monitoring-scene map, and not at all with Require drop off. Classifier inputs,
    training, normalisation and the single-input rule are unchanged.
  - **Costs.** Require drop on over a recipe input adds one `getBands$` of that recipe (a Stack's reads its mapping
    alone, without Earth Engine) and selects only the required bands. Readiness reads nothing new: the input's
    description it already acquires names the bands. Off, nothing.
  - **Regressions.** Shared `readiness.test.js` over Asset -> Stack -> Classification -> PyEO, the Classification
    training on red alone: NDVI, NDMI and NBR run over the Stack's raw bands; a provided ndvi band runs; red without
    nir, or nir renamed `b8`, refused with no alternative; asset not yet observed, nothing refused; observation
    failed, nothing of the gate; Require drop off, ready. gee `test/ee/pyeo/baselineGateIndex.test.js`: the real index
    definitions over a numeric image double - NDVI [7142, 4418, 0, masked], NDMI [4634, 886, -4634, 5384], NBR
    [5348, 0, -5348, 7307] of Stack outputs, bands read by the Stack's output names, a provided ndvi band passed through
    unscaled, a renamed band refused, the direct asset unchanged. `pyeoIndexGate.test.js`: the Stack asked for its
    required bands, monitoring asked for the index, one calculation, nothing read with Require drop off.
    `pyeoGateReadiness.test.js`: a Drive export over a Stack without nir refused (`UNAVAILABLE_GATE_INDEX`) before
    anything is built, then started once nir is restored. GUI `options.test.jsx` over the real runtime: Require drop
    on NDVI offered and saved over a Stack of red and nir; NBR offered with swir2; removing nir from the Stack says to
    turn it off, restoring it recovers with choices kept; a renamed nir keeps On disabled - only the Stack changing,
    no Sources reopened and no UI copy written.
  - **Witness.** With `baselineIndexSource` judging recipe inputs as before (their own index band only): shared 3,
    gee 6 and GUI 3 of these regressions fail; the asset, provided-index, renamed, pending/unavailable and Require drop
    off controls pass.
  - **Verification (two workers).** Shared `test/recipe` 1289. gee: baseline index, PyEO AOI and gate, the PyEO,
    Drive, Workspace and asset export tests and the classification numeric tests, 181. GUI: PyEO, Stack,
    `sourcesClassifierInputs` and `outputRequirements`, 15 files and 181 tests. ESLint and `git diff --check` clean.
    No full GUI suite, live Earth Engine or browser run: the numeric double establishes the arithmetic and scaling of
    the code path, not Earth Engine's own evaluation.
  - **Independent review (2026-10-24):** no code findings. The shared source decision preserves direct-asset
    calculation and provided recipe indexes, while the new recipe calculation selects the required output bands.
    The extra band read and image construction use the existing execution scope's cached recipe revision; no new
    loader/cache is introduced. Independent checks passed 92 shared readiness/PyEO tests, 37 gee numeric,
    orchestration, AOI and export-guard tests, and 181 GUI tests in 15 files. ESLint on the reviewed sources/tests
    and `git diff --check` passed. Only this roadmap was changed by the reviewer. No live Earth Engine or browser
    run; an actual PyEO preview and Stack remove/restore recovery remain to be checked.
  - **Browser result (2026-10-24; user reported):** in response to the focused Stack checklist, the user says
    "This works exactly like it should". Record NDVI Require drop with an actual PyEO preview, removing nir giving
    the index error and holding preview, then restoring nir clearing it and rendering again with NDVI/threshold
    preserved, as passed. The agent did not run the browser; no exact build, asset ids or numeric comparisons were
    supplied. This closes that browser check, not the separate deferred work or a controlled numerical EE comparison.
  - **Browser check instructions:** with the same optical asset directly and through a Stack mapping red and nir (no
    ndvi), the Classification training on red: turn Require drop on with NDVI in OPT and Apply, and obtain an actual
    PyEO preview for both. In the Stack's tab remove nir: OPT says to turn Require drop off and the preview is held;
    restore nir: OPT recovers with NDVI and its threshold kept, and the preview renders again.

- **Combined browser recheck instructions used for that run:**
  1. Classification and Regression over a Provider with no input imagery: TRN, the data set and its editor say what is
     wrong, with "Fix the problem in Provider, or select another recipe." and no Open action. A working recipe clears
     it; Cancel keeps the applied one; a healthy second data set's editor shows nothing.
  2. A new Classification and a new Regression: TRN is not red; its panel shows the guidance; Retrieve is held.
     Collecting a point (Classification) or adding a data set clears it.
  3. PyEO over a Classification switched to radar imagery, gate on NDVI: SRC explains it, OPT is unmarked. In OPT the
     gate, index and threshold are shown disabled with the SRC guidance, with no red index error, and the detection
     count is editable. Restoring optical imagery re-enables the gate with its choices unchanged.
  4. PyEO over imagery that feeds the classifier but provides no gate index (visible bands only), gate on: OPT says
     to turn the gate off, SRC is unmarked; Off and Apply clear it. Over red/NIR imagery gated on NBR, choosing NDVI
     repairs it.
  5. With OPT open (gate off) over visible-only imagery, change the Classification's input to red/NIR in its own tab
     and return without reopening Sources: On is enabled and takes NDVI. Gated on NDVI, change it to NIR/SWIR: NBR is
     offered and repairs it.

  Time Series/CCDC Sources and the Retrieve warning are unchanged by these corrections.

**S3: One selected-Classification validity contract (implemented, independently reviewed and focused browser rechecks passed through 2026-10-25).**

- **Policy.** A Classification a Time Series' or CCDC's Sources select is part of the configured analysis. It is
  declared once, as the analysis prerequisites of both types (`selectedClassificationPrerequisites`,
  `source/collectionSources.js`; see "Analysis prerequisites" under Operation scope): its `CLASSIFIER` readiness and
  the collection's images carrying what its classifier reads (`UNSUPPLIED_CLASSIFIER_INPUTS`). Every operation and named
  map product of either type is held to them, whatever bands are requested or fitted: Time Series `IMAGE_OUTPUT`
  (count) and `PIXEL_OBSERVATIONS`; CCDC `IMAGE_OUTPUT` (segments), `PIXEL_OBSERVATIONS`, `PIXEL_SEGMENTS` and its
  `COUNT` map product. The Classification's own requirements decide it
  (training data, reused recipes' input imagery and sampled features, input bands); its image is not described. No
  selection needs nothing; a supplied decision tree needs no training. This deliberately replaces the native-band
  bypass: a native request is now held while the selected Classification cannot be trained, until it is repaired or
  deselected. It is a policy, not an execution need: native execution still reads nothing of the Classification
  (`collection.js`), while readiness acquires the evidence training would read - the Classification's input imagery,
  observed even for a native request. Phenology is unchanged (`classifiedOutputNeed` for its classified band only).
- **Inventory and inheritance.** Server routes guarded: pixel observations (`loadObservations.js`), CCDC pixel
  segments (`loadSegments.js`), Time Series download planning/chunks (`task/export/timeSeries.js`), CCDC Segments asset
  export (`ccdcAssetExport.js`), CCDC Drive/Workspace/asset image exports (`imageOutput.js`). GUI: both charts and
  their action (`CHART_OPERATIONS`), both Retrieve panels, canonical-output previews and SRC. CCDC's named count
  preview remains a confirmed gap (below). Downstream consumers inherit through
  their existing need of a CCDC's image: CCDC Slice (image and segment chart), a Change Alerts' segment chart over a
  CCDC, a Masking of a CCDC. A Change Alerts' own image only references its source and is unaffected. Pixel AOI
  projection is unchanged (`recipeForOperation`, `atPixel`); referenced recipes keep their own AOIs. Previously
  unguarded server routes - preview tiles and other map-layer requests - remain unguarded, as before; deferred.
- **Removed.** `CLASSIFIED_COLLECTION` (operation), `CLASSIFIED_COLLECTION_NEEDS`, `requestStages`, the extra server
  stage settling it without the AOI (`requireRequestStages$`, `requireCcdcImageStages$`, `withoutAoi`, the `effective`
  bands parameter), `requestedBandAvailability`, `BandOperationWatch`, the charts' band gates/watches and
  "classified band withheld" message, Time Series Retrieve's band gate and selection watch, CCDC Retrieve's own
  `requestGate`/watch/hold (its export is held by its image output, judged at submission), and the translations
  `process.chartPixel.classifiedBandWithheld` and `process.retrieve.form.bands.classifiedWithheld`. No panel-specific
  SRC validator replaces them.
- **Kept.** Requested-output capability checks (`requireProvidedOutputs$`, `requireCcdcRequestedOutputs$`, coded 400
  `UNSUPPORTED_CLASSIFIED_OUTPUT`), the configured classified-output requirement (CCDC breakpoints, Phenology band),
  `requestedMeasures`/`fittedMeasures`, Time Series Retrieve's current-state offer checks, legacy single-indicator
  normalisation and reconciliation, the draft/save agreement gate, evidence handling, chart lifecycle
  (`pixelChartUpdate`: a finding closes and cancels, pending/unavailable clears and waits).
- **GUI presentation.** Time Series now declares `classificationReferenceFeedback`, as CCDC does: an upstream training
  problem is named beside Classification in SRC and marks SRC; editing stays possible (presentation, Apply not held).
  `sectionOfFindings` (`operationReadiness.js`) also locates an upstream finding through a declaration naming that
  edge's role, so chart and Time Series Retrieve holds name the same section SRC marks. A supported classified band or
  indicator stays selected through the failure and is charted or submitted after repair.
- **Error precedence (changed intentionally).** The configuration is judged first, the Classification's training
  included; requested-output capability second. A training failure therefore now precedes the coded 400 for an
  unprovided requested output; the 400 is unchanged where the configured source is otherwise valid. The former
  capability-before-additional-training order no longer holds.
- **Tests.** Shared `classifiedOutputTraining.test.js` (every operation, native and classified, CCDC native and
  classified breakpoints, each training finding, decision trees, pending/unavailable evidence, repair, no selection,
  Phenology's native bypass kept); `referencedSegments.test.js` (CCDC Slice/Change Alerts segments inheriting the
  policy, waiting for the Classification's input); `operationReadiness.test.js` (fixtures now trainable; what is
  observed restated). gee `loadObservations`, `loadSegmentsReadiness`, Time Series download, CCDC asset, Drive,
  Workspace and image-file exports: native and classified requests refused before product computation, building or
  training; one operation judged; precedence; no selection and decision tree; the existing collection test still
  shows native execution reads nothing of the Classification. GUI: `selectedClassificationChart.test.jsx` (renamed from
  `classifiedBandChart.test.jsx`: close and cancel on a finding, reopen after repair, save or deselection, pending and
  unavailable without closing, operations watched); CCDC `classifiedBreakpointChart`; CCDC `classificationFeedback`;
  new `timeSeries/classificationFeedback.test.jsx` (SRC and the operations naming the same problem); both Retrieve
  readiness tests (native and classified held by Apply and direct submission, choices surviving repair, last-moment
  loss of points, pending/unavailable without a finding). Fixtures now needing a trainable Classification, because a
  Time Series or CCDC selecting one requires it: `unselectedClassification`, `resolvedClassificationBands`,
  `collectionClassifierRequirements`, `pixelObservationsAvailability`, `sourceRuntime` (one case also answering the
  input's observation), the export/observation/segment gee fixtures. `classifiedOutputSources.test.jsx` toggles Less
  before More, since CCDC Sources open on More while a Classification is selected (an S2 behaviour this file had not
  been run against). `selectedClassificationChart.test.jsx` now forgets save states after each test; a save leaked
  between tests before.
- **Witnesses.** With every S3 production file restored from `HEAD` and the new tests kept: shared 60 of 132, gee 44 of
  276 and GUI 38 of 162 fail; the three GUI files still passing are fixture-only updates. Targeted mutations: removing
  Time Series' `classificationReferenceFeedback` fails 5; removing the upstream branch of `sectionOfFindings` fails 6.
- **Verification (two workers).** Shared `test/recipe` 1330. gee unit tests (all, excluding integration) 107 files and
  1424 tests. GUI `src/app/home/body/process` plus translations, 203 files and 3021 tests, every top-level recipe test
  included. ESLint and `git diff --check` clean. No full GUI suite, live Earth Engine or browser run.
- **Independent review (2026-10-24; correction needed).** The base-operation declarations and removal of band-specific
  training holds fit the chosen policy. Independent focused checks passed 132 shared tests, 276 gee tests and 68 GUI
  tests in six files. A server-boundary regression remains: `ccdcAssetExport.js` always builds CCDC segments, and the
  Time Series download job always builds its collection, but both now obtain training readiness solely from the
  request's stated recipe type. In fully mocked probes, changing an otherwise identical root to `MOSAIC`, with a
  selected point-free Random Forest and requested `probability_1`, bypassed `NO_TRAINING_DATA`. The CCDC probe reached
  both the segments builder and exporter; the Time Series chunk request also completed instead of refusing. The
  existing non-CCDC-root regression uses `TIME_SERIES`, which now declares the same training need and therefore hides
  this case. These specialised boundaries must judge the computation they actually build, or explicitly reject
  incompatible root types under an agreed endpoint contract. Add regressions with a type that does not declare
  `CLASSIFIER`; keep the refusal before product work. No production code was changed by the reviewer, both temporary
  probes were removed, and no external Earth Engine work or exports were started. Browser verification remains pending.
- **Correction, applied (2026-10-24).** The two specialised boundaries now judge the computation they build, whatever
  type the request states: the CCDC Segments export (`ccdcAssetExport.js`) judges the recipe as a CCDC - image output
  readiness, then the measures named - and the Time Series download (`task/export/timeSeries.js`, tile ids, date ranges
  and chunk export alike) as a Time Series. Endpoint compatibility is unchanged: no stated type is rejected for itself,
  and the builders still receive the recipe as submitted. No band-stage machinery returns. **Regressions:**
  `ccdcAssetExport.test.js` - a root stated as `MOSAIC` (beside the existing `TIME_SERIES` case) over a point-free
  Classification refused with `NO_TRAINING_DATA` before the segments are built or submitted, and exported as before
  once the Classification can be trained; `timeSeries.test.js` - a root stated as `MOSAIC` refused at its tile ids, date
  ranges and chunk export before anything is tiled, checked or built, and planned and exported once trainable.
  **Witness:** judging the stated type again fails both `MOSAIC` refusals (the `TIME_SERIES` case still passes, as the
  review found). **Checks:** gee unit tests 1428 (107 files); ESLint and `git diff --check` clean. Shared and GUI code
  unchanged since their recorded runs.
  **Independent recheck:** no remaining code findings. Both readiness checks project only the root type to the
  computation the endpoint builds, retain its id/model/AOI, and leave the submitted recipe passed to the builders
  unchanged. All three Time Series entry points use that check. The two affected backend suites passed 75 of 75;
  ESLint on both routes and their tests and `git diff --check` passed. No production changes by the reviewer; the
  browser checklist remains pending.
- **Browser feedback (2026-10-24; user reported).** Both Retrieve panels stayed open after the selected Classification
  became untrainable. Time Series said "The settings under SRC need attention. Open SRC to see why." CCDC said "The
  source selected under SRC cannot be used. Open SRC to see why." and offered Refresh. The user reports the rest of
  the focused checks behaved as expected; record those as passed, without an agent-run browser session or exact build
  evidence. **Decided correction (applied; see the next entry):** a confirmed configuration finding closes an open Retrieve,
  as it closes a chart. Retrieve/chart actions stay disabled and affected layers withheld; SRC owns the repair
  explanation. No configuration-error message or Refresh action should keep Retrieve open. Implement this through
  the shared operation lifecycle for both Retrieve paths, using existing readiness, rather than another SRC validator.
  Pending/unavailable evidence and unacknowledged saves still hold submission without establishing invalidity; local
  selection/destination errors remain in Retrieve. Keep current-state submission checks and server guards for the race
  before closure. Preserve saved retrieval settings and normal close semantics; do not autosave unsubmitted edits or
  reopen automatically after repair. **Regressions needed:** both panels close on upstream invalidity, submit nothing
  even in the same event batch, and become available to reopen after repair; pending/unavailable evidence does not
  close them, and local form errors remain editable. **Targeted browser recheck:** open Retrieve in each working
  consumer, remove the Classification's points and save, confirm automatic closure and disabled actions, then restore
  the original working points and save: Retrieve can be reopened with its saved settings. The other passed browser
  checks need no repeat for this correction.
  **Design checkpoint:** when an error leads to blue information text in a panel, stop and analyze whether the panel
  should still be open, where the cause is repairable and which owner should explain it. Simplify the lifecycle and
  remove redundant explanatory states rather than treating another message as the default repair. Neutral checking,
  setup and genuine recovery information remain appropriate; see `behavior-contracts.md`.
- **Retrieve closure correction, applied (2026-10-24).** One rule for both Retrieve paths, in the shared panel
  (`mosaic/panels/retrieve/retrievePanel.jsx`): an open Retrieve closes, through its activatable's normal
  `deactivate`, while the assessment that disables the toolbar's Retrieve action (`retrieveAvailability`,
  `operationAvailability.js`) withdraws it - a source found missing or unsuitable, or a configuration found unmet,
  the selected Classification's training among them. The panel closes only for what disables its action, so it cannot
  reopen into a closure. `retrieveAvailability` now answers with `requestGate`'s `withdraw`, and `requestGateOf`
  (`sourceRequirements.js`) puts a withdrawing reason before one still to be checked or unavailable: a finding is not
  hidden by another requirement's missing evidence. Checking, unavailable or expired evidence and unacknowledged saves
  hold the submission with the panel open; an empty selection or incomplete destination stays repairable in Retrieve.
  Closing saves nothing edited since the last submission; settings last submitted are kept, and repair re-enables the
  action without reopening it. Current-state submission checks and the server guards are unchanged.
  **Lifecycle defect found by the real-lifecycle tests:** Time Series Retrieve's image-output watch was taken by its
  outer component, which is mounted whenever the toolbar is, so it was never let go when the panel closed; the panel now
  takes it for as long as it is open (`watchRequest`, replacing the unused `onRequestSelection`). **Removed:** the
  panel's `SOURCE_MISSING`, `SOURCE_UNSUITABLE` and `CONFIGURATION_UNMET` messages with their Refresh for a confirmed
  configuration problem; the translations `process.retrieve.source.missing` and `process.retrieve.source.unsuitable`;
  `onRequestSelection`/`notifyRequestSelection`; `sourceRequirementGate` (its one test caller uses `requestGate`).
  **Kept:** Time Series' `process.retrieve.source.configurationUnmet` hold, for an image-output readiness finding the
  action is not withdrawn for (an AOI or source reference, say), with the evidence messages and their Refresh.
  **Observed then, corrected in the next entry:** a submission Retrieve refused was still committed and closed the
  panel. **Regressions:** both
  `retrieveTrainingReadiness.test.jsx` files now mount the real activation, toolbar Retrieve action
  (`RetrieveButton`), SRC section mark (`withSourceProblems`, the watch the toolbar keeps) and panel instead of an
  always-active activatable: an open Retrieve closes over a classified and a native selection once the Classification
  stores no points, its action disabled, SRC marked and nothing submitted; repair re-enables without reopening, and the
  reopened panel submits what was last submitted, not an edit made before closing; removal and submission in one event
  batch submit nothing and leave the project's destination; Time Series' unusable classifier inputs and CCDC's
  classified breakpoint band close it too; pending and unobservable imagery and an unacknowledged save hold it open;
  an empty selection and an unnamed workspace folder or asset keep it open and repairable; closing lets go of the
  panel's watch, leaving SRC's mark watching, and repair re-enables without reading the imagery again. Assertions that
  expected these panels to stay open with a configuration message are replaced; scenarios that opened the panel over
  an already-broken Classification now find the action disabled. `operationAvailability.test.js`: a finding withdraws
  Retrieve although another requirement is unchecked. **Witnesses:** with the pre-correction production code and the
  new tests kept, 10 of 36 Retrieve tests fail - exactly the closure, repair-reopen and watch-release cases on both
  paths; restoring only Time Series' outer-component watch fails its watch-release case; the old first-reason order
  fails the priority case. **Verification (two workers):** GUI `src/app/home/body/process` plus translations, 203
  files and 3028 tests; ESLint on the changed files and `git diff --check` clean. No full GUI suite or browser run.
  **Browser recheck (pending):** in a Time Series and a CCDC whose Classification works, open Retrieve; in the
  Classification's tab remove its points and save: Retrieve closes by itself, its button is disabled and SRC is marked.
  Restore the points and save: the button is enabled, the panel stays closed, and opening it shows the settings last
  submitted.
- **Independent closure review (2026-10-25; one contract correction still needed).** The common withdrawal check,
  withdrawing-reason priority and panel-scoped Time Series watch match the intended confirmed-finding lifecycle.
  Independent focused GUI verification passed 223 tests in ten files, covering both Retrieve paths, the shared
  destination and Masking panels, output decisions, source requirements, gate priority, CCDC Slice and chart lifecycle.
  A refused keyboard submission remains a contract gap, although its underlying form behavior predates this slice.
  Temporary mounted probes on both paths kept imagery pending, then submitted the form: no task was sent, but both
  panels closed. The Time Series probe also changed the draft folder from `downloads/series` to
  `downloads/unsubmitted`; the refused submit wrote that edit to `ui.retrieve.workspacePath`. `RecipeFormPanel`
  commits action-form values before the Retrieve guard runs, and `Form.Panel` then treats the refusal as a completed
  Apply. Existing pending tests click disabled Apply, so they do not exercise keyboard submission. **Required:**
  reject before committing form values and preserve the open panel/draft for a non-withdrawing hold; an accepted
  submission follows the normal commit/close path. Add real form-submit regressions for both paths, checking task,
  project destination, saved UI values and panel state. Keep unrelated form behavior stable and retain current-state
  and server guards. A separate malformed-AOI probe did close and disable Retrieve correctly; no additional finding
  is established by that case. The probes were removed; the reviewer changed no production code. No browser or
  external-service work was performed. The confirmed-finding closure/reopen browser recheck remains pending.
- **Refused submission correction, applied (2026-10-25).** For the finding above, acceptance is now decided at the form's single submission point, before anything is committed or closed: `Form.Panel`
  (`widget/form/panel.jsx`) takes an optional `accepts(values)`, which `RecipeFormPanel` passes through; refused, nothing
  is applied and the panel stays open as it is, its edits still in the form. Retrieve's `accepts`
  (`retrievePanel.jsx`) refuses whatever disables its Apply (`holdsSubmission`: loading, destination check or
  reconciliation, its output decision, pending or held selections) and, from the session as it now stands, its owner's
  `requestGate` or the export decision (`retrieveDecision`); the hold check formerly inside `retrieve()` moved there,
  and the submission itself still decides again before submitting. Forms passing no `accepts` are unchanged.
  **Regressions:** both `retrieveTrainingReadiness.test.jsx` files submit the form from the keyboard
  (`requestSubmit`, what Enter in a field does) while the Classification's imagery is observed, after editing the
  folder (Time Series) or asset (CCDC): the panel stays open, `ui.retrieve` keeps the last submitted value, no task is
  submitted and the project is unchanged; once observed, the same submission submits the edited value and saves it.
  Time Series' two refused race cases now also stay open. `widget/form/panel.test.jsx`: a submission its owner does not
  accept applies nothing and stays open; one it accepts applies and closes. **Witness:** with `Form.Panel`'s check
  removed and the former hold check restored in `retrieve()` (the pre-correction behaviour), 5 of 51 fail: both
  keyboard regressions, the two Time Series race cases and the unit case. **Verification (two workers):** GUI
  `src/app/home/body/process`, `src/widget/form`, `src/app/home/user` (other action forms) and translations, 216 files
  and 3177 tests; ESLint on the changed files and `git diff --check` clean. No full GUI suite or browser run.
  **Independent recheck (2026-10-25):** no remaining code findings. The optional acceptance hook runs before the
  action-form commit, confirmation and close; Retrieve shares its rendered hold checks and also judges the submitted
  values from current state. Existing forms without the hook retain their previous path. Independent verification
  passed 266 tests in 17 files: both Retrieve readiness suites, the shared destination and Masking panels, all form
  widget tests and the user action-form tests. ESLint on the reviewed sources/tests and `git diff --check` passed.
  Only this roadmap was changed by the reviewer; no production changes or browser run.
  **Browser recheck (pending):** with Retrieve open and the Classification's imagery still loading, edit the folder or
  asset and press Enter in a field: nothing starts, the panel stays open with the edit, and closing and reopening shows
  the previous value.
- **Further browser feedback and independent trace (2026-10-25; CCDC count-preview correction pending).** The user
  reports the first focused recheck passed: Retrieve closes on invalidation, stays closed on repair and reopens with
  the previously saved settings. The second, timing-dependent keyboard/pending check was too complicated and was not
  attempted. Keep it untested in the browser; automated coverage remains passed, and no repeat of that timing exercise
  is requested now. Outside the script, opening a CCDC whose selected Classification has no training data produced
  "Failed to load layer / No valid training data were found." This is a configuration fault that should hold preview
  and be explained in SRC before a new layer is requested.
  **Confirmed bypass:** CCDC defaults its layer to the named `COUNT` map product (`ccdc/bands.js`).
  `recipeOutput.js` intentionally describes a map product with no readiness, and `recipeImageLayer.jsx` asks the source
  gate for the product name `COUNT`; the Classification's needs and findings apply to `IMAGE_OUTPUT`, so they do not
  hold that request. In a temporary probe using the real GUI registry, store and runtime, a fully held point-free
  Classification yielded `SOURCE_UNSUITABLE` for the CCDC's image gate, but a null count gate, null count readiness and
  an allowed preview. Both native breakpoints and `ndvi, probability_1` failed the expected hold; a trainable control
  passed. This is not limited to a race while records load. Execution's count branch still requests fitted breakpoint
  measures (`timeSeries/ccdc.js`), so classified breakpoints can train and reach Earth Engine's empty-training failure.
  The exact live notification was not independently reproduced against Earth Engine.
  **Required shared correction (user clarified):** all analysis entry points must honor the common prerequisites of
  the configured recipe, including layers, named map products, charts and Retrieve. A broken selected Classification
  makes the Time Series/CCDC analysis invalid for all of them under S3. Use existing shared readiness as the authority;
  operations may add their own requirements. Do not add a CCDC count-specific validator, per-visualization checks or a
  cached/stored validity flag. The count preview is a regression case exposing the missing common gate. Keep product
  descriptions independent of authorization and of the canonical image catalogue; sharing analysis prerequisites
  does not require every map product to build or describe the canonical image. Add real layer-request regressions
  for opening an already-invalid recipe, native/classified breakpoints, lazy or pending evidence, repair and
  no-Classification/decision-tree controls, and check other named-product entry points against the same shared
  contract. Broader server preview gating remains separate deferred work; preserve operation-specific semantics
  beyond the common analysis prerequisites. The
  temporary probe was removed; no production code or external services were changed by the reviewer.
  **Next browser recheck after the correction:** open the same already-broken CCDC: SRC explains the Classification,
  no new preview is requested and no layer-error notification appears; restore the original working points and confirm
  an actual count preview returns. The other passed checks need no repeat.
- **Count-preview correction, applied (2026-10-25).** One shared contract replaces the per-operation copies of the
  selected-Classification policy. `output/readiness.js` adds `analysisPrerequisites`, applied by `executionNeed` and
  `configurationFindings` to every operation a type declares and every named map product (`declaresOperation` now counts
  those); `validateReadinessDeclarations` refuses an operation naming a prerequisite role and a prerequisite requirement
  scoped to operations; `judgesMapProduct` says whether a product's readiness can find anything. `collectionSources.js`
  declares `selectedClassificationPrerequisites` (the `CLASSIFIER` need and `collectionClassifierRequirement`, now
  operation-free); Time Series and CCDC declare it once instead of `[CLASSIFICATION_SOURCE]: CLASSIFIER` in each
  operation and the requirement's operation list; Phenology scopes the requirement to its `IMAGE_OUTPUT` as before. CCDC
  adds `COUNT` to its breakpoint classified-output requirement. In the GUI, `mapProductGate` (`operationAvailability.js`)
  reads a judged product's readiness with the existing `readOperationReadiness` and the shared operation gate, and the
  generic `recipeImageLayer.jsx` holds the layer on it beside `requestGate` and watches that operation while it shows the
  product (`watchOperations`): a finding withholds or removes the layer, what is pending or unavailable draws nothing new
  and finds nothing, and SRC explains through the existing output-requirement marks. No type, product or recipe name is
  tested in the layer, and no validator, cache or stored flag is added. **Acquisition cost:** for CCDC's count, one
  readiness read of the Classification and its input imagery's observation - what training reads - shared with the
  toolbar's and other consumers' reads; the CCDC's own collection is never described for it, and products of other types
  read nothing new. **Unchanged:** charts, Retrieve and server guards judge the same needs as before, the prerequisites
  folded in; pixel operations keep their point AOI and referenced recipes their own; server preview gating stays
  deferred. **Regressions:** `ccdc/countLayer.test.jsx` mounts the real layer, store, runtime and SRC marks: an
  already-invalid saved CCDC over native and classified breakpoint bands requests no preview, constructs no layer and
  raises no notification while SRC is marked; a drawn count is removed once the points are removed; repair draws it;
  pending or unobservable imagery and a Classification record not yet loaded draw nothing and find nothing (`wait` or
  `SOURCE_UNAVAILABLE`), a record arriving untrainable then being found; controls - a trainable Classification, no
  Classification with native breakpoints, a decision tree without points - draw; judging reads only the Classification's
  input asset, never the CCDC's description. Shared `analysisPrerequisites.test.js`: the count can run once what
  training reads is observed while the CCDC image still needs its own observation; it needs only that observation;
  CCDC's count is judged and the three other named products are not; the declaration's validation.
  `classifiedOutputTraining.test.js` adds `COUNT` to its per-operation campaign (each training finding, decision tree,
  pending evidence, repair, unprovided classified breakpoint, no selection). **Witnesses:** the pre-correction layer
  (`recipeImageLayer.jsx` from `HEAD`) fails 8 of 12 layer tests; not applying prerequisites to named products fails
  19 of 139 shared tests and 8 of 12 layer tests. **Verification (two workers):** shared `test/recipe` 1362; gee unit
  tests 1428 (107 files); GUI `src/app/home/body/process`, `src/app/home/map`, `src/widget/form` and translations, 235
  files and 3461 tests, including the accepted Retrieve closure and refused-submission tests; ESLint on the changed
  files and `git diff --check` clean. No full GUI suite or browser run.
  **Browser recheck (pending):** open the same broken CCDC: SRC explains it and no layer-error notification appears;
  restore its working points: an actual count preview renders.
- **Caller consolidation over the shared prerequisites, applied (2026-10-25).** Each analysis entry point was checked
  for readiness checks, watches and configuration messages the shared verdict now covers. **Became shared:** Time
  Series Retrieve is held as any Retrieve is. `withRetrieveOutput` reads and watches the image output for every panel
  (its `isImageOutput` option is gone), and a request about something other than the output's bands is decided by the
  same read without a band selection (`outputDecision`, `retrieveOutput.js`): readiness - the analysis prerequisites
  among it - validity, listing, asset and save authority, judged at render and, through `accepts`, from the current
  session at submission. Its pending and unestablished states are said as an export's are (checking; the shared
  unavailable message with Refresh). `readRetrieveOutput` now also answers `recordOf`, the closure records the held
  answer read, from which Time Series offers a Classification the session does not hold. **Removed:** Time Series'
  separate base-readiness gate (`pixelOperationsAvailability` over `IMAGE_OUTPUT` and its `holdOf` messages), its
  `IMAGE_OUTPUT` operation watch and `readOperationReadiness` read for offers, the panel's `watchRequest` hook that
  carried that watch, and the translations `process.retrieve.source.configurationUnmet` and
  `process.retrieve.form.bands.uncheckable`; per-operation copies of the selected-Classification need (previous entry).
  The request path keeps no initial loading view and no output-dependent destination control: its choices are its own.
  **Remains specific, and why:** Time Series' indicator offers and their hold (`requestGate`, `offerHoldOf`, the
  draft-pending offer), which concern the request rather than the output; charts' pixel operations and band offers
  (`pixelOperationsAvailability`, `CHART_OPERATIONS`), already the shared verdict over operations with the point AOI;
  CCDC Slice's and Change Alerts' segment-capability gate (`pixelChartAvailability`, `watchEvidence$`), a requirement of
  the selected source rather than an analysis prerequisite, beside the shared operation verdict both already close on;
  their chart lifecycle stays for S6. Layers judge the image by its read and named products by `mapProductGate`. The
  toolbar's action and the GUI requirement declarations (`collectionClassifierRequirements`,
  `classificationReferenceFeedback`) stay: they present the shared findings where they are repaired. Not in scope:
  visualization-reconciliation ownership, pixel-projection consolidation, reference-settings synchronization (S5).
  **Regressions:** Time Series Retrieve's watch tests now expect only the output question every Retrieve watches,
  released on closing; an unobservable input shows the shared unavailable message with Refresh on both paths; a
  Classification the session does not hold is offered and submitted from the shared read's records
  (`retrieveTrainingReadiness.test.jsx`); `retrieveDestinationCompatibility.test.jsx` replaces the case that pinned a
  request reading nothing with one holding it while the output is read and submitting it once it can run;
  `retrieveClassifiedOutputs.test.jsx` and `unselectedClassification.test.jsx` pass unchanged over the shared read.
  **Witness:** taking offers' records from nothing again fails the not-held-Classification case. **Verification (two
  workers):** GUI `src/app/home/body/process`, `src/app/home/map`, `src/widget/form` and translations, 235 files and
  3462 tests; ESLint on the changed files and `git diff --check` clean. No full GUI suite or browser run.
- **Independent prerequisite/consolidation review (2026-10-25; one layer-precedence correction needed).** The shared
  analysis declaration, named-product traversal and removal of Time Series Retrieve's extra base gate match the
  requested design. Independent focused verification passed 164 shared tests, 280 gee route tests and 278 GUI tests
  in 11 files, including count-layer, existing named-product, Retrieve, form and chart cases; lint on the reviewed
  sources/tests passed. A known withdrawal can still be ignored while the output description is transient:
  `recipeImageLayer.jsx`'s `drawableLayer` returns `preserved(imageOutput)` when `canPreview` is false, before it checks
  `sourceGate` or the new `productGate`. With an already drawn layer, unchanged drawing inputs and a description in
  `NEEDS_EVIDENCE`, a gate with `withdraw: true` therefore returns the old layer. A temporary component-boundary probe
  failed for each gate; the control without a confirmed finding preserved the old layer as intended. This is an
  ordering issue in the shared renderer, not another recipe-specific requirement or a live-browser reproduction.
  **Required:** apply confirmed withdrawals before any transient-preservation return; retain existing preservation
  where there is no confirmed finding. Add the two precedence regressions and that control to the shared layer tests.
  No new mechanism is needed. The probe was removed and no production code changed by the reviewer. The focused
  already-broken-CCDC/repair browser check remains pending; no repeat of the timing-dependent Enter check is requested.
- **Layer-precedence correction, applied (2026-10-25).** `drawableLayer` (`recipeImageLayer.jsx`) now takes the drawing
  away for a withdrawing `sourceGate` or `productGate` before anything else is decided; only then does a description
  that cannot be previewed preserve the existing drawing, and a gate still checking keeps it as before. No new
  mechanism. **Regressions** (`recipeImageLayer.test.js`, for each gate): a drawn layer whose description is read again
  (`NEEDS_EVIDENCE`) is removed for a confirmed finding, nothing new constructed; the control, a gate still checking,
  keeps the unchanged drawing. The existing no-gate preservation cases are unchanged. **Witness:** the former order
  fails both finding cases; the controls pass. **Verification (two workers):** GUI `src/app/home/body/process` and
  `src/app/home/map`, 230 files and 3437 tests; ESLint on the changed files and `git diff --check` clean. The CCDC
  opening/repair browser check remains pending.
  **Independent recheck (2026-10-25):** no remaining code findings. Both withdrawing gates are now evaluated before
  the transient-description preservation path, while a checking gate preserves the unchanged drawing. Shared layer,
  CCDC count-layer and output tests passed 113 of 113 in three files; ESLint on the changed source/test and
  `git diff --check` passed. No production changes or browser run by the reviewer. Only the already-broken CCDC and
  restored count-preview browser check remains for this correction.
  **Browser result (2026-10-25; user reported):** responding to that two-step checklist, the user says "It works
  well". Record opening the already-broken CCDC with SRC feedback and no layer-error notification, then restoring
  its original working points and obtaining an actual count preview, as passed. The agent did not run the browser;
  no exact build, recipe/asset ids or network trace were supplied. This closes the remaining requested S3 browser
  recheck. The timing-dependent pending/Enter browser case remains unattempted, with its automated tests passed;
  no additional manual timing exercise is required by this correction. Historical pending records above describe
  their status at the time and are retained.
- **Browser checklist.**
  1. Time Series and CCDC with a Classification storing no points: SRC marked and naming it beside Classification;
     chart action disabled; Retrieve disabled; the map preview held - for native and classified
     bands, native and classified CCDC breakpoints.
  2. With a chart open, remove the Classification's last training point in its own tab: the chart closes; restore the
     point (saved): the chart can be opened again, on the band it charted.
  3. Open Retrieve with a classified and a native indicator selected; break the Classification: the panel closes and
     submits nothing, and Retrieve is disabled. Repair: Retrieve can be reopened with its saved settings; no automatic
     reopening or clearing of saved choices.
  4. Deselect the Classification in Sources and Apply: charts and Retrieve work natively.
  5. A decision-tree Classification without points: nothing held. A Classification still loading: holds without
     an error. A CCDC Slice over a CCDC with an untrainable Classification: held, naming that recipe.

**Generalization audit of the recent work (2026-10-25; structural review, not additional confirmed bugs).**

The user's rule applies throughout: types declare the facts and prerequisites peculiar to their analysis; the shared
mechanism enforces readiness and owns the consequences for execution and operation panels. A copied validator,
per-panel interpretation of invalidity, or type-name exception in a generic component merits review. This is a bounded
audit of the paths changed in this campaign, not an exhaustive audit of the application. The common-prerequisite and
named-product implementation and its layer-precedence correction have now passed independent code review; the user
also confirmed the focused CCDC count-preview browser recheck passed on 2026-10-25.

Already consolidated: band-dependent training operations/holds are removed by S3's configured-analysis policy;
Retrieve's confirmed-finding closure and acceptance-before-commit use shared components; PyEO's one-input check moved
from its selector to shared readiness; its index derivation is shared by evidence, offers and execution. Keep these
corrections rather than adding replacement recipe-specific gates.

| Candidate | Evidence in current callers | Direction / priority |
| --- | --- | --- |
| Time Series Retrieve's extra base gate | Its image-output read, watch and readiness-to-message mapping previously overlapped the shared panel. Its indicator offers are genuinely request-specific. | Consolidation implemented and independently checked on 2026-10-25: all panels use `withRetrieveOutput` and the common output decision; Time Series keeps only its current-state indicator-offer checks. See the caller-consolidation record above. |
| Chart lifecycle in CCDC Slice and Change Alerts | Both panels combine segment-capability and operation-readiness gates and separately implement close, cancel, wait and resume. Time Series/CCDC already use `pixelChartUpdate`. | Use common gate precedence and lifecycle decisions where equivalent. Keep segment/observation computation and asset-reference handling explicit; a capability check and an execution-readiness check establish different facts. Do this with the S5/S6 work where its final policy matters. |
| Type-name exceptions in the shared layer component | `recipeImageLayer.jsx` has `SELF_MANAGED_VISUALIZATIONS` for BAYTS Alerts, Change Alerts and LandTrendr to avoid two writers reconciling the same selection. | Declare reconciliation ownership on the type and let the generic component consume it. Preserve behavior and regression coverage; this is a structural cleanup, not a new reproduced rendering bug. |
| Repeated request projection | The GUI's `recipeForOperation` drops the consumer AOI, while observations and direct CCDC segments separately project to a clicked point. Change Alerts observations use their own shared monitoring projection. | Consolidate the shared computation identity/projection so judged and built requests agree, preserving referenced recipes' own AOIs. Existing projections are deliberate; duplication is the risk, not evidence that pixel charts should acquire the consumer AOI. |
| Reference settings and background initialization | Change Alerts' `referenceObservation.js` uses `applyAccepted` to merge producer Sources/options into the consumer. The manual feedback already established unwanted overwriting, assigned to S5. | Apply one ownership contract: required source-owned values are effective/read-only; consumer-owned editable values survive background reads; defaults have a defined proposal action. Fields remain recipe-specific declarations. Do not introduce a generic synchronization framework or silently settle the initial-copy decision. |

**Disposition agreed with the user (2026-10-25).** The bounded amendment has been sent to the running implementor:
finish the common S3 gate, audit its layer/product/chart/Retrieve callers, and remove base gates, watches and
configuration messages made redundant by it, especially Time Series Retrieve's. Keep genuine indicator-offer,
current-state submission and save-agreement checks. Check the wrapper charts consume the same verdict; broader
CCDC Slice/Change Alerts chart-lifecycle consolidation belongs with S6, after S5 settles ownership. Reference-setting
synchronization remains S5. Visualization-reconciliation ownership (the shared layer's type-name allowlist) and
pixel-projection consolidation remain recorded structural follow-ups outside the current amendment; assess their
small implementation scope after S3, without making them new pre-commit blockers or assuming five extra slices.

Retained domain adapters are not automatically missing generalization. `requestedMeasures`/`fittedMeasures` belong to
CCDC; PyEO's supported indexes and input cardinality belong to PyEO; Classification's training rules belong to
Classification. The CCDC dispatch in generic image-export request capability handling is a deliberate single-consumer
adapter; revisit it if more types need the same request contract, rather than adding a declaration framework solely
to remove a short dispatch. The current review adds no production changes or new failing tests. Finish and review the
shared S3 gate first; assess the bounded candidates alongside the existing S4-S6 sequence instead of treating them as
newly discovered blockers or an approved broad rewrite.

S1 and S2 can proceed independently of the semantic changes. S3 precedes S4 to avoid adapting sampling work to a
request-stage design scheduled for removal. Start the read-only F5 audit early, but land S5's ownership behaviour
before S6's final editor/gate consolidation. If S5 reveals a need to change persisted structure, describe its old/new
shape and compatibility separately before implementation; no migration is approved by this plan.

**Product choices still to settle for these slices:**

1. **S3's strict selected-source contract.** The user's preferred direction and the recommendation are to hold Time
   Series/CCDC native downloads/charts and their count outputs too when a selected Classification is untrainable,
   until it is repaired or explicitly deselected. This is a deliberate product policy, not an execution necessity for
   native bands. Confirm that full consequence before retiring the additional band-training gate. Apply it to these
   two families first; do not silently change native Phenology or every recipe that happens to hold a reference.
   **Status:** confirmed by the S3 request and implemented for Time Series and CCDC (2026-10-24); Phenology unchanged.
2. **S5's editable defaults.** Recommend copying on the first reference Apply during new-recipe creation only,
   preserving editable values on replacement/reopen/refresh, and offering explicit copying through the normal form's
   Apply/Cancel flow. This recommendation is still not agreed. Required matches are separately source-owned/read-only.

Which PRC fields must match, how to derive Consumer features over multiple inputs, and what optional/required metadata
existing assets actually contain are technical discovery tasks, not arbitrary user preferences. Return with evidence
and a bounded choice if they expose a real tradeoff. Do not invent a mandatory-field list or automatically refuse
older assets before doing that work. The collection sampling-once constraint, source imagery ownership and the rule
that pending/unavailable evidence is not a finding are already established directions.

**Independent improvements, after the correction slices unless reprioritised:**

- P1: chart context/presentation — readable CCDC Slice band names and a map marker for the charted pixel. Keep request
  identity unchanged and make marker lifetime follow the active chart/recipe. These can share a small UI slice.
- P2: AOI update efficiency — measure redraw triggers and prevent redraws on irrelevant edits while preserving real
  geometry changes and cancellation. Keep this performance investigation separate from the S1 layout fix.
- P3: visualization Copy/Paste — F7 as a separate feature, using existing layer/visualization ownership and validation.
- P4: keyboard band addition — Enter adds the highlighted band, then highlights the next available band so consecutive
  bands can be added with repeated Enter. Separate small widget follow-up; see the later usability notes below.
- P5: CCDC Sources sizing — agreed family/view heights: stable heights for Optical/Radar/Planet and More/Less, with
  the existing viewport cap and scrollable body. Decision recorded below; not implemented.
- WebSocket recipe-update notification stays outside this implementation round; stale-copy checks were reported good.

The direct-versus-referenced chart AOI difference is expected and has no corrective slice. The invalid legacy
Time Series saved-UI fixture is removed from manual acceptance, and the passed controlled numerical checks are not
unfinished browser work. Preserve successful manual results and re-run affected cases after each slice; missing
the initial manual batch is now reported complete, with fixes and targeted rechecks outstanding. One final integrated
automated checkpoint follows the completed correction set.

**F1. Make a training-data problem visible and repairable where it is edited.**

- `classification/trainingDataRequirements.js` currently maps every Classification declaration to `toolbarMark: false`.
  Mark real findings consistently with Regression. Keep operation applicability and the decision-tree exemption with
  the existing rules; do not invent a second toolbar validator or mark an evidence read as a configuration error.
- Both training-data lists receive `withItemProblems`, but their `RecipeSection` editors only render a `RecipeInput`.
  Carry the existing finding into the selected data-set editor, naming the Provider and explaining the needed repair.
  Keep replacing/removing the reuse selection possible. For nested findings, identify the actual offending recipe,
  not just the first reference in the chain. Per the subsequent browser decision, do not add an Open Provider action
  inside this modal. Generic selector navigation depends on separate recipe-scoped-modal work.
- Re-applying the unchanged reference must not imply that it repaired an upstream error. Explain that distinction;
  do not indiscriminately disable Apply and trap the user in an editor from which a repair could be selected. An edited
  reference must not keep a stale finding belonging only to the old Provider.
- **Acceptance:** for both recipe families, an unusable Provider shows matching toolbar, list and item-editor feedback;
  opening/repairing Provider clears it, replacement/removal and Cancel behave correctly, and the Consumer renders
  after recovery. Cover real remaining feature incompatibility after F4, not a Provider selection change that F4 makes
  valid. Existing current-behaviour witnesses remain historical evidence.
- **Status:** implemented in S2 with its browser corrections (2026-10-23): no training data at all is neutral panel
  guidance, not a TRN mark, for both types; a broken configured data set is marked. Browser recheck pending.

**F2. Keep the selected Classification and its explanation visible in CCDC and Time Series.**

- Open Sources in the advanced ("More") view when a Classification is selected. Allow Less/More to be toggled normally;
  this is about the initial view and visibility, not forcing it open on every render or disabling the More button.
  The 2026-10-23 feedback requests the same initial visibility for Time Series Sources; cover both panels rather than
  leaving the selected dependency hidden in one of them.
- `collectionClassifierRequirements` binds `UNSUPPLIED_CLASSIFIER_INPUTS` to both `classification` and `dataSets`.
  Make the Classification field the explanation/repair location for CCDC's selected incompatible Classification,
  including the Optical-to-Radar edit. Keep the data-set control's own validation. Review other users of this shared
  declaration so a CCDC presentation fix does not silently change their editor policies.
- **Acceptance:** a saved selection is visible on opening; incompatible collection inputs explain the problem beside
  Classification; compatible edits and clearing/replacing the Classification repair it; Cancel preserves applied
  settings. Reuse the same shared readiness finding and form binding, without a CCDC-specific compatibility checker.

**F3. Align Change Alerts' applied settings, Sources editor and analysis chart.**

- Reproduce the reported `nbr` case through the actual producer update and source observation. Determine separately
  what the applied model holds, what the editor initially displays, and whether its controls replace an unoffered
  selection. A changed form draft must not make an applied Sources error disappear without explaining the difference.
- Retain an unsupported applied monitoring band visibly with its located explanation and an explicit repair. Do not
  silently switch the monitoring data family or choose another band to make the form or chart look valid. The final
  Sources/PRC ownership comes from F5/F6, rather than another local defaulting rule.
- The Sources `MONITORED_MEASURE` declaration currently applies to `IMAGE_OUTPUT`, while chart availability uses
  `PIXEL_SEGMENTS` and reference chartability. Extend the relevant shared requirement/availability declarations so an
  incompatible configured monitoring band disables the chart action, closes an open chart and cancels obsolete work.
  Use the configured band consistently; repair restores segments and monitoring observations.
- Do not hold the chart to every alerts-image requirement: incomplete output dates or an unrelated export requirement
  are not automatically chart failures. Preserve valid recipe-reference and segments-asset paths, server observation
  guards, and pending/unavailable semantics. Keep backend and GUI operation coverage aligned where the chart actually
  uses the configured monitoring band.
- **Simplification goal (2026-10-22 discussion):** SRC explains findings from the same shared, operation-specific
  readiness decision that holds retrieval and charting. Panels consume that decision rather than independently
  inspecting Sources settings or reimplementing compatibility rules. Do not add an "SRC toolbar is red" check beside
  the existing gates: toolbar presentation is not the authority, and an unapplied editor draft is not applied state.
  Inventory the chart/Retrieve checks touched by this work and explicitly remove those made redundant by the shared
  requirements, while preserving their existing behaviour in focused regressions.
- Keep necessary consumer responsibilities: request-selected bands/measures add their applicable requirements;
  pending/unavailable evidence has its own hold state; chart cancellation/closure/recovery remains lifecycle handling;
  Retrieve rechecks current state at submission; server guards enforce the same requirements. These are not duplicate
  configuration validators to delete. A relevant applied SRC finding disables the affected action, but SRC stays
  accessible for repair. Implement this as consolidation of existing decisions, not another validation layer.
- **Acceptance:** the Optical-to-Radar reproduction has consistent toolbar/editor messages and no chart request for
  a substituted band; repair returns both chart streams. Confirm cancellation prevents late redraw, native compatible
  controls still work, existing assets do not acquire their producer's recipe dependencies, and an unrelated output
  finding does not disable a valid chart. The change report must identify which repeated checks were removed and which
  request/lifecycle/submission guards remain necessary.

**F4. Sample the Provider's imagery with the Consumer's feature definition.**

- Trace both Classification and Regression reuse before implementing: the feature-selection issue exists in both,
  although Classification's `getSamples$` and Regression's `getTrainingData$` are different execution paths. Apply the
  same imagery/feature ownership principle, preserving class versus value labels and Regression's unnormalised path.
- Provider owns its points and input imagery; Consumer defines the bands, derived indexes/combinations and covariates
  it trains on. Derive those features on each point-contributing Provider's imagery, even if Provider's own band
  selection omits them. Nested providers retain their own imagery, locations and sampling scale. Do not resample
  everything over Consumer's imagery, mutate Consumer's selected bands, or persist sampled rows into either recipe.
- Update execution and the shared training requirements as one contract. Currently `missingTrainingFeatures` compares
  Consumer features to `ownFeatures(record.model, describedInputs(...))`, and Provider `TRAINING_DATA` validates its
  own band sets. Reassess both against the features actually sampled for Consumer: changing only execution would leave
  valid reuse refused, and removing the refusal would leave genuinely unsupported features unguarded. Provider's own
  image/classifier still uses its own selections and keeps its own applicable findings.
- Describe the Consumer feature definition once and establish whether each contributing Provider input can derive it.
  Reuse shared band/index/covariate rules and the existing graph, evidence acquisition and finding attribution. Do not
  add a parallel validator, recipe loader, stored validity flag or an operation for every band selection. Explicitly
  assess how Consumer-specific sampling affects the existing operation identities before extending any public
  readiness API. Establish input correspondence for multiple-input recipes before making claims about those cases;
  existing unknown cases must not become guessed success or guessed incompatibility.
- Assemble the sampling expression/training data outside the per-scene mapping, as `collection.js` already does for
  `getTrainingData$()`, and reuse it for the collection. Preserve configured row ordering and empty/mixed/nested reuse
  semantics. Apply Consumer normalisation once with Consumer's statistics; Provider classifier settings must not
  transform those reused rows. No global cache or Earth Engine internal evaluation-count guarantee is implied.
- **Acceptance:** Provider selects `red` over imagery containing `red,nir`, Consumer requests both, and reuse succeeds;
  truly missing/underivable Provider imagery still gives a located finding; removing all Provider imagery remains
  refused and repairs recover. Cover nested and mixed branches, indexes/covariates, unchanged no-reuse controls and
  missing/unavailable evidence. Compare one-scene and many-scene construction to show no per-scene resampling, then
  extend the controlled live numerical check to the new contract and retain its whole-row/prediction comparisons.

**F5/F6. Make settings ownership explicit instead of automatically overwriting groups.**

- Audit each Sources and PRC field from producer through monitoring execution, not just matching property names.
  Record the owner, whether it must match, why a mismatch is invalid, where the effective value is read, and whether
  that value exists in segments-asset metadata. Distinguish matching units/corrections needed for comparisons from
  options that merely filter observations or configure a producer-only computation. Do not lock all of PRC by default.
- **Agreed direction:** a genuinely required match is source-owned and shown read-only, labelled as coming from the
  reference. Execution, editor values, readiness and submitted tasks use that same effective value. Do not merely
  disable a control holding a stale copy. Unrelated source changes do not overwrite editable consumer fields.
- For a recipe reference, use the authoritative current producer settings; for a segments asset, use its recorded
  settings without loading a private producer. Treat unavailable required metadata explicitly; do not assume a match,
  fetch inaccessible history, or silently invent a value. State any storage/import compatibility implications before
  changing persisted fields; existing editable overrides must not be silently discarded on opening a recipe.
- **Recommendation after code assessment, not yet agreed:** seed editable defaults when the first reference is applied
  while creating a new Change Alerts recipe. State in the creation flow that Sources/PRC defaults came from that
  reference; the following panels show the actual editable values. Thereafter they belong to Change Alerts. Replacing
  a reference preserves these settings by default and may expose incompatibilities through normal shared readiness.
  Offer an explicit "Use reference settings" action for a user who wants to copy the new reference's editable defaults.
  Metadata refreshes and reopening a recipe are never requests to replace settings. Do not turn this into automatic
  Optical-to-Radar switching for fields the audit classifies as editable.
- **Acceptance:** editing producer property A cannot reset consumer override B; re-observing unchanged evidence and
  title/layout changes are inert. A source-owned value is consistently read-only and used by execution after producer
  changes. Asset-backed consumers work from metadata alone. Reopening and Cancel preserve user-owned settings; stale
  output/observation requests are withdrawn when effective computation changes, then recover through existing holds.

**F6 option assessment (2026-10-22; recommendation, not an implemented or approved policy).**

| Option for editable settings | Benefit | Main drawback | Assessment |
| --- | --- | --- | --- |
| Always start from generic Change Alerts defaults; never copy | Minimal implicit behaviour | The defaults are optical and can be a poor starting point for radar/Planet references; users must reconstruct a suitable configuration | Too much setup for initial creation. |
| Automatically copy whenever a reference is selected/replaced | Convenient matching starting values | Replacing the reference can erase deliberate consumer choices; cancelling/retrying or late metadata can make the replacement surprising | Do not use as the default for an existing configured consumer. |
| Keep automatically following producer changes, perhaps with per-field override tracking | Unedited fields remain up to date | Requires ownership/baseline tracking and conflict rules; does not guarantee editable settings must match scientifically; retains hidden changes | More machinery and more implicit behaviour than this task calls for. |
| Copy editable defaults at initial creation, then preserve them; allow explicit copying later | Useful initial setup with clear consumer ownership | A replacement can temporarily leave incompatible monitoring settings, which must be explained and repairable | Recommended, combined with source-owned read-only fields from F5. |

- **Observed implementation risk:** `monitoringSettings` compares against `ui.sourceEvidenceApplied`. That state is
  transient and initialized afresh on recipe load. Its first observation in a reopened editor can therefore propose
  settings again even though the persisted recipe already contains deliberate overrides. The implementation must
  distinguish a new, explicitly applied reference from the first metadata answer in a browser session. Do not add a
  persisted "copied once" flag merely to patch that observation callback; prefer the existing explicit creation /
  reference-Apply boundary and keep observation responsible for evidence.
- **Lifecycle cases:** first reference in a genuinely new recipe gets a coherent initial set of editable defaults;
  opening/importing an existing configured recipe does not initialize again; replacing a reference keeps consumer-owned
  settings; reapplying the same reference, refreshing metadata, a source edit and a reference draft followed by Cancel
  do not copy. Required linked fields remain source-owned under all of these cases, independently of editable copying.
- **Explicit copying:** show which editable Sources/PRC values will be replaced in the normal form flow, then commit
  them through Apply so Cancel can leave the recipe unchanged. Copy only the monitoring settings F5 identifies, as a
  coherent configuration rather than merging incompatible data families. Do not copy Classification, breakpoint
  bands, CCDC fitting parameters, monitoring dates or Change Alerts' detection thresholds. This does not require a new
  source-following mode, per-field override flags or stored producer snapshots.
- **Read-only assets and timing:** use the recipe/asset evidence already acquired for the selected reference; never
  fetch a private producer behind a shared asset. If optional editable-default metadata is absent, keep usable consumer
  defaults and explain that copying is unavailable; assess missing mandatory metadata separately under F5. A late
  metadata result must not overwrite edits or a newly selected reference. Initialization/copying must be part of the
  intended form action, not a delayed mutation after Apply when the user has moved on.
- **Targeted checks before adoption:** reopen a saved recipe with overrides in a fresh session; replace optical with
  radar with/without explicit copying; cancel the replacement/copy; edit while metadata is pending; re-export the same
  asset; and open an asset with no optional configuration metadata. Assert both the displayed values and applied model
  and keep relevant operation holds, avoiding tests that only prove one callback was called.

**F7. Copy/paste layer visualization parameters.**

- Add discoverable Copy/Paste actions for rendering parameters in the existing layer/visualization UI. Transfer the
  visualization only; do not replace the destination layer's identity, recipe/source, AOI or processing settings.
- Reuse the visualization model and existing validation. Show incompatible destination bands or invalid parameters
  clearly; do not silently change data sources or paste an entire recipe. Keep this a separate feature, without
  expanding the readiness follow-ups into a general layer-template framework.
- **Acceptance:** compatible layers can share a style, destination identity/source remain unchanged, incompatible
  bands have an understandable outcome, and existing visualization save/reopen behaviour is preserved. Define exact
  transferable fields and clipboard behaviour in the small implementation proposal before adding controls.

**F8. Fix the concrete chart-layout and Retrieve-message regressions.**

- Reproduce starting a chart, changing recipe tabs before it finishes, allowing data to arrive while hidden, and
  returning. Cover Time Series and CCDC and shared graph users where the reproduction applies. Inspect actual panel
  and graph dimensions while hidden and on reactivation. Resize/re-layout only when visible dimensions are valid;
  do not fix this by refetching identical Earth Engine data or discarding every inactive chart. Preserve normal
  tab switches, cancellation and multiple recipe maps. A real-browser check is needed for actual layout; a DOM-only
  mounted test cannot by itself establish the rendered dimensions.
- Reproduce the Time Series Retrieve warning in a fully working configuration, with no Classification and with a
  working Classification, before/after selecting native and classified indicators. Trace which render/gate path emits
  the message and whether its missing-band list is actually non-empty. Show an unavailable-selection warning only for
  a real unavailable selected band, naming it. An empty selection uses the existing selection rule, not a fabricated
  missing-band message. A valid settled selection shows no error and submits successfully.
- Keep these fixes independent of F9: hiding the warning by disabling the entire recipe would not correct its
  appearance on valid configurations. Record the actual root causes and regression witnesses before marking complete.

**F9. Assess and consolidate selected-Classification validity for Time Series and CCDC.**

- **User's proposed contract:** selecting a Classification makes it part of the configured analysis. If it cannot
  supply a usable classifier, Time Series and CCDC are invalid for their chart/retrieval operations even when the
  requested measures and CCDC breakpoints are native. Explain the problem in SRC beside Classification, mark SRC,
  disable actions, close an open chart and cancel obsolete work. Repair releases them. Keep supported classified
  choices selected/offered through a training failure so the analysis resumes as configured after repair; do not
  silently remove the Classification, change the chosen bands or add per-band error highlighting instead.
- This deliberately revisits the former rule that native requests bypass training readiness. Native output may still
  be computationally possible, but under this policy the user must repair or explicitly deselect the configured
  Classification to proceed. Record that distinction rather than presenting the change as an execution dependency
  discovered by tracing code. Readiness may acquire training-input evidence for a native request; native execution
  must still not actually sample/train merely to enforce a configuration policy.
- Assess a static shared `CLASSIFIER` need for selected Classifications on the affected base operations, preserving
  missing-selection and decision-tree applicability. Use the existing Classification requirements, not its full
  rendered `IMAGE_OUTPUT` and not a panel-specific "SRC is red" validator. Apply the same policy to server and GUI;
  an open Retrieve panel still checks current state on submission. Do not implicitly extend this policy to every
  recipe family, map product or previously unguarded route without naming the effect.
- **Required simplification:** inventory `CLASSIFIED_COLLECTION`, `requestStages`, the additional server settling,
  `BandOperationWatch`, requested-band holds and classified-band messages. Remove what becomes redundant when the
  base operations already require the selected classifier. Keep request-output capability checks, useful band/measure
  derivations, current-state offer/submission guards, save agreement, evidence handling and chart lifecycle. Shared
  rules keep one owner; replacing every old hold with a new parallel SRC hold is not the intended outcome.
- Explicitly review count images, native chunks/exports, classified/native breakpoints, request error precedence and
  downstream CCDC consumers. A training failure promoted into the base configured checks can now precede a requested
  capability refusal; do not claim the old capability-before-additional-training order is unchanged. Preserve the
  coded capability contract when the configured source is otherwise valid. Do not install a full image-output gate
  on pixel charts or remove the consumer-versus-reference AOI distinction.
- **Acceptance:** for both Time Series and CCDC, native and classified requests over a broken selected Classification
  are consistently held before product work; SRC and its editor identify the same problem; repair and explicit
  deselection recover; choices survive repair; controls with no Classification and a valid one work. Replace the old
  native-bypass assertions intentionally, record the behavioural cost, and verify the new shared declarations allow
  deletion of the extra training-only paths without losing capability errors or submission-race protection.
- **Status:** implemented as S3 (2026-10-24); see its record. Browser check pending.

**F10. PyEO feedback must lead to a useful repair.**

- Reproduce Optical-to-Radar Classification input changes with the index gate off and on, and record the actual SRC
  and OPT findings separately. `UNSUPPLIED_CLASSIFIER_INPUTS` and `UNAVAILABLE_GATE_INDEX` are different rules; the
  latter can concern baseline or monitoring imagery. The user report alone does not establish which OPT code fired.
- A Classification whose required features optical monitoring cannot provide invalidates PyEO regardless of index
  gate settings. Explain and repair that prerequisite at SRC/Classification; do not offer a second red index error
  inside OPT or imply switching the gate off fixes the source. The 2026-10-23 browser report confirms S2 fixed the
  toolbar attribution but left the panel-level cascade (`Options.explainGateIndex`). Address both presentations using
  the same shared compatibility state, not another local test for radar versus optical imagery or simply "SRC is red".
- Distinguish a *compatible* classifier whose imagery cannot provide the chosen gate index. That is genuinely a gate
  configuration problem: another supported index or turning the gate off can repair it. If no supported gate index
  exists but classification itself is usable, explain gate availability in OPT and allow the meaningful gate-off
  repair; do not label the selected Classification generally incompatible merely because this optional gate cannot
  run. Reassess S2's blanket rule moving every no-baseline-index finding into SRC against this distinction.
- **Agreed form behaviour (2026-10-23):** while source compatibility is invalid/pending, retain the chosen gate,
  index and threshold, disable only the dependent gate group, and show neutral SRC-repair/checking guidance rather
  than a field error; independent alert controls stay editable. When the source becomes compatible, restore local
  gate interaction and any real gate finding. Do not clear selections or switch off the gate as a side effect of
  opening OPT or refreshing evidence. A temporarily unknown input is not proof that no index is available.
- Use the existing findings and presentation bindings; remove or consolidate the independent OPT validation that
  creates contradictory feedback rather than layering another validator over it. **Acceptance:** incompatible radar
  features with optical monitoring are held with the gate both off and on, with one source explanation and no OPT
  cascade; opening OPT preserves its choices; repair restores the group; a compatible source with an unsupported
  index has a meaningful OPT repair; pending/unavailable is not a field error; a gate off acquires no gate requirement.
  **Status:** message/terminology and shared single-input corrections are implemented; the user confirmed the
  two-input selection refusal. The separate Stack index-derivation correction now has shared, execution and GUI
  coverage of the recipe-input chain and passed independent review on 2026-10-24. The user confirmed its actual
  preview and Stack remove/restore browser check passed that day; see S2's "Require drop over a Stack input" entry.

**Later usability/performance features from the 2026-10-23 feedback (not prerequisites for F8-F10).**

- **Stack Band names layout:** four short band names do not appear in the expected two-by-two layout; the user reports
  unexpected wrapping on the first line. Code uses a wrapping horizontal `Layout`, with ordinary form-input sizing
  and margins, inside a panel capped at 29rem; short text does not itself determine field width. Prefer a local two-column
  grid for these fields, falling back to one column in a narrow viewport, over changes to shared `Layout` or global
  input widths. Confirm the rendered cause and check 1/2/3/4/many fields, long names, errors and scrolling. Recorded
  as an independent small UI fix, not reproduced in a browser or implemented with S2.
- **CCDC Sources height:** the user reports an excessively tall panel after choosing Radar and asks about stable
  sizing versus content-based sizing. `ccdc/panels/sources/sources.module.css` explicitly sets `height: 46rem`, unlike
  Time Series Sources, which only caps width. Blame dates the 46rem rule to `b166296a1` (2022-03-17); it is not caused
  by S1's Panel visibility change or a new resize-stabilization mechanism. The old rule before that commit fixed a
  content height at 40rem, so history does not establish that every older CCDC panel was content-sized.
  Further code tracing confirms dynamic content: Classification loading replaces native-only breakpoint choices with
  regression/probability options, one probability per class, so both their count and label wrapping can change. In
  simple mode a Classification field can also appear for an error. Therefore content-based sizing alone (the initial
  recommendation) would not fully address background-loading jumps.
  **Agreed decision (2026-10-23): family/view heights.** Give Optical/Radar/Planet suitably sized, stable panel heights,
  also accounting for More/Less. Allow resizing on those deliberate view changes, while late Classification options and explanations
  use the existing scrollable body without changing the shell height. Keep header/footer stable, the shared viewport
  cap, and readable content at small sizes. Choose heights with actual browser fixtures; do not add per-class-count
  sizing, fit-then-freeze measurement state or another shared Panel mechanism. Content-based sizing with a reserved
  band area was considered but not selected. This decision is not implemented yet. Check Optical/Radar/Planet,
  More/Less, short/long legends, slow Classification loading, validation messages and
  small-viewport scrolling before choosing final dimensions.
- **Keyboard band addition:** in a Classification input image's Add bands popup, pressing Enter should add the
  highlighted band and move the keyboard highlight to the next available band in the displayed order. The next Enter
  adds that band; it must not add the next one immediately or jump back to the "All bands" entry after each addition.
  Code tracing: `inputImageryWithDerived/imageForm.jsx` uses a `Combo` with `stayOpenOnSelect` and removes added options;
  `ListContent.componentDidUpdate` currently resets highlighting on options/selection changes. Fix the relevant shared
  picker behaviour narrowly; do not make every single-select list advance or treat arbitrary evidence/filter refreshes
  as a band-add action. Keep filtering, mouse selection and arrow navigation, skip nonselectable rows, and define a
  safe end-of-list state that cannot accidentally activate "All bands". Cover repeated Enter over the real band-add
  flow, preserved filter text, the last available band and an unaffected ordinary selector. No persisted recipe-format
  change is needed. This is recorded, not implemented in S2.
- CCDC Slice chart labels should use human-readable band names when available, including recipe references. Keep raw
  names for request identity and a fallback for asset measures without labels; test that labels do not alter requests.
- Investigate AOI-layer redraws on unrelated recipe edits. Base updates on effective geometry/source changes; preserve
  real geometry changes and pending-read cancellation. Measure which updates trigger work before adding caching.
- Mark the charted pixel on the corresponding map. Follow the actual recipe/pixel, update when it changes, and avoid
  stale markers on another tab or after chart closure. Define the marker interaction separately from chart validity.
- Upstream recipe-update notification over WebSockets remains a separate future feature. The reported stale-copy
  tests passed; it is not a prerequisite for this correction round and does not replace existing revision currency.

**Verification and boundaries:** use focused regressions for each changed contract and combine browser rechecks over
the existing fixtures. Update old manual expectations when F4/F6 change the behaviour they describe; do not silently
relabel the earlier results as evidence of the new contract. Continue recording the user's remaining browser results.
The initial request-dependent readiness packet below is complete, but its clean automated run does not cover these
unimplemented follow-ups. F9 may replace part of that packet's request-dependent training design; its historical
verification remains evidence of the former contract. Broader preview gating, propagated request contexts and
executed-edge closure work remain deferred. No implementation slice count is asserted until the F4 contract, F5
ownership audit and F9 policy assessment establish the scope.

#### Current delivery plan (updated 2026-10-23)

The table below records the completed initial classifier/readiness packet. The active follow-ups are F1-F10 in
"Next steps from browser feedback" above; the packet's completion does not mean the reported browser issues are
resolved. The completed histories that follow are reference material, not additional slices to implement. A shared
backend helper accepting a Classification is not, by itself, a reason to expand a recipe's validation or GUI.

| Order | Remaining work | Status and next step | Estimated implementation slices |
| --- | --- | --- | --- |
| 1 | Phenology's configured classified band needs the Classification's training readiness. | Complete (2026-10-21): the `CLASSIFIER` operation and a conditional need, reusing the existing training rules without describing the Classification's output; see "Phenology's configured classified band". | 0 |
| 2 | CCDC's classified breakpoint bands need the same training readiness. | Complete (2026-10-21): `classifiedOutputNeed('breakpointBands')` for `IMAGE_OUTPUT` and `PIXEL_SEGMENTS`, native breakpoint controls unchanged; see "CCDC's breakpoint bands". | 0 |
| 3 | Training readiness for classified bands requested by Time Series charts/downloads and CCDC charts/exports. | Complete (2026-10-21): Time Series pixel observations ("Time Series' classified chart band"); CCDC's chart, with the stage generalised as `CLASSIFIED_COLLECTION` and the server sequence and band hold shared ("CCDC's requested chart bands"); Time Series Retrieve ("Time Series Retrieve's classified indicators"); CCDC export bands, to assets ("CCDC's requested export bands") and to Drive and SEPAL ("CCDC's Drive and SEPAL image exports"); CCDC Retrieve's preflight ("CCDC Retrieve's classified measures"). Remaining, deferred: direct previews (which could use the same root stage) and wrappers asking a CCDC source for classified measures (which need a propagated context). | 0 |
| 4 | Change Alerts' observation request needs an explicit server-side operation boundary. | Complete (2026-10-21): the chart sends the applied recipe; the job derives the observed collection (`observedCollection`) and holds it to Time Series' `PIXEL_OBSERVATIONS`; untyped requests are refused. See "Pixel observations". | 0 |

**Initial packet:** no implementation slice remains in its planned request-dependent readiness rollout. Browser
verification has now produced the concrete follow-ups F1-F10 above; they are not covered by that completion statement.
Reassess their implementation split after the sampling-contract review, settings-ownership audit and selected-source
policy assessment. Design reports,
review corrections and focused refactoring are not independently counted rollout items.

**Finish this round when:** the reviewed dependencies and requirements cover the training and collection work these
operations actually run,
pending and unavailable evidence stay distinct from findings, repairs recover through the existing runtime, and the
focused regressions and browser checks pass. Preserve the current native-band classifier-input policy unless a
separate decision changes it. Broader coverage listed under "Deferred beyond this round" is not required to finish.

**Verification checkpoint before push:**

- The Classification outline regression recorded under "Verification status" is corrected. The full GUI suite at
  `8d04b160b` passed all 316 files and 4547 tests with two workers (2026-10-21, 310 s, exit 0). The earlier
  `remapping/panelActivation.test.jsx` timeout did not recur; its historical result is preserved above.
- The full GUI run includes the later deselection, requested-band, legacy-indicator and submission-offer fixes.
  Live numerical normalisation checks passed at the earlier baseline recorded under "Verification status of the
  readiness and normalisation changes"; keep that evidence separate from the later GUI and route verification.
- The user reports the manual batch complete on 2026-10-23 and all issues reported; unmentioned tests pass under their
  explicit reporting convention. Results and subsequent decisions are recorded under "Browser feedback" and S2.
  Resolve the reported issues or make an explicit scope decision before treating the batch as clean. After fixes,
  run targeted browser rechecks of changed paths and nearby controls, rather than repeating the complete batch.
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
- `REFERENCE` closure over-reading and runtime refresh-policy changes: not needed for classified requests, whose stage
  reads the subgraph that executes (see the architecture checkpoint);
- server gating of direct map previews, which could then use the root training stage;
- destination compatibility at the Drive and SEPAL execution boundaries: they judge a CCDC's readiness for the bands
  requested, but neither refuse array bands nor establish that a raster file can hold them (see "CCDC's Drive and
  SEPAL image exports");
- a propagated request context for wrappers asking a CCDC source for classified measures (CCDC Slice base bands,
  Masking, Stack, Band Math);
- shared form defaults, duplicated input editors, generic reference-feedback navigation beyond F1's targeted training
  item repair path, and tab-indicator experiments.

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
   the stale-option defects without a band-aware request contract. Request-dependent readiness is in the current
   delivery plan (Time Series' chart band complete); the native-band policy decision stays separate.
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
   (`/ccdc/loadSegments`, `PIXEL_SEGMENTS`) and a segment source's image (`IMAGE_OUTPUT`, readiness alone). Change
   Alerts' observations are now judged as the Time Series collection they observe (see "Pixel observations"). A
   Classification with several inputs is
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
   - **Change Alerts' observation route is guarded (2026-10-21).** Its chart sends the applied recipe, and the job
     judges the collection it monitors (see "Pixel observations"). Requests naming no recipe type are refused.
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
     is refused by execution alone. Training readiness for requested bands is in the current delivery plan: Time
     Series and CCDC chart bands, Time Series Retrieve indicators and CCDC export bands add
     `CLASSIFIED_COLLECTION`, and CCDC Retrieve holds the measures chosen (see "CCDC Retrieve's classified
     measures"). Map previews remain.
   - **PyEO's baseline** builds outputs it does not read.
   - **Uncertain types.** SVR types are not offered by the GUI. A supplied decision tree's output modes are not
     documented.
   - **Native-band readiness.** Readiness still judges the classifier inputs of a native-band request that no longer
     classifies anything. Making it band-sensitive would change the agreed policy, so it is a separate decision. A
     request-chosen operation, as for Time Series' chart band, could express it.

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

Observation requests (resolved 2026-10-21):
- **Observation requests.** The copied Classification is now set aside on the server (`observedCollection`), not
  trusted to the GUI. `/timeSeries/loadObservations` refuses a request naming no recipe type.

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
