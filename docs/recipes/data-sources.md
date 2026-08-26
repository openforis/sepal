# Recipe data sources - architecture and roadmap

Technical index for aligning how SEPAL recipes consume other recipes and Earth Engine assets. This is a
cross-recipe concern. Masking is the first production consumer of the dependency graph; CCDC Slice and
Classification are later witnesses for capability derivation. User-facing documentation belongs in the separate
`sepal-doc` repository.

## Status

SEPAL does not currently have one contract for resolving sources, describing output bands, validating dependencies
or owning visualizations. Different recipes copy, derive and refresh the same information in incompatible ways.
Several consumers also confuse the recipe whose pixels must execute with a terminal recipe supplying semantic
metadata.

At the recorded baseline, live nested-recipe loading in GEE uses ambient SEPAL administrator credentials. That is
a longstanding fail-open authorization defect, not a capability gap. Record it separately and do not broaden that
backend path. Caller-aware loading depends on the replacement of `sepal-server` by the new Node modules and must
not be implemented temporarily in the current Groovy module. Until that replacement reaches `master`, do not
activate any new production path that loads referenced recipes through the backend. This blocks recursive live
resolution, recipe Fill and execution bundles, but not pure contracts, broad edge inventory, dependency safety in
existing paths, Apply-mask stabilization or constant Fill.

Do not add another recipe-specific synchronization component. Declare edges broadly enough to exercise the
contract, but activate the graph narrowly through Masking. Each milestone must correct an existing defect or ship
a usable Mask and Fill increment without requiring the rest of the architecture to land.

The revision-specific inventory in `mask.md` was recorded against commit
`75cfcc8c1f69d7871607006ad3beef95a270ff3d`. Later audits must record a new baseline rather than silently treating
old code identifiers or call-site counts as current.

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

The **semantic source** supplies a named domain contract such as CCDC segments or classification categories. A
decorator can preserve one capability while dropping another. Terminal recipe type alone is not compatibility
evidence.

### Source descriptions and expectations

A source description is observed evidence: ordered output bands, provisional generic band semantics, source
visualizations, capabilities, revision evidence and diagnostics. It belongs to runtime state, not persisted recipe
configuration.

A consumer expectation is derived from the consuming model. Selecting band `ndvi` means that `ndvi` must still
exist. Selecting a CCDC measure also requires the corresponding CCDC capability. Discovery updates available
choices but never silently replaces a missing saved selection.

### Capabilities

Start with two capabilities:

- `IMAGE_OUTPUT`: executable image and ordered output-band schema;
- `CCDC_SEGMENTS`: CCDC stored bands, base bands, measures and date interpretation.

Add a third capability only when a migrated consumer demonstrates that the first two cannot express its contract.
A future `CLASSIFICATION_RESULT` is likely, but it should be defined from real Classification consumers rather
than guessed in advance.

Decorators explicitly preserve, decorate, derive or drop each capability. Do not copy arbitrary methods from a
terminal recipe onto a wrapper.

### Shared contract home

Pure reference, edge, band, capability, bundle, fingerprint and validation contracts belong under
`lib/js/shared/src/recipe/source`. They must not depend on React, Redux, Earth Engine or task infrastructure.
GUI, GEE and Task adapt the same contract at their boundaries.

Recipe-specific behavior belongs to one shared recipe definition per type. A single minimal catalogue imports
those definitions and indexes them by persisted recipe type; it contains no source, capability or presentation
logic. A definition must explicitly declare its direct sources or explicitly declare that it has none. Adding a
recipe must not require updating separate switches for dependencies, bands, capabilities and runtime consumers.

Generic reference and edge modules know only canonical value shapes. Legacy model normalization and role names are
owned by the recipe definition that understands those fields. Roles are opaque to generic traversal unless a
cross-recipe contract explicitly gives one shared meaning.

Pure behavior is tested once in the shared library. Each runtime gets a thin environment witness proving that the
shared module resolves and executes under Vite or Node ESM, plus focused boundary tests for behavior owned by that
runtime.

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

## First production slice: Masking robustness

Masking exercises the dependency graph before capability, catalogue and bundle work:

- primary and mask edges with different semantic roles;
- direct and indirect cycles, missing sources and incomplete references;
- outer execution identity versus terminal semantic identity;
- direct and transitive map invalidation;
- stale copied band and visualization snapshots;
- controlled Retrieve capability handling instead of a date-range crash.

