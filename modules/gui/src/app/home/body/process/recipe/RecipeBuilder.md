# Building a SEPAL recipe — field guide

Practical reference for adding or extending a recipe type — the UI panels, the Earth
Engine wrapper, and the patterns that are easy to get wrong. The **task / export**
workflow (retrieve panel → `recipeTaskSubmitter.js` → the task module) is a separate
concern; see `recipeTaskSubmitter.js` and `recipeOutputPath.js` in this folder. Running
example: **`PYEO_ALERTS`** (the pyeoAlerts recipe).

**Worked example (mirror it):** `modules/gui/src/app/home/body/process/recipe/pyeoAlerts/`
(GUI) and `lib/js/ee/src/pyeo/` (Earth Engine). When in doubt, also read the closest
stock recipe: **changeAlerts** (references another recipe), **timeSeries** (per-scene
classification), **ccdc/ccdcSlice**, **mosaic/opticalMosaic** (sources, retrieve,
pre-process), **classification** (legend, training data).

**Golden rule:** *mirror an existing recipe; do not invent structure.* Every pattern
below already exists in stock SEPAL — copy it.

**Corollary — reuse, don't duplicate:** if a stock recipe already *builds* the thing you
need (a per-scene collection, index scaling, empty-collection validation, a classifier's
covariate derivation), call its helper — don't re-implement it. Most of our reworks were
deleting hand-rolled code in favour of an existing helper (`getCollection$`, the
classifier's own `addCovariates`). When you *do* call a shared helper, read **all** of its
call sites first and follow the majority convention.

---

## 0. Anatomy of a recipe

Two halves, registered in a few index files:

**Earth Engine** — `lib/js/ee/src/<recipe>/`
- the algorithm (kept close to source if ported), a wrapper that builds imagery from the
  recipe model and returns the output image, and a **pure** params-mapping module.
- Register the wrapper in `lib/js/ee/src/imageFactory.js` (`'PYEO_ALERTS'` → wrapper).

**GUI** — `modules/gui/src/app/home/body/process/recipe/<recipe>/`
- `<recipe>.jsx` — recipe type definition (`id`, `components.recipe`, `getAvailableBands`,
  `getPreSetVisualizations`, `getDependentRecipeIds`, `getDateRange`) + the map component
  that calls `initializeLayers`.
- `<recipe>Recipe.js` — `defaultModel` + `RecipeActions` (action builders, `submitRetrieveRecipeTask`).
- `panels/<recipe>Toolbar.jsx` — the `PanelWizard` + `Toolbar` activation buttons; wires panels.
- `panels/*/` — one folder per panel (form panels). `bands.js`, `visualizations.js`,
  `<recipe>ImageLayer.jsx`.
- Register: `recipeTypes.js` (the type) and `recipeImageLayers.js` (the image layer).
- Strings: `modules/gui/src/locale/en/translations.json` under `process.<recipe>.*`
  (only `en` needs entries for a new recipe).

---

## 1. Form panels = the core (`recipeFormPanel`)

A panel is a form scoped to **one model subtree** (`model.<id>`). This single fact drives
most design decisions.

```js
compose(
    _Panel,
    connect(mapStateToProps),                 // → props.stream, store selectors
    withRecipe(mapRecipeToProps),             // → props.recipeActionBuilder + selected props
    recipeFormPanel({id: 'sources', fields, modelToValues, valuesToModel}),  // → props.inputs
    recipeAccess()                            // → props.loadRecipe$/loadSourceRecipe$ (if needed)
)
```

- `id` == the model key (`model.sources`) **and** the toolbar activation id.
- `fields` — `{name: new Form.Field().notEmpty('key').notBlank().int().date(fmt,'key').predicate((v, allValues)=>bool,'key').skip((v,allValues)=>bool)}`.
- `modelToValues(model[id]) → inputs` / `valuesToModel(inputs) → model[id]`. These only see
  their own subtree.
- `<Form.PanelButtons/>` inside `<RecipeFormPanel>` shows **Apply/Cancel automatically when dirty**.

**The scoping lesson (cost us two reworks):** a control can only join a panel's
Apply/Cancel if its value lives in **that panel's** model subtree. When we needed the
classification selector and the From/To class buttons inside the Sources panel, we had to
**move them into `model.sources`** (a schema change) rather than leave them at
`model.classification` / `model.pyeoAlertsOptions`. A live-dispatch combo (writing the
model on every change) bypasses Apply/Cancel — avoid it.

Fields shared across recipes (Pre-process / sources / retrieve) come from
`opticalMosaic/panels/...` and `createCompositeOptions({id:'options'})` — reuse them.

---

## 2. Pulling metadata from a *referenced* recipe (do it when it makes sense)

When one recipe references another (pyeoAlerts → a Classification recipe), load the
reference's metadata and **fill the panel in place**. Pattern (see `sources.jsx`, and the
stock `changeAlerts/referenceSync.jsx`):

