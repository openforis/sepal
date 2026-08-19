# Sampling Design Roadmap

Last updated: 2026-08-19

Working decision log for Sampling Design. It records the contracts the software must honour, the constraints
future change must respect, and the work still outstanding. Delivered work is not recorded here — git history
and the verification suites carry that.

## Product Boundary

- Sampling Design creates and exports sample locations. It does not collect reference observations, assess map
  accuracy, calculate final estimates, or calculate final uncertainty.
- Sampling Design is export-only. It has no procedural map preview and does not load generated sample features
  into browser memory.
- A completed Earth Engine table asset can be added to a map through the generic feature-layer flow. Exported
  categorical metadata supplies stratum values, colors, and labels for styling and filtering.
- Earth Engine asset exports keep rows compact and store allocation, final counts, styling, and reproduction
  information as collection metadata. SEPAL workspace exports repeat the required information per row.
- `ALGORITHM_VERSION` remains `samplingDesign-v1` until the first production release. Pre-release algorithm
  changes do not increment it.

## Statistical Contract

- Every included stratum requires at least two sample locations. This is a hard software/calculation floor, not
  a general recommendation for adequate precision.
- Most automatic allocation strategies can set a higher `Min samples/stratum`. Equal and Manual use the
  two-sample floor directly.
- The target reporting category is the one category whose area or proportion the design is primarily planned to
  estimate. It does not need to be one of the strata or come from the stratification map.
- Anticipated proportions are planning assumptions. They support planning sample size, planning margin of error,
  and Optimal/Power allocation; they are not observations or final estimates.
- Planning margins of error and calculated sample sizes do not model spatial effects from Random versus
  Systematic placement.
- Margin of error is relative only: the confidence-interval half-width divided by the anticipated overall
  target-category proportion, entered and shown as a percentage. A zero overall proportion is infeasible
  (Infinity, not NaN).
- Power allocation changes how strongly each stratum's expected target amount affects allocation. Lower tuning
  values shift relative allocation toward smaller non-zero expected amounts. When all anticipated proportions
  are zero, allocation falls back to Equal.
- Random arrangement has no minimum-distance option.
- Systematic `Oversample` and `Exact` stop when the required count cannot be reached. `Closest` may accept a
  shortfall only after the applicable minimum per stratum is met.
- Final count validation applies to the draws that can under-produce (stratified Random and Systematic); it runs
  independently of allocation strategy and reports affected strata, actual counts, the missed requirement, and
  configuration-aware actions in Task Details. Unstratified Random draws an exact count, so it has no validation
  stage.
- GUI Retrieve validation and task preflight apply the same allocation rules: configured strata must exist, the
  allocation must contain exactly one row for each stratum, every row must meet the two-sample floor, and automatic
  allocation must meet its configured `Min samples/stratum`. Guidance distinguishes Samples mode from Error mode.
- A seed, when required (Random placement, Systematic `Exact` thinning, or a `Seeded` grid start), must be a
  base-10 whole number from `1` to `9007199254740991`, inclusive. This ceiling preserves the seed exactly across
  application JavaScript Number and JSON transport; it is not an Earth Engine limit. New recipes default to `1`;
  a saved zero or otherwise invalid value is rejected by GUI Retrieve validation and task preflight rather than
  silently coerced.

## Sampling Frame

The sampling frame is the geographic coverage eligible before the placement rule is applied:

- Unstratified: the complete AOI is treated as the frame.
- Stratified: only unmasked pixels belonging to included strata inside the AOI are in the frame.
- Arrangement and grid rules determine the exact locations that can be selected within the frame.

The AOI defines the outer boundary, not the full frame in every mode. Masked or omitted areas have no chance of
selection and are not represented by the sample.

### Edge convention at an exact AOI tie

| Mode | Convention |
| --- | --- |
| Stratified Random | exclusive — boundary-coincident cell dropped |
| Stratified Systematic | exclusive — boundary-coincident lattice point dropped |
| Unstratified Systematic | inclusive — boundary-coincident point kept |

