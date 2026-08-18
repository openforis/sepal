# Sampling Design Roadmap

Last updated: 2026-08-18

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

## Current Grid and CRS Policy

The demo uses ONE equal-area grid whenever a design requires a grid; a curated CRS identifier is stored and
resolved to its value only at the Earth Engine boundary. Unstratified Random is the exception because it has no
grid.

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
- Systematic membership is the class and mask at the exact exported lattice point, not at a nearby marker,
  nomination pixel or serialized feature geometry. Candidate identity remains `(stratum, i, j)` and the exact
  point must be reconstructed from the applicable layout before any feature-level membership check.
- Displacement, whole-AOI analytical point collections, overlap/dilation proxies, coarse occupancy and one
  monolithic exact `reduceRegions` over the Sudan nominations have failed semantic or operational gates. Do not
  resume one without a new hypothesis that addresses its recorded failure below.
- The next Systematic spikes are the exact-centred lattice raster followed, if necessary, by source-pixel
  ownership. Both avoid a raster reduction over the complete candidate collection.
- Keep the current one-grid behavior until Random passes small and Sudan-scale gates and Systematic passes finite
  exactness, modest batch compatibility and the reviewed Sudan-scale performance gate.

### Systematic two-grid research record

This research is post-demo and does not block release of the current one-grid design. Its contract is an
equal-area Systematic lattice in the Arrangement CRS with class and mask membership read at each exact lattice
point on an independently configured Stratification grid. A proxy may nominate a superset, but the published
candidate set must equal an independent exact point-lookup reference with no false negatives or false positives.

The repeatable Sudan fixture is:

- Stratification: `projects/fifth-bonbon-272108/assets/sudan-dynamic-world-2024`, band `label`, evaluated as
  `EPSG:32636` at 10 m.
- AOI: `users/wiell/SepalResources/gaul`, feature `id = 6`.
- Arrangement CRS: `EPSG:6933`; `Closest`; seeded start with seed `2`; Minimum distance `20 m`.
- Base allocation:

| Stratum | Area (m2) | Requested |
| ---: | ---: | ---: |
| 0 | 5465664655.29412 | 2857 |
| 1 | 73237008483.52942 | 9697 |
| 2 | 1963761640.7843134 | 1702 |
| 3 | 1044592860.7843137 | 1237 |
| 4 | 263708404850.58826 | 19840 |
| 5 | 248695078157.25507 | 19034 |
| 6 | 3832430202.745098 | 2394 |
| 7 | 1245111270211.3682 | 43221 |
| 8 | 226218.82352941178 | 18 |

The one-grid production comparison completes in roughly 25-35 minutes with low EECU use. A two-grid candidate
algorithm must remain in that operational range: semantics alone are insufficient. Use a single batch attempt,
zero automatic retries, and reviewed cancellation limits. The current hard research limit is 45 minutes or
10000 batch EECU-seconds; poll often enough near the threshold to avoid the large cancellation overshoots seen
in earlier runs.

#### Experiments already closed

| Approach | Result |
| --- | --- |
| `Image.displace` | Rejected. Zero displacement changed both class and mask under an explicitly anchored terminal request. |
| Whole-AOI analytical point collection | Rejected before export. The Sudan frame required about 722 million point features, dominated by the rare snow/ice stratum. |
| Five-layout overlap/dilation hybrid | Rejected. Cancelled after about 53 minutes and 128904 batch EECU-seconds. |
| Single-lattice overlap/dilation hybrid | Rejected. Cancelled at about 37213 batch EECU-seconds without completing. |
| Coarse tile-occupancy proxy | Rejected. Crossed 121269 batch EECU-seconds within about four minutes. |
| Source-grid nomination plus monolithic exact lookup | Nomination passed, but exact Stage 2 was rejected after crossing the 10000-EECU limit; last observed cancellation state was `CANCEL_REQUESTED` at 24722 EECU-seconds. |
| Exact-centred lattice raster | Passed after matching production's compact `label + i + j` vectorization and default WGS84 temporary centroids. The corrected full-Sudan candidate export completed in about 13 minutes using 1.59 batch EECU-seconds. |

The first lattice-centred experiment is not a rejection of the corrected exact-centred raster described below.
Its cross-CRS comparison failed before membership because the parity-grid generator omitted edge points; later
experiments also found errors in the synthetic affine oracle. Rebuild that spike against the subsequently proven
explicit-point reference instead of reusing its conclusion.

#### Source-grid nomination evidence

