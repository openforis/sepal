# Sampling Design Roadmap

Last updated: 2026-07-24

This is a working decision log for Sampling Design. It records current behavior, agreed changes, statistical
caveats, documentation work, and deferred ideas so that unsettled decisions are not lost in chat history or
mistaken for released functionality.

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

## Current Statistical Contract

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

## Sampling Frame

The sampling frame is the geographic coverage eligible before the placement rule is applied:

- Unstratified: the complete AOI is treated as the frame.
- Stratified: only unmasked pixels belonging to included strata inside the AOI are in the frame.
- Arrangement and grid rules determine the exact locations that can be selected within the frame.

The AOI defines the outer boundary, not the full frame in every mode. Masked or omitted areas have no chance of
selection and are not represented by the sample.

## Grid and CRS Policy

- Recipes store curated CRS identifiers; Earth Engine receives resolved values only at the EE boundary.
- Supported CRS options are:
  - `EPSG:6933`: EASE-Grid 2.0 Global, the default. It resolves to tested WKT because Earth Engine rejects the
    literal identifier in this environment.
  - `EPSG:6931`: EASE-Grid 2.0 North.
  - `EPSG:6932`: EASE-Grid 2.0 South.
- Stored metadata keeps the configured identifier and must never contain the EPSG:6933 WKT.
- Configuration separates two responsibilities (current behavior; sample locations are unchanged):
  - Stratification owns **Scale**, which defines the stratification resolution.
  - Sample Arrangement owns the curated equal-area **CRS**, which defines Random cells and the Systematic
    lattice.
- Sampling Design configuration, requests and reproduction metadata use CRS and Scale only; they do not carry a
  CRS transform.
- The effective grid for a stratified arrangement is `{scale: stratification.scale,
  crs: sampleArrangement.crs}`.
- For stratified Systematic, the minimum-distance floor is `2 * Stratification Scale`.
- Minimum distance is not persisted when blank. For stratified Systematic it resolves at export to the current
  raster floor and the GUI displays that effective value as the placeholder.
- Unstratified Systematic is analytical. It has no raster scale and no `2 * scale` floor; an empty Minimum
  distance applies no additional spacing constraint.
- For the first demo, area calculation and stratum membership continue to evaluate on the equal-area arrangement
  grid. Separating source/native stratification evaluation from arrangement placement is a post-demo feature,
  not part of the configuration-ownership change.

## Arrangement Applicability

| Design | Arrangement controls |
| --- | --- |
| Stratified Random | Seed and advanced CRS. Scale comes from Stratification. |
| Stratified Systematic | Sample-size strategy, grid start, Minimum distance, applicable Seed, and advanced CRS. Scale comes from Stratification. |
| Unstratified Random | Seed only. |
| Unstratified Systematic | Sample-size strategy, grid start, Minimum distance, applicable Seed, and advanced CRS. |

Current UI and effective-config behavior:

- The applicable CRS visibly defaults to Global (`EPSG:6933`).
- Sample Arrangement does not expose Scale.
- CRS belongs to Sample Arrangement and is shown as an advanced (More/Less) option whenever an arrangement grid
  applies (stratified Random, stratified Systematic, unstratified Systematic); unstratified Random shows neither
  the CRS nor the More/Less control. A saved non-default CRS reveals the advanced options on reopen.
- Stratification retains Scale but no CRS or transform control.

## Post-demo Stratification and Arrangement CRS Separation

Configuration ownership is now separated (Stratification Scale, Sample Arrangement CRS). This did not change how
Earth Engine evaluates the stratification: area, anticipated proportions and class membership still evaluate on
the equal-area arrangement grid. Separating source/native evaluation remains post-demo.

The intended post-demo design is:

- Stratification evaluation uses the source image's native projection at Stratification Scale for area
  calculation and class interpretation.
- Random retains an equal-area cell frame in the arrangement CRS and reads the source stratum at each exported
  cell centre.