The difference follows a structural line. Raster-clipped frames are centre-in-region because `reduceToVectors`
decides membership before any filter runs; the analytical frame is intersects because `filterBounds` is its only
test. Stratified Random and stratified Systematic share AOI, stratification and grid and differ only in placement
rule — that is the pair a user expects to agree, and it is aligned. Unstratified Systematic is analytical: no
raster, no Stratification grid, no `2 * scale` floor, and its frame is already categorically different.

Both raster conventions are asserted, not observed, so a later change to either cannot silently re-diverge them.

Aligning the analytical path is **not** a symmetric follow-up. It is not "remove the padding": the padding
guarantees enumeration coverage near the bounding-box edge, and removing it would drop interior points rather
than boundary ones. It means replacing `filterBounds` with a strict containment test — a per-feature geometry
operation materially more expensive than a spatial filter. Anyone proposing it should price that first.

## Grid Ownership

Two explicitly named grids, never one overloaded value:

- **Stratification grid** — how the categorical image and its mask are interpreted, how mapped stratum areas are
  calculated, and how anticipated proportions are grouped. Owns a **CRS** plus one grid definition: a **Scale**,
  or a **crsTransform** that sets alignment and resolution together and replaces Scale. The transform is derived
  from the source and written by the panel; it is never entered by hand. Its CRS is not restricted to
  the curated placement list: it must be able to name whatever projected CRS the categorical source is meant to be
  interpreted in.
- **Arrangement grid** — where samples are placed. Owns a **CRS** only, from the curated equal-area list. Random
  cells, Systematic lattice coordinates and sample identity all live here.

The Stratification grid is DERIVED from the source by default, with Scale as an override. One rule, no branch on
source type: **derive when the resolved image has a real projection, default when it does not.** `isAxisAlignedTransform`
is the whole guard — a computed image reports the identity transform `[1, 0, 0, 0, 1, 0]`, whose positive `e` fails it
by sign, so no magnitude threshold is involved. Derivation reads the SELECTED band's grid, since a single asset can
carry several (Sentinel-2 bands are 10, 20 and 60 m on one image).

A derived grid carries its pixel size in metres alongside the transform. A transform is expressed in its CRS's units,
and EPSG:4326 — SEPAL's default export CRS — makes degrees the common case, where `abs(a)` is about 9e-5 rather than 10.
The arrangement cell size and the minimum-distance floor are metre quantities, so they read the metre value; the
transform stays exact and defines the grid.

An entered Scale replaces the transform only when the two DISAGREE. Typing the value the placeholder displays must not
silently degrade the image's own grid to a resampled one, so agreement is tested as exact equality between both sides
put through `formatDistance`, and the resulting mode is shown on screen.

A collection-backed stratification derives from its FIRST member, not from the mosaic. `toAsset.js` tiles a region
and writes each tile into an ImageCollection under one configured `crs`/`crsTransform`/`scale`, so a SEPAL-exported
collection's members share a lattice by construction and their transforms differ only by whole-tile translations.
Reading the mosaic at the first member's transform therefore reproduces every tile exactly. This is also the
large-stratification case, where exactness matters most. An arbitrary non-uniform collection still yields the first
member's grid, with other members resampled — weakly better than a default, which resamples all of them, and an
unrepresentative first image is visible in the Scale placeholder. Uniformity detection was priced and rejected: the
check almost never changes the decision.

That change also fixed a PRE-EXISTING BUG with app-wide scope, found while verifying the above. The band endpoint
previously resolved a collection asset through `ImageFactory`, which mosaics it — so listing the bands of a large
collection built a mosaic expensive enough to fail outright: `User memory limit exceeded` on
`COPERNICUS/S2_SR_HARMONIZED`. The endpoint was therefore broken for large collection assets in EVERY recipe that
lists their bands, not only Sampling Design. Reading the first member avoids constructing the mosaic at all.
Dropping `ImageFactory` does not change the band list: `imageCollectionAsset.js` already reads `bandNames` from the
raw collection, bypassing its own mask and select, both of which are no-ops for a bare asset id.

Verified against Earth Engine rather than reasoned about: a member reports `EPSG:32633` at 10 m, while the mosaic of
the same members reports `EPSG:4326` with the identity transform at 111319 m. The type branch in `assetBands$` itself
is covered by inspection only — the three tests exercise `deriveStratificationGrid`, and the job module cannot be
imported because a `job()` export runs worker plumbing and calls `process.exit`. Same disposition as the other thin
job workers.

