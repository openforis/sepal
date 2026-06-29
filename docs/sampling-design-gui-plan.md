# Sampling Design GUI — Remediation & Refactor Plan

Companion to [sampling-design-gui-review.md](./sampling-design-gui-review.md) (findings & IDs). This is the
*plan*; the review is the *evidence*. Goal: make the feature **correct** and **significantly higher quality**,
with a deliberate restructuring of how/which data flows between panels, a clean domain/GUI split, careful
de-duplication, and real tests for the domain logic.

No code changed yet. This is a proposal for sequencing and target architecture.

---

## Guiding principles (from the brief)

1. **Correct first, then beautiful** — bugs fixed under test before structural moves.
2. **Split domain from GUI** — pure sampling/statistics/model logic must not import React/Redux/widgets.
   Dependency direction is **one-way: GUI → domain, never reverse.**
3. **Cohesion over everything** — each module/component should have one reason to change.
4. **Metrics locate, judgment decides** — use file size / function length / arg count / cyclomatic complexity
   to *find* candidates, then design; don't mechanically chop.
5. **Dedup without over-coupling** — share *genuine* commonality (math, a table shell, an image selector),
   but don't fuse things that merely look alike. Prefer composition; keep shared GUI and shared domain separate.
6. **Test the domain, not the GUI** — the statistics and model transforms get unit tests (Vitest); panels don't.

---

## Measured hotspots (baseline, `sepal eslint` + injected complexity rules)

Re-run this after each phase to confirm we're moving the needle:
```bash
cd modules/gui && ./node_modules/.bin/eslint \
  "src/app/home/body/process/recipe/samplingDesign" \
  --rule '{"complexity":["warn",8],"max-lines-per-function":["warn",50],"max-params":["warn",4],"max-depth":["warn",3],"max-statements":["warn",18]}'
```
Current (24 source files, 3,525 lines):

| File | Lines | Worst method (complexity / lines) |
|---|---|---|
| `proportions/proportions.jsx` | 767 | `calculateAnticipatedProportions` (12 / 55); `componentDidMount` (9); `renderStrataProportion` (57 lines) |
| `panels/stratification/stratification.jsx` | 616 | `renderStrata` (9 / **81**); `render` (62 lines) |
| `panels/sampleAllocation/sampleAllocation.jsx` | 453 | `componentDidMount` (**17**); `allocate` (10 / 53) |
| `panels/sampleArrangement/sampleArrangement.jsx` | 254 | `componentDidMount` (9) |
| `panels/retrieve/retrieve.jsx` | 250 | (forked from MosaicRetrievePanel — see DUP-7) |

Takeaway: complexity is *concentrated in lifecycle + recompute methods* (the data-flow seams) and in oversized
`render*` methods. Both are addressed structurally below, not by extracting helpers in place.

---

## Target architecture

### A. Domain / GUI split

Introduce a pure domain layer under `recipe/samplingDesign/sampling/` (no React/Redux/widget imports):

```
samplingDesign/
  sampling/                     ← PURE DOMAIN (unit-tested, no UI)
    statistics/
      confidenceInterval.js     (move; keep — verified correct)
      marginOfError.js          (+ boundsToMarginOfError — single source, fixes BUG-9/DUP-4)
      sampleSize.js
      solve.js                  (fix VAL-A2: infeasible/NaN; cache fun(max))
      allocate.js               (fix BUG-8: ÷0 guards)
      round.js                  (smartRound — single source, DUP-3)
    model/
      slices.js                 (slice shapes + defaults)
      transforms.js             (strata→proportionInputs, proportions→allocationInputs, join views)
      dependencies.js           (the dependency graph, currently smeared in sync.jsx)
      staleness.js              (pure: hash relevant inputs → detect stale derived)
      validate.js               (pure cross-panel + per-slice validation, DF-4)
    index.js
  panels/ … (GUI only)
  components/                   ← SHARED GUI (no domain math)
    ImageBandScaleSelector.jsx  (DUP-1)
    StratumTable.jsx            (DUP-2 — start with the grid/NestedForms shell)
    CrsForm.jsx                 (DUP-6)
  orchestrator.jsx              (the finished <Sync/> — see C)
```

Rule enforced by review (and optionally an eslint `no-restricted-imports`): files under `sampling/` import
**nothing** from `~/widget`, `react`, or `~/app/.../recipe` actions. They take plain data, return plain data.

### B. Data model redesign — "which data we pass" (the core of the brief)

Today every stratum's metadata is **copied into three slices** and re-joined ad hoc:
`stratification.strata = [{value,label,color,area,weight}]`, then `proportions.anticipatedProportions =
[{stratum,label,color,weight,area,proportion}]`, then `sampleAllocation.allocation =
[{…,sampleSize}]`. The duplication is the root cause of the divergence crashes (BUG-7b `find().weight`,
the stale all-zeros join in DF-1) and of the staleness ambiguity.

