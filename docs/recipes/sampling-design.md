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

### Stratum areas and the stratum frame

The stratum frame is which pixels belong to which stratum: the stratification product and its selected band, where
stratified; the AOI, with whatever recipe or table it references; and the Stratification CRS
(`lib/js/shared/src/recipe/samplingDesign/stratumFrame.js`). A design stating no Stratification CRS is read in
`EPSG:6933`, the CRS its probabilities are calculated in; areas are not calculated without one. Areas read the frame
at their Scale under the reduction contract; automatic proportions compose it with their probability source. Equal
stratum totals or weights never establish that two frames group the same pixels.

`areaPerStratum` asked for evidence answers `{groups, calculatedFrom}`. The evidence is what that request read: the
frame's closure through its `RecipeScope`, each recipe projected by its own type (the whole persisted model where a
type declares no `dependencyProjection`), and each asset's `updateTime`, read before the calculation and again before
it answers - a token that moved refuses the answer (`modules/gee/src/jobs/dependencyEvidence.js`). Callers that do not
ask keep the bare response. Apply saves `stratification.strataCalculatedFrom` with `strata`.

Results are compared by the shared rule (`lib/js/shared/src/recipe/calculation/freshness.js`), by the meaning of what
was read rather than its provenance: a different question is `STALE`; the same digests are `CURRENT` at whatever
revisions, so a title-only revision changes nothing and proportions calculated at a newer revision match older areas;
another digest or token is `STALE`; no evidence is `UNKNOWN`; a source without a token (a Cloud GeoTIFF, an asset
without `updateTime`) is `UNVERSIONED`, which only selecting another source repairs. `CURRENT` means no change was
observed: a token does not pin the pixels Earth Engine reads.

### Automatic proportions and the probability source

The calculated result is the raw probability per stratum, `SAMPLING_STRATUM_PROBABILITIES`
(`lib/js/shared/src/recipe/samplingDesign/stratumProbabilities.js`); anticipated proportions are derived from it, the
percentage interpretation, the overall-proportion override and current weights, none of which the reduction reads.
Apply saves `proportions.probabilityPerStratumCalculatedFrom` with the raw probabilities, in the shape the areas use:

    {resource: {id: 'SAMPLING_STRATUM_PROBABILITIES', contractVersion},
     question: {mode, targetClass, scale},
     dependencies: {SAMPLING_STRATUM_FRAME: <frame evidence>,
                    SAMPLING_PROBABILITY_SOURCE: <probability source evidence>}}

The frame is composed unchanged, so a stratified answer is taken only over the frame the current areas were calculated
from. The probability source is the categorical or probability product and its selected band, `{reference, band}`;
its question is null where proportions are manual or skipped, or no product and band are selected, and nothing is read
for it then. Its producer closes over a synthetic root whose only direct source is that product; execution never reads
it, so it stays a display source of the type. The result's question is the mode (`PROBABILITY` where unset), the target
class as a number in `CATEGORICAL` mode only, and the Proportions Scale; the contract version covers the reduction
(`weightedAreaSums.js`, `areaWeightedProportions.js` and the grid candidates above). Online/Batch and presentation are
in neither question. The request is built from both dependency questions, so the operation is asked what its evidence
records, and nothing is asked for a selection neither reads, such as a source type no declaration recognises.

`probabilityPerStratum` asked for evidence reads both dependencies through its `RecipeScope` before it calculates,
reads again every asset either names once it has answered, and refuses an answer whose tokens moved; an asset both
dependencies read is checked against what each observed, so one replaced between their reads is refused. It answers
`{probabilityPerStratum, calculatedFrom, stratumFrameEvidence}`, the last the frame evidence in `calculatedFrom` again,
which clients of the previous release take an answer by. `/dependencyEvidence` answers the probability source through
the same producer table.

One shared rule (`proportionsFreshness`) judges automatic proportions against the current evidence of both
dependencies, for the requirements, the panel's status and the task's admission alike: `CURRENT` where proportions are
manual, skipped or not calculated. A probability source without a token is `UNVERSIONED`, and one that cannot be read
starts nothing and holds Retrieve, as for the frame; selecting another source, or Manual, which keeps the anticipated
values as answers, repairs it. Whether the rows still cover the strata is a pure rule of their own
(`proportionsCoverStrata`, `designModel.js`): rows for strata the design no longer has - recalculated areas over an
unchanged frame, a new Stratification Scale - are calculated again as Proportions opens.