Applicability by mode:

| Mode | Stratification grid | Arrangement grid |
| --- | --- | --- |
| Stratified Random | CRS + Scale | CRS |
| Stratified Systematic | CRS + Scale | CRS |
| Unstratified Random | — | — |
| Unstratified Systematic | — | CRS |

A grid that does not apply to a mode is **absent**, so a dormant saved value can never reach the draw, validation
or the reproduction metadata.

- Curated Arrangement CRS options are `EPSG:6933` (EASE-Grid 2.0 Global, the default), `EPSG:6931` (North) and
  `EPSG:6932` (South). `EPSG:6933` resolves to tested WKT at the Earth Engine boundary because Earth Engine
  rejects the literal identifier here.
- Stored metadata and all user-facing text keep the configured identifier. The WKT must never reach row
  properties, collection metadata, CSV output, logs or error messages.
- Reproduction metadata records `crs`/`gridCrs` as the Arrangement (placement) CRS, `stratificationCrs` as the
  interpretation CRS, and `scale` as the Stratification pixel size. Each is omitted when its grid is absent.
- Mapped stratum area and allocation weight come from `ee.Image.pixelArea()` grouped on the Stratification grid.
  This stays valid for a non-equal-area CRS because `pixelArea()` supplies square metres.
- Anticipated-proportion estimation preserves the Stratification projection and applies its own Proportions
  Scale. Its mean is currently unweighted, which is strictly unbiased only on an equal-area grid; the residual
  is immaterial at planning precision.
- Random uses the effective Stratification pixel size as its Arrangement-cell size. Changing that size defines a
  new cell frame and may move every Random sample; stability across Scale changes is not a product requirement.
- Systematic has no Arrangement raster Scale. Lattice spacing comes from allocation, Minimum distance and the
  Stratification pixel-size floor. Arrangement CRS plus fixed or seeded origin defines one globally anchored
  nested lattice family: changing Stratification CRS or pixel size may change membership or the selected nested
  density, but must never translate that lattice.
- For stratified Systematic the minimum-distance floor is `2 * Stratification pixel size`. Minimum distance is not
  persisted when blank; it resolves at export to the current floor and the GUI shows that value as the placeholder.
- Unstratified Systematic is analytical: no raster scale, no `2 * scale` floor, and an empty Minimum distance
  applies no additional spacing constraint.
- Changing the Stratification grid invalidates areas, anticipated proportions and allocation. Changing only the
  Arrangement CRS moves sample locations without recalculating stratum areas.
- The strict finite Random frame is the set of eligible equal-area cell centres. Mapped pixel area and the area
  represented by those centre-classified cells can differ along AOI, mask and class boundaries. This is an
  accepted Scale-dependent discretization of the mapped strata; do not introduce a second set of frame weights
  alongside the mapped areas.

### GUI controls

- Both CRS controls are advanced (More/Less), and a saved non-default value reveals its section.
- Stratification exposes Scale and a free-text CRS while stratification is enabled; hidden when unstratified.
- Sample Arrangement exposes its curated CRS for Stratified Random, Stratified Systematic and Unstratified
  Systematic, and hides it for Unstratified Random. It never exposes a Scale.

## Draw Behaviour

The categorical image reaches both draws already masked and already pinned to the Stratification grid by exactly
one `reproject`, applied uniformly for ASSET and RECIPE sources. Neither candidate generator reprojects again.

### Random

Stratified Random uses sparse rank-based sampling of equal-area cells, sized by the Stratification pixel size and
placed in the Arrangement CRS:

- Each eligible cell receives one deterministic primary rank. The expensive raster graph carries only `label` and
  `rank`.
- Only cells below a per-stratum threshold are materialized to a temporary candidate table. Thresholds control
  runtime only; final selection always takes the requested lowest ranks.
- The ready candidate asset is inspected for per-stratum counts and unique `cellKey` identifiers. The lazy raster
  graph is never counted interactively.
- A short stratum is repaired by exporting an additional disjoint rank interval using the same rank field. Repair
  continues until enough candidates exist or the full frame has been materialized.