- Systematic retains an equal-area lattice in the arrangement CRS and reads membership at the exact exported
  lattice point.
- Public configuration remains Stratification Scale plus arrangement CRS. Native projection details are derived
  from the image and are not exposed as a CRS transform.

Random has a credible point-centre lookup path. Systematic still needs a proven implementation that separates
the efficient marker raster from exact-point membership without reintroducing the continental-scale
`reduceToVectors` failures. Do not change Systematic membership until output equivalence and full-scale
performance are demonstrated.

## Random Sampling

### Current candidate behavior

Stratified Random uses sparse rank-based sampling of equal-area grid cells at Stratification Scale:

- Each eligible cell receives one deterministic primary rank. The expensive raster graph carries only `label`
  and `rank`; it has no second random band, forced reprojection, `tileScale`, or transform branch.
- Only cells below a per-stratum threshold are materialized to a temporary candidate table. Thresholds control
  runtime only; final selection always takes the requested lowest ranks.
- The ready candidate asset is inspected for per-stratum counts and unique `cellKey` identifiers. The lazy raster
  graph is never counted interactively.
- A short stratum is repaired by exporting an additional disjoint rank interval using the same rank field.
  Repair continues until enough candidates exist or the full frame has been materialized.
- Selection is independent per stratum. Everything below the nth-rank cutoff is retained; places tied at the
  cutoff are selected by a deterministic secondary random value keyed on `cellKey`. The secondary value is
  derived from the configured seed and is neither exposed nor persisted.
- The selected rows are exported to a separate temporary asset and their actual counts are validated before
  publication. GEE publication renames the validated asset; SEPAL exports from it.
- Candidate, repair, and selected temporary assets are cleaned up on success, failure, and cancellation. Cleanup
  is best effort and does not replace the primary task error.

Sudan at 10 m and 100000 requested samples completed with exact per-stratum counts, 100000 unique IDs, and no
AOI violations. The previously failing seed containing a duplicate primary rank completed after boundary
tie-handling was added.

Unstratified Random uses `ee.FeatureCollection.randomPoints(region, points, seed, maxError)`:

- AOI geometry alone defines eligible locations. There is no raster grid, Scale, CRS, transform, or minimum
  distance.
- The single synthetic `stratum: 1`, stable identifiers, display color, and row/collection metadata are added
  after point generation. Grid fields in its reproduction metadata are absent or explicitly not applicable.
- The draw returns exactly the requested count `N` by construction, so there is no pre-export count aggregation:
  the known count is used directly for metadata (`actualSampleSize`, `sampleExpansionArea`, `sampleWeight`, and
  the collection-level `sampleCountByStratum`), and no final-count validation stage runs. Recipe preflight still
  rejects an invalid allocation or a total below the two-sample floor before any EE graph is built.
- Geometry/platform failures surface from the export itself, not as per-stratum underproduction.

### Random underproduction advice

Advice must not claim that stratified Random searched "anywhere" in the AOI: it searched eligible pixels at the
current equal-area arrangement grid.

- Unstratified `randomPoints` returns the exact requested count; geometry/platform failures are not ordinary
  per-stratum underproduction.
- Stratified Random can still run out of eligible pixels at the configured grid. Advice should mention the
  current Scale and may suggest a finer value only when it still represents the source data and intended classes.
  Scale advice applies to all relevant shortage groups, not only failures below the two-sample floor.

## Systematic Sampling

- The systematic design uses a globally anchored, nested lattice with deterministic seed-based phase.
- Stratified candidate generation is exact-first, uses compact connected-component labels plus reducer-carried
  full `i/j`, vectorizes over a two-pixel AOI buffer, reconstructs exact geometry, and filters against the
  original AOI.
- Temporary vector centroids remain in Earth Engine's default WGS84 representation. Native custom-WKT centroids
  exceeded Earth Engine's aggregation-result limit at Sudan scale.
