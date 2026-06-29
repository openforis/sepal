# Sampling Design GUI — Review, Bugs & Cleanup Proposals

Status: analysis only (no code changed). Captured 2026-06-26 after merging `origin/master` into `sampling`.
Scope: `modules/gui/src/app/home/body/process/recipe/samplingDesign/**` plus the shared widgets it
introduced/uses (`widget/form/nestedForms.jsx`, `widget/form/colorInput.jsx`, `widget/recipeInput.jsx`),
cross-checked against `modules/task/src/taskRunner.js` and the backend export tasks.

The feature is ~4,000 lines of GUI and is clearly WIP (commit tip "Sampling WIP."). Findings below are grouped
by theme; each has file:line evidence and a proposal. IDs are stable so we can reference them.

---

## 0. Priority summary

**Blockers (feature is broken end-to-end):**
- **BUG-1** Retrieve operation name mismatch — every export fails.
- **BUG-2** `<Sync/>` never selects samples — the core GUI→backend trigger is a `console.log` stub.
- **BUG-3** `seed` validation broken (wrong call signature + inverted `.skip`) — sampleArrangement opens invalid / submits `NaN` seed.

**Real bugs (silent data corruption / crashes):**
- **BUG-4** stratification `swap()` overwrites the whole strata list (matches on a non-existent `id`).
- **BUG-5** Uniqueness constraints (`colorUnique`/`labelUnique`) never fire — duplicates allowed.
- **BUG-6** `bands.lenght` typo (two panels) — single-band auto-select is dead.
- **BUG-7** `_.maxBy([])...` and `strata.find(...).weight` crash on empty/divergent EE results (proportions).
- **BUG-8** POWER/OPTIMAL allocation divides by zero → `NaN` sample sizes; relative MOE ÷0 → Infinity.
- **BUG-9** Absolute margin-of-error shows the relative value (object-vs-`.value` test).
- **BUG-10** `numeric.js` has a broken import (`boundsToMarginOfError` not exported) + a failing/aspirational test.

**Central design problems (the "streaming" the user wants to fix):**
- **DF-1** Recompute is *mount-triggered*: stale derived data is consumed downstream if you skip a panel.
- **DF-2** `requiresUpdate` invalidation is non-transitive and stored in two places inconsistently.
- **DF-3** `nestedForms` bidirectional entity↔form sync via `componentDidUpdate` + `setImmediate` is fragile.
- **DF-4** Validation has no home (literal TODO in `sync.jsx`); cross-panel invariants aren't checked.

**Biggest cleanup win:** `stratification.jsx` and `proportions.jsx` are ~70–80% duplicated; the three
table/form panels share one pattern; a dead `TimeSeriesImageLayer` copy and mosaic/timeSeries cruft can go.

---

## 1. Blocker bugs

### BUG-1 — Retrieve operation name doesn't match any registered task
`samplingDesignRecipe.js:33`
```js
const operation = `samplingDesign.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`
```
The task runner only registers (`modules/task/src/taskRunner.js:26-27`):
```js
'samplingDesign.GEE':   () => require('./tasks/samplingDesign/samplesAssetExport.js'),
'samplingDesign.SEPAL': () => require('./tasks/samplingDesign/samplesSepalExport.js'),
```
`taskRunner.getTask` throws `Doesn't exist: samplingDesign.asset_export`. Both GEE and SEPAL retrieves fail.
GUI `destination` values are already `'GEE'`/`'SEPAL'` (`retrieve.jsx:103-109`).
**Proposal:** ``const operation = `samplingDesign.${destination}` `` (with a guard that destination ∈ {GEE,SEPAL}).

### BUG-2 — Samples are never selected from the GUI
`sync.jsx:78-80`
```js
selectSamples() {
    console.log('selecting samples')
}
```
`isCompleteModel()` can be true, but `selectSamples()` is a no-op and `model.selectedSamples` is only ever
*deleted* (`sync.jsx:104-108`), never set. So the recipe map never shows samples; selection happens only inside
the export task. **Proposal:** decide the contract — either the GUI issues a `sample`/`selectSamples` request
(there are `/samplingDesign/sample` + `estimateProbability` routes, both currently pointing at the WIP
`batch/table.js` scratch job), or selection is explicitly deferred to export and the stub + map expectations
are removed. This is the heart of the unfinished "streaming".