Proportions saved with only `stratumFrameEvidence`, or with no evidence, are `UNKNOWN`: their values stay shown and
applicable, the section is unfinished, Retrieve and a new task hold them, and opening Proportions calculates them once
over usable evidence. A saved `stratumFrameEvidence`, null included, marks proportions a client of the previous release
calculated, and keeps them `UNKNOWN` beside full evidence too: that client's Apply carries fields it does not declare
through unchanged, and writes `stratumFrameEvidence` whether or not it holds any, so evidence a newer client recorded
can sit beside values it did not produce. The Proportions panel removes the property when it records or clears the
probabilities, never on load or another Apply, and never saves the response's frame alias.

### The source runtime and the panels

While a design is open the source runtime keeps the current evidence of the dependencies its type declares - the
frame, and the probability source where automatic proportions select one (`sourceRuntime/calculationEvidence.js`) -
acquired from `POST /api/gee/dependencyEvidence` and published runtime-only on the recipe; a dependency whose question
is null is not read, and what was published for it is withdrawn. The assets held evidence names are claimed for
polling. Reads and calculations are shared only under the same credentials, compared by identity. What an answer
reports it read is the session's to know: a revision storage held advances the recipe listing, or is kept as observed
for a recipe it does not list (`recipeListing.js`), which every runtime answer is judged against (`recordCurrency.js`);
a token other than the one the session read before the request began is held as a known asset change until the
session reads the asset again - so a later answer reporting what is older never overrides newer evidence. Evidence is
judged by the same rules as every other runtime answer (`sourceRuntime/evidenceStanding.js`): its credentials, its age,
and a ledger of what it read with the listing and recipe and asset refresh counts taken when it was asked. Other
credentials, a newer revision, a recipe no longer listed, another asset token or an explicit Refresh - one made while it
ran included - withdraw it to be read again. A recipe it read open as a draft storage does not hold
(`draftAgreement.js`), or an asset without current authority - not yet checked, its check lapsed or failing, or a known
mutation still settling - holds it back without reading storage. It is read again before Retrieve's five-minute
authority lapses, and whoever reads what is published judges its age as it reads, at submission too.

The panels calculate through one shared binding (`recipe/calculatedResult.js`) the type declares
(`calculatedResults`, `calculations.js`): each result names its panel, the dependencies it reads, how its question is
built from the edited model, whether the model holds a result, its Online/Batch mode, the operation it is held to and
how an answer must fit the applied design - probabilities only over the frame the areas were calculated from; the
binding takes the edited model as the panel's section of the design, and an answer's evidence from the calculation it
records. The panel supplies only what it makes of an answer. While a panel is open the binding calculates what the edit requires, in the mode chosen beside the
result: as the panel opens and as it is edited, once the question can be asked and the evidence of every dependency it
reads is usable, where the edit holds no result, one answering another question, or one `STALE` or saved without
evidence (`UNKNOWN`). The evidence itself is judged, not the result's state - empty proportions report `CURRENT` - so
evidence still being read, unreadable, expired or read from a source without a token starts nothing, and the panel
says so in place of a result it has not calculated. A current result is reused, and elapsed time only reads its
evidence again; manual proportions are never calculated. Each question is asked once in each mode for each state of
the edit: a failure or a superseded answer is not asked again as evidence is read again, only on an edit, another
mode, or the panel's Retry. Calculated results are drafts: Apply takes them, Cancel leaves the saved design as it was,
and Apply waits while one is being calculated. The binding shares the calculation through the runtime, cancels it once
the edit asks something else, refuses an answer superseded or read from a disagreeing draft (`SOURCE_BASIS_CHANGED`),
and keeps the evidence of the edited questions current, so a draft calculated for another CRS or source stays
applicable through a revision that leaves what it read meaning the same. The Proportions calculation waits on the
declared `STRATUM_PROBABILITIES` gate while a stratified design's areas are not current - asking nothing, and asking
once they are. Recalculated strata keep their labels and colours; strata of a newly selected source or band take its
legend first.