- `recipeAccess()` gives `loadRecipe$(id)` and `loadSourceRecipe$(id)` (the latter unwraps
  to the underlying mosaic/asset).
- Run loads through **`stream('NAME', obs$, onNext, onError)`** and read
  **`stream('NAME').active`** for a spinner / `busyMessage`.
- **Trigger on the form input, not the committed model**, so it loads on *selection*
  (before Apply). Do it from the panel's `componentDidUpdate` with a guard:

```js
componentDidUpdate() { this.maybeSync({initial: false}) }
maybeSync({initial}) {
    const id = this.props.inputs.classification.value
    if (id === this.loadedId) return          // guard against re-entrancy / other input changes
    this.loadedId = id
    this.cancel$.next(); this.cancel$ = new Subject()
    // ...stream(loadRecipe$(id).pipe(takeUntil(this.cancel$)), ...)
}
```

- **Prefill split:** set the *current pane's* fields as form **inputs** in place
  (`inputs.dataSets.set(...)` — the `classification/legend/legend.jsx` pattern) so they
  show without reopening the panel; set *other panes'* values on the **model** via
  `recipeActionBuilder(...).set('model.dates...', ...)`.
- **Only prefill on a user *change*, not on mount** (`{initial}` flag) — on mount just load
  the legend, or you clobber a saved recipe's edited sources/dates.
- Prefer this over a **headless sync component**: we retired `classificationSync.jsx` and
  moved its logic into the panel so the load could populate form inputs live.
- Derive sensible defaults from the metadata: e.g. monitoring window =
  `min(baselineEnd + 1y, today)` via `moment.min`.

---

## 3. UI conventions / styles (this is what the user notices)

**Minimize screen jumps — reserve the space.** Any area that swaps between placeholder →
spinner → content must keep a **fixed height** (not `min-height`, which still grows to the
tallest state):

```css
.changeClasses { height: 11rem; overflow-y: auto; display: flex; flex-direction: column; }
.changeClassesMessage { flex: 1; display: flex; align-items: center; justify-content: center; }
```

Then render one of {spinner, `<NoData message=.../>`, the real buttons} inside it. Same
lesson applies to legends/date ranges: compute visualization min/max from the recipe's own
window so the layer doesn't reflow.

**Inline validation uses the widget's own error hint — not toasts, not a separate block.**
Store the message in component state and pass it straight to the control:

```jsx
<Form.Combo input={classification} busyMessage={this.isLoading()} errorMessage={this.state.classificationError}/>
```

`Form.Combo`/`Form.Input` resolve a **string** `errorMessage` into their red hint
(`widget/form/combo.jsx` → `form.getErrorMessage`). Reserve **`Notifications`** (toasts)
for transient *network* failures only; validation belongs in the UI. There is a `Message`
widget (`widget/message.jsx`, types `normal|info|warning`) for panel-level notes if needed,
but the field hint is preferred for field-level validation.

**Disable, don't just validate.**
- Whole control: `disabled={...}` on `Form.Buttons`/`Form.Slider`. Gate *downstream*
  controls on *upstream* validity — datasets & cloud stay disabled until a **valid
  classification legend** exists (`!!classificationLegend`, not merely a value picked, so
  an invalid pick keeps them off like the default).
- Per option: `Form.Buttons` options accept `{value, label, color, disabled}`. We used this
  for From/To **mutual exclusion** (a class picked in From is `disabled` in To and vice
  versa) — better than only a cross-field `predicate`.

**Spinners:** `<Icon name='spinner'/>` (auto-spins) or a control's `busyMessage`, both
driven by `stream('NAME').active`.

**Empty states:** `<NoData message={msg(...)}/>` (`widget/noData.jsx`) instead of fake
placeholder data (we had bogus `class 1…8` buttons — delete that kind of thing).

**Sliders** (`widget/form/slider.jsx`) are continuous with `decimals`; `ticks` are just
labels (no `snap` ⇒ continuous). Pick a range that matches the data (e.g. a normalized-diff
index gate is `0…1` once you decide only *drops* count).