### BUG-3 — `seed` validation is broken (wrong args + inverted skip)
`sampleArrangement.jsx:34-37, 227-228`
```js
seed: new Form.Field()
    .skip((_seed, {arrangementStrategy, sampleSizeStrategy}) => includeSeed(arrangementStrategy, sampleSizeStrategy))
    .notBlank().int(),
const includeSeed = ({arrangementStrategy, sampleSizeStrategy}) =>
    arrangementStrategy === 'RANDOM' || sampleSizeStrategy === 'EXACT'
```
Two compounding defects: (a) `includeSeed` expects one object but is called positionally → destructures a
string → always `false`; (b) even fixed, passing `includeSeed` (true when seed *matters*) to `.skip()` is
inverted — `.skip` skips when truthy. Net: `notBlank().int()` always enforced, and `seed` is never defaulted
in `componentDidMount` → panel opens invalid; `valuesToModel` does `parseInt(undefined)` → `NaN` seed.
The `disabled=` wiring at `:206` calls `includeSeed({...})` correctly, showing the intended signature.
**Proposal:** one helper, and `.skip((_v, values) => !includeSeed(values))`; default `seed` on mount (intended default is `1`, per `:216`).

---

## 2. The data-flow / "streaming" design (DF)

This is the area the user most wants to improve. Today the mechanism is:
- Each panel reads upstream model slices via `mapRecipeToProps` and writes its derived output slice to the model.
- A null-rendering `<Sync/>` (`sync.jsx`) watches all slices in `componentDidUpdate` and, on any change:
  deletes `model.selectedSamples`, then cascades a `requiresUpdate` flag to the *immediate* dependent
  (`DEPENDENCIES = {aoi→stratification, stratification→proportions, proportions→sampleAllocation}`).
- Each dependent panel recomputes its derived data in its own `componentDidMount` *if* `requiresUpdate` is set.

### DF-1 — Recompute is mount-triggered → stale data consumed downstream
Panels recompute only when opened. Editing stratification and going straight to sampleAllocation (skipping
proportions) leaves `anticipatedProportions` stale, and it is consumed anyway (`sampleAllocation.jsx:28`).
Also each panel's own `componentDidUpdate` dep-list excludes upstream slices:
- `proportions` `proportionsDeps` omits `strata` (`proportions.jsx:702-706`) → `probabilitiesToProportions`
  joins new strata to stale `probabilityPerStratum`, silently yielding `proportion: 0`.
- `sampleAllocation` `allocateDeps` omits `anticipatedProportions` and `strata` (`sampleAllocation.jsx:432-436`)
  → allocation keeps stale weights when upstream changes while the panel is open.
**Proposal:** make derived data recompute when its inputs change regardless of which panel is mounted (finish
`<Sync/>` as the single orchestrator), and/or include upstream slices in each panel's dep-list.

### DF-2 — `requiresUpdate` invalidation is non-transitive and double-stored
- Non-transitive: changing `aoi` flags only `stratification`; downstream `proportions`/`sampleAllocation`
  stay "valid" on top of invalidated upstream (`sync.jsx:89-102`).
- `sampleArrangement` is watched but has no `DEPENDENCIES` entry and nothing sets its `requiresUpdate`, so its
  toolbar error indicator (`samplingDesignToolbar.jsx:28,90`) can never light up. Likely missing
  `sampleAllocation → sampleArrangement`.
- Dual storage: the flag lives in `model.<slice>.requiresUpdate` (set by `sync.jsx:95`) but stratification
  also declares a `requiresUpdate` *form field* that `valuesToModel`/`modelToValues` don't even map
  (`stratification.jsx:33,37,569-601`); proportions reads it from the form input (`proportions.jsx:415`)
  while stratification reads it from the model prop (`stratification.jsx:350-364`). Inconsistent and bug-prone.
