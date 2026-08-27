# Recipe data sources - architecture and roadmap

Technical index for aligning how SEPAL recipes consume other recipes and Earth Engine assets. This is a
cross-recipe concern. Masking, CCDC, CCDC Slice and Classification provide acceptance cases, but none owns the
shared model. User-facing documentation belongs in the separate `sepal-doc` repository.

## Scope and constraints

The architecture provides one contract for resolving sources, describing outputs, validating dependencies and
owning visualizations. It must replace recipe-specific copying, derivation and refresh logic incrementally rather
than introducing another parallel synchronization mechanism.

Caller-aware loading depends on the replacement of `sepal-server` by the new Node modules and must not be
implemented temporarily in the current Groovy module. Do not activate a new production path that loads referenced
recipes through ambient administrator credentials. This blocks recursive live resolution, recipe Fill and
execution bundles, but not pure contracts, in-memory resolution, output descriptions, direct asset work or
constant Fill.

Activate output descriptions and capabilities one runtime boundary or consumer family at a time. Each milestone
must correct an existing defect or deliver a usable generic contract without requiring the rest of the architecture
to land.

## Design documents

- [Source resolution, dependencies and execution](source-resolution.md) owns source references, structured
  dependency edges, authorization, capabilities, execution bundles, asset observations, provenance and task
  atomicity.
- [Source freshness, caching and invalidation](source-freshness.md) owns live source descriptions, fingerprints,
  refresh scheduling, race handling, availability and map invalidation.
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

### Capabilities

Start with two capabilities:

- `IMAGE_OUTPUT`: executable image, ordered output-band schema and per-band export requirements;
- `CCDC_SEGMENTS`: CCDC stored bands, base bands, measures and date interpretation.

Add a third capability only when a migrated consumer demonstrates that the first two cannot express its contract.
A future `CLASSIFICATION_RESULT` is likely, but it should be defined from real Classification consumers rather
than guessed in advance.

Recipe definitions declare output-transformation guarantees, such as preserving ordered band schema and values at
valid pixels while changing the mask. Capability contracts declare which guarantees they require. The resolver
combines those two contracts to preserve, decorate, derive or drop capabilities; it does not copy arbitrary methods
or properties from a terminal recipe onto a wrapper. This avoids changing every consumer when a new pass-through
recipe is added, and avoids changing every pass-through recipe when a new capability can already be decided from
its declared guarantees.

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

1. Define the pure `IMAGE_OUTPUT` contract: outer execution reference, ordered band descriptions, per-band export
   requirements, evidence and stable diagnoses. Do not add domain capabilities yet.
2. Define intrinsic, one-input and n-ary transformation contracts and a bottom-up resolver over the existing graph.
   Use pure synthetic composition tests without activating Stack or another broad consumer family.
3. Add a runtime adapter that observes actual bands through existing execution boundaries and keeps descriptions in
   runtime state. Do not change persisted recipe JSON or introduce backend recipe loading.
4. Migrate Retrieve to derive selected bands and pyramiding policy from the resolved output. Keep an explicit
   coexistence path for unmigrated recipes and remove each legacy policy only when its recipe is accepted.
5. Prove direct CCDC uses `sample`, Apply mask preserves it for a successful masked CCDC export, and ordinary
   continuous and categorical outputs retain their own policies. No recipe may inspect another recipe's type.

Explicitly defer domain capabilities, capability-indexed recipe selection, date-range and visualization ownership,
saved-recipe catalogue queries, coherent bundles and broad recipe-family migrations.

Do not schedule a standalone Change Alerts date-format patch in this phase. When Change Alerts migrates to the
capability contract, its execution boundary must still reject legacy, incomplete and directly submitted models
with a typed error, but that defensive check is acceptance work for the migration rather than a separate feature.

Exit criterion: one generic runtime output description drives a migrated Retrieve path; export requirements survive
declared transformations; masked CCDC exports successfully without a Masking-to-CCDC type check; unmigrated recipes
retain their existing behavior through an explicit and removable coexistence boundary.

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

Caller-authorized recipe loading is blocked until the current Groovy `sepal-server` has been replaced and split
into the planned Node modules. Do not build a temporary Groovy endpoint or broaden the administrator-loading path.
After the replacement merges:

- require a trusted SEPAL principal for every recipe read;
- return recipe content and its content digest from one authorized storage boundary;
- add permanent owner/non-owner, missing-principal and cache-isolation tests;
- remove ambient administrator recipe access from GEE when its replacement owns every legitimate read.

Graph traversal, capability derivation, caching and bundle construction remain shared JavaScript concerns rather
than server endpoint logic.

### 5. Add recipe Fill

- Activate caller-authorized resolution for the fill reference.
- Reuse the shared graph for cycles, missing sources and execution-versus-capability-provider identity.
- Apply the same explicit band mapping and output-preservation contract as asset Fill.

### 6. Add coherent execution and freshness infrastructure

- Introduce live and bundled resolution contexts only after authorized loading exists.
- Persist a content digest with new saves and lazily derive it for legacy rows over versioned canonical persisted
  recipe content.
- Build bundles by loading the closure and coherently rechecking every digest with bounded retries.
- Add the minimum session catalogue, conservative graph fingerprint and race-safe refresh required by the first
  catalogue-backed consumer.

### 7. Migrate CCDC Slice capabilities and visualizations

- Define and activate `IMAGE_OUTPUT` and `CCDC_SEGMENTS` from actual CCDC and CCDC Slice behavior.
- Derive exact Slice output bands and source visualizations without authoritative copied snapshots.
- Migrate Preview, map selection and Retrieve filtering together.

### 8. Migrate Change Alerts, then further consumers

- Make Change Alerts the first `CCDC_SEGMENTS` consumer: retain the selected outer execution reference, obtain CCDC
  semantics through the primary lineage, and reject an absent capability without entering algorithm code.
- Replace its recipe-type and blanket `sourceRecipe` candidate filter with the generic per-source capability query;
  Change Alerts declares only that it requires `CCDC_SEGMENTS` and has no knowledge of pass-through recipe types.
- Remove its terminal-reference replacement and copied CCDC metadata path only when the capability-backed path is
  complete, and retain typed backend validation as a safety boundary rather than the source of semantics.
- Continue one consumer family at a time. Likely groups are the remaining alert recipes, Stack and Band Math,
  generic image inputs, Classification/Regression reuse, and Sampling Design. Every migration needs a stated
  stopping rule, coexistence plan and removal of the superseded local synchronization path.

## Deliberately deferred

- Persistent source metadata across page reloads.
- A distributed GEE metadata cache.
- Fine-grained data/schema/presentation fingerprints.
- Automatic repair of missing band selections.
- One repository-wide migration commit.
- Recipe Fill before the Node server replacement supplies caller-authorized reads.
- Execution bundles before recipe content has reliable digest evidence.
- CCDC capability migration as a prerequisite for constant Fill.
