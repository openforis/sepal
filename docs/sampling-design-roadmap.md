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

## Current Grid and CRS Policy

The demo uses ONE equal-area grid per design; a curated CRS identifier is stored and resolved to its value only
at the Earth Engine boundary.

- Supported CRS options are:
  - `EPSG:6933`: EASE-Grid 2.0 Global, the default. It resolves to tested WKT because Earth Engine rejects the
    literal identifier in this environment.
  - `EPSG:6931`: EASE-Grid 2.0 North.
  - `EPSG:6932`: EASE-Grid 2.0 South.
- Stored metadata keeps the configured identifier and must never contain the EPSG:6933 WKT.
- Ownership (current demo):
  - **Stratified** designs (Random and Systematic): Stratification owns the **CRS and Scale**. Stratum-area
    calculation and sample placement (Random cells, Systematic lattice) use the Stratification CRS + Scale.
    Anticipated-proportion estimation uses the same Stratification CRS but its own (Proportions) Scale. The
    Sample Arrangement CRS is ignored and hidden.
  - **Unstratified Systematic**: no Stratification grid, so Sample Arrangement owns the **CRS** (no Scale).
  - **Unstratified Random**: no grid at all.
- Configuration, requests and reproduction metadata use CRS and Scale only; there is no CRS transform.
- The effective grid for a stratified arrangement is `{scale: stratification.scale, crs: stratification.crs}`.
- For stratified Systematic, the minimum-distance floor is `2 * Stratification Scale`.
- Minimum distance is not persisted when blank. For stratified Systematic it resolves at export to the current
  raster floor and the GUI displays that effective value as the placeholder.
- Unstratified Systematic is analytical. It has no raster scale and no `2 * scale` floor; an empty Minimum
  distance applies no additional spacing constraint.
- Class evaluation, stratum-area calculation and sample placement all use this single Stratification grid;
  anticipated-proportion estimation shares its CRS but uses its own Scale. Separating stratification
  interpretation from arrangement placement into two grids is deferred (see the post-demo section below).

## Arrangement Applicability

| Design | Arrangement controls |
| --- | --- |
| Stratified Random | Seed only. CRS and Scale come from Stratification. |
| Stratified Systematic | Sample-size strategy, grid start, Minimum distance, applicable Seed. CRS and Scale come from Stratification. |
| Unstratified Random | Seed only. |
| Unstratified Systematic | Sample-size strategy, grid start, Minimum distance, applicable Seed, and advanced CRS. |

Current UI and effective-config behavior:

- The applicable CRS visibly defaults to Global (`EPSG:6933`).
- Stratification owns Scale and an advanced (More/Less) CRS, shown while stratification is enabled and hidden
  when unstratified. There is no CRS transform control.
- Sample Arrangement shows an advanced (More/Less) CRS only for Unstratified Systematic; it is hidden for both
  stratified modes and Unstratified Random. A saved non-default Arrangement CRS reveals More only where the field
  applies. Sample Arrangement does not expose Scale.

## Post-demo Stratification and Arrangement Grid Separation

The current demo deliberately uses ONE Stratification CRS for both stratification interpretation and stratified
sample placement; Earth Engine evaluates classes/areas and places samples on that single grid. The post-demo
change introduces two explicitly named grids rather than overloading another generic `{crs, scale}` value:

- **Stratification grid**: defines how the categorical image and its mask are interpreted, how mapped stratum
  areas are calculated, and how anticipated proportions are grouped.
- **Arrangement grid**: uses a curated equal-area CRS and defines Random cells, Systematic lattice coordinates,
  and sample identity.

The intended statistical and evaluation contract is:

- Mapped stratum area and allocation weight come from `ee.Image.pixelArea()` grouped on the configured
  Stratification grid. This remains valid for a non-equal-area CRS because `pixelArea()` supplies square metres.
- Random retains an equal-area cell frame in the Arrangement CRS and reads the configured stratification at each
  exported cell centre.
- The strict finite Random frame is the set of eligible equal-area cell centres. Mapped pixel area and the area
  represented by those centre-classified cells can differ along AOI, mask and class boundaries. Accept this as a
  Scale-dependent discretization of the mapped strata; do not introduce a second set of frame weights alongside
  the mapped areas.