**Proposal:** single source of truth (model only); compute transitive staleness from the dependency graph.

### DF-3 — `nestedForms` bidirectional sync is fragile
`widget/form/nestedForms.jsx` keeps each row's form inputs and the parent array in sync via
`componentDidUpdate` + deep-equals, and reads validity on the next tick:
```js
setImmediate(() => {                                   // :108
    const errors = Object.values(this.props.form.errors).filter(error => error)
    onErrorChange(entity, hasError ? errors[0] : '')
})
```
Issues: `setImmediate` is **not a browser standard** (relies on a Vite/polyfill shim — runtime risk);
the timing hack to read `form.errors` is brittle; `arrayInput.onChange(...)` is registered in
`componentDidMount` with **no unsubscribe** (`:80-81`); `updateInputs`/`inputsToEntity` only sync fields that
already exist on the entity (`:120,128`), so new fields silently don't propagate; only `errors[0]` is reported;
the HOC is still named `WithSomethingHOC` (`:67`). All three table panels inherit this.
**Proposal:** make the array input the single source of truth and render rows as controlled inputs; aggregate
row validity explicitly (not via `setImmediate`); add unmount cleanup; replace `setImmediate` with a
microtask/`requestAnimationFrame` or restructure so it isn't needed.

### DF-4 — Validation has no home
`sync.jsx:17` literally asks "Deal with validation here? Or where should it be done?" Cross-panel invariants
(strata ids consistent across proportions/allocation, proportions sum ≤ 100%, allocation totals) are not
checked anywhere central. **Proposal:** a single `validate(model)` (or per-slice validators composed at the
recipe level) producing the per-section validity the toolbar already wants to show, replacing ad-hoc
`requiresUpdate` + scattered field constraints for *cross-panel* checks.

### Suggested direction (for discussion)
Two coherent end-states:
- **(A) Eager orchestration** — finish `<Sync/>` as the one place that, on an upstream change, transitively
  invalidates and *recomputes* downstream slices and (when complete+valid) triggers sample selection. Panels
  become pure editors of their own slice.
- **(B) Derived selectors** — stop persisting recomputable derived data; compute each panel's inputs from
  upstream via selectors, persist only genuine user input. Staleness largely disappears (single source of truth).
Either way: centralize validation (DF-4), make the array/table widget unidirectional (DF-3), and remove the
mount-triggered recompute (DF-1).

---

## 3. Validation bugs (per panel)

### Stratification
- **BUG-4** `swap()` matches on `id` which strata entries don't have (`strataTable.jsx:57-69`; entries are
  `{value,label,color,area,weight}`, built `stratification.jsx:484-493`). `find(({id}) => id === entry.id)` is
  `undefined===undefined` → first iteration matches every row → whole list overwritten with copies of
  `stratum1`. **Fix:** match on `value`.
- **BUG-5** `colorUnique`/`labelUnique` never fire (`stratumForm.jsx:15,32-43`): the constraint reads a `strata`
  field that `withNestedForm` never populates, so `isUnique` hits the `!strata` short-circuit and returns true.
  Duplicate colors/labels pass. `renderColorPicker` also computes `otherColors` manually but the invalid flag
  never trips. **Fix:** compute uniqueness against the real array (prop), or lift to the table.
- **VAL-S1** empty-strata uses the **band** error key (`stratification.jsx:56-58`
  `.notEmpty('...form.band.required')`). **Fix:** dedicated `...form.strata.required`.
- **VAL-S2** `scale` only `.notBlank()` — accepts 0/negative/fractional, later `parseInt` as EE pixel scale
  (`stratification.jsx:52-54,526`). **Fix:** `.number().min(1).int()` like sampleAllocation.
- **VAL-S3** async race: `strata.set(null)` + async `calculateAreaPerStratum` with no "loading ⇒ blocking"
  guard; apply isn't blocked during the in-flight `AREA_PER_STRATUM` stream (`stratification.jsx:467-477,517-529`).
