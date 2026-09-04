# Source resolution, dependencies and execution

Technical design for resolving recipe and Earth Engine asset sources into a coherent graph and freezing that
graph for execution. This document owns authorization and task atomicity. Live refresh policy belongs in
[source-freshness.md](source-freshness.md). Product identity, output-band description fields, declaration semantics
and the distinction between canonical output and map-only products belong in
[output-products.md](output-products.md). This document owns the traversal and evidence machinery that resolves
those declarations.

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
capability logic in a server endpoint. Recipe contents and their server-owned monotonic revisions must eventually
be observed together, and the complete closure needs a bounded coherent revision recheck. Whether the Node server
exposes this as batch HTTP, an internal repository adapter or both is an implementation decision, not a prerequisite
for the pure contract.

The current GEE administrator-loading path is longstanding and remains unchanged while pure contracts, edge
inventory and GUI-facing source descriptions are developed. Do not expand or reuse it for the new resolver.

As a bounded migration measure, a browser operation may complete its preflight graph through the existing
authenticated per-recipe GUI read. It starts with the exact unsaved root and the session's loaded records, requests
deduplicated missing frontiers under the current user, and retains returned records only for that operation. This
does not require a new Groovy endpoint, does not use administrator credentials and does not make browser evidence a
coherent execution graph. Missing or forbidden records still fail closed.

The permanent live-resolution and execution-bundle boundary remains blocked on the planned Node replacement for
`sepal-server`. Do not implement a temporary Groovy closure endpoint or activate a new administrator-backed loading
path before that replacement reaches `master`. Graph traversal, capability derivation, operation-local closure
completion, bundle construction and cache behavior remain in JavaScript.

Ambient SEPAL administrator credentials must not be reachable from generic recipe resolution. The existing GEE
configuration credentials are removed when caller-aware loading replaces their only GEE use, or narrowly scoped if
a separately audited operation proves that it needs them. An administrator service call acting on behalf of a user
must carry a trusted principal and enforce that principal's access rather than inherit administrator visibility.

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

Start with one canonical product and one domain capability:

- the `IMAGE_OUTPUT` product: executable image, ordered output bands and per-band export requirements;
- the `CCDC_SEGMENTS` capability: stored CCDC bands, base-band derivation, available measures and date
  interpretation.

`CLASSIFICATION_RESULT` remains a likely later capability for classification-specific contracts. Generic
categorical metadata must not be stretched into classifier behavior, reusable training data or other algorithmic
capabilities.

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
stabilization, constant Fill or direct asset Fill. They require caller-authorized loading from the Node server
replacement and reliable recipe revisions returned atomically with content.

The current recipe `update_time` is a plain second-resolution SQL `TIMESTAMP`. Two saves in one second are therefore
indistinguishable, so it must not be used as a coherent-build revision or cache key, and equal timestamps never
establish unchanged content. The replacement storage boundary persists a server-owned monotonic `revision`
atomically with recipe content. It orders websocket events, supports cheap invalidation and optimistic concurrency,
and is distinct from the existing `typeVersion`, which is the recipe schema-migration version.

Recipe list, load, save and future batch or closure operations expose the same committed revision, and the same
revision always returns the same execution-relevant content. Coherent construction uses that same ordinary load,
which returns content and revision from one committed row. A save carries an expected revision and returns the
committed one. A websocket update is published only after commit and carries at least recipe ID and revision,
allowing clients to ignore duplicate or out-of-order events before fetching changed content. A no-op save returns the
existing revision and publishes no event. `update_time` remains useful for display and audit only.

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

Activate the generic `IMAGE_OUTPUT` product before domain capabilities or another recipe-specific resolver:

- define execution identity, ordered bands and per-band export requirements in the shared contract;
- resolve intrinsic, one-input and n-ary transformations bottom-up over the existing graph;
- observe runtime bands through existing execution boundaries without persisting descriptions;
- migrate Retrieve behind an explicit coexistence boundary;
- use direct CCDC and masked CCDC as export-policy witnesses, not as type checks in Masking.

Domain capabilities, capability-indexed selectors and broad consumer migration follow only after this output
contract is accepted. Masking consumes the generic description to stabilize Apply mask and ship constant Fill
without adding a dependency.

Direct asset Fill may follow because it uses the linked Earth Engine identity rather than loading another SEPAL
recipe. Recipe Fill remains blocked on the permanent caller-authorized loading boundary from the Node server
replacement. The temporary browser closure loader is approved only for bounded preflight of an already selected
root; reusing it for a new source-selection or execution feature requires a separate authorization and coherence
review.

CCDC Slice is a later capability and bundle witness. The resolved path supports:

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
- `revision` representation, the normalization rules behind semantic no-op detection, websocket event
  ordering and dirty-draft conflict behavior.
- Batch recipe endpoint transport details in the Node server replacement.
- Whether and where detailed task manifests are retained.
- Output handling when asset drift is detected after completion.
- ImageCollection membership behavior of `system:version` and the fallback evidence required when it is
  insufficient.
- Trusted provenance storage, canonical serialization, digest algorithm, size limits and post-export verification
  protocol for semantics that physical asset schema cannot verify.
- User-facing distinction between a preview fingerprint and a later submitted bundle.