- Systematic exports materialize candidate tables, select/repair final locations, validate final counts, export
  the final collection, and clean up temporary assets. Cleanup is attempted on failure/cancellation too.
- Tiling candidate/final exports is deferred until real users encounter limits that justify the complexity.

### Why systematic may be useful

Systematic sampling spreads locations regularly, avoiding the clusters and large gaps that independent random
sampling can produce. When nearby locations tend to be similar, this broader spatial coverage can reduce sampling
error for the same number of observations. The gain is not guaranteed, and calculating uncertainty from one
systematic grid can be more difficult. A periodic landscape pattern aligned with the grid can perform poorly.

Use a randomized grid start when the design requires randomization. A fixed start is reproducible but is not a
randomized start.

### Iterative and repeated designs: documentation candidate, not yet a guarantee

A stable nested grid may allow sample locations to be retained when a design is enlarged, restratified, or
repeated. Before documenting "many locations will be retained", establish the actual overlap contract with
deterministic tests for:

- increasing an unstratified systematic sample;
- moving from unstratified to stratified;
- replacing one stratification with another;
- changing annual allocations while retaining CRS, grid-start method, and seed; and
- `Exact` thinning when requested counts change.

Proposed pilot workflow:

1. Export an unstratified systematic pilot, for example 1,000 locations, with a randomized start and recorded
   seed.
2. Collect or interpret reference observations and calculate the result and its uncertainty outside the recipe.
3. If uncertainty is too large, use the pilot and appropriate mapped information to plan a larger or stratified
   design.
4. Keep compatible CRS, grid-start method, and seed to maximize overlap.
5. Reuse observations only at locations selected by the revised export and only when the observation remains
   valid. Collect observations at newly selected locations.
6. Do not automatically include pilot locations absent from the revised export as if the final design selected
   them. Combining stages requires analysis that accounts for the sequential redesign.

For annual monitoring, shared locations can reduce random year-to-year variation and improve estimates of
change. They do not necessarily reduce the uncertainty of each annual estimate. Each year still needs an
observation appropriate to that year, and changing stratification can change which locations are retained.

## Why Stratify: Documentation Contract

Stratification's primary statistical purpose in this recipe is to improve sampling efficiency. Define efficiency
for beginners as either:

- lower expected sampling error for the same total number of samples; or
- fewer samples needed to reach a target sampling error.

Efficiency can improve when strata separate areas with substantially different occurrences of the target
reporting category and samples are allocated appropriately. It is not guaranteed. Weakly related strata,
inaccurate anticipated proportions, or poor allocation may provide little benefit or can increase sampling
error. Additional strata also introduce additional minimum-sample requirements.

Ensuring samples in small groups is a separate objective. It is useful when those groups require separate
results, but it does not necessarily improve efficiency for the overall target estimate.

The guide must not discourage a valid design where a mapped class defines a stratum and the corresponding
reference category is the target. Instead, warn that the mapped class is not reference truth and anticipated
proportions should not blindly assume perfect 0/100 classification.

## Underproduction and Validation Advice

Current behavior:

- Distinguish a fixed requested count (Samples mode) from a count calculated from Target margin of error
  (Error mode).
- Random never recommends `Closest`; Systematic `Oversample`/`Exact` may.
- Manual ignores stale hidden Error/Equal values.
- Equal-allocation advice recommends only Proportional, Balanced, or Manual when anticipated proportions are
  not known to be available.
- Keep no more than three prioritized actions per diagnosis.
- Task Details preserves structured `{key, args, message}` advice and reports per-stratum counts.
- Manual is normalized through the shared policy for boolean and legacy-array forms.
- Preflight recommendations distinguish Samples, Error, and Manual mode and name editable controls.
- Coverage advice says "each affected stratum" and qualifies AOI enlargement so the revised boundary must still
  represent the intended study area.