- **CLEAN-S** dead `state = {invalid: true}` (`stratumForm.jsx:46`); commented `// import Color` (`:1`);
  `==` loose compare (`stratification.jsx:486`); CSV export uses backslash-escaped quotes while the importer
  expects doubled quotes (`stratification.jsx:553-561`) — round-trip mangles labels with quotes.

### Proportions
- **BUG-7a** `_.maxBy(loadedProbabilityPerStratum,'probability').probability` throws on empty result
  (`proportions.jsx:637,653`) — reachable when AOI has no overlapping strata. The `renderBand` copy at `:282`
  *is* guarded with `?.`; the calc paths aren't. **Fix:** `?.probability` + empty-result handling.
- **BUG-7b** `strata.find(({value}) => value === stratum).weight` throws when strata/probability diverge
  (`proportions.jsx:567`, runs on every overall-proportion change). **Fix:** `?.weight || 0`.
- **VAL-P1** no cross-row sum check: weighted overall proportion can read "150%" with no error and is submitted
  (`proportionForm.jsx:12-17`, footer `proportionTable.jsx:32`). **Fix:** aggregate `Form.Constraint` ≤ 100,
  mirroring sampleAllocation's `enoughSamples`/`noNaN`.
- **VAL-P2** per-row `max(100)` is wrong in fraction mode and not re-validated on the `%` toggle
  (`proportionForm.jsx:16`, `proportions.jsx:500-510`) — `0.8` and `95` can coexist after toggling.
- **VAL-P3** `anticipatedProportions` `notBlank` on an array only catches `null`/`[]`; an all-blank/zero table
  passes (`proportions.jsx:72-74`).
- **VAL-P4** `isPercentage()` does `percentage.value.length` with no `?.` and `percentage` isn't initialized
  in `componentDidMount` (`proportions.jsx:686-688,406-413`).
- **VAL-P5** double float round-trip: model stores `proportion/100` un-rounded; display uses `smartRound`
  (`proportions.jsx:719-720,737-742,755-767`) → drift like `3.33% → 3.3299999%`. **Fix:** round at model boundary.

### SampleAllocation
- **BUG-8** POWER/OPTIMAL ÷0 → `NaN` per stratum when all proportions are 0 (`allocate.js:113-117`); relative
  MOE ÷ overall-proportion-0 → Infinity/NaN (`marginOfError.js:9`, `sampleAllocation.jsx:366`). `noNaN` blocks
  submit but shows the misleading `allocation.tooBig` message. **Fix:** guard `sum===0`/`proportion===0`.
- **BUG-9** `updateMarginOfError` tests the input object, not `.value` (`sampleAllocation.jsx:365`) → absolute
  mode shows the relative fraction. `marginOfError.js:8` does it right — share one helper (see DUP).
- **VAL-A1** confidence level: `notBlank().max(100).number()` with no lower bound and `100` allowed
  (`sampleAllocation.jsx:35-38`) → `confidenceLevel=100` ⇒ `z=+Infinity` ⇒ NaN bounds. **Fix:** `.min(50).lessThan(100)`.
- **VAL-A2** `findRoot` silently returns `min` for unreachable targets and propagates `NaN`
  (`solve.js:4-10`, `sampleSize.js`) → a too-tight MOE yields a tiny sample size that doesn't achieve it.
- **VAL-A3** `enoughSamplesToCoverMin` constraint (`min*len ≤ size`) vs `allocate()`'s strict-`>` throw
  (`allocate.js:4`) disagree at equality, and the throw is **uncaught** in `allocate()` (`sampleAllocation.jsx:372`).

### SampleArrangement / Retrieve
- **VAL-R1** `minDistance` `.min(0)` allows 0 while `scale` requires `>0` (`sampleArrangement.jsx:25-30`);
  default `minDistance = props.scale*2` where `props.scale` falls back to `10` vs stratification's `30`
  (`sampleArrangement.jsx:15-18,221`) — looks like a copy mismatch.
