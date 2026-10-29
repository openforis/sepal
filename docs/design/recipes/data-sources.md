# Recipe data sources: architecture and roadmap

This is the index and remaining-work roadmap for shared recipe behavior. Completed work is documented as current
contracts in the design documents and recipe notes; implementation steps, superseded proposals and verification
logs belong in Git history. An item here is not automatically scheduled or a release gate.

## Design documents

| Document | Responsibility |
| --- | --- |
| [Behavior contracts](behavior-contracts.md) | Ownership, operation validity, editing, feedback, repair and asynchronous lifetime. |
| [Output products](output-products.md) | Canonical/named products, physical bands, export requirements, encoding and target source composition. |
| [Source resolution](source-resolution.md) | Dependency graph, authorization, readiness, provider identity and target execution bundles/provenance. |
| [GUI source runtime](gui-source-runtime.md) | Pure reads, shared acquisition, candidates, watches and recipe-scoped interaction. |
| [Source freshness](source-freshness.md) | Live currency, revisions, assets and target persisted-result evidence. |
| [Visualizations](visualizations.md) | Presets, local styles, draft Copy/Paste, applicability and target transformation templates. |
| [Mask and Fill](mask.md) | Current Apply mask contract and proposed Fill modes. |
| [Map inspection](map-inspection.md) | Unscheduled layer-capability actions and general inspection proposal. |

Individual recipe behavior and local limitations belong in [recipe developer notes](../../recipes/README.md).
User documentation belongs in the separate `sepal-doc` repository. Keep a rule at its owner and link to it rather
than restating it in each consumer.

## Current architecture