- Selection is independent per stratum. Everything below the nth-rank cutoff is retained; ties at the cutoff are
  broken by a deterministic secondary random value keyed on `cellKey`, derived from the configured seed and
  neither exposed nor persisted.
- Selected rows are exported to a separate temporary asset and their counts validated before publication. GEE
  publication renames the validated asset; SEPAL exports from it.
- Candidate, repair and selected temporary assets are cleaned up on success, failure and cancellation. Cleanup is
  best effort and never replaces the primary task error.

Unstratified Random uses `ee.FeatureCollection.randomPoints(region, points, seed, maxError)`. AOI geometry alone
defines eligible locations — no grid, Scale, CRS or minimum distance. The draw returns exactly the requested count
by construction, so there is no pre-export count aggregation and no final-count validation stage. Grid fields are
absent from its reproduction metadata.

### Systematic

- A globally anchored, nested lattice with deterministic seed-based phase.
- Stratified candidate generation represents the lattice as two parity projections whose pixel centres are the
  exact lattice points, reads class and mask at those centres, vectorizes only accepted markers carrying a compact
  label plus full signed `i/j`, and reconstructs exact geometry from `i/j`. It exports `stratum`, `i`, `j` and
  `level`.
- Temporary vector centroids stay in Earth Engine's default WGS84.
- Unstratified Systematic uses its persisted global lattice index key (`<i>:<j>`) as the final sample ID.
- Exports materialize candidate tables, select/repair final locations, validate final counts, export the final
  collection, and clean up temporary assets, including on failure and cancellation.
- Tiling candidate/final exports is deferred until real users encounter limits that justify the complexity.

## Constraints on Future Change

These are load-bearing. Each was established by measurement, and each is cheap to break by accident.

- **Only `reproject` pins a subtree to a grid.** `setDefaultProjection` declares a projection without forcing
  evaluation on it, and produces the same result as no pinning at all. Measured in both directions: insufficient
  where a source grid exists, and equally insufficient where none does.
- **Exactly one `reproject` exists across the sampling-design tree**, on the categorical branch, and nothing on
  the rank or lattice branches. A source-level test asserts that `stratificationImage.js` is the only module
  containing `.reproject(`.
- **Random's candidate graph shape is load-bearing for cost**, not style. A `reproject` on the rank field, a
  scale-baked projection passed as `crs`, a non-default `tileScale`, or any extra carried band each make the
  candidate export fail to complete at full scale. Keep the plain resolved-WKT `crs` plus explicit `scale`, and
  exactly the `label` + `rank` bands.
- **Systematic raster indices must use `pixelCoordinates().floor().toInt()`.** `toInt()` alone truncates negative
  half-integer pixel-centre coordinates toward zero and assigns the wrong signed `i/j`.
- **Systematic membership is the class and mask at the exact lattice point**, never at a nearby marker or a
  serialized feature centroid. Identity is `(stratum, i, j)`, and the exact point is reconstructed from the layout
  before any feature-level check.
- **Temporary centroids must stay in default WGS84.** Native custom-WKT centroids exceed Earth Engine's
  aggregation-result limit at full scale.
- **The Systematic origin phase derives from the Arrangement projection's nominal scale.** Taking it from the
  Stratification projection would translate the lattice whenever Stratification CRS or pixel size changed. A
  Stratification transform's `xOrigin`/`yOrigin` are likewise never the Arrangement origin.
- **A resolved Stratification grid carries a Scale or a transform, never both.** `effectiveArrangement` emits one
  definition, so the tolerant reader (`gridPixelSize`, where a transform wins) and the strict validator (the
  candidate generator, which rejects both) can never disagree - they are never handed a grid carrying both.
- **No AOI buffer before Systematic vectorization.** The marker centre is the exact lattice point, so clipping
  already yields "exact point inside AOI"; a buffer would only reintroduce the inclusive edge convention.
- **Batch EECU does not reflect work done on the success path.** Successful exports here report roughly 0.0003 to
  0.002 EECU-seconds per wall-clock second, while cancelled ones report five orders more. Wall clock is the
  operative gate, and EECU figures cannot support cost comparisons between algorithms.