**Panel width:** a CSS-module `.panel { max-width: … }` on `<RecipeFormPanel className>`;
match a sibling recipe (we aligned Dates to CCDC's `20rem`).

---

## 4. Map layers & legend

- The map's active layer's `visParams` produce the legend. `getPreSetVisualizations(recipe)`
  returns the preset layers (the **first is the default-shown** layer); it receives the
  recipe, so date/count ranges can be derived from `model.dates`.
- **No recipe legend until configured:** call
  `initializeLayers({recipeId, savedLayers, defaultGoogleSatellite: true})` — the map
  defaults to Google Satellite (no premature legend) while the recipe layer stays available.
  (`skipThis: true` *removes* the recipe layer source entirely — usually too much.)
- **Request the map when ready:** on wizard completion, swap the center layer in:
  `recipeActionBuilder(...).set('layers.areas.center.imageLayer', {sourceId: 'this-recipe'})`.
- `bands.js` → `getAvailableBands()` = `{band: {dataType:{precision,min,max}, label}}`;
  `visualizations.js` → `getPreSetVisualizations()` = `normalize({type:'continuous', bands, min, max, palette})`.
  Keep band labels honest (rename them when the semantics change).

---

## 5. PanelWizard (initialization flow)

`panels={[...ids]}` is the **required init sequence**; `onDone` fires once, call
`setInitialized(recipeId)` (and do the map swap above). Panels **not** in the list are
optional — still reachable via `Toolbar.ActivationButton` and still show Apply/Cancel when
changed. Keep the wizard minimal so the recipe initializes early:

```js
panels={['aoi', 'sources', 'dates']}   // pre-process ('options') & detection ('pyeoAlertsOptions') are optional
```

Toolbar activation buttons are `disabled={!initialized}`; Retrieve is gated on the recipe
being usable (`disabled={!classification}`).

---

## 6. Earth Engine side

- **Reuse the shared collection builder — don't hand-roll `createOpticalCollection`.** The
  per-scene pipeline (sources → cloud masking → corrections → indices → int16 scaling →
  empty-collection validation) is already assembled by **`timeSeries/collection.js`'s
  `getCollection$({recipe, geometry, bands})`**. Call it with a **synthetic minimal recipe** the
  way `changeAlerts.js` (`getObservations$`) and `ccdc.js` do. Our first cut hand-built
  `createOpticalCollection({...})` with every processing option spread in by hand — replacing it
  with `getCollection$` deleted the boilerplate and removed latent scaling drift.
  - **Survey every caller for the convention.** Dates live in **`recipe.model.dates.{startDate,endDate}`**
    (5 of 7 callers, incl. changeAlerts/ccdc), *not* the root `startDate`/`endDate` args (one
    export task only). If your model names them differently (`monitoringStart/End`), **rename
    into that shape** in the synthetic recipe rather than take the minority override path.
  - **Know every field the helper reads; neutralise what you don't want.** `getCollection$` reads
    `sources.classification` and, if set, wires up its *own* regression/probability classifier per
    scene. pyeoAlerts needs categorical `class`, so we pass the model through but **null
    `sources.classification`** and classify ourselves. Pass the model and override the misbehaving
    fields — don't cherry-pick fields into a fresh object (that silently drops options it reads).
- **Let downstream components derive what they own.** The classifier's `classifyImage` runs
  `addCovariates` itself — it computes tasseled-cap / indices / pairwise bands from the raw scene
  bands per its `bandSetSpecs`. So **don't pre-add tasseled cap** before classifying (we removed
  that); feed raw bands, and ask the collection for the classifier's *own* input bands
  (`imageFactory(inputImagery).getBands$()`) so `addCovariates` finds what it references.
- **int16 ×10000 is the convention, not a choice.** SEPAL collections/mosaics carry reflectance
  0–10000 and indices ×10000 (`scale(index, 10000).int16()`). Emit derived bands (e.g. a gate
  index) on that same scale so they line up with the shared builder *and* with a classifier
  trained on the same-scaled mosaic. Scale **thresholds** to match the data — never down-scale the
  data to match a raw threshold.
- **Verify a dispatched method exists on every input type.** `imageFactory(x)` resolves by
  `type`; before relying on `.getBands$()` / `.getImage$({selection})` confirm each reachable
  handler implements it — ASSET **ignores** `{selection}` and can't synthesize bands, RECIPE_REF
  delegates to a mosaic that can. Mismatches fail only at runtime.
- **Order isn't guaranteed.** EE doesn't promise collection order after filter/`map`; if the
  algorithm walks scenes chronologically, `.sort('system:time_start')` explicitly (as
  changeAlerts does before iterating) — don't assume the collection arrives sorted.
- **Vendored / partner algorithm code:** commit it **pristine first** (a clean baseline commit),
  then adapt in later commits so the change reads as a reviewable diff. Under an **LoA**, request
  the clean change from the partner rather than editing their file — keep our side a thin adapter
  (e.g. a wrapper constant) and route the fix upstream.