**Proposal: store each stratum's metadata once; downstream slices reference by id and carry only their own field.**
- `stratification.strata` → the **only** home of `{id, label, color, area, weight}` (rename `value`→`id`,
  which also fixes BUG-4's id assumption for free).
- `proportions` stores `{strategy, manual, proportionById: {id → proportion}}` — not a re-embedded strata array.
- `sampleAllocation` stores `{strategy, targets, sampleSizeById: {id → size}}`.
- The **joined view** (`[{…stratumMeta, proportion, sampleSize}]`) that panels/tables/export need is produced by
  a pure `transforms.join(strata, proportions, allocation)` selector — computed where needed, never persisted.

Benefits: one source of truth for stratum metadata; divergence crashes become impossible (a missing id is a
join concern handled in one place); staleness is a pure function of the input maps; far less data flows through
the store. This is the "restructuring on how and which data we pass" the brief intuited.

Keep persisted-but-derived data (EE outputs: strata areas, per-stratum probabilities) explicitly tagged with
the **hash of the inputs that produced it** (`staleness.js`), so "is this stale?" is a comparison, not a guess.

**Export/task boundary (the by-id model must not break the task contract).** The export tasks read the
*embedded* rows today: `recipe.model.sampleAllocation.allocation` as `[{stratum, sampleSize, area, color, …}]`
(`modules/task/src/tasks/samplingDesign/{randomExport,systematicExport}.js`), and the samplers use
`stratum.area / sampleSize / color / stratum` (`randomSampling.js:63`, `systematicSampling.js:31`). If the
persisted model drops the embedded array for `sampleSizeById`, the task breaks. **Decision: the GUI→task
boundary materializes the joined rows.** `submitRetrieveRecipeTask` (`samplingDesignRecipe.js`) calls
`transforms.toTaskAllocation(strata, proportions, allocation)` (the same join, shaped to the task's expected
fields) and passes it in task params — so the lean by-id model stays the GUI source of truth while the task
keeps a stable, explicit payload. The task-side contract (what fields it expects) is documented and pinned by a
fixture test. This is part of Phase 2, not deferred.

**Unstratified mode needs an area (F4).** Skipping stratification creates one synthetic stratum
`{value:1, label, color, weight:1}` with **no `area`** (`stratification.jsx:578`), but both samplers compute
spacing from `stratum.area` (`8 * stratum.area / …`) → `NaN` distance. Two options: (a) compute & cache the AOI
area (an EE reduce) and inject it as the synthetic stratum's `area` (orchestrator-owned, like other EE-derived
caches), or (b) `validate.js` blocks area-dependent arrangements (random/systematic minDistance) in unstratified
mode. **Recommend (a)** so unstratified sampling actually works; (b) is the cheap interim guard for Phase 1.

### C. One orchestrator instead of scattered recompute (DF-1, DF-2)

Replace the mount-triggered recompute + dual-stored `requiresUpdate` with a single recipe-level orchestrator
(the finished `<Sync/>`) that is the *only* place async derivation happens:

- On any input change, compute the new input-hash per stage; mark downstream **transitively** stale via
  `dependencies.js` (fixes DF-2 non-transitivity and the missing `sampleAllocation→sampleArrangement` edge).
- For a stale stage whose inputs are complete+valid, cancel in-flight, recompute via `sampling/` + `api.gee`,
  write the derived cache + its input-hash — **regardless of which panel is open** (fixes DF-1).
- When the whole model is complete+valid, trigger sample selection (resolve **BUG-2**: either call the real
  `/samplingDesign/sample` endpoint or explicitly decide selection is export-only and delete the stub + map
  expectation).
- Panels become **pure editors**: read inputs, read the joined view read-only, render validity. Their
  `componentDidMount`/`componentDidUpdate` recompute logic (the complexity-17 / 81-line offenders) largely
  evaporates because recompute is centralized.

**Ownership seam — form-apply vs orchestrator (F3).** Today a panel Apply writes the *whole* model slice from
`valuesToModel(values)` via `setModelAndValues` (`recipeFormPanel.jsx:108-109`), and those `valuesToModel`
functions currently emit **derived** fields (`stratification.valuesToModel` returns `strata`;
`proportions`→`anticipatedProportions`; `sampleAllocation`→`allocation`). If the orchestrator also writes those
caches, a panel Apply would clobber them with stale/empty form values. **Resolution:** `valuesToModel` emits
**input fields only**; derived caches live on orchestrator-owned paths (e.g. `model.derived.*` or a clearly
separated subtree) and are *never* written by a form Apply. Concretely either (a) move derived data to a
`model.derived` subtree the forms don't touch, or (b) have the form merge only its input keys
(`setModelAndValues` already keeps `prevValues`, so a shallow input-only merge is feasible). This seam must be
settled in Phase 2 *before* the orchestrator starts writing caches, or the two writers race.