- Displacement, whole-AOI analytical point collections, overlap/dilation proxies, coarse tile occupancy and
  monolithic exact `reduceRegions` over a full-scale candidate set have all failed semantic or operational gates.
  Do not resume one without a new hypothesis that addresses its recorded failure. Cost there is driven by extent,
  not row count: scattered point reads defeat locality, while area-bounded reads amortize reprojection.

## Verification Suites

`modules/gee/verify/` holds three scripts that exercise contracts Jest cannot, because Jest cannot construct
`ee.Projection` and these require live Earth Engine credentials:

| Script | Covers |
| --- | --- |
| `samplingDesignGridInvariants.mjs` | one-reproject-on-the-categorical-branch, both raster edge conventions, Arrangement CRS liveness, origin invariance |
| `randomGridExactness.mjs` | Random's finite exactness matrix against an independent point-lookup oracle |
| `systematicLatticeExactness.mjs` | Systematic's finite exactness matrix against the same style of oracle |

They are deliberately outside `npm test` and outside `src/`, so they never ship in a module image. **They are
evidence, not regression protection** — nothing runs them automatically. Any change to grid handling should
re-run all three before it is considered done.

## Remaining Work

### Structured errors from the area and proportion jobs

`areaPerStratum` and `probabilityPerStratum` throw a raw `Error` when the Stratification CRS is absent or a
transform is malformed, where the task boundary produces a structured `{key, args, message}` the GUI can render.
Both GUI call sites guard with `|| DEFAULT`, so it is latent. This is not a fix in passing: these are gee job
workers returning RxJS streams to the HTTP layer with no `ClientException` plumbing, and the GUI consumes their
failures through a different path from task errors. It needs its own packet.

### Confirm the RECIPE conclusion against a real recipe

The uniform `reproject` result for RECIPE sources was measured on a projection-less expression. That it extends to
a computed image over real raster inputs is assumed, not shown. Confirm it against an actual recipe stratification
during acceptance; a synthetic fixture cannot settle it, because a coordinate-derived class is
resolution-independent by construction and would pass trivially.

### Clean up retained Earth Engine evidence assets

Enumerate `projects/daniel-wiell/assets/` for `sd_*` tables and delete them once the transform work no longer
needs them. They were retained as research evidence and have no production role.

### Documentation and GUI language

The user guide lives in the separate `/home/ec2-user/sepal-doc` repository at
`docs/source/cookbook/sampling_design.rst`. Standing direction already settled: define the sampling frame and
distinguish AOI boundary from stratification mask; present planning margins and sample sizes as assumptions;
define the target reporting category without requiring it to be a stratum; explain failure details through
Tasks → Task Details → Progress; document Direct versus Queued calculations, export-only behavior, temporary
export assets and exported stratum styling metadata; avoid undefined `estimator` terminology; define
stratification's primary purpose as sampling efficiency while treating coverage of small groups as a separate
objective; separate poor grouping from incomplete coverage; keep final-analysis guidance high-level; explain the
four arrangement modes separately; and present Task Details recommendations as panel-specific actions.

Outstanding:

- Describe the two-grid behaviour: Stratification CRS and Scale control class interpretation, stratum areas and
  proportion grouping, while Sample Arrangement owns the placement CRS for every mode except Unstratified Random.
- Reconcile the guide's temporary-asset, quota, cleanup and progress descriptions with the sparse Random export
  flow.
- Remove implementation details where a stable user-facing explanation is sufficient.
- Inspect every Sampling Design screenshot against the final GUI and replace only the stale ones. The
  Stratification panel changed most: there is no CRS transform control, and Scale is blank by default for an
  asset, showing the derived pixel size as its placeholder and naming which grid is in effect. Also check the
  Sample Arrangement CRS, which is now shown for every mode except Unstratified Random.

### First-release acceptance

- Run all four modes through the deployed GUI.
- Confirm a Stratified Random GEE export finishes as `COMPLETED` after promotion; an internal Earth Engine rename
  result must not be interpreted as task progress.
- Exercise both GEE and SEPAL destinations for designs that require temporary assets, plus GEE create and replace.
- Trigger one intentional underproduction failure and confirm Task Details shows concise, configuration-aware
  advice while leaving no published destination.
- Confirm temporary candidate, repair and selected assets are cleaned after success and failure. A cleanup problem
  must not replace the primary task result.
