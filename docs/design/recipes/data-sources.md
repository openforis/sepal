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

### Correctness

These are bounded assessments or contract gaps, independent of the larger architecture proposals. Code-confirmed
behavior is identified below; suspected symptoms still need reproduction. This list schedules no algorithm changes
or new release checks.

#### Collection-output correctness

Assess Classification regression/probability encoding across Optical, Radar and Planet separately from source
planning. Confirmed in [Classification execution](../../../lib/js/ee/src/classification/classification.js),
[temporal collection construction](../../../lib/js/ee/src/timeSeries/collection.js) and
[family selection](../../../lib/js/shared/src/recipe/collectionType.js):

- Classification produces floating regression values and per-class probabilities multiplied by 100 and cast to
  `uint8`.
- Optical then multiplies regression by 1,000 and those probabilities by another 100. Radar and Planet add the
  Classification outputs without those extra multipliers. All three collection branches finally cast to `int16`.
- Optical and Planet project the requested bands; Radar's collection branch has no equivalent final selection.
  Shared family selection sends non-radar/non-optical input to the Planet fallback, including empty/unknown input;
  that routing does not validate whether it can execute.

Still to reproduce: effects on stored values, fractional regression precision/range, chart interpretation and each
consuming algorithm/export, using supported classifiers and explicit/default requests. The branch differences alone
do not establish which user outputs are wrong or choose the intended common encoding. Inventory consumers and any
existing-data compatibility consequences before proposing a correction.