> Why eager orchestration over pure derived-selectors: strata areas and probabilities require **async EE**
> calls, so they can't be synchronous selectors. We use selectors for the *synchronous* derivations
> (allocation math, joins, MOE) and the orchestrator for the *async* ones. Hybrid, but with a single async owner.

### D. Validation gets a home (DF-4)

`sampling/model/validate.js` returns per-slice + cross-slice validity (strata ids consistent across slices,
weighted proportions within range, allocation feasibility, seed present when relevant). The toolbar consumes
this; panels surface their slice's errors. Per-field `Form` constraints stay for *local* input validation;
*cross-panel* invariants move to `validate.js` (pure, testable).

**Units must be pinned (F5).** The persisted model stores proportions as **fractions** (`valuesToModel`
divides display % by 100, `proportions.jsx:721`) while sampleAllocation persists `confidenceLevel`/`marginOfError`
as **percentages**. Decision: `proportionById` stores **fractions [0,1]**; `validate.js` checks the weighted sum
**≤ 1**; display ×100 happens only at the view boundary. Every domain function documents its expected unit, and
the unit is asserted in tests so the double-conversion drift (review VAL-P5) can't reappear.

### E. Shared GUI widgets — dedup with care

- `ImageBandScaleSelector` (DUP-1): the ~250 lines shared by stratification & proportions. Owns source
  (ASSET|RECIPE) → bands → band/scale/eeStrategy + cancellable stream + layer registration. Each panel still
  decides what to *do* with the chosen image. **Coupling guard:** it emits events/values; it does not know about
  strata or proportions.
- `StratumTable` (DUP-2): start by extracting only the `NestedForms` + Header/Footer grid shell; generalize to
  column-descriptors *after* the data-model change (B) lands, since rows become `{stratumMeta + one field}`.
  Don't force-fit if a table's behavior truly diverges.
- `CrsForm` (DUP-6); retrieve → extend `MosaicRetrievePanel` with a "table" mode rather than the fork (DUP-7),
  recovering the lost `destinationValidationPending` race handling (VAL-R3) and `updateProject`.