- **Params mapping is pure** (no `ee.`) so it is unit-tested: `node --test` in the recipe
  dir (`params.test.js`). Keep it that way.
- **Client-side guards** short-circuit bad configs before building the graph — return a
  `validateEEImage({valid, image, error:{userMessage, statusCode:400}})` (e.g. empty
  From/To classes), so the user gets an instant friendly error instead of a long failing run.
- **Band-name contract:** the wrapper's `CHANGE_REPORT_BANDS`, the algorithm's `.rename(...)`
  outputs, and `bands.js` keys must all agree. When you rename for honesty (we dropped
  "NDVI" for a generic `index` gate), change all three together and re-check with a diff.
- **Comment the WHY at non-obvious seams, and cite the sibling** (`Mirrors changeAlerts.js:184-191`):
  future readers need to know *why* classification is nulled, *why* we sort, *why* int16.

---

## 7. Model & schema

- `defaultModel` sets initial state. Defaults matter: empty `dataSets: {}` forces a choice;
  a non-`undefined` gate object turns a feature **on** by default (`indexGate: {index:'ndvi', threshold:0.2}`).
- **Moving a field's model location is a schema change** touching the EE wrapper and every
  reader. On a dev branch we don't migrate — the user re-creates saved recipes (confirm this
  is acceptable first).
- Source-dependent options: filter by available bands — `getIndexesForBands(getDataSetBands(recipe))`.
  Normalized-difference indices are all `[-1,1]` (one slider range); others vary.

---

## 8. Verify (what you *can* do locally vs. not)

- **Lint every GUI change:** `cd modules/gui && node_modules/.bin/eslint --fix <files>`
  (auto-sorts imports; JSON must stay valid — `python3 -c "import json,sys; json.load(open(f))"`).
- **Unit-test pure EE params:** `node --test` in `lib/js/ee/src/<recipe>/`.
- **Lint & unit tests don't cover runtime.** Live rendering, spinner timing, the map-layer
  swap, and real GEE previews can only be verified by running SEPAL — call out which
  changes are lint-only vs. runtime-verified.
- **GEE "User memory limit exceeded (Error code: 3)"** is per-tile *graph depth*, not a
  quota. Per-scene classification × N scenes + reductions in one graph is the usual cause.
  Cheap lever: lower export `shardSize`. Durable fix: two-stage materialisation (classify to
  an asset, then run the change algorithm on the asset). Note: `tileScale` applies to
  `reduceRegion`, not to `ImageCollection.sum()/.min()`.

---

## 9. Git hygiene for the eventual PR

To turn a messy branch (redo/fix commits) into one clean diff without losing work:
`git branch backup/<name> HEAD` then `git reset --mixed $(git merge-base HEAD origin/master)`.
Everything becomes one unstaged diff; create-then-delete churn washes out. Discard stray
already-upstream files (`git checkout -- <file>`). Default branch here is **`master`**.

---

## 10. Pitfall checklist

- [ ] Control needs Apply/Cancel? Its value must live in the panel's `model.<id>` subtree.
- [ ] Loading a referenced recipe? Trigger on the **input** (live), guard with `loadedId`,
      cancel with `takeUntil(cancel$)`, prefill inputs-in-place vs model-for-other-panes,
      and **skip prefill on mount**.
- [ ] Swapping placeholder/spinner/content? **Fixed height** container.
- [ ] Validation? Field `errorMessage` hint, not a toast.
- [ ] Downstream controls disabled until upstream is *valid* (not just present)?
- [ ] Mutually-exclusive options? Per-option `disabled`.
- [ ] New recipe shouldn't show a legend on init → `defaultGoogleSatellite: true`.
- [ ] Renamed an output band? Update wrapper `CHANGE_REPORT_BANDS` + algorithm `.rename` + `bands.js`.
- [ ] Per-scene collection? Reuse `getCollection$` (not hand-rolled `createOpticalCollection`); dates in `model.dates`; null `sources.classification` if you classify yourself.
- [ ] Feeding a classifier? Feed raw bands — it derives its own covariates (no pre-tasseled-cap).
- [ ] Derived bands on the int16 ×10000 convention (scale the *threshold*, not the data)?
- [ ] Dispatched method (`getBands$`, `{selection}`) exists on every `imageFactory` type you hit?
- [ ] Order-dependent algorithm → explicit `.sort('system:time_start')`?
- [ ] Vendored/partner algorithm committed pristine first; LoA fixes routed upstream?
- [ ] Pure params still pure (unit-tested)?
- [ ] Linted GUI + valid JSON? Flagged what's lint-only vs. needs live testing?
