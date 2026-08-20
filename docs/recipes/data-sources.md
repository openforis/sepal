# Recipe data sources - architecture and roadmap

Technical index for aligning how SEPAL recipes consume other recipes and Earth Engine assets. This is a
cross-recipe concern. CCDC Slice is the first proving case; Mask and Fill is the first decorator expected to use
the resulting contracts. User-facing documentation belongs in the separate `sepal-doc` repository.

## Status

SEPAL does not currently have one contract for resolving sources, describing output bands, validating dependencies
or owning visualizations. Different recipes copy, derive and refresh the same information in incompatible ways.
Several consumers also confuse the recipe whose pixels must execute with a terminal recipe supplying semantic
metadata.

At the recorded baseline, live nested-recipe loading in GEE uses ambient SEPAL administrator credentials. That is
a longstanding fail-open authorization defect, not a capability gap. Record it separately and do not broaden that
backend path. Caller-aware loading must replace it before the new resolver is activated for Preview or Retrieve,
but it does not block pure contracts, edge inventory or GUI-facing source-description work.

Do not add another recipe-specific synchronization component. Implementation should proceed as a vertical CCDC
Slice migration that introduces only the common machinery required by that slice.

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

## First vertical slice: CCDC Slice

CCDC Slice exercises the required architecture without attempting a repository-wide migration:

- direct CCDC recipes and CCDC assets;
- an optional transitive Classification dependency;
- Asset and future Mask and Fill wrappers;
- physical bands, semantic CCDC measures and derived Slice output bands;
- copied source snapshots and visualizations that can become stale;
- Preview and Retrieve through the same source contract.

The slice is complete when supported direct sources and wrappers resolve through one shared contract, produce the
same validated `CCDC_SEGMENTS` description, derive exact Slice output bands, and stop persisting refreshed source
descriptions as authoritative model state.

The migration must be reversible until acceptance is complete. Keep the old path behind a narrow CCDC Slice
switch or similarly scoped coexistence boundary; do not leave two generic resolvers active indefinitely.

## Implementation order

### 1. Shared contract and graph inventory

- Define canonical references and role-bearing edges, including recipe-backed AOIs and other references outside
  image-input sections.
- Add sanitized persisted-model fixtures and test-only completeness checks for inventoried recipe types.
- Define the initial `IMAGE_OUTPUT` and `CCDC_SEGMENTS` descriptions and expectations without changing live recipe
  loading.
- Add pure completeness, AOI-closure, capability and diagnostic tests.

Exit criterion: every canonical reference in the CCDC proving models is declared or explicitly classified as a
non-edge, and representative source descriptions can be derived without new backend traversal.

### 2. Caller authorization and backend activation

- Implement caller-aware recipe loading in the Node replacement for `sepal-server` when available. Use only a
  minimal ownership-enforcing Groovy change if activation must precede the port.
- Require a trusted SEPAL principal for every live recipe load and remove ambient administrator recipe access from
  GEE once its replacement is active.
- Keep graph traversal, capability derivation, cache and bundle logic in JavaScript and out of server endpoints.
- Add permanent two-user authorization, missing-principal and cache-isolation tests.

Exit criterion: a fixture owner can resolve a graph, another user cannot resolve the same recipe, omission of the
principal fails closed, and no expanded backend resolver can use the legacy administrator-loading path.

### 3. CCDC resolution and execution slice

- Define pure shared references, structured edges, `IMAGE_OUTPUT`, `CCDC_SEGMENTS`, source descriptions,
  expectations and stable diagnostics.
- Introduce explicit live and bundled resolution contexts.
- Build coherent, bounded execution bundles under caller authorization.
- Make CCDC Slice the first consumer, including direct assets, direct recipes and supported wrappers.
- Prevent cycles when a reference is selected and validate them again server-side.
- Index declared edges for recipes using shared definitions and apply the non-cascading deletion warning policy.
- Reject unsupported bundle versions and derive initial graph limits from the measured task path.
- Establish legacy handling and a rollback switch for the migrated path.

Exit criterion: CCDC Slice Preview and Retrieve use the new resolver end to end without copied authoritative
source state, while the old path can still be restored without reverting unrelated work.

### 4. Freshness for the migrated slice

- Add the minimum session catalogue needed by CCDC Slice.
- Refresh active recipe and asset sources with request epochs and in-flight deduplication.
- Validate saved expectations on open and before Preview or Retrieve.
- Refresh the map when the conservative resolved-graph fingerprint changes.
- Measure request cost, cache entry size and refresh latency before setting policy values.

Exit criterion: edits in another tab, asset replacement under the same ID, missing dependencies and stale
responses produce deterministic refresh or controlled diagnostics.

### 5. Visualization migration

- Normalize source presets and user-defined styles without copying source-owned entries into consuming models.
- Validate styles against current output bands and generic value semantics.
- Align map selection and Retrieve metadata filtering.
- Keep invalid saved selections visible without silently remapping them.

Exit criterion: source palette, label, preset and band changes refresh or invalidate every supported visualization
consistently.

### 6. Mask and Fill

- Apply explicit capability preservation to Asset and Masking recipes.
- Preserve outer execution identity through nested decorators.
- Validate primary, mask and fill dependencies and selected bands by name.
- Resume the user-facing fill implementation in `mask.md`.

### 7. Further migrations

Migrate one consumer family at a time. Likely groups are alert recipes, Stack and Band Math, generic image inputs,
Classification/Regression reuse, and Sampling Design. Every migration needs a stated stopping rule, coexistence
plan and removal of the superseded local synchronization path.

## Deliberately deferred

- Persistent source metadata across page reloads.
- A distributed GEE metadata cache.
- Fine-grained data/schema/presentation fingerprints.
- Automatic repair of missing band selections.
- One repository-wide migration commit.
- User-facing Mask and Fill work before the CCDC foundation is proven.