- Add a completed GEE table asset to a map and verify stratum labels, colours and filtering from exported metadata.
- Confirm task names, Earth Engine asset IDs and workspace filenames are sanitized at their respective boundaries.
- Reconcile the guide and screenshots with the final GUI, then run the Sphinx build and warning check.
- Rerun focused shared/GEE/task/GUI tests, affected ESLint targets, JSON validation and `git diff --check` in both
  repositories.
- Do not stage or commit automatically; the user controls Git mutations.

### Deferred post-release

- **Known gap: the Stratification panel's grid wiring is untested.** Its decisions are covered as pure functions
  (`stratificationGridState`, `stratificationScaleDefault`, `deriveStratificationGrid`,
  `isStratificationTransformActive`), but nothing asserts that `onGridChanged` calls `syncCrsTransform`, or that
  `loadBandGrids` fires on image load. The obstacle is NOT missing tooling - `widget/scrubControl.test.jsx` and
  `widget/crudItem.test.jsx` already render components. It is that `stratification.jsx` is a `recipeFormPanel`
  behind `compose`, `withActivators` and a Redux connection, so mounting it needs recipe context those widget
  tests never required. Whoever picks this up is solving panel mounting, not building a harness. The gap is
  tolerable because both risks degrade silently to today's behaviour - no derived grid, Scale required - rather
  than failing loudly.
- **Let recipes declare their own source grid.** A recipe is grid-less only because compositing discards the
  projection; the recipe usually knows its inputs. Where a recipe has exactly ONE unambiguous source grid - a
  classification over a single asset - it should call `setDefaultProjection(sourceProjection)` on its output.
  Prefer this over a `preferredGrid()` capability per recipe type: it reuses the measured property that
  `setDefaultProjection` declares a projection without forcing evaluation on it, so there is no `reproject` and no
  cost; recursion is free, because a classification of a classification inherits through image lineage rather than
  a model-level protocol; and every consumer benefits, not only Sampling Design. It degrades correctly - pin when
  there is exactly one source grid, leave unpinned otherwise, and unpinned falls through to the deterministic
  default. Sampling Design would then need NO change at all: the grid already derives from the resolved image's
  projection, so a recipe that declares one is picked up automatically. Two assumptions to measure first: a
  single-asset classification may already propagate the projection, since per-pixel band math preserves it and
  only mosaicking loses it; and whether `setDefaultProjection` surfaces in the band info the `/bands` endpoint
  returns.
- Add tiled candidate/final exports only when actual user workloads justify the complexity.
- Automatic addition of a completed export to the map is not required for the first release.
- Do not promise sample retention across enlarged, restratified or annual designs until the overlap contract has
  deterministic evidence. Before documenting "many locations will be retained", establish it with deterministic
  tests for increasing an unstratified systematic sample, moving from unstratified to stratified, replacing one
  stratification with another, changing annual allocations while retaining CRS, grid-start method and seed, and
  `Exact` thinning when requested counts change.

  A stable nested grid may allow locations to be retained when a design is enlarged, restratified or repeated. The
  workflow that would follow, once the overlap contract is established: export an unstratified systematic pilot
  with a randomized start and a recorded seed; collect or interpret reference observations and calculate the
  result and its uncertainty outside the recipe; if uncertainty is too large, use the pilot and appropriate mapped
  information to plan a larger or stratified design; keep compatible CRS, grid-start method and seed to maximize
  overlap; reuse observations only at locations the revised export selects, and only while the observation remains
  valid; and never include pilot locations absent from the revised export as if the final design had selected
  them, because combining stages requires analysis that accounts for the sequential redesign. For annual
  monitoring, shared locations can reduce random year-to-year variation and improve estimates of change, but do
  not necessarily reduce the uncertainty of each annual estimate — each year still needs an observation
  appropriate to that year, and changing stratification changes which locations are retained.

## Underproduction and Validation Advice

- Distinguish a fixed requested count (Samples mode) from a count calculated from Target margin of error (Error
  mode).
- Random never recommends `Closest`; Systematic `Oversample`/`Exact` may.
- Manual ignores stale hidden Error/Equal values, and is normalized through the shared policy for boolean and
  legacy-array forms.
