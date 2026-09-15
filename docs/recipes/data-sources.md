# Recipe data sources - architecture and roadmap

Technical index for aligning how SEPAL recipes consume other recipes and Earth Engine assets. This is a
cross-recipe concern. Masking, CCDC, CCDC Slice and Classification provide acceptance cases, but none owns the
shared model. User-facing documentation belongs in the separate `sepal-doc` repository.

## Current delivery order

1. Close the independent review follow-ups for both database merges, validate the affected areas, and commit the
   resolved merge into `feature/recipe-source-resolution`.
2. Merge the accepted source-resolution branch into `sepal-server` and release the completed scope after the
   [existing dev/test database preparation](../database-migrations.md#existing-devtest-databases). Further repository
   conversions and recipe capabilities are not prerequisites for this release.
3. Start a new repository-consistency branch from that updated `sepal-server`. Recipe and Message are already
   converted in this baseline; preserve their implementations rather than transplanting Recipe separately or
   maintaining a second version on `feature/reusable-db-migrations`.
4. Convert the remaining repositories one module at a time. Use the shared callback database API and isolated
   integration tests built from real schema migrations. Preserve each module's transaction guarantees, batch
   performance, named-lock requirements and case-insensitive username semantics. Consistency means common
   ownership and test guarantees, not identical repository structure. Merge the reviewed work into `sepal-server`.
5. Return to recipe dependencies with Change Alerts: introduce the smallest `CCDC_SEGMENTS` capability contract
   that replaces its copied source configuration and synchronization. Consolidate Slice's existing segment
   description into that contract rather than adding a parallel mechanism. Extend other output declarations where
   they replace existing logic; do not broaden declarations solely to populate every recipe definition.

This is the delivery priority, not a requirement to finish the architecture before releasing. Shared dependency
definitions already cover all registered recipe types; output declarations currently cover CCDC, Masking and CCDC
Slice. Generic section validation, capability discovery, coherent execution bundles and broad recipe conversions
remain separate work driven by concrete consumers.

## Scope and constraints

The architecture provides one contract for resolving sources, describing outputs, validating dependencies and
owning visualizations. It must replace recipe-specific copying, derivation and refresh logic incrementally rather
than introducing another parallel synchronization mechanism.

Recipe storage is now the Node `recipe` module: reads and writes carry a trusted principal, and `revision` is
owned by the row. GEE reads referenced recipes as the user whose request it is serving, and a task executor as
its own worker session's owning user; neither holds administrator credentials, and the executor's state and
progress callbacks are authorized by that session against the task it was assigned. Each execution operation
reads a given recipe once and keeps that record for its own lifetime, so one operation cannot mix two
revisions of the same recipe. What remains blocked is coherent execution bundles and the batch or closure read
they need. A bounded browser preflight completes one selected root's
closure by calling the existing authenticated per-recipe GUI read behind an operation-local, batch-shaped adapter.
That measure neither persists a catalogue nor makes browser evidence the execution graph; recipe Fill,
saved-recipe discovery and execution bundles remain blocked on their permanent boundaries.

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

### Products and capabilities

Start with one canonical product and one domain capability:

- the `IMAGE_OUTPUT` product: executable image, ordered output-band schema and per-band export requirements;
- the `CCDC_SEGMENTS` capability: CCDC stored bands, base bands, measures and date interpretation.

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

Pure reference, edge, band, capability, bundle, fingerprint and validation contracts belong under
`lib/js/shared/src/recipe/source`. They must not depend on React, Redux, Earth Engine or task infrastructure.
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
not the current work queue; follow the delivery order above. Each is an independent merge candidate. Do not hold
completed foundations or usable behavior until later architecture is ready. The Node replacement has landed;
caller-authorized closure loading remains a prerequisite only for the work that depends on it.

### 1. Establish runtime image output contracts

Deliver this milestone as separate merges, in this order:

1. Define the pure `IMAGE_OUTPUT` product contract: outer execution reference, ordered band descriptions, per-band
   export requirements, evidence and stable diagnoses. Do not add domain capabilities yet.
2. Define intrinsic, one-input and n-ary transformation contracts and a bottom-up resolver over the existing graph.
   Use pure synthetic composition tests without activating Stack or another broad consumer family.
3. Add a runtime adapter that observes actual bands through existing execution boundaries and keeps descriptions in
   runtime state. Do not change persisted recipe JSON or introduce backend recipe loading.
4. Migrate Retrieve to derive selected bands and pyramiding policy from the resolved output. Keep an explicit
   coexistence path for unmigrated recipes and remove each legacy policy only when its recipe is accepted.
5. Prove direct CCDC and physically observed array-valued asset bands use `sample`, Apply mask preserves it for a
   successful masked CCDC Segments asset export, and ordinary continuous and categorical outputs retain their own
   policies. Array-band selection allows only Earth Engine asset export in both the Retrieve UI and submission
   validation. Complete missing browser dependencies through the existing authenticated recipe read without Redux
   writes, with the shared graph as the sole cycle authority and explicit closure limits. No recipe may inspect
   another recipe's type.

Explicitly defer domain capabilities, capability-indexed recipe selection, date-range and visualization ownership,
saved-recipe catalogue queries, coherent bundles and broad recipe-family migrations.

Do not schedule a standalone Change Alerts date-format patch in this phase. When Change Alerts migrates to the
capability contract, its execution boundary must still reject legacy, incomplete and directly submitted models
with a typed error, but that defensive check is acceptance work for the migration rather than a separate feature.

Exit criterion: one generic runtime output description drives a migrated Retrieve path; export requirements survive
declared transformations; a Masking recipe with a CCDC Segments asset as its primary input exports successfully
to Earth Engine without a Masking-to-CCDC type check; incompatible Drive and SEPAL submissions are prevented;
unmigrated recipes retain their existing behavior through an explicit and removable coexistence boundary.

### 2. Stabilize Apply mask

- ~~Stop treating copied primary bands and visualizations as authoritative source state.~~ Done, generically:
  the transformation declaration states that band mapping is identity and values are preserved, and consumers
  read the inherited source's current bands and presets rather than the copied snapshot.
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

### External prerequisite: Node server replacement

The Groovy `sepal-server` has been replaced. `/api/processing-recipes` is served by the Node `recipe` module
behind the authenticating gateway, and the storage contract this architecture depends on is in place:

- every recipe read and write requires a trusted SEPAL principal, and reads are scoped to the owner;
- `revision` is a column on the recipe row, injected as an additive top-level field and never stored in recipe
  content, with list, load and save all exposing the same committed revision;
- save accepts `expectedRevision` and returns the committed revision, so a client maintains a revision registry
  and detects concurrent writes;
- owner, non-owner and missing-principal behavior is covered by the module's own tests.

Two things remain, and they are what still blocks the milestones below rather than the replacement itself:

- there is no authorized batch or closure read. The temporary browser preflight used by steps 1 through 4 reuses
  only the per-recipe read; it is not a coherent server resolver and must not grow into one;
- Earth Engine still reads referenced recipes with ambient administrator credentials
  (`lib/js/ee/src/recipe.js`), which the recipe service still honours. That access is removed once caller-aware
  loading owns every legitimate read.

The full storage contract, including no-op save behavior and normalization requirements, is defined in
[source-freshness.md](source-freshness.md). `revision` is distinct from the existing `typeVersion`, which is
the recipe schema-migration version.

Graph traversal, capability derivation, caching and bundle construction remain shared JavaScript concerns rather
than server endpoint logic.

### 5. Add Sampling Design derived-result freshness

Requires `revision` from the prerequisite above. No interim unversioned-recipe path is planned or built:
there is no temporary browser content-hash bridge and no `update_time` freshness rung.

- Add the recipe snapshot provider that distinguishes an editable root draft from operation-local persisted
  dependency snapshots, keyed by `revision`. Dependency snapshots never enter the shared loaded-recipe map.
- Add the request-scoped snapshot cache at the execution boundary: one snapshot and revision per recipe ID per
  operation, shared in-flight loads, and an exact evidence vector returned with each result.
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

- Activate caller-authorized resolution for the fill reference.
- Reuse the shared graph for cycles, missing sources and execution-versus-capability-provider identity.
- Apply the same explicit band mapping and output-preservation contract as asset Fill.

### 7. Complete coherent execution and live freshness infrastructure

- Introduce live and bundled resolution contexts only after authorized loading exists.
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

Done ahead of steps 5 to 7, because Slice's hand-written synchronization was the first copied-source model to
replace once Masking had proven the shared evidence lifecycle. What landed:

- Each producer of segments describes its own, through a provider its recipe type registers: CCDC from its model
  (`recipe/ccdc/segmentDescription.js`), finding the Classification it fits through the edge it declares; an
  asset mosaic and a bare asset from asset metadata read at observation time (`recipe/ccdc/segmentsAsset.js`,
  which owns the band-name parsing), not from the copy taken when the asset was selected. Slice dispatches
  through the registry and recognises no producer type.
- Slice derives its output from that description together with its date mode and options
  (`recipe/ccdcSlice/sliceEvidence.js`). One mode-aware derivation (`#sepal/recipe/type/ccdcSlice`) is used by
  the declaration, the GUI and Earth Engine's own band reporting, so an operation asked for no harmonics
  advertises none. The shared definition declares a transformation - segment arrays into scalar slice bands -
  rather than preservation, so a wrapper-inheritance rule cannot mistake it for a pass-through.
- One shared evidence lifecycle (`recipe/sourceEvidenceSync.jsx`) serves Masking and Slice through a per-recipe
  observation; `ccdcSlice/sourceSync.jsx` is gone. Preview, band selection, presets, date and options controls,
  Retrieve and the pixel chart read the same resolved description. Each published answer is numbered, so the
  chart and Preview reload when the source was READ again rather than only when what it describes differs. A
  failed read withholds what the source describes but retains which source was last read successfully, so a
  recovery can tell whether the templates a saved selection names are its own. Restored styles are bound to
  their original source when Slice opens, before the first read, so changing source during that read cannot
  transfer their identities. Slice
  no longer reconciles or gates its own visualization selection: it offers one preset list and the generic layer
  owns the rest, so a selection whose bands are gone is neither redirected nor drawn.
- A consuming recipe resolves a source's description as part of its own dependency resolution, so a saved Slice
  that has never been opened still offers what it describes to a Masking recipe over it.
- Execution no longer depends on the copied `dateFormat` and `targetType`. The producer's definition declares
  how its segment dates are represented and whether its base band names are selectable on it; a producer whose
  segments ARE an asset names the asset instead of a value, and execution reads the representation off that
  asset rather than off the metadata copied beside the reference - which is what makes the GUI and the running
  image agree about an asset re-exported since it was selected. A collection's properties are read the way the
  GUI's metadata endpoint reads them, its members' included, for the same reason. `recipeRef` derives the facts and the image from
  one load, so the two cannot describe different records. The copies remain in saved recipes as a fallback and
  are not rewritten; the source panel stops writing them, and the configured date format of a bare asset source
  is preserved as user configuration, zero included, taking precedence over the asset property that prefills it.
- Retrieve submits the band names its selection resolves to, and offers only the base bands, measures and
  segment bands the selected operation produces. A saved template selection survives reopening: the styles a
  recipe's own layers were saved with are the identities a fresh asset read is reconciled against, since `ui`
  is not persisted. A selection whose bands are gone is left as the user left it, by the same rule the generic
  layer applies.
- Execution resolves segment-producer facts THROUGH preserving wrappers. The producer of a source's segments is
  not necessarily the recipe selected: a Slice, Change Alerts or segment chart over a Masking runs the Masking's
  image and reads the underlying producer's `{dateFormat, selectableBaseBands}`. The chain is followed only where
  a recipe type declares that it preserves its input's schema and values, and only through the input filling that
  declared role, so a mask, a fill or an AOI can never become the producer. Both terminations are handled: a
  producer declaring a date representation answers from its own model, and one whose segments ARE an asset names
  the asset, whose properties are read now. All reads use the operation's authorized records, so producer
  discovery and image construction are the same records within one operation.
- Controlled failures are distinguished rather than absorbed: a declared preserving role a model does not fill
  exactly once is `MALFORMED_SEGMENT_SOURCE`, a terminal recipe declaring no segments at all is
  `UNSUPPORTED_SEGMENT_SOURCE`, a preservation chain closing on itself is the existing `CYCLIC_DEPENDENCY`, and a
  failed recipe or asset read propagates as itself - never answered from the copy saved beside the reference.
  Sources that used to fall through to that copy are now rejected before the segment algorithm runs.

Still to do here:

- Promote the existing segments description into a requestable `CCDC_SEGMENTS` capability alongside the implemented
  `IMAGE_OUTPUT` contract, driven by the Change Alerts migration in step 9. The description above is currently
  Slice's evidence, not yet a capability other consumers can request. Execution-side resolution is in place and
  is deliberately narrower: it answers `{dateFormat, selectableBaseBands}` and nothing about band descriptions or
  GUI discovery.
- Remove the copied source metadata and the GUI's selection filters and synchronization. They are unchanged: the
  copies remain in saved models, are still written where they were, and are still the compatibility fallback when
  a supported producer declares no date representation.
- Complete export acceptance as recorded below. Automated tests cover source, observer, chart and layer
  boundaries. Execution-side source resolution and band discovery have runtime witnesses with substituted
  external boundaries (`modules/gee/src/jobs/ee/ccdc/sliceSourceFacts.runtime.mjs` and `ccdcBands.runtime.mjs`);
  these do not establish successful Earth Engine pixel execution.
- Define the closed `CCDC_SEGMENT_SLICE` transformation and materialize its presentation templates only after the
  source capability, required evidence and exact Slice output bands resolve.
- Preserve existing CCDC Segments assets through a narrow structural asset contract. Continue interpreting their
  legacy `visualization_*` and `baseBands` properties as Slice template configuration after that contract validates;
  do not require assets to be recreated or rewritten.
- Prove both direct CCDC assets and CCDC assets carried through Masking. Masking preserves the capability and
  templates only while its explicit transformation effects preserve the required structure.
- Migrate Preview, map selection and Retrieve filtering together. New structured provenance may be dual-written for
  stronger future consumers, but it is not a prerequisite for existing CCDC Slice assets.

Manual acceptance, confirmed by the user for the sources and modes exercised (not every source variant):

- Successful tile and chart rendering; panel interactions without unintended Slice reloads; genuine computation
  changes refreshing Slice while the available bands stay the same.
- Optical-to-radar visualization updates and corrected chart-band selection.
- Opening Slice's visualization panel and using a saved Slice as a Masking dependency without opening Slice first.
- Saved-preset restoration after reopening, and date-mode and harmonics behavior.

Export acceptance: the user confirmed the longer-history Image export completed with valid pixels. The earlier
Image completed fully masked; insufficient Landsat 9 history remains the user's explanation rather than a verified
cause. ImageCollection completion remains unconfirmed. No additional exports were launched for this review.

Map Layers acceptance: the user confirmed the existing-layer refresh fix works after replacing an asset under the
same ID while its recipe stays open. This does not establish every invalidation or source variant. The bounded fix
re-reads metadata on activation, on a changed catalogue `updateTime`, and through the asset layer's **Refresh asset**
control. A successful read renews the preview even with identical metadata, keeps unchanged preset identities, and
withholds missing-band or array styles without deleting saved selections. Refresh errors are reported and superseded
responses are rejected. Broader shared metadata ownership and task-reported destination invalidation remain
[asset freshness follow-ups](source-freshness.md#asset-freshness).

The final review's break-confidence band mapping, unconfigured asset date fallback and SR chart correction are
covered by regression tests and accepted by inspection; they have no separate browser confirmation yet.

### Later follow-up: Band Math dependencies

After the repository work and the bounded Change Alerts capability migration, implement one chain: **input band ->
calculation -> output**. This is a separate consumer-validation packet, not a prerequisite for either release.
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

Use requirements exposed by Change Alerts as another real consumer when shaping the evaluation contract, without
making its earlier capability migration depend on this packet. Sampling Design's persisted-result freshness remains
step 5; neither its planner nor all input forms are rewritten here. The declaration API is determined by these
workflows, not by a speculative framework or synthetic consumer.

### 9. Migrate Change Alerts, then further consumers

This is the next recipe-model extension after the repository-consistency work. Scope the capability contract to
the information Change Alerts consumes and consolidate the existing Slice providers into it. Do not add generic
section validation, discovery infrastructure or execution bundles to this packet.

- Make Change Alerts the first `CCDC_SEGMENTS` consumer: retain the selected outer execution reference, obtain CCDC
  semantics through the primary lineage, and reject an absent capability without entering algorithm code.
- Landed ahead of that migration, as a bug fix rather than a step towards it: selecting a wrapper recipe no longer
  replaces the reference with the producer found underneath it, so a Masking over CCDC executes its mask. The
  producer is still resolved through `loadSourceRecipe$` and still supplies the copied description beside the
  reference; what changed is that the description is merged into the selection instead of replacing it. The copies,
  the terminal-reference discovery and the recipe-type candidate filter are all still there for the migration to
  remove.
- Replace its recipe-type and blanket `sourceRecipe` candidate filter with the generic per-source capability query;
  Change Alerts declares only that it requires `CCDC_SEGMENTS` and has no knowledge of pass-through recipe types.
- Remove its terminal-reference replacement and copied CCDC metadata path only when the capability-backed path is
  complete, and retain typed backend validation as a safety boundary rather than the source of semantics.
- Continue one consumer family at a time. Likely groups are the remaining alert recipes, Stack and Band Math,
  generic image inputs and Classification/Regression reuse. Every migration needs a stated stopping rule,
  coexistence plan and removal of the superseded local synchronization path.

## Deliberately deferred

- Persistent source metadata across page reloads.
- A distributed GEE metadata cache.
- Fine-grained data/schema/presentation fingerprints.
- Automatic repair of missing band selections.
- Live input-imagery panel refresh when the selected source recipe changes without changing its ID. Start with
  the shared Stack/Remapping form after the bounded Band Math follow-up above. Refresh available bands and
  visualizations while the panel stays open, applying the same dependency-evaluation rules. This remains separate
  from correcting explicit asset/recipe switching and must preserve live visualization propagation into Masking.
- One repository-wide migration commit.
- Recipe Fill before the Node server replacement supplies its permanent caller-authorized source boundary.
- Execution bundles before recipe content has reliable monotonic revision evidence.
- Any interim unversioned-recipe freshness path: no temporary browser content hashing and no `update_time`
  freshness rung. Persisted derived-result freshness waits for `revision` rather than approximating it.
- CCDC capability migration as a prerequisite for constant Fill.
- Shared gateway-authentication middleware for Node/Koa modules. Extract the repeated `sepal-user` parsing,
  `ctx.state.currentUser` assignment, 401 handling and role guards from Recipe, Budget, Message, Scene Metadata
  and Worker into shared HTTP infrastructure, with loggers injected at composition roots. Preserve each module's
  role combinations and response contract, and land this as a dedicated cross-module commit rather than as part
  of Recipe source resolution.

### Task-driven asset invalidation

Defer this wiring until after the current CCDC Slice and Map Layers refresh commit.

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