The retained `modules/gee/src/_spike/systematic-two-grid/source-grid-hybrid.mjs` evaluates a 1 m nearest-neighbour
EPSG:6933 coordinate ramp on the native Stratification grid. Each valid source pixel uses its class-specific
layout to calculate the nearest hex-lattice `(i, j)` and nominates it only within a conservative radius. Sparse
source pixels are vectorized, then their exact lattice geometry and nested level are reconstructed.

Evidence:

- Six finite same-CRS/cross-CRS scenarios recovered all 115 exact candidates from 149 nominations, with no
  false negatives or final key, class, mask, property, level, identity or geometry differences. Only two
  nominations were duplicates, proving that uniqueness does not imply exact membership: roughly 32 unique
  nominations were still false positives.
- The full Sudan nomination export produced 375785 rows in about 17 minutes using about 1.5 batch EECU-seconds.
- Structural validation found 374857 distinct `(stratum, i, j)` tuples and 928 duplicate rows (0.247%), no
  missing properties or schema errors, and at most 0.00242 m displacement between serialized geometry and the
  point reconstructed from the numeric properties. That validation took 36 minutes 54 seconds and 167.18 EECU-
  seconds. Do not repeat it: it established structural integrity but cannot establish exact membership.
- Reconstructing exact geometry before native-grid `reduceRegions` passed the finite wrong-stored-geometry
  witness. The full Sudan exact lookup was cancelled after exceeding the operational limit. It is semantically
  credible but not a viable production Stage 2.

Evidence assets are intentionally retained while research continues:

- Nominations: `projects/daniel-wiell/assets/sd_systematic_source_grid_nominations_sudan_1786962198406`.
- Validation summary:
  `projects/daniel-wiell/assets/sd_systematic_source_grid_validation_sudan_1786969987644`.

Before starting another batch task, confirm task `V5TQ36Q45MVR2IRQHSUW6KB4` is terminal and that its exact-
candidate target did not materialize. Preserve the evidence assets until they are no longer needed.

#### Exact-centred lattice raster evidence

This experiment was preferred because a successful result would remove nominations, duplicates, feature
ownership checks, `reduceRegions` and the second intermediate asset.

Hypothesis and graph:

1. Represent the hex lattice as two rectangular projections: one for even rows and one shifted by half a column
   for odd rows. Define each affine transform so its pixel centres, not corners, are the exact lattice points.
2. Prefer one densest globally aligned lattice when the power-of-two layouts and seeded phase prove every
   class-specific lattice is a subset. Otherwise begin with the minimum number of unique layouts and record the
   additional raster work explicitly.
3. Let the terminal lattice projections pull the original categorical image and mask by nearest-neighbour
   evaluation. The class observed at the exact output-pixel centre chooses whether that lattice point belongs to
   the class-specific layout.
4. Mask non-members and vectorize only accepted marker pixels. Reconstruct geometry and structural identity from
   carried `i/j`; never use a vector centroid as identity or membership evidence.

Finite and modest gates now pass for the retained
`modules/gee/src/_spike/systematic-two-grid/exact-centred-lattice.mjs`:

- Raster indices must use `pixelCoordinates().floor().toInt()`. The first implementation used `toInt()` alone,
  which truncates negative half-integer pixel-centre coordinates toward zero and assigned the wrong signed
  `i/j`. After the correction, nine finite fixtures compared 386 raw lattice points and 133 accepted candidates
  with no raw omissions, extras, duplicate keys, membership, property, level, identity or reconstructed-geometry
  differences.
- The finite matrix includes an accepted lattice point exactly on a discriminating four-cell source-pixel corner,
  as well as both sides of boundaries, shifted same-CRS and cross-CRS grids, negative indices, masks, holes,
  isolated one-pixel classes, fixed and seeded starts, and repair density.
- `setDefaultProjection()` is insufficient to enforce the configured Stratification grid when the terminal
  `reduceToVectors` requests an Arrangement lattice projection. In the discriminating configured-grid fixture it
  produced the same eight missing and eight extra keys as direct native evaluation. One shared `reproject()` of
  the combined class-and-mask image to the configured Stratification projection before the even/odd branches
  matched the 15-candidate oracle exactly.
- The modest cross-CRS batch exported 26 candidates in 64.611 seconds using 0.09335 batch EECU-seconds. All 26
  structural keys, properties, classes, masks and levels matched the independent oracle; all geometries were
  points and the maximum displacement from authoritative `arrangementX/arrangementY` was
  `3.73e-7` m. Asset visibility took 0.415 seconds and the temporary asset was deleted and confirmed absent.
- The modest graph serialized to 46162 bytes and contained two `reduceToVectors` operations and the one shared
  `reproject`, with no `reduceRegion(s)`, `sampleRegions`, displacement, dilation, `reduceResolution` or explicit
  resampling. This proves finite exactness and batch compatibility, not Sudan-scale performance.