- Systematic retains an equal-area lattice in the Arrangement CRS and reads membership at the exact exported
  lattice point.
- Anticipated proportions remain planning approximations, but grouping must use the Stratification grid. Once
  arbitrary Stratification CRSs are allowed, calculate an area-weighted mean rather than an unweighted pixel
  mean.

The planned public configuration is:

- Stratification keeps its existing **CRS and Scale**, used for class interpretation, stratum areas and
  proportion grouping. Future work may default the Stratification CRS from a meaningful source projection when
  available (e.g. an asset band), falling back to a visible deterministic default rather than Earth Engine's
  possible WGS84 one-degree default for recipe outputs, mosaics or ambiguous projections. Persist the resolved
  choice for reproduction.
- Sample Arrangement becomes independently responsible for the curated equal-area **placement CRS** in stratified
  modes (today it owns a placement CRS only for Unstratified Systematic), without exposing a separate
  sampling-grid resolution or transform.
- Do not expose Scale and CRS transform as simultaneously authoritative inputs. Implement the first split with
  Stratification CRS plus Scale. A later transform mode may use `{crs, crsTransform}` instead of `{crs, scale}`;
  the transform then defines alignment and resolution, while the effective Scale is derived and displayed.
  Initially constrain transforms to north-up, square, projected metre grids so the Random cell size and
  Systematic minimum-distance floor remain well-defined.
- Changing the Stratification grid invalidates areas, anticipated proportions and allocation. With mapped areas
  as the contract, changing only the Arrangement CRS changes sample locations but does not recalculate stratum
  areas.

Implementation constraints and gates:

- Random must preserve the demonstrated sparse candidate graph: only the categorical stratification image may
  be locked to the Stratification grid. Keep the expensive Arrangement-grid graph at `label + rank`, with no
  rank reprojection, extra raster band, transform branch or new reducer output. A forced categorical reprojection
  needs a Sudan-scale performance gate.
- Systematic cannot rely only on a feature-level lookup after vectorization: that removes false positives but
  cannot recover lattice points rejected earlier at the marker centre. The first spike should use a per-marker
  displacement from the marker centre to the exact lattice point, nearest-neighbour categorical lookup, and a
  bounded maximum offset. Compare it with an exact point-lookup reference on deliberately misaligned grids.
- Do not use conservative dilation as a production fallback unless it can be proved complete for arbitrary
  alignment, masks and small class patches. Do not generate every stratum's lattice over the complete AOI.
- Keep the current one-grid behavior until Random passes small and Sudan-scale gates and Systematic passes
  synthetic equivalence plus the established full-scale performance gate.

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

- Describe the current one-grid behavior without implying that the planned Stratification/Arrangement grid split
  is already implemented. Once it is implemented, distinguish Stratification CRS from the equal-area Arrangement
  CRS and explain Scale without exposing Earth Engine projection mechanics.
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

- Done: one equal-area grid per design, with the unreleased user-facing transform removed from every request
  boundary and message. Stratified designs own CRS + Scale in Stratification; only Unstratified Systematic takes
  its CRS from Sample Arrangement; Unstratified Random has no grid. Default sample locations are unchanged.
- Done: a stratified CRS or Scale change invalidates stratification areas and cascades to proportions and
  allocation through the existing forward dependency workflow; a hidden Arrangement CRS change does not.
- Done: the four effective arrangement modes verified, including advanced (More/Less) CRS visibility and the
  Global default.
- Reconcile task progress, quota requirements, cleanup wording, and the guide with sparse Random.
- Complete final GUI inspection and replace stale screenshots before the demo.
- After the demo, implement the grid split through reviewed Random and Systematic spikes. Treat Random's
  full-scale sparse-graph performance, exact Systematic membership, and full-scale Systematic performance as
  acceptance gates before moving placement-CRS ownership to Sample Arrangement and enabling separate grids.
- Resolve the seed `0` and remaining sample-ID uniqueness issues before making universal reproduction or
  uniqueness claims.
- Run focused shared/GEE/task/GUI tests, affected ESLint targets, Sphinx build and warning check, and
  `git diff --check` in both repositories.
- Do not stage or commit automatically; the user controls Git mutations.
