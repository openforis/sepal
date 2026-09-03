# Recipe data sources - architecture and roadmap

Technical index for aligning how SEPAL recipes consume other recipes and Earth Engine assets. This is a
cross-recipe concern. Masking, CCDC, CCDC Slice and Classification provide acceptance cases, but none owns the
shared model. User-facing documentation belongs in the separate `sepal-doc` repository.

## Scope and constraints

The architecture provides one contract for resolving sources, describing outputs, validating dependencies and
owning visualizations. It must replace recipe-specific copying, derivation and refresh logic incrementally rather
than introducing another parallel synchronization mechanism.

Permanent caller-aware live resolution and coherent execution bundles depend on replacing `sepal-server` with the
new Node modules. Do not implement a temporary Groovy closure endpoint or load referenced recipes through ambient
administrator credentials. A bounded browser preflight may temporarily complete one selected root's closure by
calling the existing authenticated per-recipe GUI read behind an operation-local, batch-shaped adapter. That
measure neither persists a catalogue nor makes browser evidence the execution graph; recipe Fill, saved-recipe
discovery and execution bundles remain blocked on their permanent boundaries.

Activate output descriptions and capabilities one runtime boundary or consumer family at a time. Each milestone
must correct an existing defect or deliver a usable generic contract without requiring the rest of the architecture
to land.

## Design documents

- [Source resolution, dependencies and execution](source-resolution.md) owns source references, structured
  dependency edges, authorization, capability-provider lineage, graph traversal, evidence acquisition, execution
  bundles, provenance and task atomicity.
- [Source freshness, caching and invalidation](source-freshness.md) owns live source descriptions, fingerprints,
  refresh scheduling, race handling, availability and map invalidation.
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
  scheduling, race handling and map invalidation. It consumes resolution diagnoses without redefining them.
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

## Implementation order

Each numbered milestone is an independent merge candidate. Do not hold a completed generic foundation or usable
Fill mode on a branch until later architecture is ready. The external Node-server prerequisite blocks only the
milestones that follow it; steps 1 through 4 can land on `master` independently.

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

- Stop treating copied primary bands and visualizations as authoritative source state.
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

The permanent caller-authorized batch/closure boundary is blocked until the current Groovy `sepal-server` has been
replaced and split into the planned Node modules. The temporary browser preflight used by steps 1 through 4 reuses
only the existing authenticated per-recipe read; it is not a coherent server resolver and must not grow a new
Groovy endpoint or broaden the administrator-loading path. After the replacement merges:

- require a trusted SEPAL principal for every recipe read;
- return recipe content and its server-owned monotonic `contentRevision` from one authorized storage boundary, with
  list, load, save and executor-facing reads all exposing it consistently;
- accept `expectedRevision` on save and return the committed revision, so a client can maintain a revision registry
  and detect concurrent writes;
- add permanent owner/non-owner, missing-principal and cache-isolation tests;
- remove ambient administrator recipe access from GEE when its replacement owns every legitimate read.

The full storage contract, including no-op save behavior and normalization requirements, is defined in
[source-freshness.md](source-freshness.md). `contentRevision` is distinct from the existing `typeVersion`, which is
the recipe schema-migration version.

Graph traversal, capability derivation, caching and bundle construction remain shared JavaScript concerns rather
than server endpoint logic.

### 5. Add Sampling Design derived-result freshness

Requires `contentRevision` from the prerequisite above. No interim unversioned-recipe path is planned or built:
there is no temporary browser content-hash bridge and no `update_time` freshness rung.

- Add the recipe snapshot provider that distinguishes an editable root draft from operation-local persisted
  dependency snapshots, keyed by `contentRevision`. Dependency snapshots never enter the shared loaded-recipe map.
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

- Define and activate the `IMAGE_OUTPUT` product and `CCDC_SEGMENTS` capability from actual CCDC and CCDC Slice
  behavior.
- Define the closed `CCDC_SEGMENT_SLICE` transformation and materialize its presentation templates only after the
  source capability, required evidence and exact Slice output bands resolve.
- Preserve existing CCDC Segments assets through a narrow structural asset contract. Continue interpreting their
  legacy `visualization_*` and `baseBands` properties as Slice template configuration after that contract validates;
  do not require assets to be recreated or rewritten.
- Prove both direct CCDC assets and CCDC assets carried through Masking. Masking preserves the capability and
  templates only while its explicit transformation effects preserve the required structure.
- Migrate Preview, map selection and Retrieve filtering together. New structured provenance may be dual-written for
  stronger future consumers, but it is not a prerequisite for existing CCDC Slice assets.

### 9. Migrate Change Alerts, then further consumers

- Make Change Alerts the first `CCDC_SEGMENTS` consumer: retain the selected outer execution reference, obtain CCDC
  semantics through the primary lineage, and reject an absent capability without entering algorithm code.
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
- One repository-wide migration commit.
- Recipe Fill before the Node server replacement supplies its permanent caller-authorized source boundary.
- Execution bundles before recipe content has reliable monotonic revision evidence.
- Any interim unversioned-recipe freshness path: no temporary browser content hashing and no `update_time`
  freshness rung. Persisted derived-result freshness waits for `contentRevision` rather than approximating it.
- CCDC capability migration as a prerequisite for constant Fill.