The panels say how the result shown stands beside it, as the result's own feedback (`editedResultFeedback`): not
current, not confirmed, still being checked, or waiting on the areas. While it is calculated, a short status beside the
spinner says so. Recalculation after input changes uses one line; legacy results retain an explanation directly
beneath the status text, indented past the spinner (`panels/calculationProgress.jsx`). Through the binding, the form
panel judges what is edited against what it configures, whatever the applied design says: Apply, Enter and a set-up
wizard's Next refuse areas or automatic proportions established `STALE`, or whose currency cannot be established yet,
so a fresh calculation repairs a stale design while a draft overtaken by a change is not applied. `UNKNOWN` and
`UNVERSIONED` results can still be applied.

### Sections, Retrieve and the task

The sections are declared as Sampling Design's requirements (`freshnessRequirements.js`), and the toolbar marks them
through the shared section presentation (`sectionButton.jsx`, `selectedSourceStatus.js`): amber for unfinished setup -
nothing set up yet, a result saved without evidence that opening its panel calculates once, or an allocation without a
trustworthy review record - and red for a result established stale, a source that cannot report replacement, rows no
longer covering the strata, or an allocation whose inputs changed since it was reviewed. Each finding waits on what it
reads: Proportions on the areas, and the allocation on the areas and the
proportions - its counts or the uncertainty it shows read them, whatever the strategy and with manual counts too -
unless proportions are skipped, which leaves nothing to wait on. A waiting section is neutral, with its ordinary
tooltip, and says nothing of its own until what it waits on is sound; findings that do not depend on it stay marked.
So a change to the probability source alone marks Proportions while Stratification stays current and the allocation
waits. An incomplete design can be saved between steps; Retrieve (`SAMPLES`) waits, is unavailable, is out of date or
is refused through the shared requirement gates and its own checks (`validateRetrieve.js`). Calculation evidence and
the allocation's review record are kept out of the samples' `recipe_*` properties.

A task's first stage judges the areas and the proportions from what its own request reads, with the same rules,
before exporting anything (`modules/gee/src/jobs/task/samplingDesign/freshnessGate.js`): changed inputs, sources that
cannot report replacement and designs submitted without evidence are refused, frame-only proportions with the remedy to
reload and recalculate - and the allocation by the shared review contract: one without a record, beside an earlier
version's flag or reviewed for other inputs is refused with the remedy to review and apply Sample Allocation. The
payload's own allocation rows, counts as numbers, read as reviewed exactly as the design's do. Every later stage but the final one reads the AOI or the stratification again, never the
probability source, and samples the allocation fixed in the submission, so it judges the frame alone - the areas', and
the one the proportions were admitted with: a probability-only change after admission lets the task complete, while a
frame change refuses its next stage. A task admitted with frame-only proportions is judged by that frame evidence, and
one admitted without a review record samples on.

### Manual proportions and the sample allocation

Neither is calculated by Earth Engine, and neither carries evidence: each is judged by what it reads now. Whether
proportions are skipped at all is one shared rule (`lib/js/shared/src/recipe/samplingDesign/proportionsSkip.js`) for the
allocation and its review, the panels, the section marks, Retrieve and the task: `true` or a set toggle skips them,
`false`, an empty toggle or absence leaves them applicable, and Manual is independent of it.

The automatic-allocation Target keeps the Error/Samples choices visible. With proportions skipped, Samples is selected
and Error is disabled.

Manual proportions are answers by stratum. They are settled while their rows are keyed by exactly the design's strata,
in any order, every one answered (`freshnessRequirements.js`): rows for strata the design no longer has mark Proportions
red, unanswered ones amber. The Proportions panel reconciles them in its draft as it opens, or as Manual is chosen
(`reconcileManualProportions`, `designModel.js`): an answer follows its stratum, a vanished stratum leaves, and a new
one arrives unanswered. The requirement names the panel its editor, so the draft is judged by it too
(`recipe/localCandidate.js`): Apply, Enter and Next refuse answers for other strata than the design's as it stands,
while unanswered rows are their own fields' to require. Manual is read as the form's toggle or as the boolean an
earlier version saved. A `requiresUpdate` an earlier version's planner wrote keeps manual answers marked until they are
applied: the panel drops it from its draft as it opens, Apply saves the answers without it, and Cancel leaves it.

