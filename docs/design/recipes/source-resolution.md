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

Neither executor reads recipes with administrator credentials. A GEE job reads as the user the gateway
authenticated on the request that job was built from; a task executor reads as its own worker session, which
the gateway resolves to that session's owning user. A job carrying no user reads nothing, and there is no
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
applied, the actionable Sources field is invalid, and REF shows one aggregate advisory naming the affected sections and
both remedies: choose another reference or update those sections. The advisory goes as incompatibilities are resolved.
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
  and Sources names none, so its findings show on its toolbar button only. A requirement names the other sections
  whose status advises that it is not met (`advise`): the Sources requirement names REF. No other section advises of
  it, and a recipe declaring no `advise` gets no cross-section advisory.

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
  representative problems, with every problem in their details.
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
  suit the source and whose requirements name this section to advise (Sources, in REF), whose own status says why. A diagnosis is said once per section. Toolbar marks
  count only what holds a section back (REF and Sources alike).
- **Input feedback** (`sourceInputFeedback.jsx`, `inputFeedback.js`). Inside REF, the section's status is said on the
  input its source is selected in, which the section's declaration names (`input`: the asset or recipe input), as that input's
  field validation rather than messages of its own. What holds the section back is the input's error, with every
  problem in its tooltip, after the input's own required-field or loading error and never in its place, and it holds
  Apply back as an invalid field does. A check still running is the input's busy indicator, explained in its label's
  tooltip beside the tooltip it already has, and holds Apply back too; the label's content is left as it is.
  Advisories are its warning and hold nothing back. Refresh, where reading the source again may help, is a button
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
  the panel owns: a replacement fitting other measures is applied, with REF's advisory naming Sources, Sources marked
  invalid, and the alerts waiting for it to be repaired. After Apply the recipe's evidence is read again through the normal lifecycle.
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