- Stratified-Random capacity advice mentions a finer Scale only when it still represents the source data and
  intended classes.

## Documentation and GUI Language

The user guide lives in the separate `/home/ec2-user/sepal-doc` repository at
`docs/source/cookbook/sampling_design.rst`.

Completed direction:

- Define the sampling frame and distinguish AOI boundary from stratification mask.
- Explain that planning margins/sample sizes are assumptions, not final results.
- Define the target reporting category without requiring it to be a stratum.
- Explain failure details through Tasks -> Task Details -> Progress.
- Document Direct versus Queued Earth Engine calculations, pixel-count implications, export-only behavior,
  temporary export assets, and exported stratum styling metadata.
- Avoid undefined `estimator` terminology and detailed instructions for final area estimation.
- Define stratification's primary purpose as sampling efficiency, while treating deliberate coverage of small
  groups as a separate objective whose efficiency gain is not guaranteed.
- Separate poor grouping from incomplete coverage: poor grouping may reduce efficiency, while omitted or masked
  coverage changes the sampling frame.
- Use `How to anticipate proportions` in the GUI and plain-language Power wording matching the implemented
  formula.
- Keep final-analysis guidance high-level: later calculations must account for how locations were selected and
  allocated, without prescribing weights or an area-estimation procedure.
- Explain the four arrangement modes separately, including direct AOI point generation for unstratified Random
  and CRS-only configuration for unstratified Systematic.
- Present Task Details recommendations as panel-specific actions and distinguish sampling shortages from Earth
  Engine platform failures.

Pending after the application configuration is finalized:

- Describe Stratification Scale and arrangement CRS without implying that source/native projection separation is
  already implemented.
- Reconcile the guide's temporary-asset, quota, cleanup, and progress descriptions with the sparse Random export
  flow.
- Remove implementation details from the guide when a stable user-facing explanation is sufficient.
- Replace the stale anticipated-proportions screenshot and reconsider Stratification and Sample Arrangement
  screenshots after the final GUI pass.

## Deferred Functional Issues

Keep these separate from the current language/arrangement slice:

- Seed `0` is inconsistently validated, defaulted, executed, and recorded.
- Dormant absolute-margin-of-error support conflicts with the relative-only GUI and guide.
- A tiled candidate/final export workflow is deferred until actual user workloads require it.
- Automatic addition of a completed export to the map is not required for the first release.
- Sample IDs pack coordinates rounded to ~metre precision (`toId`). Unstratified Random appends `randomPoints`'
  seed-stable feature index because it has no minimum separation. Stratified Random uses its unique equal-area
  `cellKey`. Unstratified Systematic still uses the bare coordinate ID, which can collide at sub-metre spacing.
  Decide before relying on universal ID uniqueness whether to add a structural suffix or raise `toId` precision.

## Verification Checklist for the Next Slices

- Done: curated CRS ownership moved to Sample Arrangement, Scale retained in Stratification, the unreleased
  user-facing transform removed from every request boundary and message, with current sample locations unchanged
  (verified by before/after live parity).
- Done: a stratified CRS change invalidates stratification areas and cascades to proportions and allocation
  through the existing dependency workflow.
- Done: the four effective arrangement modes verified, including advanced (More/Less) CRS visibility and the
  Global default.
- Reconcile task progress, quota requirements, cleanup wording, and the guide with sparse Random.
- Complete final GUI inspection and replace stale screenshots before the demo.
- After the demo, spike source/native stratification evaluation separately for Random and Systematic. Treat
  exact Systematic membership and full-scale performance as acceptance gates.
- Resolve the seed `0` and remaining sample-ID uniqueness issues before making universal reproduction or
  uniqueness claims.
- Run focused shared/GEE/task/GUI tests, affected ESLint targets, Sphinx build and warning check, and
  `git diff --check` in both repositories.
- Do not stage or commit automatically; the user controls Git mutations.