- Equal-allocation advice recommends only Proportional, Balanced, or Manual when anticipated proportions are not
  known to be available.
- Keep no more than three prioritized actions per diagnosis.
- Task Details preserves structured `{key, args, message}` advice and reports per-stratum counts.
- Preflight recommendations distinguish Samples, Error and Manual mode and name editable controls.
- Coverage advice says "each affected stratum" and qualifies AOI enlargement so the revised boundary must still
  represent the intended study area.
- Advice must not claim that stratified Random searched "anywhere" in the AOI: it searched eligible cells at the
  current Arrangement grid. It may suggest a finer Stratification Scale only when that still represents the source
  data and intended classes, and that advice applies to all relevant shortage groups, not only failures below the
  two-sample floor.
- Unstratified `randomPoints` returns the exact requested count; geometry or platform failures there are not
  ordinary per-stratum underproduction.

## Why Stratify: Documentation Contract

Stratification's primary statistical purpose in this recipe is to improve sampling efficiency, defined for
beginners as either lower expected sampling error for the same total number of samples, or fewer samples needed to
reach a target sampling error.

Efficiency can improve when strata separate areas with substantially different occurrences of the target reporting
category and samples are allocated appropriately. It is not guaranteed. Weakly related strata, inaccurate
anticipated proportions, or poor allocation may provide little benefit or can increase sampling error. Additional
strata also introduce additional minimum-sample requirements.

Ensuring samples in small groups is a separate objective. It is useful when those groups require separate results,
but it does not necessarily improve efficiency for the overall target estimate.

The guide must not discourage a valid design where a mapped class defines a stratum and the corresponding
reference category is the target. Instead, warn that the mapped class is not reference truth and that anticipated
proportions should not blindly assume perfect 0/100 classification.

Systematic sampling spreads locations regularly, avoiding the clusters and large gaps that independent random
sampling can produce. When nearby locations tend to be similar, this broader spatial coverage can reduce sampling
error for the same number of observations. The gain is not guaranteed, calculating uncertainty from one systematic
grid can be more difficult, and a periodic landscape pattern aligned with the grid can perform poorly. Use a
randomized grid start when the design requires randomization; a fixed start is reproducible but is not randomized.

## Protocol for Future Earth Engine Research

Rules earned by this investigation. They apply to any future feasibility work on these graphs.

- **A failing fixture is carrying information.** Adjusting a fixture until it passes discards the finding, and the
  suite stays green either way, so it leaves no trace. It happened here: a Random fixture failed on an AOI-edge
  tie, an offset removed the tie, and a real behaviour became a recorded observation instead of an assertion,
  unprotected for the rest of the investigation. The tell is that "removing a tie" and "removing a finding"
  describe the same edit, and the first phrasing is what makes it feel safe. When a fixture fails, decide first
  whether it found something; if it did, assert the behaviour before adjusting the fixture.
- **A poll-based EECU guard bounds damage but cannot prevent overshoot.** In one withdrawn run EECU grew roughly
  3700x in 30 seconds and no practical poll interval caught it. Size a graph before submitting it; the guard is a
  backstop, not the control.
- Set Earth Engine automatic retries to zero. Stop after the first unexpected semantic failure and understand the
  failed graph and oracle before submitting a corrected variant.
- A full-scale export requires an explicit reviewed go-ahead after finite and modest gates pass. Start one task,
  monitor cancellation thresholds, and confirm terminal state plus asset cleanup or intentional retention.
- Finite acceptance must compare against an independently derived oracle, and must include the configuration
  production actually runs — not a neighbouring one. Same and different CRSs, shifted grids, equal and unequal
  pixel ratios, every row parity, negative indices, AOI edges and holes, masked pixels, isolated one-pixel
  classes, and points exactly on and immediately to both sides of source-pixel edges and corners.
- Validate a graph against the shape that will ship. A measurement taken on a different composition certifies a
  graph nobody runs.
- Run research through the bind-mounted module container; do not copy source, install dependencies or create
  credential plumbing. Use service-account authentication for read-only checks and linked-user authorization in
  memory only when a writable asset is required.
- Do not stage, commit, push or change packages during feasibility work.
