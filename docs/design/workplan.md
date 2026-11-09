# SEPAL workplan

The single backlog for SEPAL recipes, tasks, applications and infrastructure. Reports need reproduction;
proposals need bounded scope and acceptance criteria; research questions do not select an implementation.
Except where an item is explicitly marked next, no ordering, delivery date or deployment is implied.
Server-preview readiness and the broader band-presentation review remain explicitly deferred.

Technical documents retain current behavior, compatibility constraints and detailed target contracts.
Add and maintain planned work here; link to those documents for design detail instead of keeping parallel roadmaps.

| Technical reference | Scope |
| --- | --- |
| [Recipe architecture](recipes/data-sources.md) | Shared contracts and the design-document index. |
| [Recipe notes](../recipes/README.md) | Current behavior, compatibility and verification. |
| [Task architecture](tasks/orchestration.md) | Current task ownership and proposed durable execution contracts. |
| [Imagery workspace](imagery-workspace.md) | Proposed GIS integration mechanisms and acceptance criteria. |

## Recipe correctness

These are bounded assessments or contract gaps, independent of the larger architecture proposals. Code-confirmed
behavior is identified below; suspected symptoms still need reproduction. This list schedules no algorithm changes
or new release checks.

### Collection-output correctness

Current [collection regression storage](../recipes/time-series.md#collection-encoding) and
[Phenology](../recipes/phenology.md#output) preserve fractions/range in established public units: Optical ×1,000,
Radar/Planet target units. Probabilities retain Optical `100*q` versus Radar/Planet `q`, where Classification already
quantizes `q=uint8(100*p)`. Scripts, saved stretches and absolute thresholds depend on these scales; numerical
agreement across families is not itself a correction criterion. The bounded
[export compatibility check](recipes/output-products.md#regression-precision-compatibility) prevents old/corrected
regression tiles or download chunks being combined. These contracts do not require an adapter/composer refactor.

**CCDC probability fitting remains deferred.** CCDC still fits public collection values directly with the configured
lambda. Scale-sensitive LASSO behavior is expected and requires suitable tuning; lambda 20 flattening a small signal
is not proof that an encoding or algorithm is defective. Do not remove Optical's probability ×100 or regression
×1,000, change lambda, improve Classification probability quantization or rewrite saved settings in this work.

A candidate for separate assessment is an explicit internal fitting scale, with public values unchanged. For
probabilities, fit `z=k*y`, where `y` is the public value, `k=1` for Optical and native bands, and `k=100` for
Radar/Planet probabilities. Inverse every probability coefficient (intercept, slope and harmonics), RMSE and
magnitude before the shared CCDC result reaches charts, Slice or exports. Do not multiply native outputs, timing,
counts, phase, change probability or dimensionless confidence ratios. No regression normalization is selected:
regression targets have arbitrary units and need their own scale/regularization assessment. Keep prediction on
its pre-encoding features and standalone Classification/training-data contracts separate.

Useful controlled EE evidence for this candidate:

- With 36 monthly `p=0.5+0.05*sin(2*pi*month/12)` observations and lambda 20, Optical retains harmonic amplitude
  `475.776483` and RMSE `45.837557` in its existing public units. Radar/Planet's current fits are flat, RMSE
  `4.425306`. Internal scaling/inverse conversion preserved the complete Optical result and recovered amplitude
  `4.757765`, RMSE `0.458376`, and Slice `52.820227` at 2021-06-01 in Radar/Planet percentage units.
- Native-only outputs remained identical. Mixed native/probability fits matched the Optical reference internally,
  with only probability value outputs inverse-scaled. A 72-month mixed step series detected the same break
  (`2023.037645448323`). Full coefficients, masks and types were compared; this establishes neither universal
  breakpoint invariance nor an appropriate lambda for other data.
- A mixed native/probability/regression fit recovered fractional regression intercepts after the precision
  correction, but its small regression seasonality still fitted flat at 20. Probability normalization does not
  solve general regularization selection or establish classifier quality/calibration.

Before implementing fitting changes, settle explicit activation and suitable internal scales without changing
public encodings or silently retuning saved lambda. Cover the seasonal witness, native-only and mixed fits,
representative real-data segmentation, inverse outputs and chart/Slice/export interpretation. A changed fitting
contract also needs a distinct enforceable Resume contract; retaining units or matching pixel types cannot make
old/new fits compatible. Existing assets/downloads must retain their interpretation and metadata.

Verification gaps include representative real-data fits, rendered styles and a live Optical regression asset write.
See [output products](recipes/output-products.md#regression-precision-compatibility) for the current export contract
and verification scope. Generic provenance and adapter/composer architecture remain separate work.

**Separate collection work.** Radar still has no equivalent final requested-band selection. Family routing still
sends non-radar/non-optical input, including empty/unknown shapes, to Planet without establishing executability.
Unknown/empty/mixed selections, default versus explicit output, GUI omissions such as optical date bands, and Planet
Daily homogeneity remain separate assessments. Its four/eight-band cases and histogram-matching narrowing are
in [the current output catalogue](recipes/output-products.md#declaration-and-description); an explicit selection,
filter or missing-band policy must establish homogeneity before it is promised.

**Requested output projection.** Audit producer `selection`/`outputBands` behavior, including internal callers and
unselected defaults, then consolidate final export projection and remove redundant per-producer projection.
Preserve established output order and producer-specific internal selection semantics.

### Validation and execution coverage

- **Removed or inaccessible assets.** Audit the reported EE "asset not found" errors against
  [current asset freshness](recipes/source-freshness.md#asset-freshness-and-drawing-currency). Active consumers already claim
  assets, poll metadata, invalidate known mutations and recheck recognized asset/schema failures. Reproduce deletion
  in this session, externally and while a consumer is closed; include direct assets, nested recipes and collection
  members. Check missing interest, failure classification, evidence propagation and operation guards. A read may
  race deletion, and a missing/inaccessible response must not be presented as proven deletion. Establish a located
  diagnosis, affected-operation hold and repair/refresh recovery without replacing saved references. Generic server
  preview readiness remains the separately deferred work below.
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
- **Empty-input geometry requests.** Reproduce remove-all/add-again across shared image-input workflows. Withhold
  requests for incomplete inputs, ignore superseded answers and require a controlled diagnosis for missing imagery.
- **BAYTS export processing metadata.** Record Historical settings from the recipe actually executed, including
  supported Masking/Stack paths. Keep legacy parsing and labelled editable fallbacks; current GUI-supplied
  `recipe_options` are not server-derived provenance.
- **CCDC Slice.** Validate the configured break-analysis band and assess server checks against the segment structure
  actually consumed. Preserve structurally compatible existing assets and legacy templates.
- **Radar DEM assessment.** The terrain-correction implementation currently reads `COPERNICUS/DEM/GLO30`
  (`lib/js/ee/src/radar/terrainCorrection.js`). Investigate the suspected outdated DEM against actual coverage,
  product/version and correction requirements before selecting a replacement; compare resulting pixels and masks.
  Dataset age alone does not establish that this processing input is wrong.

### Classification and training data

- **Explain the classifier.** Define whether the request is algorithm/parameter help, explanation of the trained
  model, or both. Inventory existing outputs and expose supported explanations with their limitations.
- **Validation.** Extend the [shared training prerequisites](recipes/source-resolution.md#execution-readiness) only
  where adequate facts establish a missing check. Assess Regression's single-point refusal and whether a
  regression-only selection should have mode-specific readiness rather than the canonical image's class requirements.
  NU-SVC feasibility, surviving singleton classes and Mahalanobis covariance quality need effective sampled facts,
  not stored counts alone. Keep these execution checks separate from predictive evaluation; define evaluation
  data/metrics, spatial leakage and reused-data policy before promising model quality.
- **Polygon training data.** Assess one labelled feature row built from statistics over each training polygon,
  rather than implicitly treating every EE polygon pixel as an independent training point. Define per-band
  statistics, scale/projection, masks, empty polygons, feature naming and matching training/prediction transforms.
  Preserve point-based workflows and decide how polygon-derived features apply to prediction imagery.

Remapping's proposed [default class](#default-or-fallback-class) is specified below.

## Recipe usability

| Item | Scope and acceptance |
| --- | --- |
| Charted-pixel map marker | Follow the chart recipe/pixel; remove or hide it on closure/tab change. Decide marker interaction separately from chart validity. |
| AOI redraw efficiency | Measure unrelated geometry/redraw work; avoid it without suppressing real changes or stale-response cancellation. |
| Cycle diagnostics | Carry structured cycle paths through shared layer-error presentation, using known names and a safe fallback. Preserve execution rejection. |
| Standalone asset visualization selection | Reconcile to the first candidate only after a successful current read; preserve intent through pending/failed/empty answers and never delete local styles. |
| Large categorical default palettes | Assess shared interpolation by entry position/count. Preserve saved colors and verify Class Change's one-based codes. |
| Radar RGB preset range | Audit the ratio range against its x1000 encoding, separate from VV/VH's x100. Keep this a presentation correction with unchanged pixel encoding. |
| Sampling Design allocation tooltip | When proportions are skipped, the Samples tooltip should describe a fixed total without promising a calculated margin of error. |
| Legend CSV encoding | Move legend downloads from `downloadCsv`'s `escape()` data URL to the shared UTF-8 Blob download. Preserve Unicode labels and CSV quoting. |
| Interactive multi-sensor time series | Assess comparison of multiple sensors with explicit time alignment, units/encoding, processing differences and missing observations. Reuse chart/collection contracts. |
| Categorical class visibility | Assess class disable/mask controls and treatment of unlisted pixel values under the [policy below](#categorical-class-visibility). |

- **Source-recovery retention policy.** Decide whether deleted Stack aliases and Band Math output selections/custom
  names should be restored when an input returns. Recovery must not steal occupied names or guess ambiguous old
  identities. Existing calculation-reference and used-source-band checks stay authoritative. Stack's
  `bandNames.retired` only keeps automatic names from moving to another source; it restores no explicit alias.
- **Training-data feedback.** Decide how an explicitly selected empty Provider is presented when other branches
  provide enough points. Do not invalidate an otherwise trainable Consumer merely because a branch is empty.
  Sampling scale, unit/encoding compatibility, legend/value compatibility and post-mask sample adequacy need
  separate requirements before any stricter promise is made. Combine an editor's multiple causes before giving
  their common repair, rather than repeating that repair after each finding.
- **Form interaction consistency.** Separate validity from error visibility; new required fields stay neutral
  initially, report errors after interaction and clear promptly on repair. Review autofocus, picker interaction,
  programmatic resets, duplicated input editors and field/group accessibility. Broken saved configurations still
  explain themselves immediately, and invalid submission stays blocked regardless of visible error timing.
- **Enter/Escape while renaming a recipe tab.** Reported: with a recipe panel open, Enter is captured by the panel while
  the selected tab's title is being edited. Reproduce through the real tab-title editor and shared keybinding/modal
  scopes. Enter in the title editor should finish the rename without applying, advancing or closing the panel;
  Escape should cancel the rename and restore its previous title without closing/cancelling the panel or losing its
  draft. The title editor already declares both handlers; verify focus ownership and shortcut precedence rather
  than assuming Escape is fixed. Preserve normal Enter submission and Escape behaviour from panel fields. Cover
  clean and edited panels, ordinary and modal panels, and panel shortcuts after title editing ends.
- **Feedback attribution.** Decide whether all routes of a diamond should be marked. Current readiness reports
  established paths without fabricating alternate routes.
- **Draft/close interaction.** Reported: an open recipe modal prevents closing its SEPAL tab and shows an information
  notification asking the user to close the modal first; an ordinary recipe form permits tab closure even with
  unapplied edits. Decide the intended policy for clean and dirty forms and modals before changing the shared tab
  close guard. Make draft retention or discard explicit, and cover the close button and middle-click closure.
  Warning about unapplied drafts on browser close remains a separate decision. A "Use reference settings" copy-again
  button is not planned; creation seeding and automatic ownership cover its useful purpose.

### Sampled Classification training data

Code-confirmed: reopening a TRN `SAMPLE_CLASSIFICATION` entry loads its source and starts sampling again.
`trainingDataSet.jsx` saves mapped training points but discards this type's raw sampled rows, which the mapping
wizard needs. Preserve the sampled rows and mapping so opening, inspecting or remapping an entry needs no new
sampling request. These are saved snapshots; source changes do not by themselves invalidate their samples.

- **Source-change advisory.** One declarative finding marks the data-set item and TRN amber when evidence
  establishes a meaningful source change since sampling or acknowledgement. It does not block classification or
  Retrieve; independent training requirements remain authoritative. Pending, unavailable or unsupported evidence
  must not be reported as a proven change; explain that changes could not be checked where appropriate.
- **Explicit actions.** Offer Resample and Keep existing samples. Resampling or changing sampling settings produces
  a draft result; Apply accepts it and Cancel preserves the saved snapshot. Keeping samples acknowledges the current
  source evidence without rewriting the original sampling provenance. A subsequent meaningful change warns again.
- **Shared ownership.** Reuse source-runtime acquisition, cancellation and semantic evidence comparison, with
  recipe-declared dependencies and feedback. Cover transitive source inputs/assets, resolved sampling AOI, band,
  scale and count; title-only revisions do not trigger resampling or a warning. Preserve snapshot semantics,
  including sampling the recipe's own output: provenance references are not live execution dependencies.
- **Compatibility.** Keep existing saved points usable when raw rows or sampling evidence are absent. Missing
  evidence is unknown, not proof of change; any sampling needed to reconstruct legacy rows must be explicit.

Acceptance: reopen/reload without sampling or edits; remap stored rows locally; meaningful versus title-only and
transitive source changes; pending/failed checks; both advisory locations; acknowledgement followed by another
change; explicit resampling and settings edits with Apply/Cancel; rejection of late answers; legacy entries.

### Unfinished setup feedback

Extend the [shared section feedback](recipes/source-resolution.md#section-feedback) only for concrete remaining gaps:

- **Generic training-data setup guidance.** Remove the repeated panel instruction for `NO_TRAINING_DATA` in
  Classification and Regression, including "Collect points on the map or add a training data set." Keep the amber
  TRN and collection-button marks, their explanatory tooltips and the Collect/Add controls; use ordinary empty-list
  presentation. Preserve specific diagnostics, such as insufficient represented classes or samples and missing
  training features, through normal feedback at the relevant field or item. This is presentation only: retain the
  authoritative requirements, readiness holds and wizard timing. Use finding codes or declarative presentation
  metadata rather than message-text matching or another training-data presence check. Acceptance covers both
  recipes: generic guidance is not repeated in the panel, amber clears when setup is complete, and actionable
  diagnostics remain visible where repaired.
- **Further adoption.** Establish a reachable incomplete configuration before adopting amber for Masking, Class
  Change, required reference selectors or other wizard-protected sections. A required field alone is insufficient:
  demonstrate removal, recovery or another path that can leave saved setup unfinished. An already-selected source
  becoming unusable is an error; optional settings stay neutral.
- **Prerequisite chains.** Assess cross-section prerequisites for output-derived training and input-band findings,
  which currently wait on no local item. Local prerequisites resolve local reads only; empty Band Math output also
  does not wait on an input's source failures. Reproduce the desired repair order before extending the resolver.

Keep completion in authoritative requirements or their declarative presentation mapping. Preserve wizard timing,
independent draft repair, saving and operation gates; add no separate toolbar predicate or persisted "new recipe" flag.

### Untouched recipe panels

Confirmed with mounted panels over the real shared form/buttons and mocked API/evidence reads: the cases below
show Apply and mark the draft dirty without a configuration edit. The callers write initialization or presentation
state with ordinary field `set`; keep the shared form's detection of genuine edits. Paths below are relative to
`modules/gui/src/app/home/body/process/recipe/`.

- **Source validation.** [Planet Sources](../../modules/gui/src/app/home/body/process/recipe/planetMosaic/panels/sources/sources.jsx)
  initializes `validAsset` to `true`, then sets `'valid'` on mount, including for NICFI. The Sources panels in
  `ccdc`, `timeSeries`, `phenology` and `changeAlerts` repeat the boolean/string mismatch when an unchanged saved
  Planet collection reloads (`onLoading` also sets `''`). Keep loading/validity checks effective without treating
  their state as user edits; use existing validation or field-initialization operations, not just matching the
  success sentinel.
- **Band Math calculation fields.** [Calculation](../../modules/gui/src/app/home/body/process/recipe/bandMath/panels/calculations/calculation.jsx)
  sets the derived `otherNames` field on opening; `panels/calculations/functionSection.jsx` also sets
  `defaultBandName` from the reducer. A saved FUNCTION calculation opens dirty with unchanged inputs and settings.
  Establish these derived fields as initial values; preserve actual name, reducer and band edits.
- **CCDC Slice hidden dates.** [Date](../../modules/gui/src/app/home/body/process/recipe/ccdcSlice/panels/date/date.jsx)
  fills `startDate`/`endDate` with `set` even for a complete SINGLE selection. Reproduction: saved date
  `2020-06-01`, no range fields, source extent `2018-01-01`–`2024-01-01`. Learn defaults as initial field values,
  including when evidence arrives later, without replacing explicit dates or clearing unrelated edits.
- **Missing-field defaults.** The same post-initialization writes occur in
  [Planet Options](../../modules/gui/src/app/home/body/process/recipe/planetMosaic/panels/options/options.jsx)
  (absent thresholds become 85/60 in the form),
  [Change Alerts Options](../../modules/gui/src/app/home/body/process/recipe/changeAlerts/panels/options/options.jsx)
  (absent `mustBeConfirmedInMonitoring`, `mustBeStableBeforeChange`, `mustStayChanged` become `true`),
  [Sampling Design arrangement](../../modules/gui/src/app/home/body/process/recipe/samplingDesign/panels/sampleArrangement/sampleArrangement.jsx)
  (absent seed becomes 1), and shared AOI `mosaic/panels/aoi/{countrySection,eeTableSection}.jsx`
  (absent buffer becomes 0). Seed these defaults before comparison, or adopt each learned field's initial value.
  Retain explicit saved choices and existing default semantics; do not migrate models on opening.
- **Change Alerts More/Less.** `changeAlerts/panels/options/options.jsx` stores disclosure in the form's `advanced`
  field. With otherwise complete default settings and no saved `advanced`, More → Less leaves `false` against an
  initially absent value, so Apply remains. Keep presentation state separate from configuration edits.

Acceptance: untouched opening, metadata completion, More/Less, Close/reopen and Cancel leave the model unchanged
and no spurious Apply; real edits still enable Apply and survive unrelated learned defaults. Preserve pending/failed
validation and submission blocking. Cover each cause through real form/button wiring, with clean controls for
complete settings, supported LandTrendr Sources/Options and Classification/Class Change/Index Change/Remapping
legends. These controls were clean in the bounded assessment; this does not establish every panel or browser path.
Retrieval action forms and required setup defaults are not blanket candidates for suppressing Apply. Keep this a
local form correction, independent of calculation freshness or source-adapter architecture.

### Categorical class visibility

Assess a reversible disable/hide control for categorical legend entries instead of requiring their deletion.
Removing a color/label is not necessarily a pixel mask. Decide how disabled classes and pixel values absent from
the legend render, including whether unlisted values should be masked in preview; no automatic policy is adopted.

Keep this a presentation decision unless the user explicitly requests a computational mask. Preserve asset pixels,
saved class identities and locally edited styles; exports and downstream recipes must not silently inherit a
preview-only filter. Verify map tiles, cursor values, legends, histograms, Copy/Paste and re-enabling classes agree
with the chosen policy, including unknown categories and genuinely masked pixels.

## GUI code organization

The [shared recipe GUI reorganization](#shared-recipe-gui-organization) is implemented. These follow-up candidates
are confirmed by code and imports, not by file count alone. Keep each move bounded and preserve behavior and existing
lifecycle, acquisition, caching and validation owners.

- **Application monitors in `widget/`, recommended first.** Budget, session/expiry, task, message, login and connection
  monitors are application services mounted by `app/home/home.jsx`, mixed with generic controls. Some also read
  application policy and user-session presentation. Give them an application-owned location, moving associated
  rules, tests and styles together and updating callers of their refresh functions. Separately group the asset and
  workspace selectors; `widget/recipeInput.jsx` depends on recipe access, context and registration, so coordinate
  its destination with the current recipe-folder proposal. Keep generic controls in the widget library.
- **Recipe-session support in the parent `process/` directory.** `draftAgreement.js`, `recipeCache.js`,
  `recipeCacheClaims.js`, `recipeListing.js`, `saveCoordinator.js` and `recipeAccess.jsx` form a connected lifecycle
  group beside process menus, creation screens and layer registries. Assess a cohesive session/cache/save location
  and what remains at the process entry points. Coordinate with the current proposal rather than planning overlapping
  moves; keep `process/sourceRuntime` as the acquisition owner.
- **Feature-layer code in `app/home/map/`.** The root mixes map lifetime/context and controls with feature rendering,
  styling and legend editing. Start with the feature-layer editor and its style, filter, category and asset-style
  helpers, then establish which renderers belong with them. Preserve the existing `visParams/` and
  `imageLayerSource/` boundaries rather than reshuffling the whole map tree.
- **Application preferences under `app/landing/`.** `themeSelector.jsx` and `languageSelector.jsx` are used by both
  Landing and the authenticated user menu. Give these controls an application-wide preferences location, preserving
  their theme/language behavior and both entry points.

Acceptance for each move: a concrete old-to-new path map; companion tests/styles kept together; static and dynamic
imports, test mocks and documentation links updated; lint, a production GUI build and the full GUI suite passing
with at most two test workers. Keep moves separate from behavior/API redesign and introduce no compatibility
re-exports, barrels or aliases solely for relocation. Shared recipe `type/`, `source/` and `output/` already have clear
responsibilities and are not candidates merely because they contain many files.

## Deferred recipe architecture

These remain unscheduled target designs. Correctness and usability slices above do not require adopting them.

### Server preview readiness

Assess acquisition cost and operation/product identity before adding a shared guard to generic preview. Bands,
histogram, distinct values, geometry/sample routes, the LandTrendr chart and direct asset-segment layout validation
need their own boundary inventory. A disabled GUI action does not establish server protection. This review remains
explicitly deferred.

### Current-input dependency evaluation

Extend the existing pure requirement declarations, not a second rule engine. Local configuration, calculation
outputs and described external inputs use the same evaluation boundary with different acquisition owners. An AOI
change alone is not reason for another warning. See
[declarative evaluation](recipes/source-freshness.md#declarative-dependency-evaluation).

The shared mechanism exists: types declare `dependencies` and their products' `dependencyProjection`; calculating
operations return evidence of what they read (`modules/gee/src/jobs/dependencyEvidence.js`); the shared rule compares
it (`lib/js/shared/src/recipe/calculation`); the source runtime owns calculation work and current evidence
(`sourceRuntime/calculationEvidence.js`); and local requirements read runtime-acquired evidence with its acquisition
state (`sourceRequirements.js`). Sampling Design is its first consumer. Form panels judge drafts, as committing them
would leave the recipe, by local requirements naming them as `editor` (`recipe/editing/localCandidate.js`) and keep synchronous results derived in their drafts
(`recipe/editing/derivedResult.js`): Sampling Design's manual proportions and allocation, and Band Math's Output bands, use them.
Commits keep applied results derived in the same action (`commitRecipe`, same file):
[Band Math's calculation bands](../recipes/band-math.md), [Stack's band names](../recipes/stack.md#band-names) and
[Class Change's transition legend](../recipes/class-change.md#transition-legend).

- **Product projections.** Tighten what counts as a meaningful input change at each product owner, through
  `dependencyProjection`, so every consumer benefits from the same rule. For stratum areas, preserve changes to
  pixel values, masks, the selected band, AOI and grid; exclude labels and colours where they affect presentation
  only. Do not globally ignore a field that another product uses in computation. Start with recipe types used as
  stratification, then extend to other consumers that recalculate unnecessarily. Acceptance pairs a display-only
  edit that keeps results current with a computational edit that invalidates them, including transitive inputs.
  Until these declarations exist, retain the conservative whole-model fallback. This follow-up is separate from
  Sampling Design's panel behaviour.

#### Recipe adoption inventory

The code assessment covers all 23 current shared recipe types and the common workflows below. It identifies
reuse opportunities, not reproduced defects in every listed path. Sampling Design, Band Math, Stack and Class Change
use the shared bindings; the remaining migrations are separate work. Paths in the table are relative to
`modules/gui/src/app/home/body/process/recipe/` unless qualified.

Use the part of the mechanism each responsibility needs:

- **Local derivation and compatibility:** synchronous projections and pure requirements, with declared section or
  item prerequisites. Cheap derived names and band lists need no persisted evidence or hashing.
- **Acquired facts and temporary results:** the existing source runtime and candidate/output watches, with shared
  request identity, cancellation and rejection of superseded answers. Loading facts must not rewrite user choices.
- **Persisted calculated results:** operation-produced evidence and currency checks, including execution checks
  where later work reads live inputs. Saved imports and manual selections need their own policy before being
  treated as recalculable results.

| Recipes | Concrete reuse and existing owner | Migration boundary |
| --- | --- | --- |
| CCDC, Time Series, Phenology | The selected Classification is read once per recipe for its UI (`collections/selectedClassification.js`). Chosen bands of the images, classified outputs and CCDC's TMask are judged in shared readiness, and Sources keep chosen bands shown. `collections/collectionClassifierRequirements.js`, `collections/collectionBandRequirements.js` and CCDC's `segmentDescription.js` establish reusable owners. | [Remaining items](#temporal-sources-dependencies): unmatched Planet Daily's imagery-dependent bands and the Time Series chart's corrections. No persisted fit evidence. |
| LandTrendr | Sources' data-set, date and index dependencies are judged in shared readiness, and Sources keep chosen values shown and say which inputs an index lacks ([LandTrendr](../recipes/landtrendr.md#sources)). Data sets follow the shared [data-set availability](recipes/data-sources.md#data-set-availability). | [Named-product periods](#sources-data-set-availability), the annual mosaic's included; chart gating stays with [server preview readiness](#server-preview-readiness). |
| Optical Mosaic | `sceneAreas.jsx`, `sceneSelection.jsx`, `autoSelectScenes.jsx` and `sceneDeselection.jsx` separately coordinate AOI/source/date-dependent reads and selected scenes. | Shared question identity and request lifecycle can replace local coordination. Scene discovery results are temporary; manual selections remain user-owned. Preserve explicit auto-selection and define retention/reconciliation before changing scene deletion behaviour. |
| Classification, Regression | Shared input-band and training-data requirements already judge live dependencies. `panels/trainingData/sample*Section.jsx` and table-import sections own similar asynchronous import requests and mapping stages. | Reuse acquisition lifecycle and declared stage prerequisites where duplicated. Sampled/imported rows are persisted snapshots, and source IDs there record provenance; do not turn them into live execution dependencies or invalidate them automatically. Keep training adequacy and value/encoding policy separate. |
| Unsupervised Classification | Shared derived-input requirements already validate its band sets; sampling and clustering run during execution. Cluster-dependent preset legends are computed synchronously by `visualizations.js`. | No persisted calculation sidecar is justified by these paths. Conditional sampling/clusterer rules can use shared requirements when their validation is migrated; retain the domain parameter rules and cheap preset derivation. |
| Remapping, Masking | `remappingRequirements.js`, `maskRequirements.js` and shared input/constraint requirements already locate source problems and permit isolated draft repair. | Extend those declarations for concrete missing dependencies. Preserve mapping constraints and independent entry repair; no new result-freshness layer is needed for the current configuration-only workflows. |
| Index Change | Shared selected-band rules judge both change/error bands; `hasErrorBands` controls optional confidence settings, while legend/mapping choices are explicit. | Use conditional requirements for the optional error/confidence path and retain the existing input-source lifecycle. A confidence prerequisite must not hold ordinary difference outputs. Thresholds, mappings and legends stay user-owned. |
| Asset Mosaic | `asset/panels/assetDetails` saves metadata for the filter/mask editors; the current output description already reads the asset through shared machinery. | Feed metadata-dependent controls from current acquired facts and declare their dependencies on asset kind, bands or properties. Keep filters/masks explicit. A first collection member's properties alone do not prove every member's schema. |
| Radar Mosaic, Planet Mosaic, BAYTS Historical | Processing panels have source/mode-dependent fields; Radar shares its PRC panel, and Historical shares monitoring presentation with BAYTS Alerts. Their computed images/statistics are built during execution. | Reuse conditional requirements and product-owned projections as concrete rules migrate. No separate persisted panel calculation was identified. Keep processing defaults, effective values and numerical algorithms with their existing owners. |
| Change Alerts, BAYTS Alerts | Shared effective-processing functions, reference observations, creation seeding and operation requirements already own reference-dependent settings. | Preserve these owners. Remaining cross-section compatibility can use the same requirement declarations; reference-owned values stay derived, and editable monitoring settings remain user-owned. No renewed background copying or parallel evidence cache. |
| CCDC Slice | `sourceRequirement.js` and shared segment evidence already govern the source; Dates use source coverage, while OPT's break settings depend on date mode and the selected analysis band. | Declare these conditional dependencies and the existing [break-band validation follow-up](#validation-and-execution-coverage). Preserve extrapolation policy and independent chart availability; metadata date extents do not prove per-pixel coverage. |
| PyEO Alerts | `sourcesRequirements.js` and `gateIndexCandidates.js` already share candidate evaluation. Sources separately acquires baseline metadata and proposes dates/processing at selection Apply. | Reuse existing candidates and acquisition ownership; declare the baseline-to-gate prerequisites where this removes local coordination. Preserve explicit proposal/defaulting policy and manual settings. Broader index/encoding work stays separate. |
| Sampling Design | Areas and automatic proportions consume persisted-result evidence; manual proportions and the allocation consume the draft bindings, the allocation with an explicit review record. | Complete the [remaining live checks, compatibility cleanup and optional derivations](#sampling-design-derived-result-freshness). |

**Shared workflows.** Review these at their common owners rather than migrating every recipe independently:

- **Input descriptions and AOI lookup:** the shared input editors, `mosaic/panels/aoi/` and source candidates combine
  selected sources, table columns/rows, buffers and geometry lookups. Reuse acquired facts and request identity;
  preserve draft isolation and each AOI kind's meaning. The resolved AOI belongs to its existing geometry owner.
- **Histograms and image values:** `app/home/map/visParams/visParamsPanel.jsx` owns temporary histogram results,
  explicit stretching and legend-value requests. Request identity includes the image/product, band and spatial
  question. Sharing/currency must preserve edited ranges and legends; a fresh result does not authorize replacing
  them. Retain the existing Paste cancellation safeguards.
- **Charts and Retrieve:** `charts/pixelChartUpdate.js`, operation watches, selected-Classification reads and the shared
  Retrieve panel already coordinate relevant consumers. Extend those owners where a migration exposes a gap;
  do not add a second chart/request coordinator or duplicate server-preview readiness work.

**Adoption order and acceptance.** The rows are an inventory, not a commitment to migrate working code.
Product-owned input projections can be added independently where the conservative fallback causes unnecessary
recalculation.

Each migration must name the domain projection, the old coordination it deletes and the user choices it preserves.
Verify irrelevant edits, prerequisites, valid draft repair and Apply/Cancel; asynchronous migrations additionally
cover superseded responses and shared-work teardown. Reproduce suspected behavioural defects before treating them
as confirmed. This assessment used code inspection; browser behaviour, request costs and end-to-end races remain
unverified for these follow-ups.

#### Temporal Sources dependencies

For CCDC, Time Series and Phenology. The selected Classification's UI read, CCDC's TMask bands and the bands of the images
CCDC and Phenology choose are current behaviour
([Time Series](../recipes/time-series.md#bands-of-the-images-ccdc-and-phenology-choose)). Remaining, from code
inspection; paths are relative to `modules/gui/src/app/home/body/process/recipe/`:

- **Unmatched Planet Daily.** Its eight-band names, and any index needing them, are not refused, because the rule reads
  no imagery. Refusing them needs the contributing imagery's bands (`nativeBands$`) acquired for the rule; a pending or
  failed read establishes nothing.
- **Time Series chart corrections.** `timeSeries/panels/chartPixel.jsx` reads corrections from
  `model.opticalPreprocess`, which nothing writes, so under SR the chart offers bands the collection lacks.

**Further label opportunities, not scheduled.** Other places could adopt the
[retained-output naming](../recipes/time-series.md#what-is-offered-of-the-selected-classification) where they are shown
to be the same case:

- CCDC's `segmentBandLabels`, and so CCDC Slice's producer labels, leave a probability output unnamed while its
  Classification's record is not held.
- The CCDC and Time Series chart band pickers list a charted classified output the Classification no longer offers
  by its value.
- `~/sources.js` formats classified-output labels beside Classification's `bandPresentation`.

#### Sources data-set availability

Date-filtered Sources share one data-set availability policy, LandTrendr's included, and new recipes resolve their
initial data sets by it ([current behaviour](recipes/data-sources.md#data-set-availability),
[initial data sets](recipes/data-sources.md#initial-data-sets)). Remaining:

- **Named-product periods, a separate bounded follow-up.** Products reading a period of their own are not judged for it:
  LandTrendr's annual mosaic, its requested year, and Change Alerts' calibration and monitoring mosaics
  (`COLLECTION_MOSAIC`), each its own period. A Landsat 8-only LandTrendr annual mosaic for 2010 cannot hold imagery
  even where its fitted years include usable ones. A configuration requirement reads the model, not a product's
  parameters, and a delegated product reads the delegate's description without its readiness
  (`lib/js/shared/src/recipe/output/resolveImageOutput.js`), so Optical Mosaic's requirement does not cover them.
  Judging each product's own period needs its parameters where its readiness is read.
- **Classifier-input messages, a separate bounded slice.** The finding is located at the classification when no single
  data set supplies the classifier's features at the current reflectance (`collectionClassifierRequirement`,
  `lib/js/shared/src/recipe/type/pyeoAlerts.js`). Its messages ("No collection this recipe can use provides…", and
  PyEO's "No supported monitoring data provides…") overlook a PRC repair: Landsat 8 under SR with a classifier reading
  `pan` is located there, although TOA supplies it. The smallest correction scopes the wording to the processing
  applied, and offers PRC only from a finding fact naming it (alternatives judged at the other reflectance). The
  data-set alternatives also ignore the period: Landsat 4-5 for 1990-1995 with a classifier reading `redEdge1` is told
  to choose data sets that provide it, though only Sentinel-2 does and Sources refuse it for those years. They can be
  judged by the shared policy (`excludedDataSets`, `lib/js/shared/src/recipe/dataSetAvailability.js`).
- **Chart gating.** LandTrendr's pixel chart is not held for these findings and declares no pixel operation; it stays
  with [server preview readiness](#server-preview-readiness).
- **Open drafts.** A form panel's draft is judged again when the panel renders. An applied change made elsewhere while
  it is open is seen only then; panels open one at a time, so no current path reaches this.
- **Choices unavailable anew, not scheduled.** A data set the years exclude is disabled without saying why; only one kept
  chosen gives its catalogue years. A tooltip on the disabled choice would explain it, if hover on disabled buttons is
  reliable.
- **Abandoned set-up drafts.** Wizard Back leaves an invalid Sources draft uncommitted, as for every panel; Sources
  opened again are proposed again over the dates then chosen. Keeping such a draft would need draft persistence, not
  defaulting.

#### Class Change transition styles

When class edits shift transition codes, this recipe's saved `transition` styles keep their numeric codes and can
depict different transitions. Assess following identifiable class-value pairs in those styles, preserving their
labels, colours and identity. Define retention for removed or ambiguous transitions before implementing; keep
confidence styles and execution's transition encoding unchanged.

### Sampling Design derived-result freshness

Remaining work on [Sampling Design's result evidence](../recipes/sampling-design.md#derived-result-freshness):

- **Remaining live checks and costs.** Verify probability-asset replacement tokens after export overwrite, copy or
  move, and Proportions-only invalidation after same-id replacement with the design open and after reopening it.
  Measure the added evidence-read cost and check temporary-asset cleanup when a later stage is refused after a frame
  change. Mid-task changes still need separate live verification.
- **Compatibility impact.** Assess how many saved designs use unversioned or missing probability sources or lack a
  trustworthy allocation review record, and how often old-client task submissions are refused after deployment.
- **Compatibility removal.** Each has its own lifetime. Drop the probability response's `stratumFrameEvidence` alias
  once no client of the previous release can call it. Drop the later stages' reading of frame-only proportions
  (`admittedProportionsFrameFreshness`), and their sampling of allocations admitted without a review record, once no
  task admitted by the previous release can survive. The persisted markers stay while designs an older client saved may
  remain untouched: `stratumFrameEvidence`, which keeps proportions `UNKNOWN` until they are calculated;
  `sampleAllocation.requiresUpdate`, true or false, which keeps an allocation `UNTRUSTED` until it is reviewed; and the
  `requiresUpdate` on manual proportions, honoured until they are applied.
- **Optional derivation work.** Rows could be recomputed locally, without Earth Engine, when only the strata
  identities changed; and re-derived when weights change under an overall-proportion override, where today they keep
  the earlier weights.

### Capability projection and visualization ownership

Follow [transformation contracts](recipes/output-products.md#transformation-and-capability-projection) and
[visualization ownership](recipes/visualizations.md#target-design), retaining selected outer execution identity and explicit
band mappings. Reduce/drop capabilities and templates when required bands disappear. Define `CCDC_SEGMENT_SLICE`
from actual segment structure and recheck it on the server.

Define classified-result versus reusable-classifier mask semantics before admitting wrapped Classifications to
PyEO, CCDC, Time Series or Phenology; see [the distinct contracts](recipes/source-resolution.md#classification-results-and-reusable-classifiers).
Consolidate [structured band selection](recipes/output-products.md#structured-band-selection-deferred) across CCDC, Slice and
preserving wrappers without deciding defaults or automatic inclusion implicitly. Inherited band presentation belongs
to the later broader presentation review, not another Masking Retrieve patch.

### Mask and Fill

The [Mask and Fill design](recipes/mask.md#target-design) defines the sequence: stabilize the remaining Apply mask behavior
and explicit mask-band selection, add constant Fill, then asset Fill, then recipe Fill under declared authorized
acquisition/execution rules. Constant Fill requires no new source edge, bundle or domain-capability system.
Do not duplicate unmasking in Asset, Band Math or Stack.

### Source planning and temporal collection composition

Follow [the target adapter/composer boundary](recipes/output-products.md#source-planning-and-collection-composition):
source-owned acquisition/normalization, one closed temporal composer and consumer-owned requirements. Replace family
switches and fabricated foreign models only through a bounded consumer. Keep shared planning browser-safe, EE
mechanics in EE and presentation in the GUI; derive references once and bind role-scoped declarations.
The [collection correctness assessment](#collection-output-correctness) stands independently of this refactor.

### Reference layers and acquisition

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

### Task-driven asset invalidation

The [asset-mutation audit](#asset-mutation-notifications) below owns export reporting, partial effects,
settlement and notification. Feed confirmed mutations into the existing asset-evidence owner; keep polling
and explicit refresh for external changes and missed events.

### Storage and execution coherence

- Add explicit live/bundled contexts and trusted coherent acquisition/acceptance as described in
  [source resolution](recipes/source-resolution.md#target-design). Operation record retention alone is insufficient.
- Define semantic no-op normalization at the Recipe service; compare normalized equality before conflict rejection.
  Identical committed payloads should converge, while conflicting remote writes never receive blind retries.
- More recipe WebSocket updates are an optional latency improvement after the correctness contract. Publish
  committed revisions, ignore duplicate/out-of-order events and retain reload/reconnect recovery. Inventory
  listing, save and dependency consumers before adding event types; patch transport is a separate choice.
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
[stored encoding contract](recipes/output-products.md#band-encoding). Convert at one explicit boundary, preserving saved
ranges and unchanged pixels. Encoding describes representation, not semantic bounds or scientific comparability.

Index Change's default difference style should eventually use trustworthy compatible-unit input bounds:
`[toMin - fromMax, toMax - fromMin]`. For two probabilities in [0, 1], this is [-1, 1]. Preserve user styles and
choose an explicit unknown-range fallback rather than treating an encoding multiplier as a display range.

### Map inspection

Deferred proposal: one Inspect action across recipe maps with inspectable layers, showing raster values or feature
attributes grouped by layer. An eyedropper is the proposed icon; charts are optional views of the inspected location,
not a requirement for every recipe. Decide final placement and whether existing charts open alongside values.

- **Values and layers.** Show selected display bands first; categorical bands show both numeric value and class
  label, retaining unknown values without inventing a class. Offer other bands on expansion. Proposed default:
  inspect layers displayed in the clicked pane, with explicit inclusion of sources not placed in the layout.
  Query additional bands/sources on demand rather than starting every possible calculation. Read actual data
  before palette/stretch rendering, not values reconstructed from tile colours. Distinguish masked pixels,
  no matching feature, unsupported inspection, unavailable evidence and failed requests. Tables identify features
  and their attributes; define hit tolerance and multiple-match behaviour separately from raster sampling.
- **One spatial question.** Capture the clicked pane's map projection, resolution and pixel-grid alignment with
  the location. Values and any chart opened for that inspection use that same grid; neither silently chooses its
  own scale. Show the sampling scale beside the coordinates. Zooming alone leaves the result unchanged; another
  inspection captures a new grid. Verify alignment against actual EE tiles, including zoom, latitude and display
  pixel density; specifying a CRS and nominal scale alone does not establish the same pixel. Preserve categorical
  codes with appropriate resampling. Arrays and fitted-model records need product-specific sampling semantics.
- **Charts by capability.** Reuse existing charts first. A Masking output preserving CCDC could offer its segment
  chart, as could a CCDC layer added to an Optical map; the owning recipe type must not determine every layer
  action. Resolve interpretation through the capability provider while reading the selected outer layer's pixels,
  retaining its mask and transformations. A Stack may preserve several instances; names alone do not establish
  a usable one. Sampling stored segments on the map grid does not refit them: do not average unrelated model
  coefficients. Original observations alongside fitted segments need evidence an asset may not supply. Generic
  optical/radar observation charts are later work: declare their source and temporal scope rather than inferring
  a unique series from any upstream imagery dependency.
- **Shared ownership and compatibility.** Recipes declare supported products, interpretation and restrictions;
  reuse existing [product](recipes/output-products.md),
  [provider](recipes/source-resolution.md#execution-identity-and-capability-providers),
  [runtime](recipes/gui-source-runtime.md), [freshness](recipes/source-freshness.md) and
  [style](recipes/visualizations.md) owners for acquisition, cancellation and reuse. Current observation/CCDC chart
  requests specify 10 m and LandTrendr 30 m; adopting map scale changes results with zoom, not only cost. Compare
  representative results and timings before changing existing charts; no speedup is established. A product unable
  to honour the common spatial question needs an explicit restriction, not a silently different chart scale.

First slice: raster inspection and existing chart integration. Acceptance covers selected/all-band queries,
categorical values/labels, layer inclusion, masked/failed states, common value/chart grids and stable results after
zoom, outer-layer transformations, and superseded requests on location/source changes. Feature inspection and new
generic charts can follow separately. Scalar/array and unit/encoded-value presentation still need decisions;
physical-value presentation remains deferred separately. No new tool-registration framework is selected.

### Shared recipe GUI organization

Shared recipe GUI modules are grouped by responsibility ([code layout](recipes/gui-source-runtime.md#code-layout)).
Remaining, each a separate bounded move or decision:

- **`mosaic/` shared panels.** The AOI and radar-options panels several types use sit in a folder that is no recipe
  type. Give them a shared location with their tests, styles and `mosaicRecipe.js`.
- **Shared code reading type folders.** `collections/` reads `classification/bands.js`, and
  `sources/segmentCapability.js` reads `ccdc/segmentsAsset.js`. Assess whether those owners should move, not just
  the files.
- **Collection definitions.** The mosaic types' data-set catalogues, bands and processing panels, and `~/sources.js`,
  follow [source planning](#source-planning-and-temporal-collection-composition).

### Recipe packages and supporting work

Recipe packaging remains unscheduled: one package would own shared rules, GUI and EE behavior/tests, with separate
runtime entry points. Establish discovery, cross-package dependencies, compatibility and build/deployment ownership
using a simple recipe and Change Alerts before adding a framework. Independent deployment is a separate decision.

Retain shared recipe verification-script authentication as tooling work. Persistent/distributed metadata caching
and finer data/schema/presentation fingerprints need measured recipe-consumer justification.

## Recipe-specific follow-ups

These assessments are unscheduled. Shared validation, projection and recovery work above applies across types;
the entries below retain the concrete differences and local policy questions.

### Band Math

The declaration refuses repeated final names, while direct EE construction renames a second `x` to `x_1`.
Include that discrepancy in requested-output/server-boundary assessment. Deleted-output retention remains
under the shared source-recovery policy above.

A multi-band PREFIX/SUFFIX calculation whose model lacks `bandRename` derives names ending in `undefined`
(`updateIncludedBands`). This is confirmed for such a model. Whether the editor saves a suffix left untouched as
absent is unverified: `modelToValues` passes the field through as `undefined`, and the form keeps that value. This is
separate from the derived-bands migration, which keeps the rule unchanged.

### BAYTS Alerts

Audit unknown wire modes: execution treats a `visualizationType` other than `alerts`/`last` as the first
radar observation, whereas the GUI refuses an unknown product. Preserve the contextual observation semantics
in the [recipe contract](../recipes/bayts-alerts.md#radar-observation).

### Change Alerts

- Unknown visualization modes fall through to calibration; a non-`latest` mosaic type becomes median.
  A layer saving `mosaicType: undefined` instead names no product. Establish one boundary policy.
- Saved `sources.dataSetType` selects map mosaics, while `sources.dataSets` selects alert collections;
  mismatched models can therefore compare different families. Include in collection/monitoring assessment.
- A new empty `reference: {}` can pass preview preflight although execution raises `MALFORMED_SEGMENT_SOURCE`.
  Include in the separately deferred server-preview readiness work.
- Chart highlights still call `monitoringDates` for malformed applied periods. Execution permits overflowing
  calendar days, fractional durations and years that product validation refuses; settle compatibility explicitly.

### Phenology

`calendarRange(month, month + 1, 'month')` is inclusive: January uses January/February and December requests
12–13. Decide whether composites should cover their named month alone before changing calculated pixels.

### Planet Mosaic

- Daily processing without histogram matching adds an image containing its own bands again through `addDates`, creating
  `blue_1` and equivalent working duplicates. Assess removal against default/internal selections.
- Mixed four/eight-band Daily imagery fails at pixel evaluation without histogram matching; matching first
  narrows to four bands. Establish an explicit homogeneity policy in the collection assessment.
- Temporal choices omit `kndvi` and PSB.SD-only bands that CCDC declares. Reconcile eligibility and offered choices.
- State NICFI encoding only after authoritative evidence for that exact product establishes it.

### PyEO Alerts

- **Classification-input ancestry.** `loadClassificationInputs$` in `lib/js/ee/src/pyeo/pyeoAlerts.js` uses
  `loadRecipe$` directly before building the classification's input image, rather than following that read through
  `recipeRef`. Audit cycle detection on this path separately. The main classification read already uses `recipeRef`;
  the concern is limited to the input-loading path and has not been reproduced end to end.
- **Uniform index acquisition.** Use a provided index when its meaning and encoding are known; otherwise
  calculate it from suitable spectral bands, for either a recipe or asset. Preserve the selected image and its
  masks. This would replace the recipe/asset branch and its wrapped-asset limitation. Shared output and encoding
  contracts come first; no PyEO-specific resolver or encoding convention should compete with them.
- **Threshold ranges from the result.** UoL asked for the detection sliders to end at the largest
  `post_fcd_change_count`, `from_class_count` or `to_class_count` in the area. That needs an area-wide reduction of
  the full classification on every change of AOI, dates or classes before OPT can draw its sliders, and a moving
  maximum can cut a saved value. The ranges stay fixed until there is a cheap, stable bound.
- **Index choices and names.** Account for supplied indices as well as computable ones on both baseline and
  monitoring inputs. Unique case-insensitive matching is a possible convenience, retaining the actual band
  name for execution. Ambiguous matches need an explicit outcome; sensor aliases and value semantics cannot
  be inferred from case folding.

### Radar Mosaic

- Time scans reduce per-image harmonic terms selected by `VV.*`/`VH.*`, then discard them; assess the wasted work.
- Missing dates surface EE's DateRange error rather than a controlled configuration diagnosis.
- The Orbits constraint names undefined translation `process.recipeMosaic.panel.options.form.orbits.required`;
  literal `msg()` checks do not cover constraint messages. Repair that gap alongside the message.
- Remove or justify unmatched `constant` in `radar/visParams.js`. Offering point-in-time `unixTimeDays`
  remains a separate output-product decision.

### Regression

The panel offers `DECISION_TREE`, which execution does not construct. Resolve that unsupported option.
A `RECIPE` training dataset currently counts as data without assessing what its provider supplies; extend
operation-scoped `TRAINING_DATA` requirements before claiming that reuse is validated.

### Remapping

Used-band checks and automatic source recovery are implemented. Unused-selection policy remains above.
Direct preview/image routes can still build broken constraints differently from guarded exports; include
those concrete paths in the shared operation/server-boundary audit.

### Default or fallback class

Proposal: assign a configured default class where no rule matches. Execution currently mosaics the constrained
class images; it has no separate fallback-class setting. Prefer preserving genuinely masked/no-data pixels rather
than converting them to the fallback, but confirm that policy before implementation.

Define the valid domain across multiple inputs and rule dependencies: "no matching rule" differs from a rule
that cannot be evaluated because required pixels are masked. Specify priority, numeric type/range, legend and
export behavior, then verify matched, unmatched and partially/fully masked cases. Explicit unmasking belongs to
[Mask and Fill](recipes/mask.md#fill-semantics), whose footprint policy must remain separate.

### Stack

A selected input contributing no mapped bands can supply an empty clip geometry when other selected inputs
are unbounded; selecting no mapped output fails similarly. An empty Stack emits no image. Include these cases
in empty-input geometry and output-projection assessment. Discarded aliases follow the shared retention decision.

A model without a `bandNames` section makes Band names fail as it opens. The panel expects the section, which every
Stack the GUI creates holds; a model written elsewhere without it should open with its inputs offered unnamed.

### Time Series

Empty periods can fail as `Image.reduce: Unable to reduce an image with 0 bands` before a no-scenes diagnosis;
unknown requested bands still return `count`. Include controlled errors and request handling in operation coverage.

### Time Series cloud cover

- **Scene cloud cover.** Time Series offers no control for `sources.cloudPercentageThreshold`, the percentage of cloud
  an optical scene may have to be included; a recipe that states none includes every scene. Expose it: new recipes save 75%
  explicitly, a recipe that states none keeps including every scene and shows 100%, and a saved value is kept.

### Sampling Design deferred scope

- **Letting recipes declare their own source grid.** A recipe source defaults to `EPSG:4326` at 30 m because a
  recipe declares no preferred grid. Where a recipe has exactly one unambiguous source grid it could declare
  one, without forcing evaluation and therefore at no cost. Two assumptions to measure first: a single-asset
  classification may already propagate the projection, since per-pixel operations preserve it and only
  compositing loses it; and it is unconfirmed whether a declared projection surfaces in the band metadata the
  GUI reads. Until then `/bands` returns band names and nothing is invented.
- **Collection uniformity detection.** Priced and rejected: the check almost never changes the decision, since
  the first member's grid is weakly better than a default even when members differ.
- **Structured errors from the area and proportion calculations.** They throw a plain error where the task
  boundary produces a renderable structured message. Latent, because both call sites supply a default. Not a
  fix in passing — those jobs have no structured-exception plumbing, and the GUI consumes their failures
  through a different path from task errors.
- **Tiled candidate and final exports**, until real workloads justify the complexity.
- **Promising sample retention** across enlarged, restratified or annual designs, until deterministic tests
  establish the overlap contract.

## Tasks and exports

Technical contracts: [task orchestration](tasks/orchestration.md#proposal).

### Durable workflow slices

These are possible scopes from the current container model, not a scheduled delivery sequence.

- **Durable engine and admission:** begin with operations without file steps (`image.DRIVE`, `image.GEE`,
  `ccdc.GEE`, `samplingDesign.GEE`). Durable acceptance requires the unimplemented
  [Retrieve execution bundle](recipes/source-resolution.md#retrieve).
- **Recoverable file steps:** `image.SEPAL`, `timeseries.download`, `samplingDesign.SEPAL`, including repeatable or
  discoverable external effects and cleanup obligations.
- **Compute steps:** runner, task environments and a first compute workload, with sessions acquired only for its
  resource-intensive steps.

### Asset mutation notifications

Audit the existing lifecycle boundary before integrating task writes with recipe asset freshness:

- Export operations in `modules/task/src/runner/operations` receive concrete asset IDs and, for collections, tile
  IDs from gee. Collection preparation can delete/create assets before tile exports finish; failure or cancellation
  is not evidence that nothing changed. Sampling Design also creates and cleans up temporary assets.
- `runTask` currently returns terminal state/status, and progress reports carry status plus local-slot release.
  The container writes `result.json`; task-manager's `ContainerSupervisor` reads it on exit, settles the task row and
  removes the workspace. Reconciliation can settle an interrupted task without a usable result file.
- Repository changes emit `taskChanged$` for a username. The task websocket re-queries the listing; it supplies status
  and submitted `taskInfo`, not an authoritative affected-asset manifest. That listing notification does not feed
  recipe source evidence.

The unresolved boundary is how actual written/replaced/deleted IDs, collection parents/members and partial effects
survive failure, cancellation, lost results and workspace removal, then reach the
[shared asset-evidence owner](recipes/source-freshness.md#asset-freshness-and-drawing-currency).
Audit reporting, settlement and notification together; do not infer effects from a successful terminal state or a
requested output path alone. Notifications must cause real re-reads, not fabricate tokens or edit catalogue facts.
Transport, replay/deduplication and missed-event recovery remain to be chosen; no `user-assets` route or integration
is assumed available. Polling and explicit refresh remain necessary. This audit is independent of adopting the
whole durable-workflow proposal and is not scheduled here.

### Scheduled recipe execution

Support a recipe export with date-template parameters resolved for each scheduled run. Define the timezone,
window boundaries, relative dates and when current recipe revisions are accepted; record the concrete dates,
inputs, destination and execution identity with each task. Decide overlap, missed runs, retries, duplicate
prevention, cancellation and ownership when credentials expire or the recipe/account becomes unavailable.
Use task acceptance and authorization rather than a browser timer. A schedule must not imply that current tasks
already freeze their dependency graph or resume durable steps.

### Raster-file layout and resolution

- **Merged exported GeoTIFFs.** Offer or assess one merged raster alongside the current tiles/VRT. Establish
  classic TIFF/BigTIFF and consumer size limits, peak temporary disk, cancellation and overwrite behavior.
  Reuse the [materialization/COG proposal](imagery-workspace.md#a-viewer-friendly-sepal-export) for band metadata,
  nodata and overviews rather than another conversion pipeline.
- **Optical export hyper-resolution.** Clarify whether this means a finer output grid/resampling or an actual
  super-resolution algorithm. State native information limits, projection/resampling and storage/runtime costs;
  do not promise added spatial detail from an export-scale change alone. Define validation and compatibility
  before choosing an implementation.

### Time-series download NoData

Pre-existing, outside the regression-precision slice. The workspace stacker (`lib/python/shared/stack_time_series.py`)
declares NoData 0 on every VRT it writes: each tile's `stack.vrt`, the per-date stacks and the SITS files. A
legitimate zero, including a regression or index value of exactly 0, therefore reads as missing. Earth Engine writes
masked Float32 pixels as NaN with no nodata value (seen in a live Float32 Drive export), and the VRTs do not declare
NaN, so masked floating pixels read as valid NaN values. Reproduce by stacking a floating chunk holding both an exact
zero and a masked pixel and reading both through the VRT with GDAL.

Decide the NoData policy per data type before changing it: a floating stack could declare NaN, while an integer
stack needs a value outside its valid range or an explicit mask. Downloads already written, and readers that treat
0 as missing, keep their interpretation unless they are migrated explicitly. Cover zero, NaN and masked pixels for
floating and integer chunks through `stack.vrt`, the per-date stacks and SITS.

### Task design questions

- **Recovering lost launch responses.** Stable EE request ids prevent duplicate exports, but recovery must also
  find an accepted export whose launch response was lost. A reliable mechanism remains to be validated.
- **Main-instance capacity.** Which file work is cheap enough to stay on the main instance at current task volumes,
  and when the orchestrator needs an instance of its own.
- **Compute environments.** How task-specific runtime requirements are defined and provided on task instances.

## GIS workspace evaluation

GIS tools in the sandbox are assessed against the [imagery-workspace design](imagery-workspace.md#evaluation-brief).
Other required tools can use the same workflow evaluation; no application has been selected for production.

### GeoLibre Stage 0

The smallest experiment proving that imagery opens, a polygon is processed, GeoLibre's own Save writes into home, and
the project reopens after sandbox replacement. It uses no plugin. Its only change to GeoLibre's files is the start-up
script with the adapter, served from an overlay through the widget's private `serve_app`.
1. A notebook creating `Map(server_proxy=True, layout="full", height="100vh")`, registered in a dev catalog.
2. **Imagery:** add a SEPAL export's `.vrt` by its `/files/` URL, and try `metadata.bandNames`. Record sibling
   resolution, low-zoom behaviour, bytes transferred and memory.
3. **Polygon:** draw one; a temporary button runs statistics on the `.vrt`, including a scaled band, writing a CSV and
   adding the polygon.
4. **Save and Open through the adapter:**
   - Ctrl+S and Project › Save write into home;
   - Cancel leaves the project unsaved;
   - a failed write (a read-only target, or a write refused by the server) shows the error, stays unsaved and
     downloads nothing;
   - Download happens only when chosen;
   - Open reads the project back.
5. **Reopen in a new sandbox:** imagery, styling, the polygon and an edit are restored.

Also recorded: the tiles' layout (`gdalinfo`), masked-pixel values, and whether map activity is seen.

**Early gates:** the plugin is built only after Stage 0 shows that a failed write stays unsaved without downloading,
and that a project saved through GeoLibre's own Save reopens through its own Open after sandbox replacement. These test
the central assumption; if either fails, the design is revisited.

**Recording:** results are recorded in the app repository against the pinned versions: the gates, memory, transfer,
band names and the observations above.

### GeoLibre later stages

1. **The patched web build:** policy, start-up script, history off, policy failing closed, empty plugin, with tests that
   each patch applied. Verify against earlier browser state and a slow `deployment.json`.
2. **SEPAL files in GeoLibre's interface:** the plugin's dialog, Add Data › SEPAL, the adapter for all saves, opens and
   exports, and "Locate…", in Chrome, Firefox and Safari.
3. **The job service and workflows:** preparation, mosaics and statistics, with disk, quota and overwrite checks.
4. **Upstream requests,** each retiring a patch or custom piece:
   - an option disabling history;
   - a fail-closed policy;
   - a document-relative sidecar URL;
   - a storage provider hook for Open, Save and Save As;
   - plugin entries in the Project menu;
   - add-by-URL for FlatGeobuf and GeoParquet;
   - band names from `.vrt` files and on `addCogLayer`;
   - saves that report failure instead of downloading;
   - a widget language parameter.

### RustGIS prototype

Bounded, built on `main` at a pinned commit:
1. **Build** the integration code (recording its size and copied parts) with self-hosted assets, served from a Voilà
   notebook showing only a frame.
2. **Prepare** a real multi-gigabyte export from its `.vrt`, recording time, peak disk and the result's layout.
3. **Display** it by URL, choosing bands and range, and record memory, transfer and frame times over a scripted path,
   for a three-band, a pixel-interleaved 10-band and a band-separate COG.
4. **Statistics** on a drawn polygon from the `.vrt`, checked independently.
5. **Save:**
   - **stock hook:** show that a failed write is reported as saved;
   - **patched hook:** a failed write stays modified and downloads nothing; a cancellation changes nothing; an edit
     during a save stays unsaved; an interruption between sidecar and project leaves the previous project openable;
     re-preparing with new settings and interrupting the save still lets the previous project open and regenerate the
     previous image.
6. **Reopen** after a kernel restart and in a new sandbox: two COG layers with bands and range, the statistics layer
   and an edit are restored. Deleted COGs regenerate independently; a changed source tile is reported, not
   regenerated.
7. **Styling:** record the band, stretch and colour choices users can reach in the interface, against the gate.

**To settle:**
- whether the integration code can draw its own windows cleanly;
- whether a separate crate's WebAssembly build needs extra configuration;
- how prepared COGs draw;
- whether unknown project keys really are dropped.

**Production prerequisites:** demonstrated asynchronous save success/failure/cancellation, reachable COG styling,
immutable prepared paths, consistent sidecar/project commit, and maintainable integration code. Feasibility
remains unproven until the prototype passes; source inspection is not a runtime result.

### Common evaluation and maintenance

Each app repository needs a maintainer, pinned inputs, automated transport/fingerprint/save/restoration tests
and recorded dev-SEPAL acceptance at upgrades. A fingerprint must detect changed tiles behind an unchanged VRT.

The runtime experiments must establish:

- Authenticated ranges/suffix ranges, VRT siblings, contents writes and durable URLs.
- Large-image memory/transfer/navigation, conversion time/peak disk and bounded statistics reads.
- Save failure/cancellation, reopened styles/edits and interrupted sidecar/project commits.
- Nodata, scale/offset, CRS transformations and zones captured at submission against an independent oracle.
- Job lifetime after kernel closure, cancellation cleanup, account changes across tabs and nested-frame activity.
- Actual patch/copy burden and achievable upstream prerequisites.

Check the deployed proxy version, kernel environment, Voilà CSP/shutdown beacon, orphaned failed-render kernels
and EE tile authentication. Run GeoLibre Stage 0 first and the bounded RustGIS prototype under the same evaluation;
choose production only from measured results.

## Storage and credentials

- **Relocate EE credentials.** Inventory writers, readers, permissions and lifecycle before choosing a path.
  Include account link/refresh/revoke, sandbox Python/JavaScript tools, app environments and existing sessions.
  Separate user credentials from service-account keys; migrate or remove the old file without leaving stale copies.
- **SEPAL-managed user S3 storage.** Assess FUSE mounts separately from the current home filesystem. Establish
  supported read/write operations, rename/locking semantics, caching, failure recovery, quotas and cost ownership
  before promising filesystem compatibility to applications.
- **Bring your own cloud bucket.** Assess supported providers, per-user mount authorization, credential renewal/
  revocation and session cleanup. "Keys in secure cookies only" is an open suggestion, not an adopted design:
  establish how server-side mounts authenticate and what secrets, if any, need browser storage. Preserve account
  isolation across reconnects, logout and concurrent sessions.
- **Simultaneous file downloads.** Clarify workspace/browser downloads versus parallel chunks within export tasks.
  Inventory current limits; define bounded concurrency, per-file progress/cancellation and retry behavior.

## Discovery, help and analysis tools

- **Community link.** Add a discoverable Google Groups link after confirming the intended group and UI location.
- **Tool overview.** Review catalogue grouping, search and descriptions so users can find and compare tools.
  Keep documentation/tooltips with their owning feature and end-user guides in `sepal-doc`.
- **Onboarding.** Evaluate guided onboarding versus videos or contextual help against actual first-use workflows;
  no tutorial framework is selected.
- **Peatland analysis.** Identify priority workflows, required datasets and reusable existing applications before
  selecting new tools or recipe types.
- **Global products on the map.** Clarify whether this means background layers, overlays, source choices or a
  product-driven map workflow. Assess catalogue, coverage, styling and selection behavior once the use is defined.
- **Recipe to GEE script.** Assess which recipes can produce a runnable Earth Engine script, dependency expansion,
  private-asset access, credentials exclusion and equivalence with SEPAL processing. Unsupported steps must be explicit.

## Platform and development research

- **OS upgrade.** Inventory host, worker AMI and container bases separately; identify the intended target and
  compatibility work for Docker, GPU drivers and geospatial binaries. Define upgrade/rollback and data retention.
- **Single processing server.** Clarify whether the goal is topology consolidation, centralized scheduling or one
  processing worker. Assess capacity, isolation, failure impact and the [current task model](tasks/orchestration.md#current-implementation-and-limits).
- **Applications on workers: Solara and sandbox.** Evaluate Solara-hosted apps alongside existing sandbox apps;
  define packaging, routing, session lifetime, environment isolation and saved-state ownership before migration.
  Relate GIS application requirements to the imagery-workspace evaluation above.
- **Codespaces-like SEPAL environments.** Research reproducible per-user workspaces, environment/image selection,
  editor access, persistence, startup time, lifecycle and resource controls. Compare with existing sandboxes and
  app environments before proposing another environment service.
- **Sentry MCP for Claude.** Investigate the intended debugging workflow, available integration, access scope and
  treatment of event data/secrets. This records research only; no connector, account or tool access is enabled.

## Maintaining the workplan

Keep one entry per decision or delivery slice. Merge overlaps; distinguish confirmed behavior, reported symptoms,
proposals, deferred scope and rejected approaches. Remove completed entries and update the owning technical
contract. Verification logs, implementation steps and superseded variants belong in the change/Git history.