- The reviewed full-Sudan base-candidate graph serialized to 53164 bytes with the same operator shape and an
  estimated 692767113 densest-lattice pixels. Task `V73IVPU2JFCXB6EHGGEKNYWF` failed after 445.727 seconds and
  4.156 batch EECU-seconds with `Computed value is too large.` No cancellation threshold was reached, no candidate
  table materialized, and target
  `projects/daniel-wiell/assets/sd_systematic_exact_centred_sudan_1787036362831` was deleted and confirmed
  absent. Do not rerun the unchanged Sudan graph.
- The failure reproduced a production issue already fixed by commit `9e58ea2ea`: native-projection temporary
  centroids carry the Arrangement CRS's large custom WKT through `reduceToVectors`, while six reducer-carried
  properties enlarged each aggregation further. The corrected spike leaves temporary centroids in default WGS84,
  vectorizes only compact `label` plus full signed `i/j`, decodes stratum and nested level afterward, reconstructs
  exact geometry, and exports only `stratum`, `i`, `j` and `level`.
- The corrected Sudan graph serialized to 45950 bytes with two `reduceToVectors` calls and one shared
  `reproject`, and no other aggregation or forbidden operator. Task `TKNVLFUUAQL7WGJ6OKT4PNWD` completed in
  787.94 task seconds (795.57 seconds observed RUNNING) using 1.59007 batch EECU-seconds. Its 360844 Point rows
  have 360844 distinct structural `(stratum, i, j)` identities, no duplicate or null required properties, and
  exactly the four production candidate fields. The retained candidate asset is
  `projects/daniel-wiell/assets/sd_systematic_exact_centred_sudan_1787037882518`.
- Production-shaped `CLOSEST` selection chooses levels/counts `0:1/1996`, `1:1/6687`, `2:1.5/1462`,
  `3:1/1527`, `4:1/24158`, `5:1/22844`, `6:0.5/2852`, `7:0.5/57266`, and `8:1/26`, for 118818 rows total.
  Every stratum has at least its requested raw candidate count, so no repair export is required.
- The reviewed final-selection graph loaded only the retained table and invoked the production
  `stratifiedSystematicFinalSamples` selector; its 8690-byte serialization contained no image, raster source,
  candidate-generation or membership operation. Task `O5IH5AGSAIPXOS4QQX3N2G2V` completed in 112.863 task
  seconds using 0.00616 batch EECU-seconds. The ready table contains exactly the 118818 expected Point rows and
  per-stratum counts above, with 118818 distinct signed structural IDs, zero duplicates, the exact
  `id`, `stratum`, `selectedLevel` schema, and no ID-format or selected-level mismatch. The retained final asset
  is `projects/daniel-wiell/assets/sd_systematic_exact_centred_final_1787042745900`; retain it together with the
  base-candidate asset until the investigation is explicitly closed.

Finite acceptance must compare the complete `(stratum, i, j)` set with an independently enumerated exact-point
`reduceRegions` oracle. Include same and different CRSs, shifted grids, fixed and seeded origins, every row
parity, negative indices, AOI edges and holes, masked pixels, isolated one-pixel classes, and points exactly on
and immediately to both sides of source-pixel edges and corners. Assert zero raw-lattice omissions before
comparing membership. Verify nearest-neighbour mask semantics and the half-pixel affine translation explicitly.

The corrected candidate graph contains no `reduceRegions`, `sampleRegions`, `displace`, `focalMax`,
`reduceResolution`, conservative class dilation or feature-level membership lookup. Finite correctness, modest
compatibility, full-Sudan base-candidate materialization and the production-shaped final-selection/export gate
now pass. Production implementation remains separate work.

#### Fallback spike B: source-pixel ownership

Hold this while the corrected exact-centred raster advances. Use it only if final selection exposes a new blocker.
It builds on the operationally successful source-grid nomination stage but replaces the rejected raster lookup
with feature geometry and integer ownership checks.

1. Carry each nominating source pixel's integer grid indices (`sourceI`, `sourceJ`) through vectorization. Ensure
   `reduceToVectors` cannot merge adjacent nominating pixels: use a proven per-pixel or checkerboard label and
   verify one output feature per nomination pixel before relying on ownership.
2. Reconstruct the exact Arrangement-CRS lattice point from `(stratum, i, j)` and the authoritative layout.
3. Transform that point geometry to the full Stratification-grid projection. Its returned coordinates are grid
   coordinates; apply the same PixelIsArea boundary convention as the exact oracle (`floor(u)`, `floor(v)`).
4. Keep the nomination only when those containing-pixel indices equal the carried source indices. The feature's
   source class and valid source mask then establish exact membership without reading the raster again.
