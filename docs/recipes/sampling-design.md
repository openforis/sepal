# Sampling Design — developer notes

Technical notes for working on the Sampling Design recipe: the invariants, the reasoning behind them, and the
mistakes that are cheap to make. The user-facing guide lives in the separate `sepal-doc` repository.

## Orientation

The recipe spans the GUI, the task module, the gee module and both shared libraries — look for
`samplingDesign` directories in each. Nothing owns it end to end.

The Earth Engine library has no test runner of its own; its tests live in the modules that consume it. Run
tests through the `sepal` CLI from the dev-env container.

## Output

A design's output is its samples, which its own tasks export as a table (`samplingDesign.GEE` and
`samplingDesign.SEPAL`). It produces no image, and its shared type says so: `imageOutput: NO_IMAGE_OUTPUT`
(`lib/js/shared/src/recipe/type/samplingDesign.js`). Read as an image - its own IMAGE_OUTPUT, or through a Masking or
Stack that reads it - it is refused as `NON_IMAGE_OUTPUT`, located at the design, whatever else the read is waiting
for; nothing is previewed or retrieved, and a generic image export fails before anything is built. That is not an
image with no bands, which describes and exports as one.

## The two grids

Sampling Design uses two explicitly named grids, and conflating them is the mistake the design exists to
prevent.

- The **Stratification grid** decides how the categorical image and its mask are interpreted, how mapped
  stratum areas are calculated, and how anticipated proportions are grouped. It is a CRS plus a Scale in
  metres, and nothing else. Its CRS is whatever the source uses, and is not restricted to the equal-area list.
- The **Arrangement grid** decides where samples are placed. It owns a CRS only, from a curated equal-area
  list, and Random cells, Systematic lattice coordinates and sample identity all live on it.

A grid that does not apply to a mode is **absent** rather than defaulted, so a dormant saved value can never
reach the draw. Only stratified designs have a Stratification grid; unstratified Random has no grid at all and
draws directly from the AOI geometry.

Stratum areas are computed in true square metres, so they stay correct whatever grid is used. The Arrangement
grid must be equal-area for a different reason: it is what gives every eligible location the same chance of
selection.

### Optional overrides, concrete persisted values

The recipe stores a concrete grid: Stratification's `crs` and `scale`, and Proportions' `scale`. There is no
derived-grid state, no hidden resolved fields, and **no affine transform anywhere in the recipe** — a transform
is expressed in its CRS's own units, so for a 10 m source held in `EPSG:4326` it reads 0.0000898315, and every
consumer of the grid (the Random cell size, the systematic spacing, the minimum-distance floor, reproduction
metadata) reads metres.

The visible fields are **optional overrides**. What the user types wins; clearing a field means "use what this
selection provides", which the placeholder shows. The selection's own values live in transient form fields
(`sourceCrs`/`sourceScale`, `defaultScale`) that are placeholders and fallbacks only — Apply consolidates the
override and the transient default into the one concrete value that is persisted, and neither transient field
ever reaches the model or a request body. Blank is a form-level operation, not a stored mode, so reopening a
recipe shows the concrete values it saved rather than an empty field.