- **VAL-R2** `crs` only `.notBlank()`, `crsTransform` unconstrained (`sampleArrangement.jsx:31-33`,
  `retrieve.jsx:36-39`) — malformed CRS/transform reach EE and fail opaquely.
- **VAL-R3** retrieve `strategy` required for GEE but never defaulted and subject to the asset-resolution race
  the shared `MosaicRetrievePanel` handles via `destinationValidationPending` (`retrieve.jsx:33-35,204-221`).
- **CLEAN-R** `onScaleChanged` wired but undefined (`sampleArrangement.jsx:141`); empty constructor (`:43-45`);
  translation typo `assetIt.tooltip` (`retrieve.jsx:140`); `update()` re-defaulting destination on every
  `componentDidUpdate` (`retrieve.jsx:223-234`).

---

## 4. Statistical correctness (sampleAllocation math)

Verified by reproducing each helper in Node against the `gaussian` lib and the test fixtures:
- **Correct:** `confidenceInterval.js` is the continuity-corrected Wilson (Newcombe 1998) interval; the
  stratified combine `error = sqrt(Σ(wₕ·errorₕ)²)` and `p = Σwₕpₕ` are standard; `sampleSize.js` reproduces
  (test → 213); allocation strategies (EQUAL/PROPORTIONAL/POWER/OPTIMAL/BALANCED) match their tests.
- **Caveat to document:** combining *Wilson* per-stratum half-widths via root-sum-of-squares is a defensible
  heuristic, not a textbook stratified Wilson interval — worth a comment/citation since it's the statistical core.
- **BUG-10 (dead/broken):** `numeric.js:4` imports `boundsToMarginOfError` which `marginOfError.js` does not
  export → throws if ever called; `allocateToMarginOfError` is an empty stub (`:44`); `numeric.test.js` asserts
  a 2-element result for 5-stratum input (`:18`) — broken/aspirational. **Proposal:** delete `numeric.js` +
  `numeric.test.js` (also removes 4 eslint errors), or finish them.
- `solve.test.js` only covers an *increasing* function; real callers pass *decreasing* MOE functions — add a
  decreasing + unreachable-target case (would document VAL-A2).
- `findRoot` recomputes `fun(max)` (a full allocation) on every bisection step (`solve.js:10`) — cache it.

---

## 5. Duplication (cross-cutting) — biggest cleanup wins

- **DUP-1** `stratification.jsx` ↔ `proportions.jsx` are ~70–80% the same: `renderType/renderAsset/renderRecipe/
  renderBand/renderScale`, `onImageChanged/onImageLoading/onAssetLoaded/onRecipeLoaded`,
  `updateImageLayerSources`, the cancellable EE-stream + identical `Notifications.error` block, the
  `eeStrategyButtons` block, and the field defs. **Proposal:** extract an `ImageBandScaleSelector`
  component/hook (ASSET|RECIPE → bands → band/scale/eeStrategy + cancellable stream + layer-source registration).
  Removes ~250 lines from proportions alone and kills the duplicated `bands.lenght` bug.
- **DUP-2** Three table/form trios (`strata*`, `proportion*`, `allocation*`) implement the same
  `NestedForms` + `Header`/`Footer` grid + per-row `withNestedForm` shape. **Proposal:** a generic
  `StratumTable` taking column descriptors + a row-form.
- **DUP-3** `smartRound` triplicated (`proportions.jsx:755-767`, `allocationTable.jsx:85-96` — the latter missing
  the `if(!num)` guard). **Proposal:** hoist to `~/format` or `samplingDesign/numeric`.
- **DUP-4** MOE-from-bounds logic triplicated (`marginOfError.js:6-10`, `sampleAllocation.jsx:364-367`, and the
  intended `numeric.js`). One `boundsToMarginOfError({bounds, relative})` also fixes BUG-9.
- **DUP-5** CSV legend-import `componentDidUpdate` block copy-pasted across 6 files
  (`stratification.jsx:367-382` + 5 legend panels). **Proposal:** shared `useImportedLegendEntries` hook.