5. A valid exact point must be nominated by its containing source pixel. Retain the existing radius/spacing proof
   and test that claim directly; rejecting neighboring nominations is safe only when this completeness invariant
   holds.

The finite witness must compare ownership output with the exact native-grid oracle at ordinary, masked, isolated,
edge and corner cases, including exact boundaries and both sides of each boundary. It must also demonstrate that
an adjacent wrong-class pixel can nominate a point but cannot own it, while the actual containing pixel does.
Assert one owner and one structural key per exact candidate.

For diagnosis, ownership may first run after the retained nomination asset. The production goal is to fold the
post-vectorization geometry transform and integer comparison into the candidate export so only the exact
candidate asset is materialized. If combining it makes the graph expensive, measure a separate feature-only
asset-to-asset stage; do not reintroduce a raster lookup.

#### Spike execution protocol

- Keep spike scripts in `modules/gee/src/_spike/systematic-two-grid/` until the research direction is settled;
  do not delete and recreate them after every run. Production and permanent tests remain untouched during
  feasibility work.
- Run through the bind-mounted `gee` module container from `/usr/local/src/sepal/modules/gee`; do not copy source,
  install dependencies or create credential plumbing. Use existing service-account authentication for read-only
  finite checks and linked-user authorization in memory only when a writable asset is required.
- Preserve exact commands, task IDs, graph operators, runtime, batch EECU, counts and discrepancies. Set EE
  automatic retries to zero. Stop after the first unexpected semantic failure; do not submit corrected variants
  until the failed graph and oracle are understood.
- A full Sudan export requires an explicit reviewed go-ahead after finite and modest gates. Start only one task,
  monitor cancellation thresholds, and confirm terminal state plus exact asset cleanup or intentional retention.
- Run `node --check` on retained scripts and `git diff --check`. Do not stage, commit, push, change packages or
  touch production files during a spike.

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
- Unstratified Systematic uses its persisted global lattice index key (`<i>:<j>`) as the final sample ID.
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

Pending before the first release:

- Describe the current one-grid behavior: Stratification CRS + Scale control both class interpretation and
  stratified placement, while Sample Arrangement exposes a CRS only for Unstratified Systematic. Do not imply that
  the planned Stratification/Arrangement grid split is already implemented.
- Reconcile the guide's temporary-asset, quota, cleanup, and progress descriptions with the sparse Random export
  flow.
- Remove implementation details from the guide when a stable user-facing explanation is sufficient.
- Inspect every Sampling Design screenshot against the final GUI and replace only those that are stale. In
  particular, verify the advanced Stratification CRS and the mode-dependent Sample Arrangement controls.

## First-release Blockers

No known code blockers remain. Release still depends on completing First-release Acceptance.

## First-release Acceptance

- Run all four modes through the deployed GUI: Stratified Random, Stratified Systematic, Unstratified Random and
  Unstratified Systematic.
- Confirm a Stratified Random GEE export finishes as `COMPLETED` after promotion; an internal Earth Engine rename
  result must not be interpreted as task progress.
- Exercise both GEE and SEPAL destinations for designs that require temporary assets, plus GEE create and replace.
- Trigger one intentional underproduction failure and confirm Task Details shows concise, configuration-aware
  advice while leaving no published destination.
- Confirm temporary candidate, repair and selected assets are cleaned after success and failure. Cleanup is best
  effort, but a cleanup problem must not replace the primary task result.
- Add a completed GEE table asset to a map and verify stratum labels, colours and filtering from exported metadata.
- Confirm task names, Earth Engine asset IDs and workspace filenames are sanitized at their respective boundaries.
- Reconcile the guide and screenshots with the final one-grid GUI, then run the Sphinx build and warning check.
- Integrate upstream application changes only after the current work is committed safely, then rerun focused
  shared/GEE/task/GUI tests, affected ESLint targets, JSON validation and `git diff --check` in both repositories.
- Do not stage or commit automatically; the user controls Git mutations.

The demonstrated Sudan-scale Random graph does not need another full-scale benchmark unless that graph changes.

## Deferred Post-release Work

- Split Stratification interpretation from equal-area sample placement through reviewed Random and Systematic
  implementation packets. Random's full-scale sparse-graph performance, exact Systematic membership and
  full-scale Systematic performance remain acceptance gates for that change.
- Consider a CRS-transform mode only after the two-grid ownership is stable; do not expose Scale and transform as
  simultaneously authoritative inputs.
- Add tiled candidate/final exports only when actual user workloads justify the complexity.
- Automatic addition of a completed export to the map is not required for the first release.
- Do not promise sample retention across enlarged, restratified or annual designs until the overlap contract has
  deterministic evidence.
