# Sampling Design — developer notes

Technical notes for working on the Sampling Design recipe: the invariants, the reasoning behind them, and the
mistakes that are cheap to make. The user-facing guide lives in the separate `sepal-doc` repository.

These notes deliberately avoid naming files and functions, so that refactoring does not silently invalidate
them. Earth Engine API names are kept, because several constraints are precisely about how those behave.

## Orientation

The recipe spans the GUI, the task module, the gee module and both shared libraries — look for
`samplingDesign` directories in each. Nothing owns it end to end.

The Earth Engine library has no test runner of its own; its tests live in the modules that consume it. Run
tests through the `sepal` CLI from the dev-env container: a raw `jest` invocation falsely fails every suite
that imports the Earth Engine wrapper.

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

Both draws look over-engineered until you try the obvious thing. Finding a Systematic lattice that completes at
national scale took many attempts, and the failures share a pattern: **what makes a graph fail here is
materialised work, not output size.** Every rejected approach produced a small result and died producing it.
Cost tracks the extent a computation must be realised over, and the number of separate places it must be
realised — not the number of rows that come out.

Some examples. Enumerating the frame as points needed about 722 million features before anything could be
exported. An overlap-and-dilation hybrid was cancelled after 53 minutes and 128,904 batch EECU-seconds. Reading
the class at a thousand scattered points cost 18,701 EECU-seconds in 40 seconds and was still climbing when it
was stopped — while the same reads bounded to small areas cost a fraction of that. And `Image.displace` failed
on semantics rather than cost: zero displacement changed both class and mask.

The accepted approach completes in about 13 minutes and 1.59 EECU-seconds — roughly five orders of magnitude
below the most expensive rejected attempt at the same task. It works because representing
the lattice as raster projections whose pixel centres are the sample locations means Earth Engine only ever
materialises accepted markers: never the frame, never a neighbourhood around each candidate, never a separate
read per point.

So before simplifying something here, check whether the simplification is one of these. A common trap is an
approach that nominates candidates cheaply and verifies them expensively — the two costs have to be judged
together, not separately.

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

## Verification

A directory of verification scripts sits alongside the gee module's source, outside the test suites, because
Earth Engine projections cannot be constructed in Jest and the scripts need live credentials. Its own README
describes what each covers and how to run them.

They are **evidence, not regression protection** — nothing runs them automatically. Any change to grid
handling should re-run all of them before it is considered done.

Two structural obstacles explain the shape of the coverage:

- A gee job module runs its worker plumbing on import, so reaching a job's graph means mocking `#gee/jobs/job`
  (and `#sepal/ee/ee`) with recording stubs and asserting the structure the worker BUILDS. That is how the
  projection rule, its three consumers and the `/assetMetadata` evaluation count are covered.
- The Stratification and Proportions panel wiring is untested, because mounting a recipe form panel needs Redux
  and recipe context that the existing widget tests never required. The obstacle is panel mounting, not missing
  tooling: `widget/form/form.test.jsx` mounts a form-wrapped component with only the Redux HOC stubbed.
  **This is where the defects actually land.** Four have reached a reviewer from this one component: a derived
  CRS that was never adopted, one that was adopted and then read back stale, a flex value constraining the wrong
  axis, and two placeholders reading keys the object did not have. Every pure function was correct every time,
  and every suite was green every time.

  It was first recorded as tolerable because the failures degrade silently rather than breaking loudly. That
  reasoning is backwards: silent degradation is precisely why they survived every automated gate and were found
  by eye. The gap is not a coverage nicety.

  Until it is closed, the mitigation that has actually worked is moving decisions out of the panel into pure
  functions — each one shrinks the untestable surface — and having a person exercise the panel against a source
  that is not the default before shipping grid changes.

## Deliberately not done

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

## Working with Earth Engine here

Learned on this recipe, but none of it is specific to it.

- **A failing fixture is carrying information.** Adjusting a fixture until it passes discards the finding, and
  the suite stays green either way, so it leaves no trace. It happened here: a fixture failed on an AOI-edge
  tie, an offset removed the tie, and a real behaviour became a recorded observation instead of an assertion.
  The tell is that "removing a tie" and "removing a finding" describe the same edit, and the first phrasing is
  what makes it feel safe.
- **A poll-based cost guard bounds damage but cannot prevent overshoot.** In one withdrawn run EECU grew
  roughly 3700 times in 30 seconds. Size a graph before submitting it; the guard is a backstop, not the control.
- **Validate the shape that will ship.** A measurement taken on a different composition certifies a graph
  nobody runs.
- **Finite acceptance must include the configuration production actually runs**, not a neighbouring one, and
  must compare against an independently derived oracle.
- Set Earth Engine automatic retries to zero. Stop after the first unexpected semantic failure and understand
  the failed graph and oracle before submitting a corrected variant.
- **Heuristic thresholds failed here four times.** None could separate the good case from the bad one:
  detecting a "real" projection by nominal scale, comparing raw floats for equality, a resolution sanity bound,
  and a coarseness bound on derived grids. When a threshold cannot distinguish them, either measure the real
  signal or leave the value visible and let a person judge. What replaced them is not a fifth threshold: the
  comparison is exact canonical WKT, and the one remaining tolerance is the display rounding it has to undo,
  measured against the real asset rather than guessed.