All image-producing types declare `IMAGE_OUTPUT`; Sampling Design declares `NO_IMAGE_OUTPUT`. Shared registration
rejects an undeclared image/no-image contract. Canonical output, named map products, physical schema, GUI decoration
and capability requirements are distinct. Map and Retrieve consume one common read rather than per-type band
availability helpers. [Output declarations](output-products.md#declaration-and-description) describe this contract.

The source runtime owns asynchronous work and evidence. Shared pure requirements produce located findings;
type/GUI declarations apply them to operations and repair fields. Description availability, structural dependency
validity, readiness and evidence currency remain separate. Source facts do not overwrite editable choices.

References retain selected outer execution identity while capability providers supply interpretation. Browser
preflight uses authenticated closure loading. Server operations retain one authorized record per recipe ID and
preserve each subscriber's context. Neither path supplies a graph-wide coherent execution bundle today.

Recipe-owned modal panels inherit scope centrally. Recipe selectors and known recipe names in shared validation
feedback use the same open-or-focus action, preserving existing drafts. The interaction contracts are in
[the GUI runtime](gui-source-runtime.md#recipe-scoped-panels-and-navigation).

### Band encoding

Encoding is a per-band fact (`physical = stored * scale + offset`), separate from pixel size and measurement
compatibility. The [output contract](output-products.md#band-encoding) owns its persisted asset format, bounds,
reader and export-authority rules.

## Remaining work

No implementation is started by this list. Choose a bounded slice and its acceptance criteria before editing code.
The broader band-presentation review and server-preview readiness remain explicitly deferred.

### Bounded usability and correctness follow-ups

| Item | Scope and acceptance |
| --- | --- |
| Charted-pixel map marker | Follow the actual chart recipe/pixel; remove or hide the marker on closure/tab change and never leave it on another recipe's map. Decide marker interaction separately from chart validity. |
| AOI redraw efficiency | Measure which unrelated edits cause geometry/redraw work. Avoid that work without suppressing real geometry changes or stale-response cancellation. |
| CCDC breakpoint selection during empty dataset editing | Preserve chosen bands through Landsat → none → Sentinel-2 while options are unsettled; reconcile only once new options exist. No datasets must still block Apply. |
| Empty-input geometry requests | Reproduce remove-all/add-again across shared image-input workflows. Withhold geometry for incomplete inputs, ignore superseded answers and return a controlled backend diagnosis rather than an undefined-image TypeError. |
| Cycle diagnostics | Carry structured dependency-cycle paths through shared layer-error presentation, using known recipe names and a safe generic fallback. Preserve execution rejection. |
| Standalone asset visualization selection | Reconcile a missing selection to the first candidate only after a successful current read; preserve intent through pending/failed/empty answers and never delete local styles. |
| Large categorical default palettes | Reuse shared palette interpolation by entry position/count rather than repeating the twentieth color. Preserve saved colors and verify Class Change's one-based codes. |
| Radar RGB preset range | Audit the ratio range against its x1000 encoding, separate from VV/VH's x100. Correct presentation only; pixel encoding must remain unchanged. |

### Validation, repair and operation coverage

- **Source-recovery retention policy.** Decide whether deleted Stack aliases and Band Math output selections/custom
  names should be restored when an input returns. Recovery must not steal occupied names or guess ambiguous old
  identities. Existing calculation-reference and used-source-band checks stay authoritative.
- **Unused Remapping selections.** Decide whether to retain current source-specific selection semantics, add
  requirements for them, or make execution select only used bands. A missing unused asset selection differs from
  an actually used missing constraint band.
- **Training-data feedback.** Decide how an explicitly selected empty Provider is presented when other branches
  provide enough points. Do not invalidate an otherwise trainable Consumer merely because a branch is empty.
  Sampling scale, unit/encoding compatibility, legend/value compatibility and post-mask sample adequacy need
  separate requirements before any stricter promise is made.
- **Operation coverage.** Inventory remaining GUI-only/EE-only prerequisites, geometry and product routes against
  the shared declaration contract. Keep the Time Series/CCDC selected-Classification policy scoped; extending it
  to other families is a product decision.
- **Server preview readiness, deferred.** Assess acquisition cost and operation/product identity before adding a
  shared guard to generic preview. Bands, histogram, distinct values, geometry/sample routes, the LandTrendr chart
  and direct asset-segment layout validation need their own boundary inventory. Do not infer server protection
  from a disabled GUI action.
- **Raster-file exports.** CCDC Drive/workspace execution must validate the selected scalar/array shape itself,
  independent of the existing GUI destination check.
- **Executed-edge acquisition and request propagation.** Reduce conservative `REFERENCE` closure over-reading only
  after declaring which dependencies execution reads. Propagate selected-output questions through Masking, Stack,
  Band Math and Slice without reintroducing retired request-dependent training gates.
- **Band Math draft evaluation.** Reuse the shared item requirements to judge just the edited/added item before
  Apply, with an explicit prerequisite policy. Preserve independent draft repair and entry-level validation.
- **Change Alerts dates and impossible choices.** Derive reference/calibration coverage from actual execution
  requirements and sufficient evidence; metadata extents alone do not establish per-pixel coverage. Preserve
  explicit choices. Enabling/disabling type/dataset choices must distinguish unknown evidence from incompatibility.
- **Form interaction consistency.** Separate validity from error visibility; new required fields stay neutral
  initially, report errors after interaction and clear promptly on repair. Review autofocus, picker interaction,
  programmatic resets, duplicated input editors and field/group accessibility. Broken saved configurations still
  explain themselves immediately, and invalid submission stays blocked regardless of visible error timing.
- **Feedback attribution.** Decide whether all routes of a diamond should be marked. Current readiness reports
  established paths without fabricating alternate routes.

### Stack automatic names

Separate generated defaults from explicit `outputName` overrides. Compute one effective-name rule for description,
execution and forms. Reserve explicit names first, allocate unique defaults in Stack order and retain overrides by
source-band identity. Clearing an override opts back into automatic naming; explicit collisions fail validation.

Existing saved names have no provenance and must be treated as explicit, not guessed from suffixes. Defaults
recompute on input changes, not panel opening or metadata refresh. Preserve local style/selection identity where
possible and never silently bind an old name to a different source. Downstream missing-name repair remains explicit.
Check add/remove/reorder, clear/duplicate overrides, save compatibility and affected dependent references.

### Current-input dependency evaluation

Extend the existing pure requirement declarations, not a second rule engine. Local configuration, calculation
outputs and described external inputs use the same evaluation boundary with different acquisition owners.
Band Math's input → calculation → output chain is the bounded reference case; retain current shared reference
analysis and remove only synchronization a replacement actually supersedes.

Sampling Design's edit-driven planner remains until its result-evidence migration. Review actual compatibility,
normal invalidation/recalculation and user decisions separately; an AOI change alone is not reason for another
warning. See [declarative evaluation](source-freshness.md#declarative-dependency-evaluation).

### Capability projection and visualization ownership

**BAYTS export processing metadata.** Record Historical settings from the recipe actually executed, including
supported Masking/Stack export paths, rather than relying only on GUI-supplied `recipe_options`. Keep legacy
asset parsing and labelled editable fallbacks; no existing asset is assumed to carry the new record.

Replace remaining copied snapshots and per-type passthrough assumptions through
[transformation contracts](output-products.md#transformation-and-capability-projection) and
[visualization ownership](visualizations.md#target-design). Preserve explicit band mappings, reduce/drop capabilities
and templates when required bands disappear, and retain outer execution identity.

- Define `CCDC_SEGMENT_SLICE` and server rechecks from actual consumed segment structure. Validate Slice's
  break-analysis band. Preserve existing structurally compatible CCDC assets and their legacy templates.
- Define classified-result versus reusable-classifier mask semantics before admitting wrapped Classifications to
  PyEO, CCDC, Time Series or Phenology. See [the distinct contracts](source-resolution.md#classification-results-and-reusable-classifiers).
- Consolidate [structured band selection](output-products.md#structured-band-selection-deferred) for CCDC, Slice
  and preserving wrappers. Base bands/result types describe existing physical choices; defaults and automatic
  inclusion require explicit decisions. This is separate from display labels.
- Give inherited band presentation one shared owner; this belongs with the later broader presentation review,
  not another producer-specific patch in Masking Retrieve.

### Sampling Design derived-result freshness

Implement [persisted calculation evidence](source-freshness.md#persisted-derived-result-evidence), first for stratum
areas, then per-stratum probabilities. Use operation-local persisted dependencies, exact calculation provenance,
product-input fingerprints and stale-response epochs. Compare all applicable recipe/asset/inline evidence on open
and before submission; unchanged product inputs preserve results despite unrelated revision changes.

Keep existing arrays/ownership joins and write sidecars atomically. Old results without evidence become `UNKNOWN`,
remain visible and require recalculation before submission. Replace existing panel caches instead of keeping two
freshness implementations. This needs no interim `update_time` or browser whole-model hashing scheme.

### Mask and Fill

The [Mask and Fill design](mask.md#target-design) defines the sequence: stabilize the remaining Apply mask behavior
and explicit mask-band selection, add constant Fill, then asset Fill, then recipe Fill under declared authorized
acquisition/execution rules. Constant Fill requires no new source edge, bundle or domain-capability system.
Do not duplicate unmasking in Asset, Band Math or Stack.

### Source planning and temporal collection composition

**Remaining collection-contract gaps.** Normalize unknown/empty/mixed source selections explicitly rather than
accepting the current permissive family fallback. Establish a common classified-band regression/probability encoding
contract across Optical, Radar and Planet; current branches do not apply the same scaling. Recheck default versus
requested output and GUI-only omissions such as optical date bands. Planet Daily mixed-schema behavior stays an
explicit limitation until a selection/filter/policy establishes homogeneity. These are prerequisites of a sound
shared composer contract, not reasons to reproduce old defects as compatibility profiles.

**One final output projection.** Audit producer `selection`/`outputBands` behavior, then put exact requested-band
projection at the shared export boundary and remove redundant per-producer projection. Do not preserve an
unchecked path merely because another producer happens to select correctly. Keep internal selection semantics
and default output behavior explicit.

Follow [the target adapter/composer boundary](output-products.md#source-planning-and-collection-composition).
Replace family switches and fabricated foreign-recipe models with source-owned commands, one closed temporal
composer and consumer-owned requirements. Establish schema/measurement/encoding agreement against real execution
before declaring contracts; never preserve a known scientific defect as a supported legacy algorithm.

Keep shared planning browser-safe, EE mechanics in EE and labels in the GUI. A source command owns direct references
once; the shared graph loads them, and cross-recipe binders receive role-scoped declarations rather than arbitrary
foreign models. No universal matcher or workflow language is planned.

### Reference layers and acquisition

**Load map sources only when needed.** Listing metadata can supply names without full recipe reads. Acquire an
additional source through runtime/cache claims only when a displayed layer or another active consumer needs it.
Retain entries and assignments; selecting an unread source must load and validate it. Incidental loads must not
serve as dependency checking.

**Persisted reference index.** Derive references from definitions at save time, consistent with the committed
revision. Distinguish execution edges from display references, support access-controlled direct/transitive "used by"
queries and deletion warnings, and define how existing records are indexed. Never cascade deletion. Do not rewrite
saved references merely because a listing omits them or a load returns 404.

### Task-driven asset invalidation

Deferred pending the task rewrite's lifecycle/notification audit. Current session asset mutations already feed
shared evidence. Future exporters should report actual affected asset IDs, including collection members and
partial failed/cancelled writes; the shared owner rechecks active consumers without knowing recipe/layer callers.
Notifications trigger real reads rather than blind catalogue edits. External changes and missed events still need
polling/explicit refresh. No user-assets transport route is assumed in advance.

### Storage and execution coherence

- Add explicit live/bundled contexts and trusted coherent acquisition/acceptance as described in
  [source resolution](source-resolution.md#target-design). Operation record retention alone is insufficient.
- Define semantic no-op normalization at the Recipe service; compare normalized equality before conflict rejection.
  Identical committed payloads should converge, while conflicting remote writes never receive blind retries.
- WebSocket revision events and patch transport are optional latency improvements after the correctness contract;
  publish committed revisions, ignore duplicate/out-of-order events and retain a reload path.
- Choose batch-by-ID versus closure transport based on consumers without duplicating graph/authorization logic.
- Stronger trusted provenance, post-execution asset drift policy and product-specific AOI projections remain target
  architecture, not promises of current exports.

### Future: consistent band presentation across recipes

This review is deliberately deferred to a substantially later round. Inventory all viewing, picking, mapping,
renaming and expression contexts before implementation: input imagery, Remapping/Masking, Stack, Band Math,
Sources, charts/legends, visualizations and Retrieve. Include assets, native/classified/derived/custom bands.

The agreed direction is reliable display labels for viewing/choosing, raw names as fallback; actual identifiers
for editable output names and expressions. Show both where a mapping needs them. Preserve raw names in saved
values/keys, requests, expressions and exports. Duplicate labels must stay distinguishable, and relabelling must
never change selection or computation.

Extend shared band/presentation/picker APIs so callers inherit the correct behavior; recipes provide domain
metadata rather than reconstructing another producer's labels. Establish propagation through renames and
transformations. Missing/pending/unavailable labels must never remove bands, hold operations or require access to
an exported asset's private producer. Check localization, casing, accessibility and keyboard/filter behavior.
Deliver shared defaults first, followed by coherent consumer groups, without another label cache or copied snapshot.

### Physical-value presentation

General physical-unit legends, charts and inspection remain deferred beyond the
[stored encoding contract](output-products.md#band-encoding). Convert at one explicit boundary, preserving saved
ranges and unchanged pixels. Encoding describes representation, not semantic bounds or scientific comparability.

Index Change's default difference style should eventually use trustworthy compatible-unit input bounds:
`[toMin - fromMax, toMax - fromMin]`. For two probabilities in [0, 1], this is [-1, 1]. Preserve user styles and
choose an explicit unknown-range fallback rather than treating an encoding multiplier as a display range.

### Recipe packages and other architecture work

Recipe packaging is a separate unscheduled direction: one package owns shared rules, GUI and EE behavior/tests,
with browser-safe, GUI and execution entry points. Consolidated registration alone is insufficient. Establish
host discovery, cross-package dependencies, model/contract versioning and build/deployment ownership using a simple
recipe and Change Alerts as examples. Independent deployment is a separate decision; add no package framework now.

Other unscheduled work includes shared verify-script authentication, Node/Koa gateway-authentication middleware,
persistent/distributed metadata caching and finer data/schema/presentation fingerprints when measurement justifies
them. These are dedicated cross-module changes, not side work in a recipe slice.

Map inspection remains an [exploratory design](map-inspection.md). Warning about unapplied drafts on browser close
and revisiting the current recipe-tab close guard are separate interaction decisions. The explicit "Use reference
settings" copy-again button is not planned: creation seeding and automatic ownership cover its useful purpose.

## Keeping these documents current

Describe behavior that exists or a clearly labelled target contract. Keep one owning location for each rule and
link to it. Remove a roadmap item when it lands; update the owning current-design section instead. Do not append
implementation/review diaries, temporary paths, test-count histories or superseded proposal variants. Record
verification in the change/commit under review and preserve useful regression tests in their owning suite.