The shared definitions still include CCDC, CCDC Slice and at least one AOI-bearing recipe so the edge contract is
not shaped around a two-edge decorator. Those definitions remain inactive at runtime. The slice is complete when
Masking uses one cycle-safe dependency traversal, Apply mask is stable across Preview and Retrieve, and the known
dependency defects fail predictably without introducing new backend recipe loads.

The migration must be reversible until acceptance is complete. Keep coexistence boundaries local to the migrated
Masking paths; do not leave two generic dependency resolvers active indefinitely.

## Implementation order

Each numbered milestone is an independent merge candidate. Do not hold a completed robustness correction or usable
Fill mode on this branch until later architecture is ready. The external Node-server prerequisite blocks only the
milestones that follow it; steps 1 through 5 can land on `master` independently.

### 1. Shared edge contract and broad inventory

- Define canonical references and role-bearing edges, including recipe-backed AOIs and other references outside
  image-input sections.
- Declare Masking, CCDC, CCDC Slice and representative AOI-bearing recipes, while activating only Masking.
- Add sanitized persisted-model fixtures and test-only completeness checks for inventoried recipe types.
- Add pure completeness, AOI-closure, reference and diagnostic tests without changing live recipe loading.

Exit criterion: every canonical reference in the proving models is declared or explicitly classified as a
non-edge, Masking has complete role-bearing edges, and no production resolver is activated.

### 2. Pure graph traversal and Masking dependency safety

- Add deterministic traversal with memoized diamonds, a visited set, dependency paths and stable diagnoses.
- Make every Masking edge participate in cycle, missing-source and output-validity checks while only the primary
  edge supplies semantic lineage.
- Correct map invalidation so direct dependencies are retained while descendants are traversed.
- Add backend cycle protection to the existing Masking execution path without adding a new recipe-loading path.
- Keep the outer Masking reference as execution identity and report unsupported downstream semantics explicitly.

Exit criterion: direct and indirect cycles, missing sources and incomplete references are controlled errors; every
direct and transitive dependency invalidates the map once; the existing happy path is unchanged.

### 3. Stabilize Apply mask

- Capture current Earth Engine behavior and legacy first-mask-band semantics.
- Add explicit mask-band selection for newly edited recipes.
- Stop treating copied bands and visualizations as authoritative source state.
- Correct Retrieve capability handling, including the current date-range failure.
- Verify Preview, map rendering, Retrieve and exported metadata while preserving outer execution identity.

Exit criterion: Apply mask is behaviorally stable, stale source snapshots cannot silently win, and every supported
workflow executes the Masking recipe rather than its semantic source.

### 4. Ship constant Fill

- Add the operation discriminator with legacy Apply mask as its default.
- Implement a finite constant replacement for selected target bands.
- Preserve output band names, order, metadata and the primary footprint.
- Validate malformed saved models at both form and backend boundaries.

Exit criterion: constant Fill works in Preview and Retrieve and introduces no fill dependency, recipe catalogue,
bundle, provenance or caller-aware loading requirement.

### 5. Add direct asset Fill

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

### 6. Add recipe Fill

- Activate caller-authorized resolution for the fill reference.
- Reuse the shared graph for cycles, missing sources and execution-versus-semantic identity.
- Apply the same explicit band mapping and output-preservation contract as asset Fill.

### 7. Add coherent execution and freshness infrastructure

- Introduce live and bundled resolution contexts only after authorized loading exists.
- Persist a content digest with new saves and lazily derive it for legacy rows over versioned canonical persisted
  recipe content.
- Build bundles by loading the closure and coherently rechecking every digest with bounded retries.
- Add the minimum session catalogue, conservative graph fingerprint and race-safe refresh required by the first
  catalogue-backed consumer.

### 8. Migrate CCDC Slice capabilities and visualizations

- Define and activate `IMAGE_OUTPUT` and `CCDC_SEGMENTS` from actual CCDC and CCDC Slice behavior.
- Derive exact Slice output bands and source visualizations without authoritative copied snapshots.
- Migrate Preview, map selection and Retrieve filtering together.

### 9. Further migrations

Migrate one consumer family at a time. Likely groups are alert recipes, Stack and Band Math, generic image inputs,
Classification/Regression reuse, and Sampling Design. Every migration needs a stated stopping rule, coexistence
plan and removal of the superseded local synchronization path.

## Deliberately deferred

- Persistent source metadata across page reloads.
- A distributed GEE metadata cache.
- Fine-grained data/schema/presentation fingerprints.
- Automatic repair of missing band selections.
- One repository-wide migration commit.
- Recipe Fill before the Node server replacement supplies caller-authorized reads.
- Execution bundles before recipe content has reliable digest evidence.
- CCDC capability migration as a prerequisite for constant Fill.
