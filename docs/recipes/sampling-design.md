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
  stratum areas are calculated, and how anticipated proportions are grouped. It owns a CRS plus one grid
  definition — a Scale, or an affine transform. Its CRS is whatever the source uses, and is not restricted to
  the equal-area list.
- The **Arrangement grid** decides where samples are placed. It owns a CRS only, from a curated equal-area
  list, and Random cells, Systematic lattice coordinates and sample identity all live on it.

A grid that does not apply to a mode is **absent** rather than defaulted, so a dormant saved value can never
reach the draw. Only stratified designs have a Stratification grid; unstratified Random has no grid at all and
draws directly from the AOI geometry.

Stratum areas are computed in true square metres, so they stay correct whatever grid is used. The Arrangement
grid must be equal-area for a different reason: it is what gives every eligible location the same chance of
selection.

### Deriving the Stratification grid

The grid comes from the source rather than a default, under one rule with no branch on source type: **derive
when the resolved image has a real projection, use the default when it does not.**

A single image asset reports a real grid. An image collection derives from its **first member**, because the mosaic it
would otherwise resolve to has no projection at all. That is exact rather than merely better for a SEPAL-tiled
export: tiles are written under one configured grid, so members share a lattice and reading the mosaic at the
first member's transform reproduces every tile. A recipe
composites, so it reports Earth Engine's identity transform and falls through to the default.

The axis-alignment check is the whole guard: the identity transform has a positive north-south coefficient and
fails on sign, so no magnitude threshold is involved. Derivation reads the **selected band's** grid, since one
asset can carry several — Sentinel-2 bands are 10, 20 and 60 m on a single image.

A derived grid carries its pixel size in metres alongside the transform. A transform is expressed in its CRS's
units, and since `EPSG:4326` is SEPAL's default export CRS, degrees are the common case — a 10 m grid then has
a transform width of about 9e-5, not 10. The arrangement cell size and the minimum-distance floor are metre
quantities and read the metre value; the transform stays exact and defines the grid.

Scale is an **override**, not the definition. An entered Scale replaces the transform only when the two
disagree, tested as exact equality with both sides put through the same rounding, and the resulting mode is
shown on screen. Typing the value the placeholder displays must not silently degrade the image's own grid.

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
  projection would translate the lattice whenever that grid changed. A Stratification transform's origin is
  never the Arrangement origin.
- **A resolved Stratification grid carries a Scale or a transform, never both.** One definition is emitted at
  the boundary, so the tolerant reader and the strict validator downstream can never disagree.
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

- Importing a gee job module runs its worker plumbing and exits the process, so a job cannot be imported in a
  test. Pure logic has to be extracted from a job to be testable at all.
- The Stratification panel's wiring is untested because mounting a recipe form panel needs Redux and recipe
  context that the existing widget tests never required. The obstacle is panel mounting, not missing tooling.

## Deliberately not done

- **Letting recipes declare their own source grid.** Where a recipe has exactly one unambiguous source grid it
  could declare it, without forcing evaluation and therefore at no cost. Sampling Design would need no change,
  since the grid already derives from the resolved image's projection. Two assumptions to measure first: a
  single-asset classification may already propagate the projection, since per-pixel operations preserve it and
  only compositing loses it; and it is unconfirmed whether a declared projection surfaces in the band metadata
  the GUI reads.
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
  signal or leave the value visible and let a person judge.