- **DUP-6** CRS/crsTransform render+fields duplicated in `sampleArrangement.jsx:173-195` and `retrieve.jsx:180-202`
  (with diverging translation keys). **Proposal:** shared `<CrsForm/>`.
- **DUP-7** `retrieve.jsx` reimplements what every other recipe gets from `MosaicRetrievePanel` (asset/bandMath/
  ccdc/regression all delegate). The forked copy is where the asset-validation race (VAL-R3) and `updateProject`
  were lost. **Proposal:** extend `MosaicRetrievePanel` with a "table" mode or share a base.

---

## 6. Dead code / cleanup (CLEAN)

- **CLEAN-1** `samplingDesignImageLayer.jsx` is a verbatim, **unused** copy of `TimeSeriesImageLayer` (class is
  literally `_TimeSeriesImageLayer`, references classification/COUNT vis). Recipe is `noImageOutput: true` and
  never imports it. **Delete.**
- **CLEAN-2** `samplingDesignRecipe.js` mosaic/timeSeries cruft: `loadObservations$` (`:64-67`, dead),
  `data_set_type: recipe.model.dataSetType` (`:59`, no such field), hard-coded `destination:'SEPAL'` event and
  `...task.SEPAL` title regardless of destination (`:34-35,56-60`), `REQUEST_MOSAIC_RETRIEVAL` action name (`:20`).
- **CLEAN-3** `bands.js`/`visualizations.js` are empty stubs (`{}`/`[]`) still wired into the descriptor though
  `noImageOutput: true` (`samplingDesign.jsx:71`); unused `getGroupedBandOptions` + `import _`.
- **CLEAN-4** `console.log`s in `sync.jsx:62,66,79` (fail `no-console`); commented `cancel$.next()` in
  `proportions.jsx:530,551`; commented `console.log`/`calculateStratumErrors` block in `confidenceInterval.js`.
- **CLEAN-5** Missing `componentWillUnmount` in stratification & proportions — `cancel$` Subject never
  completed; in-flight EE request not cancelled when the panel closes; `setImmediate` callbacks can fire after
  unmount in sampleAllocation/nestedForms.
- **CLEAN-6** Placeholder i18n shipped: `msg('Samples')`, `msg('Target')`, `msg('Error')`,
  `msg('Select ... something')` (sampleAllocation `:174,180,189,191,305`); hardcoded English headers in
  `allocationTable.jsx:47,48,55` (with `msg` imported-but-unused).
- **CLEAN-7** eslint errors currently failing (`sepal eslint gui`): `sampleAllocation.jsx:7` unused `format`;
  `allocationTable.jsx:4` unused `msg`; `numeric.js:44` 4 unused args; `sampleAllocation.../numeric.js` and
  `sync.jsx` console; `visualizations.js:1` unused `normalize`; `sampleSize.test.js:2` blank-line.
  Most are subsumed by CLEAN-1/-3/-4 and BUG-10.

---

## 7. Suggested sequencing

1. **Unblock:** BUG-1 (operation name), BUG-3 (seed), then decide BUG-2 (sample selection contract).
2. **Stop data corruption:** BUG-4, BUG-5, BUG-7, BUG-8, BUG-9, BUG-6.
3. **Redesign the streaming** (DF-1…DF-4) — pick direction (A eager orchestration vs B derived selectors),
   centralize validation, make the table widget unidirectional. This is the structural cleanup and should
   precede/*inform* the dedup work so the extracted components match the new model.
4. **Dedup:** DUP-1 (ImageBandScaleSelector), DUP-2 (StratumTable), DUP-3/-4 (shared numeric/MOE), DUP-6/-7 (CRS + retrieve).
5. **Delete cruft:** CLEAN-1…CLEAN-7 (much falls out of the above), fix eslint, real i18n keys.

All paths relative to `modules/gui/src/app/home/body/process/recipe/samplingDesign/` unless noted.