The sample allocation - its counts, the total they add up to and the uncertainty shown with them - is derived locally
from the strata, the proportions and the allocation settings (`allocationOutcome.js`), and is approved by applying it.
The Allocation panel derives it in its draft through a shared binding the type declares (`derivedResults`,
`derivations.js`, `recipe/derivedResult.js`) whenever the design's inputs, as the edit would leave them, are not those
it was reviewed for: as the panel opens, as it is edited, and as what it reads changes under it. Settings a recipe
saved before they existed, and a strategy it cannot run, are resolved to a new recipe's defaults as the draft is built
(`defaultModel.js`), before anything is derived from it. Each derivation captures beside the outcome the inputs it
read (`sampleAllocation.reviewedInputs`, `lib/js/shared/src/recipe/samplingDesign/allocationReview.js`): the strata in
order, their weights and proportions wherever the counts or the uncertainty read them, the effective settings and the
active target, and manual counts wherever they determine the uncertainty - canonical ordinary values, without labels,
colours, revisions or evidence.
Apply saves both in one action. Apply, Enter and Next refuse a draft whose record no longer reads as the design does,
and show it derived anew; a record is never stamped on an older outcome. Manual counts are never recalculated: they
follow their strata, and only the uncertainty is derived from them. Nothing is acquired, polled or cached.

An allocation stands reviewed while its record reads as the design does now, so an edit changed back restores it. It is
marked red once what it reads changed since (`INPUTS_CHANGED`), and amber where it has no trustworthy record: saved
before allocations recorded one (`UNREVIEWED`), or beside the `requiresUpdate` an earlier version wrote, false included
(`UNTRUSTED`) - that version kept unknown fields while it replaced the counts. Such an allocation keeps its saved values
until it is reviewed once and applied, which removes the flag. An arrangement an earlier version flagged stays marked
until its panel applies it.

## Verification

[Live EE probes](../../modules/gee/verify/README.md) cover grid shape, Random/Systematic exactness and
area-weighted proportions. They are hand-run, outside CI; rerun the relevant probes for grid changes.
Recording stubs cover job graph construction, projection selection and metadata evaluation count, not EE pixels.

Mounted Stratification/Proportions tests exercise the real panels, forms, requirements, store and source runtime with
substituted Earth Engine reads. They cover automatic calculation, dependency evidence of the frame and the probability
source, direct and transitive source changes with a design open or closed, legacy results, edited grids, prerequisite
ordering, manual reconciliation and Apply/Cancel. Mounted Allocation tests compare the derived draft with
`allocationOutcome`, and cover legacy records, earlier versions' flags, edits, and inputs changing under a submission.

User-confirmed browser checks against real Earth Engine cover changes to stratification and probability recipes,
reopening, recipe title changes without recalculation, automatic recalculation, the STR → PRO → ALO repair order, manual
and skipped proportions, allocation review, clean reopening, Apply/Cancel, the Target controls and successful Retrieve
to the SEPAL workspace. Race handling, same-id asset replacement and task-stage guards have automated coverage; live
asset replacement and changes during a running task remain separate verification work.

Deferred scope and unresolved experiments are tracked in the [workplan](../design/workplan.md#sampling-design-deferred-scope).

## Working with Earth Engine here

- Preserve edge-case fixtures, including AOI-boundary ties; changing a fixture to avoid a failure loses evidence.
- Measure the exact composed graph and configuration that will ship against an independent oracle.
- Bound graph work before submission. Poll-based cost guards can overshoot between polls.
- Set automatic retries to zero for probes; investigate the first unexpected semantic failure before rerunning.
- Compare canonical WKT and the measured display-rounding tolerance. Nominal-scale heuristics do not establish
  projection identity; keep uncertain values visible rather than inventing another threshold.