- **nestedForms rework (DF-3):** array input is the single source of truth; rows are controlled; aggregate
  validity explicitly (drop the `setImmediate` error-read; `setImmediate` isn't a browser standard); add the
  missing `arrayInput.onChange` unsubscribe; rename `WithSomethingHOC`.

---

## Phased plan

Each phase ends green: `sepal eslint {gui,gee,task}`, `sepal npm-test` for domain, and the complexity re-run.

### Phase 0 — Safety net + pure-domain correctness (no UI risk)
Pin behavior before moving anything.
- Expand domain tests (Vitest): edge cases the review found — ÷0 / all-zero proportions (BUG-8), confidence=100
  → z=∞ (VAL-A1), infeasible/decreasing target in `solve` (VAL-A2), single stratum, empty/divergent strata.
- Fix the pure bugs under the new tests: BUG-8 (÷0 guards), VAL-A2 (`solve` infeasible + cache `fun(max)`),
  DUP-3/DUP-4 (single `smartRound`, single `boundsToMarginOfError` — fixes BUG-9 by construction).
- Resolve BUG-10: delete `numeric.js` + `numeric.test.js` (broken import + aspirational test) **or** finish them.
- Outcome: statistics are correct and covered; net for later refactor.

### Phase 1 — Correctness blockers & quick wins (small, low-risk, high-value)
- **BUG-1** retrieve operation name (`samplingDesign.${destination}`) — unblocks the **GEE asset** export path
  only. SEPAL table export is still an empty stub (`samplesSepalExport.js`, `tableToSepal.js`) and GUI sample
  selection is still a no-op against WIP routes (`sync.jsx:78`, `/samplingDesign/sample`→`batch/table.js`); both
  stay out of scope until pulled forward (BUG-2 is a Phase 3 decision).
- **BUG-3** seed validation (signature + inverted skip + default).
- **BUG-4** strata `swap` (becomes trivial once ids exist; do the id rename here or in Phase 2).
- **BUG-6** `bands.lenght` typo (both panels). **BUG-7** empty/divergent `_.maxBy`/`find` guards.
- **BUG-5** uniqueness constraints (compute against the real array).
- Delete dead code: `samplingDesignImageLayer.jsx` (CLEAN-1), mosaic/timeSeries cruft in `samplingDesignRecipe.js`
  (CLEAN-2), `bands.js`/`visualizations.js` if `noImageOutput` (CLEAN-3); remove `console.log`s (CLEAN-4);
  fix eslint errors + real i18n keys (CLEAN-6/7).
- Add the interim unstratified guard (F4 option b): `validate.js`/panel blocks area-dependent arrangements when
  stratification is skipped, until the AOI-area cache lands in Phase 2.
- Outcome (scoped honestly): the **GEE asset export path is testable end-to-end**; the recipe is lint-clean and
  demoable for stratified GEE asset export. **Not** yet working: SEPAL table export, GUI sample selection/preview.

### Phase 2 — Domain extraction (behavior-preserving)
- Move statistics + create `model/{slices,transforms,dependencies,staleness,validate}.js` under `sampling/`.
- Introduce the **reference-by-id data model** (B): id rename, `proportionById`/`sampleSizeById`, `join` selector.
  Add a one-time migration in `modelToValues`/recipe load if older saved recipes carry the embedded arrays.
- Split `valuesToModel` to **inputs-only** and move derived data to an orchestrator-owned subtree (F3 seam) —
  do this in the same change as the by-id model so forms and orchestrator never both write a derived path.
- Add `transforms.toTaskAllocation(...)` and wire `submitRetrieveRecipeTask` to materialize the joined rows into
  task params (F1); pin the task-side field contract with a fixture test (shared expectation between GUI and
  `modules/task/.../samplingDesign`).
- Add the AOI-area compute/cache for unstratified mode (F4 option a), replacing the Phase 1 interim guard.
- Tests cover transforms + validate + staleness + the task-payload shape. No intended behavior change; tests +
  manual run guard it.
- Add the optional `no-restricted-imports` guard so `sampling/` stays UI-free.

### Phase 3 — Data-flow restructuring (the orchestrator)
- Build `orchestrator.jsx` (finished Sync): transitive invalidation, input-hash staleness, central recompute,
  cancellation, and the sample-selection decision (BUG-2).
- Strip per-panel recompute/`requiresUpdate` plumbing; panels become editors. This is where the complexity-17
  `componentDidMount` and the 81-line `renderStrata` get dismantled (DF-1/DF-2 resolved).
- Re-measure: those hotspots should drop sharply.

### Phase 4 — GUI dedup (metrics-guided)
- Extract `ImageBandScaleSelector` (DUP-1) → removes ~250 lines from proportions and the duplicated typo site.
- `StratumTable` shell (DUP-2), `CrsForm` (DUP-6), retrieve via `MosaicRetrievePanel` (DUP-7), nestedForms rework (DF-3).
- Re-measure file sizes; proportions/stratification should fall well below their current 767/616.

### Phase 5 — Polish
- Final eslint + complexity pass; consider keeping the complexity rules as CI warnings to prevent regression.
- Statistical comment/citation on the Wilson-RSS combine (review §4 caveat).
- Confirm the deferred async-geometry follow-up (RECIPE/ASSET AOI) is still tracked (separate from this work).

---

## De-dup coupling guardrails

- **One-way deps:** `panels/` and `components/` may import `sampling/`; `sampling/` imports neither. A shared
  `StratumTable` must not import statistics; statistics must not import widgets.
- **Don't merge on shape alone:** the three tables share a *shell*, not necessarily semantics — extract the
  shell, keep per-table column/validation config local until proven identical.
- **Prefer props/composition over inheritance/flags:** `ImageBandScaleSelector` takes callbacks, doesn't branch
  on "am I stratification or proportions".
- **Persist inputs, derive views:** never persist what `transforms.join` can compute; if an EE result must be
  cached, tag it with its input-hash.

## Test strategy (domain only)

- Vitest, colocated `*.test.js` next to `sampling/` modules. Cover: each allocation strategy; CI/MOE/sampleSize
  against known fixtures; `solve` monotonic-decreasing + infeasible; `validate` (consistent/inconsistent strata,
  sum>100, missing seed); `staleness` (hash changes ⇒ stale); `transforms.join` (missing id tolerated).
- No React-component tests — panels are thin editors after Phase 3.

## Risks & notes

- **Saved-recipe migration:** the data-model change (B) alters persisted shape — add a load-time migration and
  test it against an old recipe fixture.
- **BUG-2 is a product decision**, not just code: does the GUI select/preview samples, or is selection
  export-only? Phase 3 needs that answer (the `/samplingDesign/sample` + `estimateProbability` routes currently
  point at the WIP `batch/table.js` scratch job — backend isn't ready either).
- Phases 0–1 deliver a correct, demoable feature independently; 2–4 are the quality investment and can be paced.
