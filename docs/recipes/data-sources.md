# Recipe data sources - architecture and roadmap

Technical index for aligning how SEPAL recipes consume other recipes and Earth Engine assets. This is a
cross-recipe concern. Masking, CCDC, CCDC Slice and Classification provide acceptance cases, but none owns the
shared model. User-facing documentation belongs in the separate `sepal-doc` repository.

## Current delivery focus

Every recipe selector is `RecipeInput`, and what it reads is what its caller asks to be given - the
[selector contract](gui-source-runtime.md#recipe-selector-loading).

Eligibility for the classification selectors is direct `CLASSIFICATION`. Supporting a masked classification
requires a separate contract for classifier behavior; the selector does not establish that support. Further
consumer validation, capability discovery and coherent execution bundles remain separate packets driven by
concrete consumers.

## Scope and constraints

The architecture provides one contract for resolving sources, describing outputs, validating dependencies and
owning visualizations. It must replace recipe-specific copying, derivation and refresh logic incrementally rather
than introducing another parallel synchronization mechanism.

Recipe storage is the Node `recipe` module: reads and writes carry a trusted principal, and `revision` is
owned by the row. GEE reads referenced recipes as the user whose request it is serving, and a task executor as
its own worker session's owning user; neither holds administrator credentials, and the executor's state and
progress callbacks are authorized by that session against the task it was assigned. Each execution operation
retains each successfully read recipe for its own lifetime, so one operation cannot mix two revisions of the
same recipe. Failed reads can be retried. Authorized batch/closure endpoints and coherent execution bundles are
not implemented. Browser resolution completes a selected root's closure through the existing authenticated
per-recipe read and the shared batch-shaped traversal. Retrieve preflight retains those records locally; the live
evidence lifecycle uses the session's reference-counted loader. Neither makes browser evidence the execution graph.
Recipe Fill and instance-level capability discovery still require their own acquisition and validation contracts.

Activate output descriptions and capabilities one runtime boundary or consumer family at a time. Each milestone
must correct an existing defect or deliver a usable generic contract without requiring the rest of the architecture
to land.

## Design documents

- [Source resolution, dependencies and execution](source-resolution.md) owns source references, structured
  dependency edges, authorization, capability-provider lineage, graph traversal, evidence acquisition, execution
  bundles, provenance and task atomicity.
- [Source freshness, caching and invalidation](source-freshness.md) owns live source descriptions, fingerprints,
  refresh scheduling, race handling, availability, consumer dependency evaluation, derived-result freshness and
  map invalidation.
- [GUI source runtime](gui-source-runtime.md) defines the stable browser boundary through which components request
  source resolution without owning Redux catalogue state, loading or cache policy.
- [Recipe output products and band schemas](output-products.md) owns product identity, output-band description and
  declaration semantics; separates physical schema, export requirements, capabilities and GUI projections; and
  records the cross-recipe migration audit.
- [Visualization ownership and validity](visualizations.md) owns source presets, user-defined styles,
  transformation rules, selection validity, map use and export metadata.
- [Mask and Fill](mask.md) consumes these foundations and must not create a competing lineage or snapshot model.

Observability is cross-cutting. Each design document specifies its Prometheus metrics, structured logs and the
signals that require action.

## Shared model

### Sources

A source selected by a user is either a recipe reference or an Earth Engine asset reference:

```js
{type: 'RECIPE_REF', id: 'recipe-id'}
{type: 'ASSET', id: 'projects/project/assets/image'}
```

Recipes and assets share output-description and validation contracts, but not loading or revision semantics.
Recipes can be frozen into an execution bundle. Assets remain mutable under a stable ID and can only be observed
and checked for drift.

### Execution and semantics

The **execution source** supplies the pixels. A Masking recipe wrapping a Classification remains the execution
source; replacing it with the Classification ID bypasses the mask.

The **capability provider** supplies one named domain contract such as CCDC segments or classification categories.
Providers are capability-specific: one resolved output can preserve, derive or obtain different capabilities from
different nodes. There is no single effective or semantic recipe type. Terminal recipe type alone is not
compatibility evidence.

### Source descriptions and expectations

A source description is observed evidence: ordered output bands, per-band export requirements, provisional generic
band semantics, source visualizations, capabilities, revision evidence and diagnostics. It belongs to runtime state,
not persisted recipe configuration.

A consumer expectation is derived from the consuming model. Selecting band `ndvi` means that `ndvi` must still
exist. Selecting a CCDC measure also requires the corresponding CCDC capability. Discovery updates available
choices but never silently replaces a missing saved selection.

Masking, Slice and Change Alerts read current descriptions rather than writing fresh copies beside the selection.
A copy in a saved recipe is the fallback while nothing has been observed, never the answer once something
has. The selection itself is durable intent and is never replaced by what it stands for: a Masking over CCDC
remains what executes while CCDC supplies the semantics, through selection, refresh, reopening and execution.

Live acquisition is owned by the shared source-evidence lifecycle: when to read, what a reading was based on,
cancellation, and rejection of superseded answers. It completes the closure of the selected source, not of the
consumer, so a consumer whose own configuration has lost a dependency can still acquire the source that would
repair it; the source's own dependencies still take part in invalidation. A consumer may declare what to do with
an answer that was accepted - its settings are written in the same action as the evidence, compared against the
last successful observation, so a failed read cannot reset user edits on recovery - and what to say when one was
not, since a panel that shows no withheld state would otherwise fail silently. One read answers everything asked
of one asset. Panel prefill can instead use a one-shot read: PyEO stages proposed configuration until Apply and
keeps acquisition separate from the decision to copy defaults.

### Products and capabilities

One canonical product, and a capability per requirement a migrated consumer has shown cannot be expressed
without one:

- the `IMAGE_OUTPUT` product: executable image, ordered output-band schema and per-band export requirements;
- `CCDC_SEGMENTS`: stored bands, base bands, measures and date interpretation, for CCDC Slice and Change Alerts;
- `BAYTS_HISTORICAL_STATS`: which record or asset produced the statistics BAYTS Alerts monitors against;
- `OPTICAL_COLLECTION_DEFAULTS`: the collection configuration and window PyEO Alerts fills its panels from.

A capability is a name and the declaration key it asks for. A recipe type states what it produces by declaring
that key, and the shared step (`capability/providerStep.js`) answers `PRODUCES` with what was declared,
`PRESERVES` with the input filling a declared preserving role, or `UNSUPPORTED`/`MALFORMED`. It is pure,
recognises no recipe type by name, and follows no mask, fill or AOI. Execution walks it as it loads records; the
GUI walks it over records the closure already resolved (`recipe/sourceProvider.js`), which answers
`{record, declared}`, `{assetId}` or a diagnosed `{error}`. Naming a failure, and deciding what a producer must
then prove, belongs to the capability that asked.

A declaration establishes what a consumer can READ, never what may execute. A producer declaring no
`OPTICAL_COLLECTION_DEFAULTS` still answers about its bands, still classifies and is configured by hand.
Candidacy is not evidence either: an asset mosaic declares where something would be read from, not what its
asset holds. Consumers therefore acquire source information and derive defaults as separate questions, and an
answer to one survives a failure of the other.

The adapters share the producer-step rule. Change Alerts and BAYTS candidate selectors use its declaration query;
Slice's selector and the four classification pickers still use type filters. Declaration candidacy does not establish
support for a particular wrapper instance; that requires resolving the selected source and its evidence.

An asset mosaic carries three declarations of the same shape, one per capability. Before adding another, review
whether a single "stands for its asset" declaration can express the shared fact without erasing capability-specific
requirements.

Add another capability only when a migrated consumer demonstrates that product schema, adapter identity and current
capabilities cannot express its contract. A future `CLASSIFICATION_RESULT` may be useful, but it should be defined
from real Classification consumers rather than guessed in advance.

Recipe definitions declare product-transformation guarantees, such as preserving ordered band schema and values at
valid pixels while changing the mask. Capability contracts declare which additional guarantees they require. The
product resolver combines those contracts bottom-up to preserve, decorate, derive or drop capabilities; it does not
copy arbitrary methods or properties from a terminal recipe onto a wrapper. This avoids changing every consumer when
a new pass-through recipe is added, and avoids changing every pass-through recipe when a new capability can already
be decided from its declared guarantees.

Transformations are not restricted to one-input decorators. A Stack can derive one output from several role-bearing
inputs, preserve a capability over an unchanged subset of output bands, or expose several instances of the same
capability. Consumer expectations state any required cardinality and selection constraints; the resolver never
chooses one matching instance silently.

### Shared contract home

Pure recipe contracts belong under `lib/js/shared/src/recipe`, grouped by responsibility: `source/` for references
and traversal, `output/` for products and transformations, `capability/` for named consumer requirements, and `type/`
for recipe definitions. They must not depend on React, Redux, Earth Engine or task infrastructure.
GUI, GEE and Task adapt the same contract at their boundaries.

Recipe-specific behavior belongs to one shared recipe definition per type. A single minimal catalogue imports
those definitions and indexes them by persisted recipe type; it contains no source, capability or presentation
logic. A definition must explicitly declare its direct sources or explicitly declare that it has none, and must
declare the output transformation needed for generic capability preservation. Adding a recipe must not require
updating separate switches for dependencies, bands, capabilities and runtime consumers.

The intended end state is that implementing a recipe primarily means declaring its model edges, output
transformations and capabilities, plus genuinely recipe-specific execution and UI behavior. Generic consumers must
derive behavior from those declarations rather than require copied orchestration or per-recipe compatibility code.
During migration, recipe-specific adapters must remain thin and removable. Extract a new shared API only when a
second consumer demonstrates the same stable repeated shape; temporary fallback policy must not become part of the
permanent recipe API.

Recipe action builders should describe state transitions only. New source-resolution, observation and submission
work must start explicitly after dispatch through runtime or command boundaries, not through
`actionBuilder.sideEffect()`. When a migrated path already uses a reducer-side effect, remove it when behavior and
ordering can be preserved within that packet; unrelated uses remain separate cleanup work.

Known scientific or execution defects are corrected on `master` before the new contracts describe the affected
behavior. Contract versions identify deliberate durable contract evolution; they do not preserve old bugs as
supported algorithms. Existing assets produced by defective code receive no source-resolution workaround and may
need to be recreated when correctness matters. This does not prohibit backward-compatible readers for established
asset formats: preserving CCDC metadata and Slice usability is format compatibility, not preservation of a defective
algorithm.

Generic reference and edge modules know only canonical value shapes. Legacy model normalization and role names are
owned by the recipe definition that understands those fields. Roles are opaque to generic traversal unless a
cross-recipe contract explicitly gives one shared meaning.

Pure behavior is tested once in the shared library. Each runtime gets a thin environment witness proving that the
shared module resolves and executes under Vite or Node ESM, plus focused boundary tests for behavior owned by that
runtime.

### Recipe-type knowledge boundary

A recipe definition knows its own persisted model, direct source roles, transformation and capabilities it
intrinsically provides or derives. A consumer knows the capability it requires. Neither enumerates the concrete
recipe types on the other side. Concrete type dispatch belongs in the central registry, and temporary type-specific
migration adapters must have an explicit removal condition.

The maintenance tests for this boundary are:

- adding a pass-through or composing recipe does not modify existing consumers, selectors or Retrieve;
- adding a consumer adds an expectation, not a list of compatible recipe types;
- adding a capability does not modify existing transformations whose declared guarantees already decide whether it
  is preserved;
- adding a recipe type requires its definition and runtime implementation, not new cross-recipe switches.

## Normative policy map

Normative policy appears only in the owning design document:

- [Source resolution](source-resolution.md) owns explicit-principal authorization, edge completeness, cycles,
  deletion, diagnostics, execution eligibility, bundle lifetime and compatibility, asset observations, provenance
  and legacy evidence.
- [Source freshness](source-freshness.md) owns the session catalogue, conservative fingerprinting, refresh
  scheduling, race handling, map invalidation, consumer dependency evaluation and derived-result freshness.
  It consumes resolution diagnoses without redefining them.
- [Output products](output-products.md) owns product identity, output-band declarations, source-adapter commands,
  temporal collection composition, operation requirements and the boundary between canonical output, map products
  and GUI projections.
- [Visualization ownership](visualizations.md) owns source-preset and user-style ownership, applicability,
  transformation, map selection and export filtering.

This index records implementation order and scope. When a summary here appears to conflict with an owning
document, the owning document is authoritative and this index must be corrected.

## Acceptance scope

The shared contracts must cover:

- differently role-bearing edges in one recipe;
- direct and indirect cycles, missing sources and incomplete references;
- outer execution identity versus capability-provider identity;
- direct and transitive map invalidation;
- stale copied band and visualization snapshots;
- per-band export requirements through transformations and composition;
- controlled rejection of incompatible consumer expectations.

Keep each correction independently mergeable. Do not combine runtime output descriptions, visualization ownership,
domain capabilities and recipe-specific operation controls merely because one acceptance case exposes all of them.

## Architecture milestones

The numbered milestones retain their identifiers for cross-references and describe architectural dependencies,
not the current work queue; follow the delivery focus above. Current contracts and remaining work are identified
separately. Do not hold usable behavior until later architecture is ready. Coherent closure acquisition remains a
prerequisite only for the work that depends on it.

### 1. Establish runtime image output contracts

The shared `IMAGE_OUTPUT` contract describes outer execution identity, ordered bands, per-band export requirements
and evidence. The browser's one-shot runtime completes a bounded dependency closure and observes bands through
existing execution APIs. Masking Retrieve consumes that description for band selection, destination compatibility
and pyramiding policy, with an explicit coexistence boundary for unmigrated recipes.

Remaining work:

- Extend output declarations to further consumers where they replace existing logic. Keep source observations in
  runtime state and remove each legacy policy only when its replacement is accepted.
- Verify exported pixels and metadata for the supported direct and wrapped sources. Runtime witnesses establish
  contract handoffs, not live Earth Engine computation.
- Keep declaration-driven array-band policies and destination checks consistent between forms and submission.
  Do not add recipe-type checks to Masking or silently apply an export-policy fallback to unresolved bands.

### 2. Stabilize Apply mask

Masking declares identity band mapping and preserved values at valid pixels. Its live evidence comes from the
selected primary source; copied bands and presets are only an unobserved compatibility fallback.

Remaining work:

- Extend the resolved description incrementally with preserved date range and source-visualization ownership.
- Capture current Earth Engine behavior, add explicit mask-band selection with legacy first-band compatibility, and
  validate required operation inputs.
- Verify Preview, map rendering, Retrieve and exported metadata against the same resolved output while preserving
  outer execution identity.

Exit criterion: Apply mask is behaviorally stable, stale source snapshots cannot silently win, and every supported
workflow executes the Masking recipe rather than a capability provider.

### 3. Ship constant Fill

- Add the operation discriminator with legacy Apply mask as its default.
- Implement a finite constant replacement for selected target bands.
- Preserve output band names, order, metadata and the primary footprint.
- Validate malformed saved models at both form and backend boundaries.

Exit criterion: constant Fill works in Preview and Retrieve and introduces no fill dependency, recipe catalogue,
bundle, provenance or caller-aware loading requirement.

### 4. Add direct asset Fill

- Add explicit name-based target-to-replacement band mapping.
- Resolve the replacement through the user's linked Earth Engine identity.
- Verify masks, projections and footprint behavior without introducing new recipe loading.

Exit criterion: asset Fill is validated end to end and cannot silently remap bands by position.

### Storage and loading prerequisites

`/api/processing-recipes` is served by the Node `recipe` module behind the authenticating gateway:

- recipe reads and writes use the trusted SEPAL principal; reads apply the owner-or-administrator policy without
  substituting service-account authority for the requesting user;
- `revision` is a column on the recipe row, injected as an additive top-level field and never stored in recipe
  content, with list, load and save all exposing the same committed revision;
- save accepts `expectedRevision` and returns the committed revision, so a client maintains a revision registry
  and detects concurrent writes;
- owner, non-owner and missing-principal behavior is covered by the module's own tests.

GEE and Task use caller-authorized readers and operation-scoped records. The remaining execution-bundle work is
trusted closure acquisition and graph-wide coherence. A batch or closure API can reduce round trips but does not
itself provide a coherent snapshot; a transaction or bounded revision-recheck protocol must establish that.

The full storage contract, including no-op save behavior and normalization requirements, is defined in
[source-freshness.md](source-freshness.md). `revision` is distinct from the existing `typeVersion`, which is
the recipe schema-migration version.

An endpoint may orchestrate the shared JavaScript traversal and bundle logic; it must not introduce a separate
definition of edges, capability rules or access policy.

### 5. Add Sampling Design derived-result freshness

Uses the existing storage `revision`. No interim unversioned-recipe path is planned or built:
there is no temporary browser content-hash bridge and no `update_time` freshness rung.

- Add the recipe snapshot provider that distinguishes an editable root draft from operation-local persisted
  dependency snapshots, keyed by `revision`. Dependency snapshots never enter the shared loaded-recipe map.
- Reuse the existing operation-scoped recipe records and shared in-flight reads. Add the exact recipe/asset
  evidence vector to derived results; record sharing alone does not establish persisted-result freshness.
- Resolve recipe AOIs through the AOI geometry product they expose, including transitive recipe and asset evidence,
  rather than teaching Sampling Design which recipe fields affect geometry. Unmigrated recipe types fall back to
  conservative whole persisted-source evidence.
- Add generic persisted `calculatedFrom` sidecars, operation-input fingerprint comparison and stale-response epochs.
- Migrate stratum areas first, then per-stratum probabilities, each declaring its own named source roles and
  parameters. Replace both existing per-panel calculation caches with the generic derived resource and remove the
  old module once both have migrated.
- On open and before Retrieve, refresh the dependency revision vector, re-resolve only changed dependencies, and
  mark results stale only when their operation-input fingerprint changed. Keep stale values as context, block their
  use and direct the user to recalculate.
- Treat a legacy result without `calculatedFrom` as `UNKNOWN`, blocking submission exactly as `STALE` does. Every
  existing Sampling Design result is in that position and needs one recalculation — potentially a batch
  calculation — before its next submission, with its existing values visible as context until then.
- Reuse the existing shared recipe-closure limits rather than defining another policy.

Exit criterion: a recipe or asset may change while its dependent Sampling Design recipe is closed. Opening that
recipe refreshes current source evidence; unchanged complete evidence preserves results without loading unchanged
recipe content; changed evidence re-resolves the consumed products; changed operation-input fingerprints mark the
affected results stale while unchanged fingerprints preserve them despite conservative revision changes; a late
calculation response cannot commit; and Retrieve revalidates afresh and blocks stale or unknown applicable results.
No update-time or temporary content-hash bridge is involved.

### 6. Add recipe Fill

- Reuse caller-authorized loading for the fill reference and define its acquisition and execution requirements.
- Reuse the shared graph for cycles, missing sources and execution-versus-capability-provider identity.
- Apply the same explicit band mapping and output-preservation contract as asset Fill.

### 7. Complete coherent execution and live freshness infrastructure

- Add explicit live and bundled resolution contexts on top of the authorized operation-scoped reader. A bundled
  operation must never fall back to live reads for a missing member.
- Build bundles by loading the closure and coherently rechecking every revision with bounded retries. A content
  digest remains optional until a concrete integrity or provenance requirement needs exact byte identity.
- Extend the session catalogue and product-scoped fingerprints established by Sampling Design with remote
  invalidation and coherent execution support.
- Add one source-version registry for recipe revision events, local draft generations and Earth Engine asset
  `system:version` evidence. Build generic versioned derived resources above it so image-output descriptions,
  visualization applicability and Sampling Design stratum areas and per-stratum probabilities share invalidation,
  in-flight deduplication and replay rather than creating recipe-specific caches.
- Add websocket revision events and, if justified, patch transport. Both remain latency and transport
  optimizations; correctness established in step 5 never depends on them.
- Progressively migrate recipe types to explicit AOI and image product projections, reducing the conservative
  whole-source recalculation that unmigrated providers fall back to.

### 8. Migrate CCDC Slice capabilities and visualizations

Slice and Change Alerts share the CCDC producer contract and source-evidence lifecycle. Their current execution,
date-format and compatibility rules are described in
[source resolution](source-resolution.md#current-segment-consumer-contract); GUI refresh and template identity
belong to [GUI source runtime](gui-source-runtime.md#live-source-evidence). No second synchronization or producer
discovery path is needed.

Remaining work:

- Replace Slice's hard-coded CCDC/ASSET_MOSAIC candidate filter with the declaration query, while keeping candidacy
  distinct from verified support for a specific recipe or asset.
- Define the closed `CCDC_SEGMENT_SLICE` transformation and structural capability evidence. The current mode-aware
  band derivation is not a complete capability-validation contract.
- Preserve existing CCDC Segments assets through a narrow structural asset contract. Interpret legacy
  `visualization_*` and `baseBands` properties as template configuration after validation; do not require assets
  to be recreated or rewritten solely to adopt that contract.
- Verify direct and masked segment sources against live Earth Engine, including ImageCollection retrieval,
  date representations and output-band semantics. Node runtime witnesses substitute external boundaries and
  cannot establish correct pixels.
- Keep Preview, map selection and Retrieve filtering aligned as validation strengthens. Structured provenance
  may support future consumers but is not a prerequisite for existing Slice assets.

### Later follow-up: Band Math dependencies

Implement one chain: **input band -> calculation -> output**. This is a separate consumer-validation packet,
independent of selector presentation and acquisition changes.
Follow the [declarative evaluation direction](source-freshness.md#declarative-dependency-evaluation), reusing the
shared source-observation lifecycle rather than adding another watcher, cache or source traversal.

1. Identify user configuration versus derived fields in Band Math's current sync path, including expression and
   output references. Preserve saved-model compatibility and intentional rename behavior.
2. Express the chain's consumed inputs, requirements and derived output through recipe-owned pure functions,
   using the existing expression parser. Use the same declaration and evaluation contract for local configuration,
   calculation outputs and current evidence from selected recipes or assets; only their providers differ.
3. Connect derived diagnostics to the owning sections and affected Preview/Retrieve operations. Remove the
   superseded bookkeeping for this chain; leave unrelated sync behavior alone. Recheck the same requirements at
   execution, so a closed panel or directly submitted model cannot bypass them.

Acceptance scenarios, without closing or reopening the recipe:

- Removing a required band identifies the affected calculation and output and prevents their execution, while
  preserving the expression and output configuration. Restoring the band restores validity automatically.
  Exercise the same rule for a local input-selection change and for a change to the external source's bands.
- Removing an unused band or changing only a visualization does not invalidate the calculation.
- An unavailable source is reported as unverified, not as a missing band; a superseded observation cannot change
  the current diagnosis. Cover source replacement and upstream changes under the same recipe or asset ID.

Use requirements exposed by Change Alerts as another real consumer when shaping the evaluation contract.
Sampling Design's persisted-result freshness remains
step 5; neither its planner nor all input forms are rewritten here. The declaration API is determined by these
workflows, not by a speculative framework or synthetic consumer.

### 9. Source selection and further consumers

Extend the shared contracts where a consumer demonstrates a requirement. Keep selector presentation, source
compatibility, panel defaults and execution behavior as separate responsibilities and separately reviewable work.

Still to do here:

- Define [classification output versus reusable classifier behavior](source-resolution.md#classification-results-and-reusable-classifiers)
  before admitting masked classifications to PyEO, CCDC, Time Series or Phenology. Decide mask semantics for the
  baseline image, training and newly classified monitoring images; never unwrap a selection and silently drop it.
- Fix PyEO Sources Apply during a pending prefill: it can commit the new `model.sources` while keeping the old
  options and dates. Define a pending/failed/manual-configuration policy so an applied selection and its settings
  are intentional together; preserve Cancel and user-edited datasets.
- Resolve PyEO's gate-index behavior for asset-backed imagery through wrappers. Execution currently selects an
  index for any `RECIPE_REF` and computes it for a direct asset; a successful defaults read does not establish
  wrapped-asset execution support. Preserve the selected image and verify both paths through execution.
- Decide whether PyEO's selected-scenes restriction is only a limit on deriving defaults or an execution
  requirement. It is currently checked during prefill, not when opening a saved recipe; apply the chosen policy
  at the appropriate boundaries rather than broadening rejection incidentally during selector migration.
- Surface recipe-dependency diagnostics in the GUI's shared layer-error handling. A rejected cycle should
  explain the circular dependency and show its path, using known recipe names where available, instead of
  only "Failed to load layer - Bad request". Preserve the execution rejection and retain a generic fallback
  for unrecognised failures. Cover the diagnostic's passage from the execution response to the visible error.
- Continue one consumer family at a time. Likely groups are the remaining alert recipes, Stack and Band Math,
  generic image inputs and Classification/Regression reuse. Every migration needs a stated stopping rule,
  coexistence plan and removal of the superseded local synchronization path.

## Deliberately deferred

- Decide asset date-format authority separately from source-resolution migrations: whether a stated asset format
  can be overridden, and how missing or incorrect metadata can be corrected. Preserve the current explicit
  override, including zero, until that decision defines validation and saved-recipe compatibility.
- Explore [map inspection and capability-driven layer actions](map-inspection.md), including charts for added
  layers. Discussion only; scope and scheduling undecided.
- Persistent source metadata across page reloads.
- A distributed GEE metadata cache.
- Fine-grained data/schema/presentation fingerprints.
- Automatic repair of missing band selections.
- Live input-imagery panel refresh when the selected source recipe changes without changing its ID. Start with
  the shared Stack/Remapping form after the bounded Band Math follow-up above. Refresh available bands and
  visualizations while the panel stays open, applying the same dependency-evaluation rules. This remains separate
  from correcting explicit asset/recipe switching and must preserve live visualization propagation into Masking.
- One repository-wide migration commit.
- Recipe Fill before its source acquisition and execution requirements are defined.
- Execution bundles before trusted closure acquisition, graph-wide coherence and task acceptance are implemented.
- Any interim unversioned-recipe freshness path: no temporary browser content hashing and no `update_time`
  freshness rung. Persisted derived-result freshness uses the existing `revision` contract.
- Requiring domain-capability work as a prerequisite for constant Fill.
- Shared gateway-authentication middleware for Node/Koa modules. Extract the repeated `sepal-user` parsing,
  `ctx.state.currentUser` assignment, 401 handling and role guards from Recipe, Budget, Message, Scene Metadata
  and Worker into shared HTTP infrastructure, with loggers injected at composition roots. Preserve each module's
  role combinations and response contract, and land this as a dedicated cross-module commit rather than as part
  of Recipe source resolution.

### Task-driven asset invalidation

Connect task completion to the shared asset-freshness design in a separate packet.

- Exporters report actual affected asset IDs to shared asset invalidation, without knowing which recipes or
  layers consume them. Invalidate when a destination may have changed and recheck after success, failure or
  cancellation; an unsuccessful replacement can still have deleted or partly rebuilt the destination.
- Handle present -> missing -> changed transitions, including partially populated collections. Preserve saved
  references and selections during temporary absence, withhold unavailable imagery, and refresh active consumers
  when the asset returns. Notifications trigger reads of actual state, not blind catalogue additions or removals.
- Keep catalogue scanning and explicit refresh for external changes and missed notifications.

### Band encoding and physical-value presentation

Defer general scale/offset propagation and physical-unit legends, charts and pixel inspection. This is not a
prerequisite for decoupling Slice: producers supply correct descriptions and ready-to-use visualizations;
consumers need no optical, radar or Planet-specific encoding knowledge.

Follow the representation/measurement distinction in [output products](output-products.md):

- Producers declare per-band encoding as `physical = stored * scale + offset`. Share that declaration between
  execution and preset conversion where it removes duplicated assumptions, preserving pixel values and casts.
- Convert pixels or visualization ranges at one boundary, never both. Derived quantities need their own rules;
  phase and timing do not inherit a base band's multiplier.
- Preserve existing assets and saved styles. Do not infer their encoding from today's producer configuration or
  reinterpret already-encoded ranges; settle compatibility before expanding the contract.

The narrow radar RGB preset correction need not wait: its ratio range must match the existing x1000 encoding,
not the x100 used for VV/VH. Verify matching ranges and unchanged pixel encoding without broadening this into
an all-product migration.