Include unknown/empty/mixed selections, default versus explicit output, GUI omissions such as optical date bands,
and Planet Daily mixed members in that bounded inventory. Planet's four/eight-band cases and histogram-matching
narrowing are described by [the current output catalogue](output-products.md#declaration-and-description); they do
not establish temporal-collection homogeneity. Require an explicit selection/filter/missing-band policy before
promising it. Do not make this assessment wait for an adapter/composer refactor.

**Requested output projection.** Audit producer `selection`/`outputBands` behavior, including internal callers and
unselected defaults, then consolidate final export projection and remove redundant per-producer projection.
Preserve established output order and producer-specific internal selection semantics.

#### Validation and execution coverage

- **Operation coverage.** Inventory remaining GUI-only/EE-only prerequisites, geometry and product routes against
  the shared declaration contract. Keep the Time Series/CCDC selected-Classification policy scoped; extending it
  to other families is a product decision.
- **Raster-file exports.** CCDC Drive/workspace execution must validate the selected scalar/array shape itself,
  independent of the existing GUI destination check.
- **Unused Remapping selections.** Decide whether to retain current source-specific selection semantics, add
  requirements for them, or make execution select only used bands. A missing unused asset selection differs from
  an actually used missing constraint band.
- **Band Math draft evaluation.** Reuse the shared item requirements to judge just the edited/added item before
  Apply, with an explicit prerequisite policy. Preserve independent draft repair and entry-level validation.
- **Change Alerts dates and impossible choices.** Derive reference/calibration coverage from actual execution
  requirements and sufficient evidence; metadata extents alone do not establish per-pixel coverage. Preserve
  explicit choices. Enabling/disabling type/dataset choices must distinguish unknown evidence from incompatibility.
- **CCDC breakpoint selection during empty dataset editing.** Check Landsat → none → Sentinel-2; retain selections
  while options are unsettled and reconcile once options exist. No datasets must still block Apply.
- **Empty-input geometry requests.** Reproduce remove-all/add-again across shared image-input workflows. Withhold
  requests for incomplete inputs, ignore superseded answers and require a controlled diagnosis for missing imagery.
- **BAYTS export processing metadata.** Record Historical settings from the recipe actually executed, including
  supported Masking/Stack paths. Keep legacy parsing and labelled editable fallbacks; current GUI-supplied
  `recipe_options` are not server-derived provenance.
- **CCDC Slice.** Validate the configured break-analysis band and assess server checks against the segment structure
  actually consumed. Preserve structurally compatible existing assets and legacy templates.

### Usability

| Item | Scope and acceptance |
| --- | --- |
| Charted-pixel map marker | Follow the chart recipe/pixel; remove or hide it on closure/tab change. Decide marker interaction separately from chart validity. |
| AOI redraw efficiency | Measure unrelated geometry/redraw work; avoid it without suppressing real changes or stale-response cancellation. |
| Cycle diagnostics | Carry structured cycle paths through shared layer-error presentation, using known names and a safe fallback. Preserve execution rejection. |
| Standalone asset visualization selection | Reconcile to the first candidate only after a successful current read; preserve intent through pending/failed/empty answers and never delete local styles. |
| Large categorical default palettes | Assess shared interpolation by entry position/count. Preserve saved colors and verify Class Change's one-based codes. |
| Radar RGB preset range | Audit the ratio range against its x1000 encoding, separate from VV/VH's x100. Keep this a presentation correction with unchanged pixel encoding. |

- **Source-recovery retention policy.** Decide whether deleted Stack aliases and Band Math output selections/custom
  names should be restored when an input returns. Recovery must not steal occupied names or guess ambiguous old
  identities. Existing calculation-reference and used-source-band checks stay authoritative.
- **Training-data feedback.** Decide how an explicitly selected empty Provider is presented when other branches
  provide enough points. Do not invalidate an otherwise trainable Consumer merely because a branch is empty.
  Sampling scale, unit/encoding compatibility, legend/value compatibility and post-mask sample adequacy need
  separate requirements before any stricter promise is made.
- **Form interaction consistency.** Separate validity from error visibility; new required fields stay neutral
  initially, report errors after interaction and clear promptly on repair. Review autofocus, picker interaction,
  programmatic resets, duplicated input editors and field/group accessibility. Broken saved configurations still
  explain themselves immediately, and invalid submission stays blocked regardless of visible error timing.
- **Feedback attribution.** Decide whether all routes of a diamond should be marked. Current readiness reports
  established paths without fabricating alternate routes.
- **Draft/close interaction.** Warning about unapplied drafts on browser close and revisiting the current recipe-tab
  close guard remain separate decisions. A "Use reference settings" copy-again button is not planned; creation
  seeding and automatic ownership cover its useful purpose.

#### Stack automatic names

Separate generated defaults from explicit `outputName` overrides. Compute one effective-name rule for description,
execution and forms. Reserve explicit names first, allocate unique defaults in Stack order and retain overrides by
source-band identity. Clearing an override opts back into automatic naming; explicit collisions fail validation.

Existing saved names have no provenance and must be treated as explicit, not guessed from suffixes. Defaults
recompute on input changes, not panel opening or metadata refresh. Preserve local style/selection identity where
possible and never silently bind an old name to a different source. Downstream missing-name repair remains explicit.
Check add/remove/reorder, clear/duplicate overrides, save compatibility and affected dependent references.

### Deferred architecture

These remain unscheduled target designs. Correctness and usability slices above do not require adopting them.

#### Server preview readiness

Assess acquisition cost and operation/product identity before adding a shared guard to generic preview. Bands,
histogram, distinct values, geometry/sample routes, the LandTrendr chart and direct asset-segment layout validation
need their own boundary inventory. A disabled GUI action does not establish server protection. This review remains
explicitly deferred.

#### Current-input dependency evaluation

Extend the existing pure requirement declarations, not a second rule engine. Local configuration, calculation
outputs and described external inputs use the same evaluation boundary with different acquisition owners.
Band Math's input → calculation → output chain is the bounded reference case; retain current shared reference
analysis and remove only synchronization a replacement actually supersedes.

Sampling Design's edit-driven planner remains until its result-evidence migration. Review actual compatibility,
normal invalidation/recalculation and user decisions separately; an AOI change alone is not reason for another
warning. See [declarative evaluation](source-freshness.md#declarative-dependency-evaluation).

#### Sampling Design derived-result freshness

Migrate areas, then probabilities, under the [generic evidence contract](source-freshness.md#persisted-derived-result-evidence).
[Sampling Design's notes](../../recipes/sampling-design.md#derived-result-freshness) own current flags/caches and the
target calculation dependencies, sidecars, propagation and compatibility rules. Replace the old mechanism rather
than keeping parallel freshness implementations.

#### Capability projection and visualization ownership

Follow [transformation contracts](output-products.md#transformation-and-capability-projection) and
[visualization ownership](visualizations.md#target-design), retaining selected outer execution identity and explicit
band mappings. Reduce/drop capabilities and templates when required bands disappear. Define `CCDC_SEGMENT_SLICE`
from actual segment structure and recheck it on the server.

Define classified-result versus reusable-classifier mask semantics before admitting wrapped Classifications to
PyEO, CCDC, Time Series or Phenology; see [the distinct contracts](source-resolution.md#classification-results-and-reusable-classifiers).
Consolidate [structured band selection](output-products.md#structured-band-selection-deferred) across CCDC, Slice and
preserving wrappers without deciding defaults or automatic inclusion implicitly. Inherited band presentation belongs
to the later broader presentation review, not another Masking Retrieve patch.

#### Mask and Fill

The [Mask and Fill design](mask.md#target-design) defines the sequence: stabilize the remaining Apply mask behavior
and explicit mask-band selection, add constant Fill, then asset Fill, then recipe Fill under declared authorized
acquisition/execution rules. Constant Fill requires no new source edge, bundle or domain-capability system.
Do not duplicate unmasking in Asset, Band Math or Stack.

#### Source planning and temporal collection composition

Follow [the target adapter/composer boundary](output-products.md#source-planning-and-collection-composition):
source-owned acquisition/normalization, one closed temporal composer and consumer-owned requirements. Replace family
switches and fabricated foreign models only through a bounded consumer. Keep shared planning browser-safe, EE
mechanics in EE and presentation in the GUI; derive references once and bind role-scoped declarations.
The [collection correctness assessment](#collection-output-correctness) stands independently of this refactor.

#### Reference layers and acquisition

**Load map sources only when needed.** Listing metadata can supply names without full recipe reads. Acquire an
additional source through runtime/cache claims only when a displayed layer or another active consumer needs it.
Retain entries and assignments; selecting an unread source must load and validate it. Incidental loads must not
serve as dependency checking.

**Executed-edge acquisition and request propagation.** Reduce conservative `REFERENCE` closure over-reading only
after declaring which dependencies execution reads. Propagate selected-output questions through Masking, Stack,
Band Math and Slice without reintroducing retired request-dependent training gates.

**Persisted reference index.** Derive references from definitions at save time, consistent with the committed
revision. Distinguish execution edges from display references, support access-controlled direct/transitive "used by"
queries and deletion warnings, and define how existing records are indexed. Never cascade deletion. Do not rewrite
saved references merely because a listing omits them or a load returns 404.

#### Task-driven asset invalidation

Audit the [export reporting → settlement → notification boundary](../tasks/orchestration.md#asset-mutation-notifications-deferred),
including actual asset/member IDs, partial effects and lost results. Current session mutations feed shared evidence;
task-list status and submitted paths do not provide the required mutation contract. Choose transport only after
that audit; no integration or schedule is assumed. The shared freshness owner re-reads active consumers, with
polling/explicit refresh retained for external changes and missed events.

#### Storage and execution coherence

- Add explicit live/bundled contexts and trusted coherent acquisition/acceptance as described in
  [source resolution](source-resolution.md#target-design). Operation record retention alone is insufficient.
- Define semantic no-op normalization at the Recipe service; compare normalized equality before conflict rejection.
  Identical committed payloads should converge, while conflicting remote writes never receive blind retries.
- WebSocket revision events and patch transport are optional latency improvements after the correctness contract;
  publish committed revisions, ignore duplicate/out-of-order events and retain a reload path.
- Choose batch-by-ID versus closure transport based on consumers without duplicating graph/authorization logic.
- Stronger trusted provenance, post-execution asset drift policy and product-specific AOI projections remain target
  architecture, not promises of current exports.

#### Future: consistent band presentation across recipes

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

#### Physical-value presentation

General physical-unit legends, charts and inspection remain deferred beyond the
[stored encoding contract](output-products.md#band-encoding). Convert at one explicit boundary, preserving saved
ranges and unchanged pixels. Encoding describes representation, not semantic bounds or scientific comparability.

Index Change's default difference style should eventually use trustworthy compatible-unit input bounds:
`[toMin - fromMax, toMax - fromMin]`. For two probabilities in [0, 1], this is [-1, 1]. Preserve user styles and
choose an explicit unknown-range fallback rather than treating an encoding multiplier as a display range.

#### Map inspection

Deferred exploration; scope and interaction remain undecided. General inspection reads raster values/feature
attributes across layers, grouped by layer. Specialized actions require the selected layer/product's capability:
a Masking output preserving CCDC could offer its segment chart, as could a CCDC layer added to an Optical map.
The owning recipe type must not determine every layer action. Resolve interpretation through the capability
provider while reading the selected outer layer's pixels, retaining its mask and other transformations. A Stack
may preserve several instances; CCDC-derived names alone do not establish a usable one. Original observations
alongside fitted segments need evidence a segments asset may not supply.

Decide action placement and layer/instance selection; all versus visible layers and feature-hit matching; which
named product/parameters are queried; scalar/array/unit/encoded-value presentation and distinct masked/no-match/
unavailable/failed states; and cancellation, refresh and reuse when layer, capability or location changes.
Use existing [product](output-products.md), [provider](source-resolution.md#execution-identity-and-capability-providers),
[runtime](gui-source-runtime.md), [freshness](source-freshness.md) and [style](visualizations.md) owners. These scenarios
do not commit to a toolbar or tool-registration framework; physical-value presentation remains deferred separately.

#### Recipe packages and supporting work

Recipe packaging remains unscheduled: one package would own shared rules, GUI and EE behavior/tests, with separate
runtime entry points. Establish discovery, cross-package dependencies, compatibility and build/deployment ownership
using a simple recipe and Change Alerts before adding a framework. Independent deployment is a separate decision.

Retain shared recipe verification-script authentication as tooling work. Persistent/distributed metadata caching
and finer data/schema/presentation fingerprints need measured recipe-consumer justification.

## Keeping these documents current

Describe behavior that exists or a clearly labelled target contract. Keep one owning location for each rule and
link to it. Remove a roadmap item when it lands; update the owning current-design section instead. Do not append
implementation/review diaries, temporary paths, test-count histories or superseded proposal variants. Record
verification in the change/commit under review and preserve useful regression tests in their owning suite.