What a selection provides comes from the **selected** band: its `crs`, and its `nominalScale` rounded for
display. Per-band grids are real — one Sentinel-2 asset carries 10, 20 and 60 m bands — so the first band is
never assumed. A source that reports no usable grid, and any recipe source (a computed image reports Earth
Engine's degree-scale default rather than a grid), falls back to what a new recipe starts as: `EPSG:4326` at
30 m. Recipes declare no preferred grid, and Sampling Design never asks `/bands` for one.

A nonblank value that is not a usable Scale stays invalid rather than falling back: clearing the field asks for
the default, but typing 0 asks for something the design cannot run on.

Nominal scales are opt-in: `/assetMetadata` takes an `includeNominalScale` flag, evaluates every selected
band's scale in **one** Earth Engine call regardless of band count, and adds `nominalScale` beside the existing
band fields. Without the flag the request is byte-for-byte what it was, and failing the enrichment returns
ordinary metadata rather than reporting a missing asset. Only the Stratification and Proportions asset
selectors ask for it.

Selection defaults are installed **when a source or band is selected**, and again when metadata arrives for a
band that is already selected — so clearing a field on a reopened recipe shows that source's real value rather
than the plain fallback. Installing them only ever writes the transient fields, so a saved or entered override
is never touched, and it uses `setInitialValue` rather than `set`: what a panel learns about its source is not
an edit, and must not mark a reopened recipe as modified.

Replacing the source type, source id or band clears both the override and the transient default; the next band
selection installs the new one. Once persisted, a value is ordinary configuration: it survives reopening and
unrelated upstream edits, and a Stratification Scale change does not rewrite a Proportions Scale that was
already stored.

Selecting a projected CRS opens the advanced section, so an effective CRS that is not the default is never left
hidden behind a button.

### Native alignment is Earth Engine's decision, not the recipe's

The recipe says *what resolution and projection to read the classes at*; whether that lands on the source's own
pixel boundaries is decided inside the graph, per evaluation:

    ee.Projection(ee.Algorithms.If(
        bandProjection.wkt().compareTo(configured.wkt()).eq(0)
            .and(bandProjection.nominalScale().subtract(scale).abs().lte(0.0001)),
        bandProjection,
        configured))

where `configured` is `ee.Projection(resolvedCrs).atScale(scale)`. When the configured grid names exactly the
band's own grid, the band's projection is used and the source's native alignment survives — `atScale` would
re-origin it at 0,0. Otherwise the configured projection is used and the source is resampled onto it.

Three constraints are not negotiable, and all three were established against live Earth Engine:

- **Equivalence is canonical `wkt()`.** `Projection.crs()` returns null for a WKT-defined projection (an
  EASE-Grid source reports NULL), and `Projection.transform()` has been observed returning a 263-character WKT
  string instead of six numbers. Neither can carry the comparison.
- **Scale agreement is an absolute 0.0001 m.** A displayed Scale is rounded to four decimals, so the worst
  observed disagreement between a band's own scale and the value a user was shown is 3.2e-6 m; 0.0001 m accepts
  that with a wide margin and still rejects 10.001 against 10.
- **The projection is taken after `select(band)`.** `Image.projection()` is a hard error on an image whose
  bands differ, not merely a wrong answer.

The decision costs no round trip: it is built into the graph, so no panel keystroke triggers a projection
lookup. What the recipe stores is the effective CRS and Scale - concrete configuration, whether the user typed
it or took what the source provides. What is never transported is an affine transform or the result of a
client-side projection discovery.

Candidates are **ordered**, and the first one that already is the configured grid wins. This matters where two
grids could both be right. A stratified proportion reduction runs at the coarser of the strata and the property
band, so with 30 m strata over a 10 m property the 30 m grid *is* the stratification lattice: offering the
strata first keeps it, while resampling onto a fresh origin-zero 30 m grid would cut every stratum boundary the
reduction groups by. So:

| consumer | candidates |
| --- | --- |
| area per stratum, final draw | selected stratification band |
| stratified proportions | selected stratification band, then property band |
| unstratified proportions | property band only |

Unstratified reductions run over a synthetic constant image whose degree-scale default is not a grid worth
snapping to, so it is never offered. Area and proportions pass the chosen projection as `reduceRegion`'s `crs`
and do **not** reproject — a live comparison showed the reduction alone already reproduces the exact native
result — while the final draw applies the single tree-wide `reproject`.

### Proportions Scale

Proportion estimation keeps its own Scale. Selecting a property band supplies the transient default: the
coarsest grid the answer can carry — the coarser of the Stratification Scale and that band's own resolution, or
the band's own resolution alone when there is no stratification, falling back to what a new recipe starts as. That is a cost/precision
policy for a rough estimate rather than an arithmetic necessity: reading the probability finer than the strata
it is grouped by buys detail the grouping immediately discards.

That default is what a blank field resolves to and displays; the user can overrule it, and Apply persists the
effective concrete Scale, whichever of the two it is. A stored Scale is never re-derived afterwards, which is why a Stratification Scale
change alone leaves calculated proportions standing while a Proportions Scale change invalidates them.

## How samples are drawn

The categorical image reaches both draws already masked and already pinned to the Stratification grid by
exactly one `reproject`, applied uniformly for asset and recipe sources. Neither candidate generator
reprojects again.

**Random** uses sparse rank-based sampling of equal-area cells, sized by the Stratification pixel size and
placed in the Arrangement CRS. Each eligible cell gets one deterministic rank, and only cells below a
per-stratum threshold materialise to a temporary candidate table. Thresholds control runtime only, never which
cells are selected. A short stratum is repaired by materialising an additional **disjoint** rank interval from
the same rank field. Selection takes the lowest requested ranks per stratum, with ties at the cutoff broken by
a deterministic secondary value keyed on the cell identity.

Unstratified Random draws directly from the AOI geometry — no grid, Scale, CRS or minimum distance — and
returns exactly the requested count, so it has no final-count validation stage.

**Systematic** places a globally anchored, nested lattice with a deterministic seed-based phase. Stratified
candidate generation represents the lattice as two parity projections whose pixel centres are the exact
lattice points, reads class and mask at those centres, vectorizes only accepted markers, and reconstructs
exact geometry from the carried indices. Unstratified Systematic is analytical: no raster, no Stratification
grid, and no twice-the-pixel-size spacing floor.

Allocation is validated twice, in the GUI before Retrieve is enabled and again at the task boundary before any
Earth Engine graph is built. Both apply the same rules, because a recipe can reach the task boundary without
passing through the GUI. If they drift apart, a design becomes exportable that the GUI would have refused.

A seed must be a whole number from 1 to 9007199254740991. That ceiling is not an Earth Engine limit — it is
the largest integer that survives JavaScript's Number type and JSON transport exactly, and a seed that does
not round-trip exactly does not reproduce a design.

## Why the implementation looks the way it does

Earth Engine cost depends on materialized extent and repeated reads, not just result size. Enumerating the
national-scale frame would require hundreds of millions of features. Per-candidate spatial reads and
neighborhood operations also proved expensive. The raster-lattice approach materializes accepted markers
rather than the full frame or a separate neighborhood per candidate.

Measure candidate generation and validation together before replacing it. Wall-clock completion on the
production graph is the useful gate; reported EECU from cancelled and successful runs is not comparable.

## The sampling frame at AOI edges

| Mode | Convention at an exact tie |
| --- | --- |
| Stratified Random | exclusive — boundary-coincident cell dropped |
| Stratified Systematic | exclusive — boundary-coincident lattice point dropped |
| Unstratified Systematic | inclusive — boundary-coincident point kept |

The difference follows a structural line rather than an arbitrary one. Raster-clipped frames are
centre-in-region because `reduceToVectors` decides membership before any filter runs; the analytical frame is
an intersects test because a spatial filter is its only test. Both raster conventions are asserted rather than
observed, so a change to either cannot silently re-diverge them.

Aligning the analytical path is **not** a symmetric follow-up. It is not a matter of removing padding — the
padding guarantees enumeration coverage near the bounding-box edge. It means replacing a spatial filter with a
strict containment test, a per-feature geometry operation materially more expensive.

## Constraints that are easy to break

Each was established by measurement, and each is cheap to break by accident.

- **Only `reproject` pins a subtree to a grid.** `setDefaultProjection` declares a projection without forcing
  evaluation on it, and produces the same result as no pinning at all. Measured in both directions: it is
  insufficient where a source grid exists, and equally insufficient where none does.
- **Exactly one `reproject` exists across the recipe**, on the categorical branch, and a test enforces that it
  is the only one.
- **Random's candidate graph shape is load-bearing for cost**, not style. A `reproject` on the rank field, a
  scale-baked projection passed as the CRS, a non-default `tileScale`, or any extra carried band each make the
  candidate export fail to complete at full scale. It must stay at exactly two bands and one reduced value.
- **Systematic raster indices must floor before converting to integer.** Converting alone truncates negative
  half-integer pixel-centre coordinates toward zero and assigns the wrong signed indices.
- **Membership is the class and mask at the exact lattice point**, never at a nearby marker or a serialized
  centroid. Identity is the stratum and the lattice indices, and the exact point is reconstructed before any
  feature-level check.
- **Temporary vector centroids stay in Earth Engine's default WGS84.** Centroids in a custom-WKT projection
  exceed the aggregation-result limit at full scale.
- **The Systematic origin phase derives from the Arrangement projection.** Taking it from the Stratification
  projection would translate the lattice whenever that grid changed. A Stratification source's own pixel
  origin is never the Arrangement origin.
- **The configured Stratification grid is a CRS and a metre Scale.** Native alignment is chosen inside the
  graph from the selected band's projection, so no affine transform is configured, persisted or transported.
- **No AOI buffer before Systematic vectorization.** The marker centre is the exact lattice point, so clipping
  already yields "exact point inside AOI".
- **`EPSG:6933` is rejected by Earth Engine as an identifier.** It resolves to tested WKT at the Earth Engine
  boundary only, and that WKT must never reach metadata, logs, CSV output or user-facing text.
- **Batch EECU does not reflect work done on the success path.** Successful exports report roughly 0.0003 to
  0.002 EECU-seconds per wall-clock second while cancelled ones report five orders more. Wall clock is the
  operative gate, and EECU cannot support cost comparisons between algorithms.

## Derived-result freshness

### Current invalidation

The recipe compares successive applied models while its tab is mounted and writes section-level `requiresUpdate`
flags together. An AOI edit invalidates stratified areas and propagates to proportions and allocation. Proportions
also track the stratification frame and stratum identities; manual proportions depend on identities rather than
weights. Allocation tracks the ordered strata, applicable weights, proportions and their readiness. Panels calculate
against their own candidate settings and Apply saves those settings with the result. Retrieve refuses applicable
sections marked `requiresUpdate`, alongside its allocation and grid checks.

Two in-memory caches hold successful raw area/probability responses for the recipe tab's lifetime, across panel
closure and tab switching. Access with a different AOI clears the cache's scope; form-derived keys distinguish
source references, selected bands, grids, mode and target class. Percentage interpretation, overall target and
weights are applied locally to raw probabilities, rather than making another Earth Engine calculation. Panel
request cancellation handles changed candidate inputs.

Those keys and flags do not establish persisted calculation provenance. No `calculatedFrom` sidecars or generic
derived resources are implemented, and no recipe revisions or asset replacement tokens are attached to the stored
results or these cache keys. Closing the tab drops the caches; reopening does not prove saved areas/probabilities
current when a referenced recipe or same-ID asset changed. General source-runtime freshness does not supply that
missing evidence for materialized results.

### Target: persisted calculation evidence

Sampling Design is the proposed first consumer of the
[generic persisted-result contract](../design/recipes/source-freshness.md#persisted-derived-result-evidence).
That contract owns operation-produced evidence, product fingerprints, comparison, sharing and superseded-response
rejection. The dependencies and propagation below belong to this recipe and are not current behavior.

| Calculation | Inputs |
| --- | --- |
| `SAMPLING_STRATUM_AREAS` | Resolved AOI geometry product; stratification image product and selected band; configured Stratification CRS and Scale; relevant product/calculation contracts. |
| `SAMPLING_STRATUM_PROBABILITIES` | Resolved AOI geometry; optional stratification product, band and applicable grid; categorical/probability product and selected band; mode, target class and Proportions Scale; relevant product/calculation contracts. |

The probability-only source is an operation-scoped dependency, not automatically an execution edge of the final
design. Anticipated proportions are not a third Earth Engine calculation: their local derivation reads raw
probabilities, percentage interpretation, the overall-proportion target and current stratum weights. Stale areas
or probabilities propagate to the dependent proportions and allocation; manual choices retain their own semantics.
Sampling Design owns these propagation rules, recalculation controls, messages and submission blocking.

AOI evidence follows its kind: canonical inline geometry; asset/table reference and geometry-affecting selection
with verified replacement evidence; a recipe's resolved AOI product and transitive dependencies; the concrete source
product for `ASSET_BOUNDS`; or immutable GeoID plus buffer. A GeoID is not polled for change, though lookup can fail.
The AOI product owner decides what affects geometry. Until its shared declaration agrees with execution, use
conservative whole persisted-source evidence, never a consumer-maintained field list. Unrelated source edits avoid
recalculation only where a migrated product provider establishes unchanged inputs.

Write evidence atomically with its result in section-level sidecars:

```
model.stratification.strataCalculatedFrom
model.proportions.probabilityPerStratumCalculatedFrom
```

Keep `strata`, `probabilityPerStratum` and `anticipatedProportions` in their existing ownership locations, with
owner-first joins and legacy joined-row compatibility. The generic result/evidence envelope does not wrap or
relocate these arrays.

On open and before submission, refresh dependency evidence and compare it under the shared contract. A dependency
edited while this recipe was closed must be detected without requiring both recipes open or a revision event stream.
A changed revision triggers product re-resolution; unchanged operation inputs preserve the expensive result.
Mismatches keep old values only as stale context and require recalculation. Legacy results without sidecars become
`UNKNOWN`, block submission like `STALE` and need one recalculation, potentially in batch, before their next submission.
This is a target migration consequence, not an existing restriction on saved designs.

Migrate areas first, then probabilities, replacing the existing calculation caches rather than keeping two
freshness implementations. Recipe revisions already exist; exact returned calculation evidence and the generic
resource integration remain unfinished. No interim timestamp or browser whole-model hashing scheme is planned.

## Verification

[Live EE probes](../../modules/gee/verify/README.md) cover grid shape, Random/Systematic exactness and
area-weighted proportions. They are hand-run, outside CI; rerun the relevant probes for grid changes.
Recording stubs cover job graph construction, projection selection and metadata evaluation count, not EE pixels.

Stratification/Proportions panel wiring lacks mounted integration coverage. Until covered, exercise a
non-default source CRS/scale, late metadata, cleared overrides, Apply/Cancel and reopened placeholders in the
browser. Pure helper tests do not establish that the panel uses their results correctly.

Deferred scope and unresolved experiments are tracked in the [workplan](../design/workplan.md#sampling-design-deferred-scope).

## Working with Earth Engine here

- Preserve edge-case fixtures, including AOI-boundary ties; changing a fixture to avoid a failure loses evidence.
- Measure the exact composed graph and configuration that will ship against an independent oracle.
- Bound graph work before submission. Poll-based cost guards can overshoot between polls.
- Set automatic retries to zero for probes; investigate the first unexpected semantic failure before rerunning.
- Compare canonical WKT and the measured display-rounding tolerance. Nominal-scale heuristics do not establish
  projection identity; keep uncertain values visible rather than inventing another threshold.
