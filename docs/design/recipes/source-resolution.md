# Source resolution, dependencies and execution

Technical design for resolving recipe and Earth Engine asset sources into a coherent graph and freezing that
graph for execution. This document owns authorization and task atomicity. Live refresh policy belongs in
[source-freshness.md](source-freshness.md). Product identity, output-band description fields, declaration semantics
and the distinction between canonical output and map-only products belong in
[output-products.md](output-products.md). This document owns the traversal and evidence machinery that resolves
those declarations.

[Recipe behavior contracts](behavior-contracts.md) defines the user-facing design guidance for configuration,
validation, repair and recovery. It separates operation prerequisites from deliberate analysis policies and provides
the behavior questions to answer before extending these declarations or their presentation.

Structured dependency edges, authorized operation-scoped recipe reads and declaration-based producer resolution
are implemented. The explicit live/bundled graph API, coherent execution bundles, generalized capability discovery
and versioned provenance verification below describe the target design, not guarantees of current execution.

For the current release decision, start with the [release checkpoint](#current-release-checkpoint).
The detailed audits and completed packet history below retain evidence and boundaries; they are not an open task list.

## Current release checkpoint

**Status reconciled 2026-10-27, against `8c0976ff9`.** S1-S6 are implemented, reviewed and browser-accepted within
their recorded scopes. S5 is committed as `6fc9e5874`, S6 as `eaba8f54f`, and the subsequent shared-read context
correction as `12129ad9b`. Origin was integrated at `3fd364ce7` before that correction. The implementation histories
retain their original pending/failure statements as evidence of those earlier checkpoints; they are not additional
unfinished slices.

Origin's app-instance recommendation change (`15dd7f07e`) was subsequently merged as `8c0976ff9`, without
conflicts or recipe-code changes. Its focused post-merge verification is recorded below; the complete integrated
campaign remains evidence for the preceding `d075ce7ec` recipe tree, not a repeated full-suite run after this merge.

Pushing this work releases it. Both agreed release gates are now satisfied:

| Gate | Current evidence / action |
| --- | --- |
| Final integrated verification and resolution of its findings | Complete within the recorded verification scopes. The 36 GUI failures, hidden-local-refusal defect and missing/null-model guard are corrected and committed as `d075ce7ec`. The final full GUI suite passed 4780 of 4780; shared, GEE, Task, build and static groups are green as recorded. Origin's subsequent app-picker change is merged as `8c0976ff9`; 114 focused GUI tests, changed-file lint and the production build pass on that merge. Independent review has no remaining finding. See "Final verification corrections", "Projection guard correction", the independent recheck and "Origin integration after asset checks". |
| Focused CCDC asset compatibility check | Complete. Existing radar and optical assets work with the intended editable fallbacks, confirmed by user chart/preview results and independent metadata inspection. The user then completed a fresh radar CCDC Segments export, confirmed that PRC applies the recorded properties and disables the appropriate controls, and explicitly confirmed that both preview and chart work using that same new asset. See "Fresh export browser acceptance". |

**Release decision:** both gates passed and the findings are resolved; commit the verification notes and push/release.
No further implementation slice is required by this roadmap. Optional improvements below can wait for another release. A newly
confirmed release defect can require a bounded correction; finding a historical proposal or an explicitly deferred
item does not by itself expand the release scope.

**Focused asset check.** Use compatible monitoring imagery and a native measure actually held by the segments asset.
An existing CCDC asset must remain usable in Change Alerts: select it under REF, verify recorded processing/date
values and genuinely unrecorded editable fallbacks, and obtain an actual preview and chart segments/observations.
The asset path must not require opening or reading its producer or Classification. Complete one small CCDC export
under the current build and use the resulting asset as a reference to exercise the new processing-metadata
writer/reader round trip. Record the asset/build and actual outcome; an enabled button, a mocked metadata round trip
or a running export is insufficient. No repeat of the complete S1-S6 manual batch is requested.

**Release communication, not another implementation gate.** Explain the intentional behavior/result changes in
the release summary or recipe documentation:

- A selected untrainable Classification holds Time Series and CCDC native operations too; repair or explicitly
  deselect it. This is the S3 configured-analysis policy, not a claim that native execution trains a classifier.
- Reused samples use the Consumer's features over each Provider's own imagery. Results can change, narrower
  Provider selections can now work, and ambiguous names require repair. Matching names does not establish matching
  units/encoding or probability calibration across separately trained models.
- Change Alerts follows reference-owned processing while preserving its consumer-owned monitoring choices.
  Malformed governing metadata is held; genuinely absent asset metadata retains labelled editable fallbacks.
- These changes do not migrate saved recipes. Existing task payload compatibility is preserved; new CCDC exports
  add processing metadata. Do not describe the release as having identical results to the previous behavior.

**Optional small improvements, ranked by containment.** These are recommendations for later selection, not newly
scheduled release requirements. Make no production changes while the integrated campaign is establishing its
baseline. If a later improvement is included, refresh its affected automated/build/browser checks rather than
claiming the earlier campaign tested that later tree.

| Priority | Follow-up | Boundary / regression risk |
| --- | --- | --- |
| 1 | Stack Band names layout | **Implemented and browser-accepted (2026-10-27).** Cause, confirmed in Chromium: each field took the browser's default `<input size=20>` width (202px) in a wrapping horizontal `Layout` with 1rem margins, so two never fit the 352px group of the 29rem panel and every band took its own row. Each input-image group is now a local grid of two equal columns, one where two would each be narrower than 10rem; fields shrink to their column and long original names wrap with their feedback icon in view. Shared Layout, Panel, form and input widths are unchanged. Checked in Chromium on a harness build of the real Stack toolbar and panel: 1/2/3/4/many bands, three groups, long names and values, a duplicate name, 400px and 320px viewports, scrolling, Tab order, rename then Apply or Cancel. Independent review found no issue; all 41 Stack tests, lint and `git diff --check` pass. The user confirmed the running-app layout works, including small windows, and renaming works. Browser acceptance is complete; the browser was not named, so no separate Firefox/Safari pass is claimed. Renaming behavior is unchanged; additional manual renaming checks were unnecessary for this layout-only change. |
| 2 | CCDC Sources family/view heights | **Implemented and browser-accepted (2026-10-27).** The height follows the draft's family and the rendered view: Optical 46/58rem, Radar 30/42rem and Planet 36/48rem for Less/More. Less fits its usual controls with about 2rem to spare. Following the user's browser feedback, More adds 6rem beyond the original proposal to reserve two extra breakpoint-band rows with breathing room; its height still depends only on family/view. The original content measurements in Chromium were (Optical 620/700px with Landsat, Radar 397/477px, Planet 477/557px with its asset field). Planet is sized for Custom Basemaps and Daily Imagery's asset field, leaving NICFI Less about 107px spare; Sentinel-2-only Optical Less scrolls about 15px. Classification choices, the Classification field shown in Less for an error, and validation messages scroll in the body; the shared viewport cap and width are unchanged. Checked in Chromium on a harness build of the real Sources panel in a real recipe context, with reads answered by the harness: all six views; family and More/Less changes resize; a Classification chosen after opening whose 16 long classes arrived 2s later left the outer height unchanged before, during and after; an untrained Classification and an empty breakpoint selection in Less; 700/560/440px-tall and 800/480px-wide windows keep header and footer in view and the last choice reachable by scrolling. Independent review confirmed the 21 CCDC-related test files (232 tests), lint and `git diff --check` pass. After adding More's extra space, a fresh Chromium harness build confirms two probability rows fit in every family with 35–39px to spare at an uncapped viewport; Less keeps its previous heights, and short windows keep the shared cap and scrolling. Evidence: `/tmp/sepal-ccdc-headroom-review/browser.log`. The user confirmed the adjusted More spacing looks good in the running app; browser acceptance is complete. |
| 3 | CCDC Slice chart labels | **Implemented and browser-accepted (2026-10-27).** Segment descriptions carry no labels, so the Slice chart asks the producer its source resolves to. CCDC registers `segmentBandLabels` beside `describeSegments$`, labelling bands as its own chart does (`flatBandOptions`) from the same data sets, corrections and Classification its description uses. The records are those the chart's operation already resolved (`recordOf`), so nothing extra is loaded, saved or copied, and `ui.classification` copies are not used. Native names agree with the CCDC chart, `regression` and `probability_<value>` are named by the Classification's current class labels, and a band without a label (an asset, an unresolved producer or Classification) keeps its raw name. Choices, their order and values, requests and readiness are unchanged; options are keyed by name, so alike labels stay distinct. Mounted Slice regressions cover labelled choices with requests by name, a class relabelled while chosen, two classes labelled alike and an asset's probability-named band with no recipe read; witnessed by reverting to raw labels, by labels as values and by dropping unlabelled bands. 21 CCDC/Slice and segment test files (234 tests), lint and `git diff --check` pass. After the own-property fallback correction, all 37 mounted Slice tests pass independently. The user confirmed that Classification band labels appear in the chart and accepted the change; the browser check is complete. The broader presentation review remains deferred. |
| 4 | Consecutive keyboard band addition | **Implemented 2026-10-27; browser-accepted 2026-10-28.** Cause: after a stay-open choice the add flow removes the band; `Combo` then has no selected option (these pickers pass no `value`) and `ListContent` re-highlights the first selectable row, "All bands", so the next Enter added every band. Ownership is shared: `Combo` marks a stay-open choice and hands its key to `ListContent` with the options the parent next supplies (a typed filter or closing first ends it), and `ListContent` highlights the first selectable option that followed it, past headings and disabled rows, only when those options are what remained of the previous ones without the chosen option. Past the last, nothing is highlighted and Enter does nothing; arrows still reach every row, "All bands" included. Other changes of options, selections that keep their option, ordinary selectors and lists outside `Combo` highlight as before. Every stay-open caller is an equivalent add-and-remove flow: shared and Classification-derived input imagery, Band Math input imagery, output bands and function inputs, and training-data class mapping. Mounted regressions use the real Combo/List keyboard path (lifecycle: repeated Enter, filter, end of list, All bands; `combo.test.jsx`: skipped rows, options changed without a choice, a keeping picker filtered after a choice, a click, an ordinary selector), witnessed against the unchanged widgets. 85 widget, input imagery, Band Math, Classification and Slice test files (1068 tests), lint and `git diff --check` pass; a Chromium harness of the real input-image editor confirmed repeated Enter, filter, focus, visibility and the end of the list. The user accepted the brief running-app keyboard check on 2026-10-28 and authorised committing; browser acceptance is complete. |

**Agreed next sequence after keyboard band addition (2026-10-27):**

**Band Math setup feedback completed and browser-accepted (2026-10-28).** An empty output leaves OUT unmarked,
with neutral guidance; preview and Retrieve remain held and name OUT. Choosing an output releases the hold.
See "Band Math empty-output setup feedback". The separate map-area menu correction is also implemented,
independently reviewed and browser-accepted on 2026-10-28; it reuses shared menu/overlay behavior without changing
image readiness.

1. **BAYTS settings ownership and consistency.** Implemented, independently reviewed and browser-accepted
   (2026-10-28). The ownership audit, implementation and corrections are recorded below. Final full GUI verification
   passed: 4823 tests in 334 files. No further implementation finding is open.
2. **Visualization Copy/Paste.** Implemented and independently reviewed (2026-10-28): copy the current draft,
   including incomplete values, through controls only inside the visualization panel. Destination identity stays
   its own and Apply validates. All review findings are corrected. The user accepted the final header layout and
   confirmed unsaved Copy / source Cancel / destination Paste; browser acceptance is complete. Final full GUI
   verification passed 4860 tests in 335 files. See F7 for the implementation, corrections and acceptance evidence.
3. **[Recipe-scoped modals](data-sources.md#recipe-scoped-modals).** The visualization-panel pilot is implemented,
   independently reviewed and browser-accepted (2026-10-28), including the hidden-popup, covered-shortcut and
   section-flash corrections. The user confirmed nested import, narrow layout and the background tab's × close
   guard, and chose to keep requiring Apply or Cancel with "panel" in its message. Physical middle-click is covered
   by mounted tests and Chromium/Firefox, not a manual trackpad check. Full GUI verification passed 4881 tests in
   337 files; the production build, lint and whitespace checks passed. A final wording-only change passed 24
   locale/modal tests and another production build. The checkpoint is on `feat/recipe-scoped-modals`, from
   `77e4e8f89`. Next: establish recipe scope once at the recipe boundary, inheriting it for ordinary panels and
   nested dialogs with explicit application-wide exceptions. Opening selected recipes follows that migration.

This order records the user's priorities and adds no release gates to already accepted work. Visualization
Copy/Paste is next after the BAYTS slice is committed. The copy-settings action remains dropped.

**Functional follow-ups.** The BAYTS ownership correction below is now browser-accepted; server preview readiness
remains deferred:

- **Server preview readiness:** `modules/gee/src/jobs/ee/image/preview.js` still constructs imagery without the shared
  readiness guard. GUI layers withdraw correctly, but a direct or stale preview request can reach an execution
  error. Extending declaration-based operation/product authorization needs its own scope and cost assessment;
  do not claim all server preview paths are guarded.
- **BAYTS settings ownership:** implemented, independently reviewed and browser-accepted (2026-10-28). Reference-owned
  processing is derived, editable monitoring choices are seeded once, and background copying is removed. See the
  audit, implementation, corrections and acceptance records below. Server-derived historical metadata remains
  a separate follow-up.

Other deferred work remains deferred:
[consistent band presentation across recipes](#future-consistent-band-presentation-across-recipes), chart map markers,
AOI redraw optimization, WebSocket updates, broader request propagation/dependency loading, execution bundles and
CCDC array-file destination compatibility. Explicitly selected empty-Provider feedback remains a separate
product decision; an empty branch does not invalidate a Consumer that has adequate data elsewhere, while total
training absence continues to hold operations. No new confirmed implementation blocker was established by this
bounded roadmap/code audit; this does not dispose of the separate final-verification findings recorded below.

The separate **Use reference settings** action was dropped on 2026-10-27. First-creation seeding and automatic
reference-owned processing already cover the important needs; copying the remaining editable defaults offers too
little convenience to justify another potentially confusing control. Earlier deferral statements are historical;
see "S5 follow-up: Use reference settings action" for the decision and withdrawn proposal.

**BAYTS settings ownership audit and proposal (2026-10-28; assessment only, no production change).** Traced on
`4a3576742` from BAYTS Historical's execution and exports, through `baytsAlerts/referenceObservation.js`, to BAYTS
Alerts' editors, GUI requirements, alert execution and the radar-observation product. It applies the S5 principles
to BAYTS's own algorithm.

*Confirmed behaviour.*

- **Copying.** `baytsAlertsObservation.applyAccepted` → `processingOptions` merges the producer's whole `options`
  into the consumer's `model.options` (`merge: true`). It does this whenever the selected source changes or the
  producer's options differ from `ui.sourceEvidenceApplied`, in the evidence action, while an editor watches
  (`evidenceRegistry.js`).
  - Producer options are the historical recipe's `model.options`, or an asset's top-level `recipe_options`.
  - `seeding()` drops unparseable options, or ones stating unusable orbits; these then seed nothing.
- **Lifecycle.**
  - **Creation:** the wizard is REF → Date; PRC is not a step. After REF Apply, the observation answers
    asynchronously and merges, whichever step is open.
  - **Reopen:** `ui` is not saved (`recipe.jsx`, `NON_CONTENT`), so `previous` is empty. The first observation in a
    session merges the producer's options over saved choices: orbits, masks and angles.
  - **Producer edit:** any change rewrites every consumer key the producer holds. An unchanged Refresh writes
    nothing.
  - **Replacement:** the new reference's options are merged.
  - **REF Cancel:** writes nothing.
  - **Open PRC, or a late answer:** PRC's values are initialised once at mount (`initValues`). A merge landing while
    PRC is open is undone by its Apply; one landing while it is closed is silent.
  - **Pinned:** the existing tests pin all of this (`referenceObservation.test.jsx`: "supplies refreshed options
    when its own change"; `sourceRequirement.test.jsx`: "the editor opened afterwards seeds the options once").
- **PRC.** It is BAYTS Historical's options panel in `monitor` mode (`baytsAlerts/panels/preprocess/preprocess.jsx`),
  writing every radar key (`valuesToModel`). Monitor mode hides the multitemporal parameters, outlier removal and
  minimum observations, but still shows the multitemporal filter choice. `orbitNumbers` has no control in either mode.
  - `reconcileOrbits` rewrites the open draft's passes whenever the supported passes answer. That is an evidence-
    driven draft mutation, pinned by "follow the reference while PRC is open".
- **Two different sets of execution defaults.**
  - **History:** each pass is a Radar Mosaic of the producer's options (`bayts/baytsHistorical.js` →
    `radar/mosaic.js` → `radar/collection.js`). A missing key takes the radar collection's defaults: speckle `NONE`,
    `kernelSize` 5, `snicSize` 3, `orbitNumbers` `ALL`, `outlierRemoval` `NONE`, `minObservations` 1.
  - **Alerts:** monitoring (`bayts/bayts.js`) fills a missing key with BAYTS's own: speckle `LEE`, `kernelSize` 9,
    `snicSize` 5.
  - Today, a producer missing speckle keys leaves the consumer's `LEE` copy in place, so the monitored values are
    filtered differently from the history.
- **How the alerts compare.** `bayts.js` scores each monitoring observation against the history's per-pass
  `*_mean`/`*_std` (`pdf`, with `sd × 2 × sensitivity`).
  - It keeps only observations whose relative orbit equals the history's `orbit` band (`maskOrbits`).
  - It applies the history's multitemporal speckle ratio, `*_speckle` (`applyMultitemporalFilter`).
  - It forces `outlierRemoval: 'NONE'`, `multitemporalSpeckleFilter: 'NONE'` and `minObservations: 1`, and never
    passes `orbitNumbers`.
  - A setting that transforms backscatter values must therefore equal the history's. Multitemporal consistency is
    carried by the statistics themselves.
- **The radar-observation product.** `radarObservationRecipe` (`type/baytsAlerts.js`) builds a Radar Mosaic of the
  consumer's whole `options`, with `minObservations: 1`. Unlike the alerts, it honours the consumer's multitemporal
  filter, outlier removal and `orbitNumbers`. Its description (`VV`, `VH`, ratio, orbit, dates) is the same whatever
  the processing.
- **Metadata actually written.**
  - BAYTS Historical exports through the generic `image.GEE` path (`recipeTaskSubmitter.js` →
    `imageAssetExport.js`). Since BAYTS Historical arrived (2023-04, after recipe properties in 2023-03), this writes
    flat `recipe_*` properties, including `recipe_options` (the GUI's `model.options` as submitted) beside
    `recipe_type: 'BAYTS_HISTORICAL'`. The old `modules/task` exporter was flat too.
  - No server-derived `processing` property is written for BAYTS: S5's `executedProcessing` covers only CCDC segment
    producers.
  - Exports through Masking or Stack carry the wrapper's model, so no historical options.
  - Evidence is code and fixtures only. As recorded under BAYTS Alerts' verification, no BAYTS Historical asset is
    accessible for a live read.
- **Readiness.**
  - Shared readiness has no processing rule (`executionNeeds` `REFERENCE` only).
  - The GUI holds the reference to `MONITORABLE_STATISTICS`, and the consumer's passes to `MONITORED_PASSES`
    (`model.options.orbits`; `sourceRequirement.js`).

*Field ownership*, from execution:

| Field | Historical use | Alerts use | Execution defaults (history / alerts) | Proposed |
|---|---|---|---|---|
| `geometricCorrection` | Corrects the values the statistics summarise | Corrects the monitored values compared with them | `ELLIPSOID` / `ELLIPSOID` | **Reference-owned**: equality |
| `spatialSpeckleFilter`, `kernelSize`, `sigma`, `strongScatterers`, `strongScattererValues`, `snicSize`, `snicCompactness` | Filters values before the mean and standard deviation | Filters monitored values scored against them | `NONE`, 5, 0.9, `RETAIN`, [0, -5], 3, 0.15 / `LEE`, 9, 0.9, `RETAIN`, [0, -5], 5, 0.15 | **Reference-owned**: equality (agreed: follow known speckle settings) |
| `orbits` | The passes the statistics hold | The passes monitored | both / both | **Consumer-owned compatible subset**: within the reference's passes, already enforced by `MONITORED_PASSES` |
| `mask`, `minAngle`, `maxAngle` | Exclude edge and angle observations from the statistics | Exclude monitored observations | `SIDES`/`FIRST_LAST`, 30.88, 45.35 / same | **Consumer-owned** observation selection (see decision 2) |
| `multitemporalSpeckleFilter`, `numberOfImages` | Compute the `*_speckle` statistics | Unused: forced `NONE`, applied through the history's `*_speckle` | `NONE` / forced | **Unused by the alerts**; used only by the radar-observation product (decision 3) |
| `outlierRemoval` | Removes outliers before the statistics | Unused: forced `NONE` | `NONE` / forced | **Unused by the alerts**; product only |
| `orbitNumbers` | Chooses relative orbits (`handleOrbitOverlap`) | Unused; `maskOrbits` enforces the history's orbit | `ALL` / not passed | **Unused by the alerts**; product only |
| `minObservations` | Masks pixels with too few observations | Unused: forced 1 | 1 / forced | **Unused** |
| `advanced` | UI | UI | - | **Unused** (UI state) |

*Readers and how each acquires the facts.*

| Reader | Today | Proposed |
|---|---|---|
| PRC values and controls | Consumer's `model.options` | Effective settings from the applied evidence (`ui.sourceEvidence`; the observation already reads the producer record or asset metadata). Reference-owned fields read-only and labelled; unused fields hidden in monitor mode |
| REF first Apply | - | Seeds consumer-owned defaults from `SourceCandidate.facts()` (the S5 accessor) under the existing blocked-form guard |
| `MONITORED_PASSES`, supported passes | Consumer `orbits`; evidence | Unchanged: consumer-owned |
| Processing hold (GUI) | None | Pending is a need; unavailable or `UNREADABLE` holds `IMAGE_OUTPUT` and `RADAR_OBSERVATION`, as S5's `changeAlertsProcessing` does |
| Alert execution (`bayts/baytsAlerts.js`) | `...recipe.model.options` | Effective model from a server facts read: a records-only walk of the `BAYTS_HISTORICAL_STATS` provider chain (as `withSegmentSource$` does for segments), or `assetProperties$`. Client evidence is never authority |
| Radar-observation execution | `radarObservationRecipe(recipe)` | The same effective model; the description is unchanged |
| BAYTS Alerts Retrieve/export | Same execution; consumer `recipe_*` as provenance | Same effective execution; provenance unchanged, and no reader treats it as authority |
| BAYTS Historical export (writer) | Flat GUI `recipe_options` | Read as below (decision 4 covers a server-derived record) |
| `previousAlertsAsset` | Image only | Unchanged |

*Recommended contract.*

- **Reference-owned:** `geometricCorrection` and the spatial speckle filter with its parameters. Their effective
  value is:
  - for a recipe reference, the resolved producer's value, or its radar collection's execution default where the
    key is absent - never the consumer's copy;
  - for an asset, the value recorded in a complete form;
  - `NOT_RECORDED` otherwise: the consumer's value, editable and labelled unverified.

  Read-only wherever the value is known.
- **Consumer-owned:** `orbits`, within the passes the reference supports, plus `mask`, `minAngle` and `maxAngle`.
  They are seeded once at the first Reference Apply of a new recipe (`!ui.initialized`, no reference applied
  before), atomically through `additionalUpdates`. After that, reopen, Refresh, replacement and producer edits never
  write them.
- **Unused by the alerts:** hidden from monitor-mode PRC. Saved copies stay untouched.
- **Asset forms:**
  - **Complete:** a top-level `recipe_options` beside `recipe_type: 'BAYTS_HISTORICAL'`. Its absent keys take the
    history's execution defaults.
  - **Partial:** a `recipe_options` without that marker, which records only its stated keys.
  - **Malformed:** a present but malformed governing form is `UNREADABLE` and held; it never falls back to the
    consumer.
  - Pending and failed reads stay `PENDING` and `UNAVAILABLE`.
  - A format marker proves neither origin nor scientific comparability.
- **One derivation for every reader.** A pure shared derivation answers each field's state and value, and the
  effective model, for the editors, GUI holds, alert execution and the radar product. The six evidence states and
  the parsing and precedence helpers are those of S5.
- **Removed:** `applyAccepted` for BAYTS Alerts.
- **Intentional result changes:**
  - Consumers whose copied geometric or speckle settings drifted from their history now follow the history.
  - A producer without speckle keys is monitored with `NONE`, not `LEE`.
  - Reopening no longer resets passes, masks or angles.
  - A malformed asset record now holds the alerts instead of running on the consumer's options.

*Smallest coherent scope.*

1. **Shared:** move S5's evidence-state constants and parse/precedence helpers from
   `recipe/changeAlerts/processing.js` to a neutral module, re-exported, so Change Alerts is unchanged. Add a BAYTS
   field specification and effective-settings derivation (`recipe/bayts/processing.js`) with tests.
2. **GUI:**
   - **PRC adapter:** parameterise `changeAlerts/processingSettings.js` (`presentProcessingInputs`,
     `preserveProcessingCopies`) by field set and move it to a shared location. Today it hard-codes `SR`/`BRDF` and
     Change Alerts' field list. Callers: Change Alerts' toolbar and REF panel, then BAYTS PRC.
   - **Observation and seeding:** the BAYTS observation carries `processing`. REF's first Apply seeds the
     consumer-owned fields, and `applyAccepted` is removed.
   - **Hold:** a processing hold declaration for BAYTS.
3. **gee:** `bayts/baytsAlerts.js` derives the effective model from a server facts read for both the alerts and the
   radar product.

No persisted-format change, migration or new loader is needed. The rewritten tests are the pinned copying ones above.

*Acceptance cases* (asserting displayed values, the applied model and holds):

- **Creation:** the first REF Apply in a new recipe seeds passes, masks and angles once. Enter/Next behave alike.
  Pending evidence blocks Apply; Cancel writes nothing; a replacement in the wizard seeds nothing.
- **Reopen and producer edits:** a fresh reopen with overrides is unchanged. A producer edit to a mask changes
  nothing; a producer edit to speckle `LEE` → `REFINED_LEE` shows read-only and is used by the alerts and the radar
  product, while the saved copy is unchanged. A producer missing speckle keys is effective `NONE`.
- **Replacement:** replacing the reference keeps consumer passes. An unsupported pass is still refused by
  `MONITORED_PASSES`.
- **Assets:** a complete `recipe_options` is read-only, with defaults for absent keys. A partial form leaves its
  unstated fields editable and not recorded. A malformed form is `UNREADABLE` and held. Missing options give
  editable fallbacks. Pending and failed reads stay distinct. A wrapper (Masking) export gives not-recorded
  fallbacks.
- **Server (gee):** alerts and the radar product use the producer's geometric and speckle values without loading
  its unrelated dependencies, and refuse an unreadable record.

*BAYTS-specific decisions still needed.*

1. **`reconcileOrbits`:** keep its evidence-driven repair of the open PRC draft (convenience, Cancel reverts), or
   remove it so passes change only by the user, with `MONITORED_PASSES` explaining an unsupported choice.
   Recommendation: remove it, since it is the one remaining evidence-driven draft write.
2. **Angle range:** the history's statistics cover its `minAngle`/`maxAngle`. Monitoring outside that range compares
   other incidence angles. Recommendation: keep the range consumer-owned but seed it, without enforcing a subset; an
   enforced compatibility rule would be a separate scientific decision.
3. **Radar-observation processing:** keep honouring the consumer's multitemporal filter, outlier removal and
   `orbitNumbers` in the product, or build it with the alerts' monitoring processing (`NONE`/forced, reference
   speckle). Recommendation: build it as the alerts monitor, so the product shows what is compared. This is a
   visible product change; otherwise PRC must keep showing controls that only the map uses.
4. **Server-derived historical metadata:** add a canonical `processing` record to BAYTS Historical exports (and
   through Masking/Stack, via `executedProcessing` over `BAYTS_HISTORICAL_STATS`). The concrete need is wrapper
   exports, which today carry no historical options. Recommendation: a separate follow-up, not required for the
   ownership correction.

*Boundaries.* The missing-reference radar-preview issue (BAYTS Alerts open issue) and server preview readiness stay
separate. The processing hold proposed here is independent of them, and does not fix a preview without a reference.

**BAYTS ownership audit: independent review (2026-10-28; proposal amendments required before implementation).**

The background copying, inconsistent absent-key speckle defaults and field/reader inventory were checked against
the GUI, radar collection, BAYTS Historical and BAYTS Alerts execution. The core ownership recommendation is sound.
This is a code/design review; no production code, probes or test campaign were run for this assessment.

- **Pass retention needs more than removing `reconcileOrbits`.** Historical's `renderOrbits` disables unsupported
  passes. `widget/form/buttons.jsx` then filters disabled values out of the input in `componentDidUpdate`, and a
  disabled selected button cannot be deselected by the user. The revised design must preserve an unsupported draft
  selection visibly, explain it through `MONITORED_PASSES`, allow explicit removal/repair and block unusable Apply.
  Keep unavailable new choices unavailable without silently deleting existing choices. Cover the real form/widget
  path on delayed evidence, producer pass changes, repair and Cancel; do not globally remove widget normalization
  or consider the issue fixed just because the explicit reconciliation method is gone.
- **The proposed radar-map equivalence is not established by settings alone.** `bayts.js` applies per-pass historical
  `*_speckle` factors and per-pixel historical relative-orbit masking through `beforeGeometricCorrection`, plus
  optional scene normalization through `afterDbConversion`. A Radar Mosaic built with the same `options` does none
  of those. It also picks the nearest date per pixel in its existing window around the period endpoint, rather than
  showing the exact first/last observations used for alerts. Supplying the same effective model does not by itself
  remove the current spread of legacy multitemporal/outlier/orbit-number options into that product either.
  **Recommended bounded direction, pending user decision:** share effective geometric/spatial settings, consumer
  passes/masks/angles and the algorithm's forced/ignored option policy with the radar product, leaving its existing
  contextual nearest-date-mosaic contract intact. Do not claim this shows the exact values/observations scored by
  BAYTS. Extracting a genuine monitored-observation view would need the history-dependent transformations, altered
  imagery/cost/dependency semantics and a separate explicit scope; it must not silently make a recipe reference's
  radar map build all historical statistics. Clarify decision 3 and its acceptance before implementing it.
- **Preserve unused saved options explicitly.** Hiding a control does not prevent Historical's `valuesToModel`
  from serializing it. Include unchanged and absent unused keys in the preservation/Apply/Cancel acceptance cases,
  as well as preserving saved reference-owned copies. No new persisted synchronization flag is needed.
- **Reuse at the actual common boundary.** A neutral field adapter/parser is reasonable only for behavior the two
  consumers share. Keep Change Alerts' optical corrections, date-format rules and legacy metadata precedence in
  their domain specification. Preserve existing exports/imports and add focused Change Alerts controls if extracting
  its helpers; a general form/processing framework or another shared form-lifecycle change is not justified here.
- **Recommendations on decisions 1, 2 and 4:** stop evidence-driven draft rewrites; keep masks/angles consumer-owned
  without a new scientific compatibility rule; keep server-derived BAYTS metadata as a separate recorded follow-up.
  These are reviewer recommendations, not a record of the user's approval. Existing metadata provenance remains
  the documented legacy contract; do not claim this audit makes GUI-supplied properties server-authoritative.

**BAYTS ownership proposal: review amendments folded in (2026-10-28; no production change).** These supersede the
corresponding parts of the proposal above. The four choices below are decided for implementation by the subsequent
user direction recorded after the independent recheck; they do not need another confirmation round.

- **Decision 1, passes: no evidence-driven change; unsupported choices kept visible.** Removing `reconcileOrbits`
  is not enough. `Form.Buttons.componentDidUpdate` (`widget/form/buttons.jsx`) drops disabled values from the input,
  and a disabled button cannot be deselected.
  - **Fix, in monitor-mode `renderOrbits`, without changing the shared widget:** a pass the reference does not
    support is disabled only while it is not selected. A selected unsupported pass stays enabled and selected, so the
    widget keeps it, the user can deselect it, and `MONITORED_PASSES` explains it and holds Apply. Once it is
    deselected, it cannot be chosen again.
  - **Acceptance:** delayed evidence, a producer whose passes change, the repair by deselection, and Cancel, all
    through the real form and widget path, asserting the draft, the applied model and the hold.
- **Decision 2, masks and angles:** consumer-owned, editable, seeded once at the first Reference Apply. No new
  compatibility rule.
- **Decision 3, the radar map stays a contextual nearest-date mosaic.** It shares the alerts' effective settings
  without claiming to show the values BAYTS scores. BAYTS also applies the history's `*_speckle` factors, per-pixel
  relative-orbit masking and optional normalization, which need the historical statistics; reproducing them is
  separate work, if wanted.
  - **Shared with the alerts:** the reference-owned geometric correction and spatial speckle settings, the
    consumer's passes, masks and angles, and the alerts' forced or ignored options (`outlierRemoval` and
    `multitemporalSpeckleFilter` `NONE`, `orbitNumbers` not applied, `minObservations` 1).
  - **Intentional change:** the map no longer honours legacy multitemporal, outlier or orbit-number copies.
  - **Not added:** the product builds no historical statistics and gains no dependency.
  - **Acceptance:** the product's effective radar options for a recipe reference and an asset, including
    `NOT_RECORDED` fallbacks and holds. Its description, window and nearest-date selection are unchanged.
- **Decision 4, server-derived metadata, deferred.** Assets without recorded settings keep the documented, labelled,
  editable fallback. GUI-supplied `recipe_options` stays the documented legacy contract and does not become
  server-authoritative.
- **Unused and reference-owned saved values are preserved.** Hiding a control does not stop Historical's
  `valuesToModel` from serialising it. PRC Apply keeps the saved values of hidden unused keys
  (`multitemporalSpeckleFilter`, `numberOfImages`, `outlierRemoval`, `orbitNumbers`, `minObservations`) and of
  reference-owned keys, including their absence, as S5's `preserveProcessingCopies` does for Change Alerts. Add
  Apply and Cancel cases for unchanged, changed-elsewhere and absent keys.
- **Extraction, kept to the common boundary.** Share only what both recipes do: the evidence states and the
  per-field presentation and preservation adapter, parameterised by a field specification. Change Alerts' optical
  corrections, `dateFormat` rules and legacy metadata precedence stay in its own specification. Existing exports and
  imports are preserved, and focused Change Alerts controls cover the extraction. No general form or processing
  framework, and no shared form-lifecycle change.

**BAYTS amended proposal: independent recheck (2026-10-28).** The amendments above address the review: selected
unsupported passes remain visible and removable through the real widget path; the radar product explicitly keeps
its contextual nearest-date semantics; hidden/reference-owned saved keys are preserved; and shared extraction is
limited to common behavior. No further design finding remains. The reviewer recommends all four choices as written;
this is review acceptance, not a claim of user approval or implementation. No production change or additional test
campaign was made for this documentation recheck.

**BAYTS implementation authorized (2026-10-28).** After the amended proposal passed review, the user asked why
implementation had not started. Proceed with the four reviewed choices: preserve pass selections with explicit
repair; keep masks/angles editable and seed once during creation; retain the contextual radar mosaic while aligning
its effective processing and forced options; defer server-derived historical metadata. This replaces the earlier
audit-only packet's restriction on production changes. The audit, review and recheck records above retain their
historical approval status; there are no outstanding confirmations for these four choices. Implement the bounded
shared/GUI/gee correction and its acceptance tests together. Do not stage, commit or push during implementation.

**BAYTS settings ownership implemented (2026-10-28; browser checks pending; nothing staged or committed).** The four
approved choices and the folded-in review amendments are implemented.

- **Shared** (`lib/js/shared`).
  - `recipe/referenceProcessing.js` holds the evidence states and small parsers that both recipes use.
    `changeAlerts/processing.js` re-exports its states from it, and its API and metadata precedence are unchanged.
  - `recipe/bayts/processing.js` derives the effective settings:
    - `processingOfProducer` gives a history's geometric correction and spatial speckle settings, with absent keys at
      its radar collection's defaults (speckle `NONE`, `kernelSize` 5, `snicSize` 3).
    - `assetProcessing` reads `recipe_options`: complete beside `recipe_type: 'BAYTS_HISTORICAL'`, partial otherwise,
      `UNREADABLE` when present but unparseable or invalid, and `NOT_RECORDED` when absent.
    - `effectiveSettings` returns per-field states and the monitoring model, with `FORCED_OPTIONS` (`outlierRemoval`
      and `multitemporalSpeckleFilter` `NONE`, `orbitNumbers` `ALL`, `minObservations` 1). A pending, unavailable
      or unreadable field leaves no model. An unrecorded field falls back to the alerts' own value, or BAYTS's
      default.
    - `seedMonitoring` gives valid passes, masks and angles only.
  - `requirement/baytsAlertsProcessing.js` holds operations while the processing is pending and refuses an
    unreadable one.
  - `radarObservationRecipe` applies `FORCED_OPTIONS`.
- **Server** (`lib/js/ee/src/bayts`).
  - `historicalProcessing.js` follows the `BAYTS_HISTORICAL_STATS` provider chain one record at a time
    (`recipeRef.withRecord$`), or reads `assetProperties$`. It builds no statistics and loads no dependency.
  - `baytsAlerts.js` runs both the alerts and the contextual radar product on `effectiveBaytsAlerts`, which refuses
    unreadable processing with a client error. The product keeps its window, nearest-date selection, geometry and
    asset mask.
- **GUI.**
  - **Observation:** `referenceObservation.js` publishes `processing` beside `historicalStats`. `applyAccepted` is
    removed, so observing configures nothing.
  - **Seeding:** the REF panel seeds the consumer-owned fields through `additionalUpdates` at the first Reference
    Apply of a new recipe (`!ui.initialized`, no reference applied before), from current `SourceCandidate.facts()`.
    The existing blocked-form guard covers Apply, Enter and Next alike, since `Form.Panel` routes all three through
    `apply`.
  - **Shared presentation:** `recipe/referenceProcessing.js` (GUI) holds the extracted evidence reader, per-input
    presentation and key preservation. Change Alerts' `processingSettings.js` keeps its corrections, labels and field
    list on top of them. BAYTS's `processingSettings.js` presents the reference-owned inputs read-only, and preserves
    unused and reference-owned keys, absence included, on PRC Apply.
  - **Historical options panel, monitor mode:**
    - the read-only presentation is spread onto the geometric correction and speckle controls;
    - `SpatialSpeckleFilterOptions` gets the same editability handling Radar Mosaic's copy already has;
    - the multitemporal selector is hidden;
    - `reconcileOrbits` is removed, and an unsupported pass is disabled only while unselected, so `Form.Buttons`
      keeps a chosen one for explicit deselection.
  - **Requirements:** PRC's `MONITORED_PASSES` finding is said on the passes field. A processing declaration holds
    `IMAGE_OUTPUT` and `RADAR_OBSERVATION`, with `process.baytsAlerts.processing.*` wording.
- **Compatibility effects** (intentional):
  - Alerts and radar observations follow the history's geometric and speckle processing instead of drifted copies.
  - A history without speckle keys is monitored with `NONE`, not `LEE`.
  - Reopening, Refresh, producer edits and replacement no longer change passes, masks or angles.
  - A malformed asset record holds the alerts instead of running.
  - The radar map no longer honours legacy multitemporal, outlier or orbit-number copies.
  - The radar observation is now withheld where the reference holds no historical statistics, or none is selected,
    because its processing is the reference's. This also holds a new recipe's radar layer without a reference, which
    the open issue in `docs/recipes/bayts-alerts.md` described; server preview readiness remains separate.
  - No persisted-format change or migration: saved copies stay as saved.
- **Regressions.**
  - Shared `test/recipe/bayts/processing.test.js` (11): producer defaults, complete, partial, malformed and absent
    asset forms, invalid values, pending and unavailable, and seeding.
  - gee `alertMapProducts.test.js`: the radar product's options for a recipe, a complete asset and an asset recording
    nothing; unreadable refusals for both products; the alerts' `bayts` arguments, initial alerts included.
    `alertRuntimeGeometry.test.js`'s BAYTS fixture now resolves to a historical record.
  - GUI `referenceObservation.test.jsx` (9): processing from a recipe, a wrapper and an asset; a fresh reopen;
    replacement; a producer edit; unreadable and recovered reads; a late answer - each leaving the saved options
    untouched.
  - GUI `sourceRequirement.test.jsx` (53):
    - first Apply and Enter seeding; pending reads; the last-selected reference; Cancel; no reseeding;
    - real-widget retention, explicit repair and the inability to add an unsupported pass;
    - read-only and unverified presentation; hidden and absent key preservation;
    - unreadable holds; the radar observation's holds; and an editor opened afterwards configuring nothing.
  - GUI `changeAlerts/processingSettings.test.js` covers the extracted preservation.
  - `modelDerivedOutput`'s BAYTS evidence fixture now publishes `processing`.
- **Witnesses** (each targeted mutation restored):
  - background copying put back: 8 GUI cases fail;
  - the old pass disabling: 2;
  - no seeding: 3;
  - no preservation: 1;
  - alerts on saved options: 1 gee;
  - the radar product on saved options: 5 gee;
  - an absent speckle key at the alerts' default: 1 shared and 1 gee;
  - malformed falling back: 1 shared and 2 gee;
  - the shared presentation showing drafts: 4 Change Alerts;
  - the shared preservation keeping absent keys: the new Change Alerts case.
- **Verification** (two workers):
  - shared `test/recipe` 1497 and the gee suite 1561;
  - GUI over BAYTS Alerts, BAYTS Historical, Change Alerts, Mosaic, Radar Mosaic, `modelDerivedOutput`,
    `recipeImageLayer`, `recipeMapArea`, process panels and locale: 34 files, 680 tests;
  - ESLint on changed files and `git diff --check` clean.

  The full GUI suite and live probes were not run.
- **Not covered:**
  - No real BAYTS Historical asset was available; the asset forms rest on the exporter's code and fixtures.
  - The wizard's Next is covered by the shared `Form.Panel.apply` route rather than a mounted wizard.
- **Browser checklist:**
  1. Create BAYTS Alerts and select a historical reference. Its passes, masks and angles appear in PRC; geometric
     correction and speckle show read-only as the reference's.
  2. Edit masks, Apply, reopen the recipe: they are kept.
  3. Edit the historical recipe's speckle filter: PRC shows the new value read-only, and the alerts' preview follows.
  4. Select an asset reference without recorded options: the fields are editable and labelled unverified.
  5. Replace the reference with one lacking a chosen pass: the pass stays shown with the error until deselected,
     and Apply then succeeds.
  6. The first/last radar layer draws once the reference is read.

**Independent review of BAYTS ownership implementation (2026-10-28; corrections required).** The shared extraction
and main ownership path fit the agreed scope. Independent probes reproduced three remaining contract gaps:

- **[P2] Partly recorded speckle parameters lose their ownership in the modal.**
  `baytsHistorical/panels/options/spatialSpeckleFilterOptions.jsx` opens its modal when any visible parameter is
  editable, but `modalSubformPanel` copies only values into independent form inputs. The modal does not carry
  per-field presentation or reference ownership. With partial asset metadata recording `spatialSpeckleFilter: LEE`,
  `strongScatterers: RETAIN` and `strongScattererValues: [4, -4]`, but no kernel size, the real strong-scatterer input
  shows `4` and is neither disabled nor read-only. Its edits are then discarded by the outer read-only setter.
  Keep recorded fields read-only inside a mixed dialog, while unrecorded fields remain editable; current reference
  values must stay current without replacing editable drafts. The summary also passes tooltip information that
  `SubformDetails` does not render, so verify that unrecorded parameters have their promised attribution.
- **[P2] Unrecorded fallbacks shown in PRC can differ from execution.** With an asset recording no processing and
  saved options containing only passes and minimum observations, shared `effectiveSettings` supplies monitoring's
  `LEE` default, but PRC shows no selected filter. With saved `LEE` and `RETAIN`, but no scatterer values, the
  parameter dialog shows the Historical editor's `7` instead of monitoring's `0` (the full defaults are `[7, 2]`
  versus `[0, -5]`). `presentedInput` uses the raw editable draft, so the resolved defaults are never presented.
  Initialise missing editable values from the same effective rule, retaining subsequent explicit draft edits,
  Cancel semantics and the absence of background configuration writes. Check an unrelated Apply as well as opening.
- **[P2] Valid reference compactness zero is replaced inside the algorithm.** A historical recipe with
  `spatialSpeckleFilter: SNIC` and `snicCompactness: 0` is correctly resolved to zero, and the contextual radar
  collection honours it. The actual `bayts.js` monitoring path then uses `args.snicCompactness || 0.15` and sends
  `0.15` to `createCollection`. Preserve the resolved valid value through the final algorithm boundary; testing only
  the arguments supplied to a substituted `bayts` function misses this discrepancy.

The three GUI assertions and one backend collection-boundary assertion all fail against this implementation for
the stated reasons. They used temporary test files, now removed from the repository and archived under
`/tmp/sepal-bayts-ownership-review/`; production files and the implementor's tests were not modified.
Independent existing-test checks passed: 206 GUI tests in five files (BAYTS requirements and observation, Change
Alerts presentation, reference requirements and toolbar), and 17 backend map-product and geometry tests, with at
most two workers. No full GUI suite, browser check or live Earth Engine probe was run by this review.

**BAYTS ownership review corrections (2026-10-28).**

- **Compactness zero.** `bayts.js` takes each processing value it is given (`??`), so a resolved SNIC compactness
  of 0, or any other falsy valid value, reaches `createCollection`. Its own defaults apply only where nothing is
  given. Masks and angles keep their existing fallbacks.
- **Mixed speckle dialog.** Historical's `modalSubformPanel` now does what Radar Mosaic's does since S5. A
  reference-owned parameter is the outer presented input: read-only, kept current with `setInitialValue` and never
  written back. An editable one is the dialog's own draft, worded as the outer input words it. The dialog's controls
  spread that presentation. `SubformDetails` renders each parameter's tooltip, so the summary says which values are
  recorded and which are unverified.
- **Fallbacks shown as executed.** `unrecordedValues(settings)` gives, per form input, the value
  `effectiveSettings` resolves for each `NOT_RECORDED` field. Historical's options panel learns it once per field,
  through `setInitialValue`, where the field is first offered without a value. Opening PRC therefore does not dirty
  it: Close stays offered and nothing is written. A later edit, Cancel or clear is not overridden. An unrelated Apply
  saves the values monitoring already ran with. Shared `effectiveSettings` now validates a saved fallback, so NaN or
  null values take monitoring's default.
- **Compatibility.** Historical's own editor previously showed strong-scatterer values `[7, 2]` where none were
  saved. It now shows `[0, -5]`, which its radar collection executes. The `7` was only ever presented: the editor
  saved it on its next Apply, which execution then honoured. Radar Mosaic's `SubformDetails` still drops tooltips;
  that S5 gap is unchanged here.
- **Verification.**
  - Shared: `test/recipe` 1498.
  - gee: 1563.
  - GUI focused: 30 files / 598 tests (BAYTS Alerts and Historical, Change Alerts, Radar Mosaic, mosaic,
    model-derived output, image layer, map area, reference processing, form, locale), with two workers.
  - Witnesses each fail:
    - `||` restored: the compactness test.
    - HEAD `modalSubformPanel`, or the dialog without presentation spreads: the read-only case.
    - No summary tooltip: the attribution case.
    - No default learning, or the `[7, 2]` fallback: the filter, scatterer and Apply cases.
    - No fallback validation: the shared case.
  - The reviewer's archived probes pass when copied in temporarily (GUI 56, backend 1) and were removed again.
  - Not run: the full GUI suite and browser checks.

**Independent recheck of BAYTS corrections (2026-10-28).** The three review findings are resolved. The algorithm
preserves compactness zero, the mixed speckle dialog projects ownership per field, and absent unrecorded values
start from the effective monitoring defaults without writing the recipe on opening. The Historical editor's
strong-scatterer default correction is consistent with its existing radar execution.

Independent checks passed: 69 GUI tests in four files (BAYTS requirements and observation, Change Alerts
presentation, and Radar Mosaic's modal boundary), plus 19 backend tests (the actual monitoring collection,
map products and alert runtime geometry), with at most two workers. An additional temporary mounted case passed
for editing and applying the speckle dialog while preserving PRC's passes, masks and angles; it was removed from
the repository and archived under `/tmp/sepal-bayts-ownership-review/`. No further blocking finding from this
review. Browser acceptance and the final full GUI suite remain pending. Radar Mosaic's separate summary-tooltip
gap remains outside this slice, as recorded above. Nothing staged, committed or pushed.

**BAYTS browser acceptance and final verification (2026-10-28).** The user reports that the recipe-reference
checklist passes: initial seeding and read-only processing; monitoring choices surviving reopen; upstream speckle
changes updating reference-owned fields without resetting choices; an unsupported pass retained, explained and
repaired explicitly; and working alerts and contextual radar previews. No additional asset-metadata coverage is
claimed from this report. The final full GUI suite passed 4823 tests in 334 files, exit 0, in 366.93 seconds with two
workers (`/tmp/sepal-bayts-final-gui.log`). Fingerprints confirmed all 28 changed code/data files stayed unchanged
through verification. Shared, gee and static results remain as recorded above. The accepted slice is ready for
commit; this acceptance does not authorise a push.

## Responsibilities

This subsystem owns:

- source-reference normalization;
- structured recipe dependency edges;
- explicit-principal, authorization-aware graph traversal;
- missing, forbidden, incomplete and cyclic dependency diagnostics;
- capability-provider lineage and capability preservation;
- resolving product declarations into descriptions from graph and runtime evidence;
- coherent execution bundles for Preview and Retrieve;
- observed Earth Engine asset revisions and drift handling;
- trusted verification of versioned provenance produced by SEPAL exports.

It does not own refresh timers, GUI cache storage, visualization editing or recipe-specific React synchronization.

## Explicit resolution contexts

Reference resolution must never depend on ambient behavior.

```js
resolveSourceGraph({rootRecipe, context: {mode: 'LIVE', principal, loadRecipes, describeAssets}})
resolveSourceGraph({rootRecipe, context: {mode: 'BUNDLED', recipesById, assetObservationsById}})
```

`LIVE` loads the current authorized source graph. `BUNDLED` can read only the recipes and observations supplied in
the bundle. A missing bundle member is an execution error; it must never fall back to loading the recipe live.

`RECIPE_REF` currently serves both interactive and task execution. Its eventual adapter must require one of these
contexts explicitly so Preview and Retrieve cannot drift back to different implicit resolution rules.

## Authorization boundary

Live recipe loading requires an explicit trusted SEPAL principal. It has no default and cannot read a principal
from a recipe model or other caller-controlled request field. The gateway or another authenticated server boundary
supplies it. Omitting the principal fails before any recipe is loaded.

The resolver remains JavaScript so recipe-type edge extraction and traversal have one implementation. A
caller-aware server boundary enforces access and returns authorized recipe records; it does not duplicate edge or
capability logic in a server endpoint. Recipe contents and their server-owned monotonic revisions are read
together. Graph-wide coherence additionally needs a consistent transaction or bounded revision-recheck protocol.
Whether the Node server exposes this as batch HTTP, an internal repository adapter or both is an implementation
decision, not a prerequisite for the pure contract.

GEE reads recipes without administrator credentials. A GEE job reads as the user the gateway authenticated
on the request that job was built from; for a task container's request that is the task's user, resolved from
its per-task key. A job carrying no user reads nothing, and there is no
service-credential fallback. Recipe applies its existing ownership policy, so a recipe another user owns is
answered exactly as a missing one.

### Operation-scoped recipe loading

One execution operation - one submitted GEE worker job, one task execution - owns both the reader it is
authorized with and the records it has read. Its `configure` task opens that operation on the request's own
worker state, every later task of the request runs inside it, and the finalize pass ends it however the
request ended. Concurrent references share the read in flight, and after a successful read every later reference
gets the retained record, so the several factories one operation constructs from one reference cannot derive
geometry, metadata and imagery from different revisions. A read that fails
is not retained, so a later attempt reads again rather than replaying the failure. Reads still resolve at
subscribe, and ancestry remains path-local: a shared record carries no ancestry from whichever branch read
it first. Ending the operation unsubscribes reads still in flight and releases the records; a later
operation starts fresh and may observe newer revisions.

This guarantees one version per recipe per operation. It does not establish a coherent snapshot across the
dependency graph - nothing rechecks revisions once the closure is resolved - it does not freeze Earth Engine
assets, and it is not an accepted Retrieve execution bundle.

As a bounded migration measure, a browser operation may complete its preflight graph through the existing
authenticated per-recipe GUI read. It starts with the exact unsaved root and the session's loaded records, requests
deduplicated missing frontiers under the current user, and retains returned records only for that operation. This
does not use administrator credentials and does not make browser evidence a coherent execution graph. Missing or
forbidden records still fail closed.

The Node Recipe service exposes authorized per-recipe reads; batch and closure endpoints are future work.
Neither endpoint shape alone would establish graph-wide coherence. The trusted bundle-acquisition and task-
acceptance boundaries must also enforce the snapshot protocol. Endpoints can orchestrate shared JavaScript
traversal, capability derivation and bundle construction without introducing a separate resolver.

Ambient SEPAL administrator credentials must not be reachable from generic recipe resolution. A separately
authorized administrative operation must remain explicit; acting on behalf of a user must enforce that user's
access rather than inherit service-account visibility.

Any server-side or shared recipe, description or resolved-graph cache includes the SEPAL principal in its key.
Asset metadata caches additionally include the linked Earth Engine identity or authorization context. Cache hits
must never broaden what the current principal can resolve.

## Structured source edges

Every recipe type owns one shared definition. That definition exposes its direct recipe and asset references as
role-bearing edges after normalizing the legacy shapes in that recipe's model:

```js
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'PRIMARY_IMAGE'}
{reference: {type: 'ASSET', id: 'asset-id'}, role: 'MASK_IMAGE'}
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'FILL_IMAGE'}
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'CLASSIFICATION_SOURCE'}
{reference: {type: 'RECIPE_REF', id: 'recipe-id'}, role: 'AOI'}
```

For a source adapter or temporal composer, the discovered command skeleton owns named references once and the
recipe definition projects these role-bearing edges from that structure. Do not let a caller supply both a command
reference and an independently maintained dependency list. Discovery and binding semantics are defined in
[output-products.md](output-products.md); the graph remains the sole authority for loading, authorization, closure,
cycles, diamonds and dependency paths. A planner declares direct references but never traverses or loads the graph.
After closure, the product resolver evaluates declarations bottom-up in graph order.

The definition that owns a recipe may inspect that recipe's raw model while resolving its node. A cross-recipe
binder receives only role-scoped child product declarations, capability declarations and evidence requirements for
its named references. It receives neither foreign recipe records nor the complete catalogue. After evidence
resolution, those declarations become resolved products and capability instances carrying provider paths. This
prevents adapter or composer code from reconstructing another recipe type's output or acquiring undeclared
dependencies.

The shared recipe catalogue only imports and indexes definitions by persisted type. It rejects duplicate and
incomplete definitions and contains no recipe-specific behavior. A recipe definition must explicitly expose its
direct sources or explicitly declare that it has none; absence fails closed. Generic reference and edge modules
know canonical shapes only. Legacy `RECIPE`, `EE_TABLE`, bare-ID and other model-specific forms are interpreted by
the definition that owns those fields rather than by a central normalizer.

Role identifiers are owned by recipe definitions and are opaque to generic traversal. A new role does not require
editing a central role registry. Cross-recipe behavior must be represented by an explicit shared contract rather
than by generic code switching on recipe-specific role names.

All edges affect execution fingerprinting. Recipe references participate in dependency closure and cycle detection;
asset references contribute observations and drift checks. Only roles declared to supply inherited capabilities
participate in capability-provider lineage. Mask and fill inputs affect pixels but do not supply the wrapper's
inherited capabilities. An `AOI` edge affects output extent and geometry but does not provide image semantics.

An absent AOI means "no restriction" to the shared geometry resolver. Whether absence is allowed belongs to the
recipe's operation contract: PyEO requires an AOI for image and geometry execution but can report static band names
without one. Required-input validation returns an actionable client error; it does not depend on GUI wizard state.
The resolver remains strict about malformed descriptors rather than treating them as unrestricted geometry. The
GUI must not request initial bounds for an unconfigured selection, including a saved empty AOI object.

Every inventoried recipe type declares every output-relevant recipe and asset reference, including references
outside image-input sections. Executable references use canonical source-reference shapes. A test-only structural
audit compares a representative persisted model with its definition: every canonical reference must be either a
declared edge or an explicitly classified non-edge snapshot. Fixtures are sanitized from real saved-recipe shapes
recorded during the inventory rather than invented from an ideal model.

The audit is a migration guard, not a claim that arbitrary legacy JSON can be understood by shape alone. Strict
runtime enforcement applies only to inventoried recipe types. For them, an undeclared canonical reference is a
controlled resolution error. Tests cover every representative model and reject adding a canonical reference
without declaring or classifying it.

The resolver memoizes recipes by ID, so diamond dependencies are resolved once. It keeps the dependency
path for diagnostics and rejects direct and indirect cycles. Any adapter that loads a closure around this resolver
also applies bounded depth, node-count, serialized-byte, loading-round and request-concurrency limits with
controlled errors. Limits are safeguards against malformed graphs, not tuning knobs for ordinary recipes; their
initial values require measured repository and production evidence.

The GUI should reject a newly selected reference when it would close a known cycle. Backend resolution performs
the same check because saved and programmatically submitted recipes can bypass the form.

## Deletion and movement

Recipe deletion never cascades. When known dependents exist, deletion warns and requires confirmation. After
deletion, saved dependents retain their reference and resolve to `MISSING_SOURCE`; new Preview and Retrieve
operations are blocked. A task whose execution bundle was already accepted continues to use its frozen recipe
contents.

Dependency warnings can initially be incomplete. Once edge declarations are indexed at save time, SEPAL can report
known direct and transitive dependents without rescanning opaque recipe JSON. Recipe rename and project movement do
not invalidate ID-based references; display metadata refreshes independently.

Earth Engine asset deletion is asymmetric: SEPAL cannot enumerate every external dependent and cannot warn before
the asset is removed. Observation refresh and execution-time drift handling are the detection mechanisms.

## Execution identity and capability providers

A resolved source separates its execution identity from capability-specific providers:

```js
{
    executionReference: {type: 'RECIPE_REF', id: 'masking-recipe'},
    chain: [/* role-bearing nodes from the selected source */],
    capabilities: {
        CCDC_SEGMENTS: [{
            providerReference: {type: 'RECIPE_REF', id: 'ccdc-recipe'},
            providerPath: [/* role-bearing path to this provider */]
        }]
    }
}
```

The execution reference always identifies the selected outer source. A capability records its own provider and
evidence path; a resolved output can carry capabilities from different providers or derive one at the outer node.
There is no single semantic reference or effective recipe type. Replacing the execution reference with any
capability provider is never valid.

Resolution and compatibility are separate:

1. Resolve every dependency edge.
2. Follow roles declared to supply inherited capabilities.
3. Derive source descriptions and capabilities bottom-up.
4. Validate the consumer's expectations against the complete execution chain.

Terminal recipe type alone does not prove compatibility.

Plan validity and compatibility are separate as well. A valid bound command may carry a partial declaration and
explicit evidence requirements. A consumer then classifies its operation-specific requirement as supported,
unsupported or unresolved. Runtime availability, such as whether the configured AOI and dates produce any
observations, remains execution evidence rather than a capability or planning diagnosis.

## Resolved descriptions and capability lineage

The output-band field contract and product-declaration semantics are owned by
[output-products.md](output-products.md). This section specifies how resolution carries that description through a
dependency graph, associates capabilities with providers and applies execution constraints. The resolved generic
image description uses an ordered band array. Order is part of image schema, but consumers match by name unless their
operation explicitly defines a positional contract.

```js
{
    name: 'class',
    dataType: {precision: 'int', arrayDimensions: 0},
    grid: {
        crs: 'EPSG:32636',
        crsTransform: [10, 0, 300000, 0, -10, 1100000],
        nominalScale: 10
    },
    pyramidingPolicy: 'mode',
    valueSemantics: 'CATEGORICAL', // CATEGORICAL, CONTINUOUS or UNKNOWN
    categories: [                  // optional, provisional and evidence-qualified
        {value: 1, label: 'Forest'}
    ]
}
```

Per-band grids are real and must not be replaced by the first band's projection. `valueSemantics` and `categories`
are provisional generic fields to be tested by migrated consumers. They may support decisions such as pyramiding
and categorical applicability, but must not absorb richer domain behavior merely to avoid a capability. Categories
remain optional because an image can be categorical without an exhaustive legend. `pyramidingPolicy` is an export
requirement, not a presentation preference: CCDC array bands require `sample`, while categorical and continuous
scalar bands may require different policies. Palette and stretch are visualization state, not band schema.

Array dimensionality is verified physical schema, not inferred semantics. When SEPAL must derive an export policy
from physical schema, every band with `arrayDimensions > 0` uses `sample`: spatial aggregation can require matching
array shapes and can reinterpret structured values even when shapes happen to match. This rule depends on neither a
recipe type nor a band name. A recipe may declare another policy only when it owns and guarantees the array's
fixed-shape aggregation semantics; no current recipe does. Physical scalar type alone does not determine `mean`,
`mode` or another policy. The scalar band's physical schema can still resolve; its pyramiding policy remains absent
until stronger evidence or an explicit coexistence policy supplies one. Missing operation-specific authority must
not erase otherwise verified band schema.

Export compatibility is also per selected band. Earth Engine asset export is the only supported destination for
array-valued bands; Drive and SEPAL raster-file exports require scalar bands. If any selected band has
`arrayDimensions > 0`, the resolved output permits only the Earth Engine asset destination. This is derived from the
selected output schema, not from recipe type. An empty selection meaning all bands is compatible only when every
described band is compatible. Consumers must reject an incompatible destination before submission, and execution
boundaries must retain their own validation rather than trusting the GUI.

Export validation considers only the selected bands. A scalar band with no known policy is valid for Drive or
SEPAL, where no Earth Engine asset pyramid is created, but cannot be selected for Earth Engine asset export until a
policy is known. Consequently, a mixed scalar/array image can resolve completely: an array-only selection can
export to Earth Engine with `sample`, while a scalar-only selection can use Drive or SEPAL. An all-band selection
must satisfy the requirements of every described band.

The current shared contracts include:

- the `IMAGE_OUTPUT` product: executable image, ordered output bands and per-band export requirements;
- the `CCDC_SEGMENTS` capability: stored CCDC bands, base-band derivation, available measures and date
  interpretation;
- `BAYTS_HISTORICAL_STATS`: the producer whose statistics BAYTS Alerts monitors against, and whose processing options
  it uses as defaults;
- `OPTICAL_COLLECTION_DEFAULTS`: imagery configuration available for panel prefill, independently of whether that
  imagery can execute.

The generic `providerStep(record, capability)` reads the capability's declaration key and returns `PRODUCES`,
`PRESERVES`, `UNSUPPORTED` or `MALFORMED`. A preserving step follows only the input filling its declared role.
The shared `discoverProvider(selected, records, capability)` walks records already held and returns the provider
with the way there (`chain`: each record followed and the role it was followed through) or where the walk stopped
(`at`); the GUI's `resolveProvider` adapts it for callers that treat every stop as a failure. Execution's segment
resolver loads records through the operation's reader. Both use that same step. A possible provider is not verified
asset content or a guarantee of compatibility with every operation: discovery says where to look, and a consumer's
requirement decides from evidence about what is there ([Change Alerts REF](#change-alerts-ref)).

### Current segment consumer contract

CCDC Slice and Change Alerts ask the GUI's segment capability adapter for a description. Registered producer
providers describe CCDC from its model and declared dependencies, or an asset from its metadata. The shared
evidence lifecycle owns watching and acceptance; consumers derive their bands, dates, presets and operation choices
from the accepted description. A saved Slice can supply a description to another recipe without first being opened.

Slice uses the shared mode-aware output-band derivation for its declaration, GUI and execution band reporting.
Segment slicing and interpolation/range modes retain their distinct harmonic behavior. Presets and Retrieve
selections are filtered against the bands the chosen operation actually produces. A map layer's selection whose
bands disappear is never rendered; it gives way to the first style offered, or is kept while none is. Stable preset
identities are reconciled against the selected source and the styles restored from saved layers.

Slice, Change Alerts and the segment chart resolve execution facts through
`lib/js/ee/src/timeSeries/segmentSource.js`. It obtains `{dateFormat, selectableBaseBands}` before the consumer
chooses image-construction arguments. A declared asset-backed producer names the asset whose properties supply
the date representation. Discovery and construction reuse the operation's recipe records, and construction
retains the selected outer reference and its ancestry: Masking supplies the image while its primary producer
supplies segment facts. Asset metadata and pixels are not frozen by that record sharing.

For a recipe source, the producer's declared date representation or asset property takes precedence over a legacy
copy beside the reference; a missing value may use that copy. For a directly selected asset, an explicitly
configured date format takes precedence, including zero. Slice retains its final zero default; Change Alerts does
not introduce one. Fresh descriptions are not copied into these consumers' models, and saved copies are not
rewritten. Changing the date-format override policy is a separate decision.

Unsupported and malformed sources fail before segment algebra with `UNSUPPORTED_SEGMENT_SOURCE` and
`MALFORMED_SEGMENT_SOURCE`. Preservation-chain cycles use the execution path's `CYCLIC_DEPENDENCY`; unavailable
recipe or asset reads propagate instead of falling back to a copy. The GUI additionally identifies unresolved
records as `UNRESOLVED_SEGMENT_SOURCE`. Runtime witnesses live under `modules/gee/test/jobs/ee/ccdc/` and
`modules/gee/test/jobs/ee/timeSeries/`; their external substitutes do not prove live Earth Engine pixel results.

`CLASSIFICATION_RESULT` remains a likely later capability for classification-specific contracts. Generic
categorical metadata must not be stretched into classifier behavior, reusable training data or other algorithmic
capabilities.

### Classification results and reusable classifiers

These are distinct candidate contracts, to define from their consumers. A classified result supplies pixels and
their categorical meaning. A reusable classifier supplies the behavior needed to classify another image, including
its training and input requirements. PyEO needs the baseline classified image and classifier behavior; CCDC, Time
Series and Phenology also apply a selected classifier to collection images. Band or legend availability alone
cannot establish compatibility for those operations.

Masking a Classification preserves values at the remaining valid pixels; it does not by itself establish how to
reuse that classifier. Before accepting such wrappers, decide whether the mask affects only the baseline, also
newly classified images, or the training footprint, and define preservation for each requested operation. Execution
must retain the selected wrapper wherever its output is consumed. Resolving a classifier provider cannot silently
replace that output with the unmasked Classification.

An optical input masked before Classification is a different composition from a Classification whose output is
masked. Support for the former does not prove the latter. Standardizing selector presentation is independent of
this design and should retain existing eligibility until the behavioral contract is established.

### Transformation and preservation

Recipe definitions describe their product transformations in terms of guarantees relevant across capabilities.
For example, Apply mask preserves ordered band schema and values at pixels that remain valid, changes the mask and
may change the effective footprint. It also preserves per-band export requirements because it does not change band
representation. A capability contract states which guarantees it requires and whether a transformation preserves,
decorates, derives or drops it. The resolver combines the contracts bottom-up.

Identity needs no per-band list. A subset or rename is different: it supplies the actual ordered input-to-output
mapping, not merely a `SUBSET` label. Generic resolution validates that every mapping refers to the stated input and
output products and is unambiguous. Capability-owned code receives the input capability, both products and the
transformation effects, then preserves, reduces or drops its capability description. Generic code never interprets
CCDC timing, measures or another domain contract.

The same mechanism applies to n-ary recipes. A Stack definition maps each input's bands into its output, carrying
schema, export requirements and capability evidence only for unchanged bands. It can expose several instances of a
capability from different inputs. A value-changing operation such as Band Math derives a new output and does not
inherit domain capabilities merely because one input supplied them.

Do not maintain a list of pass-through recipe types in each consumer, and do not require every pass-through recipe
to name every capability individually when its transformation guarantees already decide preservation. A recipe or
capability may still provide an explicit rule when generic guarantees are insufficient.

### Requirement and capability discovery

Compatibility is queried for a source instance's declarations or resolved description, not inferred from its recipe
type. The same Masking type can preserve `CCDC_SEGMENTS` when its primary input provides that capability, and lack it
for another primary input or operation. Capabilities are zero-or-more instances keyed by capability name; each
instance has a stable provider path and any output-band mapping needed to interpret it. A consumer expectation
includes cardinality or a persisted
instance selection when more than one match is meaningful. It receives one of three outcomes:

- `SUPPORTED`: current declarations or resolved evidence satisfy the operation requirement;
- `UNSUPPORTED`: the operation is not admissible under the current contract, whether contradicted or lacking
  permanently required provenance;
- `NEEDS_EVIDENCE`: a concrete authorized acquisition path could still decide the requirement.

`NEEDS_EVIDENCE` is not a runtime transport state. Before acquisition, supported requirements skip observation and
unsupported requirements stop. After acquisition, success yields supported or unsupported, transport or
authorization failure yields runtime `UNAVAILABLE`, and contradictory or malformed evidence yields runtime
`INVALID`. Once all declared acquisition paths are exhausted, final validation cannot remain `NEEDS_EVIDENCE`.
A permanently unknowable semantic requirement is unsupported with `INSUFFICIENT_PROVENANCE`.

Recipe selectors use this query rather than synchronous type predicates or blanket `sourceRecipe` checks. A
consumer such as Change Alerts declares `CCDC_SEGMENTS` and remains unaware of Masking and future pass-through
types. If several instances match an expectation requiring exactly one, the result is unsupported with a stable
ambiguity diagnosis until the consumer supports choosing one. Existing persisted selections are revalidated through
the same contract and remain visibly invalid rather than being silently replaced. Backend validation repeats the
required safety checks for legacy models, direct API submissions and stale clients.

The GUI can seed descriptions from recipes already loaded in the session and may complete one operation's declared
closure through the existing authenticated per-recipe read. This temporary loading is suitable for bounded
preflight of a known root, not for searching all saved recipes or establishing execution coherence. Complete
discovery across saved recipes requires the caller-authorized storage and session-catalogue boundary described
below. Asset capability discovery uses authorization-scoped metadata evidence and bounded inspection; an arbitrary
asset property is not proof of compatibility.

Selector integration is a later step after validation of a selected source. Recipe listings carry basic metadata,
not the configured dependency chain, and asset listings do not establish band structure. Opening a picker must not
load every recipe closure or issue an Earth Engine metadata request for every candidate.

- Use cheap candidacy rules first, retaining deliberate input-eligibility restrictions. These can rule out impossible
  types but cannot prove a particular source suitable.
- Refine candidates using current records and evidence already held by the shared runtime. Known unsuitable
  candidates may be excluded or disabled with a reason; unknown or temporarily unavailable candidates must not be
  treated as unsuitable merely because they have not been checked.
- Perform bounded validation when a candidate is selected, sharing the existing loading and evidence paths.
  Any later inspection of visible or searched candidates needs an explicit request budget and cancellation policy.
- Always retain the current selection visibly, with its diagnosis, even if it no longer qualifies for new selection.
- If efficient discovery needs richer recipe summaries or an index, design its authorization and dependency/version
  invalidation separately. Such summaries narrow candidates; final validation still checks current evidence.

Keep candidate discovery separate from suitability validation so a future storage implementation can query recipe
configuration and dependency relationships directly, for example with PostgreSQL JSONB. Do not make discovery
depend on loading the entire catalogue into the browser or duplicate capability rules in storage-specific queries.
Validation consumes supplied records and evidence regardless of how candidates were found; session drafts remain
part of final validation. This is a compatibility direction, not a scheduled database migration or a reason to add
a speculative storage abstraction to the current packet.

#### Requirement contract

A requirement is pure and shared (`lib/js/shared/src/recipe/requirement/`): a stable `id`, the capability it is over,
and `evaluate(facts, parameters)`, where `parameters` is plain data and `facts` describe the provider the capability
resolves to - never the recipe that selects it. It loads nothing, acquires nothing, translates nothing and holds no
UI state; without facts it answers `NEEDS_EVIDENCE`. Capability discovery (`discoverProvider`) stays separate: it
finds the provider over records, and a requirement judges that provider's facts. For CCDC segments the facts are
`{producer: COMPUTED, measures}` for a recipe computing its segments, whose layout CCDC guarantees by declaration, or
`{producer: ASSET, assetId, bands: [{name, arrayDimensions}]}` for segments stored in an asset, a rank undefined
where the metadata established none. Each consumer's GUI side adds what diagnoses mean (`describe`) and where facts
come from (`factsOf` on the capability).

Today loaded records supply discovery, and the observation the source runtime accepted supplies the facts: typed
asset metadata, or the producer's own description. A future index could supply both instead - per recipe its type and
declared source edges, per asset its typed-band summary - and the same `evaluate` would answer a query without full
recipe JSON. Facts from an index are no more current than facts read live: a summary must carry what makes it
trustworthy - the identity of the source it describes, the record revisions it was taken from, the asset versions or
update times it was read at, and the authorization scope it was read under - and be checked against the current
state as live evidence is. The live check compares a basis that includes object identity within one session; an index
needs equivalent semantics expressed in those durable terms, not that mechanism. Evaluating an old summary alone never
establishes current suitability.

#### Validation across model properties

General policy belongs to [validation across model properties](../../code-design.md#validation-across-model-properties),
not source resolution. Source-backed validation adds provider discovery and current evidence to that policy.

For Change Alerts, REF is refused when established facts show no supported monitoring source can use its segments.
When REF permits a valid configuration but the current monitoring settings do not, the reference replacement is
applied, Sources is marked and the actionable Sources field is invalid, saying what to change - the type of data, the
data sets or the band monitored. REF says nothing of it: a reference deliberately replaced is followed by Sources' own
validation, not warned of in advance, and Sources declares no advisory to REF.
Optional chart requirements gate the chart independently. [Change Alerts REF](#change-alerts-ref) describes how.

Date compatibility needs a separate execution-derived rule and adequate evidence. Preserve configured dates;
distinguish an incompatible selected period from a reference that cannot support any permitted period. Metadata
extents alone must not be assumed to establish per-pixel coverage.

### Change Alerts REF

Change Alerts is the first consumer to validate its configured source. A recipe declares what it needs; shared code
decides when the answer can be trusted and what it does to the UI.

- **Declaration** (`referenceRequirement.js`). Change Alerts' type declares four requirements over its reference,
  the selection by the role its source edge already has (`PRIMARY_IMAGE`), each with the section it belongs to and the
  requests that need it met. A section may name the form input that shows what its requirements find (`input`, a
  function of the panel's form values naming a form input, not a model location): REF names its asset or recipe input,
  and Sources names none, so its findings show on its toolbar button only. A requirement may name other sections whose
  status advises that it is not met (`advise`); none of Change Alerts' does, so REF gets no cross-section advisory:
  what Sources needs after a reference is replaced is said in Sources alone.

  | Requirement | Section | Gates | Required to apply |
  |---|---|---|---|
  | `ccdcSegments.sliceable` | REF | the alerts and their Retrieve (`IMAGE_OUTPUT`); the monitoring and calibration mosaics through the provider chain only (`providerOperations`) | yes |
  | `ccdcSegments.monitoredMeasure`, `{monitorable}`: the bands any monitoring data Sources offers observes | REF | the alerts and their Retrieve | yes |
  | `ccdcSegments.monitoredMeasure`, `{measure, available, observed}` from `sources.band`, the bands any data sets of the selected type observe, and those its selected data sets observe | Sources | the alerts and their Retrieve | yes, in Sources |
  | `ccdcSegments.chartable` | REF | the segment chart (`PIXEL_SEGMENTS`) | no (`requiredForSelection: false`) |

  Each is derived from what reads it. The alerts' slicer (`changeAlertsAlgorithm.js`) finds the segment nearest a date
  from `tStart` and `tEnd` and evaluates a measure from `<measure>_coefs` against `<measure>_rmse`, every band shaped as
  it masks it: a `_coefs` band as a two-dimensional array, any other as a one-dimensional one. The segment chart
  (`ccdcGraph.jsx`) also plots `tBreak`, `changeProb`, `numObs` and a measure's `_magnitude`. The mosaics resolve the
  segment source's geometry only. Which measure is monitored is a setting of Sources, so a reference that fits other
  measures is still a suitable reference; the alerts wait for Sources to name one it fits. A reference with no
  measure any monitoring data Sources offers observes could never be monitored, and is refused in REF. What the
  monitoring data observes comes from the band definitions Sources itself offers (`monitoringData.js`): any one data
  set of a type, top of atmosphere or corrected to surface reflectance.
- **Requirements** (`requirement/ccdcSegments.js`, shared; `segmentRequirements.js` for their wording). Segments read
  from an asset - selected directly or named by an asset-backed recipe - are judged from the dimensionality its
  metadata states for its bands; a recipe computing its segments guarantees the layout by declaration, so only its
  measures are asked of it. A band whose dimensionality was not established is insufficient evidence, kept apart from
  an observed incompatibility and never reported as a scalar, and refuses wherever the requirement is mandatory. The
  rules do not establish how many coefficients an array holds, whether dates are in the configured representation, or
  anything of an image collection beyond its first member. The monitored measure is judged against narrowing scopes,
  the widest that observes none of the segments' measures refusing them - any monitoring data, the selected type, the
  selected data sets - so the diagnosis names the setting to change. Diagnoses read as a summary naming a few
  representative problems, with every problem in their details; an asset without the time bands every requirement
  over segments needs is said, in one sentence naming the remedy, to provide no CCDC segments at all.
- **Facts.** The observation reads the asset's metadata (`/assetMetadata`), which states each band's array rank: for an
  image asset, the gee adapter restores the rank the Cloud record states (`dimensionsCount`) that the Earth Engine
  client's legacy conversion drops; a band whose rank was not established stays unknown. The segment description
  carries the ranks as `typedBands`; the capability's GUI side (`SEGMENTS`, `segmentCapability.js`) turns an accepted
  observation into facts - an asset's typed bands, and only those of the asset that establishes the capability, or a
  computing producer's measures. One observation answers all three requirements. Version polling stays a separate
  metadata read.
- **Trust** (`sourceRequirements.js`). Shared for every declaration: the selection by role, missing selections,
  `discoverProvider` and its generic diagnoses (not a producer, unfilled role, cyclic), and whether the evidence owner's
  answer counts - its live basis from the source runtime ([evidence watches](gui-source-runtime.md#evidence-watches))
  passing the owner's own rule for that selection, the evidence published by the observation that basis belongs to,
  and the asset that establishes the capability authorized by its asset evidence; a mask or AOI failing says nothing
  about it. A chain that cannot lead to the capability is refused from the held records alone, owner or not. A failed
  read settles to unavailable; nothing reading the source is unchecked, never waited on. Each read answers its verdict
  (`SUPPORTED`, `UNSUPPORTED`, `NEEDS_EVIDENCE`) apart from the state of its evidence (`UNCHECKED`, `CHECKING`,
  `CHECKED`, `UNAVAILABLE`, `EXPIRED`), and says whether its section selects the source: a section names the form
  panel editing the model at its id, so REF selects the reference and Sources configures something that depends on it.
- **Section status** (`selectedSourceStatus.js`). A section is held back by the requirements its
  selection must meet: a refusal before unavailable or expired evidence before checking. A section that only depends
  on the source is held back by what is established about its own setting; whether the source can be read is the
  selecting section's to say. Every other established problem over the same source is an advisory, said apart and
  never in place of what holds the section back: a requirement of one operation only (the chart, in REF), by what it
  says; and, while nothing holds the section back, one advisory naming each other section whose settings no longer
  suit the source and whose requirements name this section to advise (PRC, in BAYTS Alerts' REF), whose own status
  says why. A diagnosis is said once per section. Toolbar marks
  count only what holds a section back (REF and Sources alike). While a recipe's wizard sets it up, a section it has
  not reached is not marked yet (`SectionButton`, `PanelWizard`'s `reached`): a section is reached once its panel has
  been open, and every section is once the wizard is done. Only the toolbar mark waits; what holds the section back
  holds the recipe all along, and a panel says what it says once open.
- **Input feedback** (`sourceInputFeedback.jsx`, `inputFeedback.js`). Inside REF, the section's status is said on the
  input its source is selected in, which the section's declaration names (`input`: the asset or recipe input), as that input's
  field validation rather than messages of its own. What holds the section back is the input's error, in its short
  message alone - the problems behind it stay in the status, not in the tooltip - after the input's own required-field
  or loading error and never in its place, and it holds Apply back as an invalid field does.
  A check still running is the input's busy indicator, explained in its label's
  tooltip beside the tooltip it already has, and holds Apply back too; the label's content is left as it is.
  Advisories are its warning, hold nothing back, and show only while nothing holds the section back, so the input shows
  one indicator: a chart's problem waits until the reference itself is usable. Refresh, where reading the source again
  may help, is a button
  beside the label. The combos read this from the form they are in (`feedbackOf`), so a panel adds no code for it.
  Sources declares no input: its button choices cannot show feedback (`Form.Buttons` does not read it), keep their existing presentation, and a candidate it refuses holds its Apply
  back. What is wrong with its committed settings is said by its toolbar button's mark and tooltip, naming the
  setting to change - the type where no data of that type observes a measure of the reference, the data sets or
  pre-processing (an optical reflectance correction) where others of the type would, otherwise the band.
- **Validation before Apply** (`sourceCandidate.js`, `recipeFormPanel.jsx`). A recipe form panel whose id names a
  declared section judges its values before they are applied, with no panel code: over the recipe as it would be with
  the values applied - the candidate - by the same reads. Where the observation keeping the recipe's own evidence
  current holds for the candidate - its live basis passes for it, as when a Sources edit leaves the reference alone -
  that evidence answers, so changing the monitored measure is judged anew without another read. Otherwise the
  candidate is observed on its own while the panel is open (`watchCandidate$`): the evidence is held by the source
  runtime, never published to the recipe, and the recipe's configuration, evidence and drawing stay as they are until
  Apply. One object stands for an edit while it is the edit, and the recipe's own where the edit is what the recipe
  holds, so selections compare as the basis compares them: a same-asset edit of the date representation is read
  anew, and returning to the applied one reads nothing. An edit that changes, a Cancel and a closed panel let the
  candidate go, cancelling its read. Apply asks the form at that moment (`isInvalid`), so evidence a change of
  credentials, records, refreshes or tokens moved past refuses it however recently it was read. Refresh in the panel
  reads again what the candidate's own observation read - its assets, explicitly refreshed, or failing that the
  candidate observed anew - and never the source the recipe holds, unless that is the candidate's. A saved unsuitable
  reference stays visible with its diagnosis and never blocks applying a suitable replacement. Applying commits what
  the panel owns: a replacement fitting other measures is applied, Sources marked invalid, and the alerts waiting for it
  to be repaired. After Apply the recipe's evidence is read again through the normal lifecycle.
- **Authority.** A layer whose product a requirement holds says so on its area menu's visualization selector, as that
  selector's own feedback, without changing the menu's layout: a check in progress is its busy indicator, explained by
  its label. Why the requirement is not met is said in the recipe, on the section's fields and toolbar, so a layer of
  the recipe being edited adds nothing to them, and a layer of another recipe says only that it cannot be rendered and
  which section of that recipe to review. A product no requirement holds says nothing of it, and a selection not made
  holds what needs one. Retrieve decides from the same reads at submission: it waits while the source is
  being checked and otherwise blocks, naming the section; dependencies already known to be unsound refuse it for that
  instead. A new preview or segment-chart request is held by the reads of the requirements naming it (`requestGate`)
  while they are not known to be met, keeping what is already drawn; a source found missing or unsuitable also
  withdraws the drawing. The chart offers the measures the chart requirement establishes that its observations show
  ([operation availability](#operation-availability)), and replaces a charted band that is no longer one of them, but
  not while the reference is being checked again. Once none is left, an open chart cancels what it is reading, stops
  showing what it read and settles on saying it has no band to chart; it charts again once one returns. The consumer making a request
  watches what its operation needs wherever the recipe is shown. Absence from the listing is never called deletion.

Scalar-image and classification-input requirements, and execution parity for asset segment leaves, remain separate
packets. CCDC Slice ([below](#ccdc-slice-src)) and BAYTS Alerts ([below](#bayts-alerts-ref)) follow the same contract.

### CCDC Slice SRC

CCDC Slice declares two requirements over the source selected in SRC (`ccdcSlice/sourceRequirement.js`), by the role
its source edge already has (`PRIMARY_IMAGE`), and registers its existing observation (`sliceObservation`) so layers,
Retrieve and the chart check it outside the editor:

| Requirement | Section | Gates | Required to apply |
|---|---|---|---|
| `ccdcSegments.sliceSource` | SRC | the slice, its layers and Retrieve (`IMAGE_OUTPUT`) | yes |
| `ccdcSegments.chartable` | SRC | the segment chart (`PIXEL_SEGMENTS`) | no (`requiredForSelection: false`) |

Each is derived from what reads it:

- **The slice** (`lib/js/ee/src/timeSeries/ccdcSlice.js`, `temporalSegmentation.js`). Every mode - a date by segment
  or by interpolation, or a range - finds segments from `tStart` and `tEnd`, treats every `_coefs` band as a
  two-dimensional array and every other band as a one-dimensional one, and reads `tBreak`, `numObs` and `changeProb`.
  It reads every measure the source holds, not only the ones asked for: an asset is sliced whole, since an asset read
  takes no selection, and each `_coefs` band is read with its `_rmse` and `_magnitude` band, by name. A break's
  confidence divides the `_magnitude` bands by the `_rmse` bands pairwise in stored order. So one complete measure
  beside an incomplete one fails, as does a lone `_rmse` or `_magnitude` band; magnitudes stored in another order
  than their errors would be paired wrongly without failing, and are refused as well. At least one measure. Change
  Alerts' `ccdcSegments.sliceable`, which needs only `tStart`, `tEnd` and one measure with its RMSE, is unchanged.
- **The chart.** The segment endpoint reduces whatever bands the source has at the pixel, and the graph reads the
  segment bands and the one measure it plots, so incomplete extra measures do not fail it. It shares Change Alerts'
  `ccdcSegments.chartable`. A source the chart can plot but the slice cannot is refused in SRC, holds back Retrieve
  and leaves the chart available.
- **Computed segments.** CCDC fits complete measures by its own declaration, so only that it fits one is asked of
  it; Masking over CCDC is followed through its provider chain. Masking over anything else is refused from the held
  records, naming where the chain stopped.

Asset metadata does not establish how many coefficients an array holds (the slice pads them to eight), whether the
configured or declared date representation is right (Slice falls back to Julian days where neither says), anything of
an image collection beyond its first member, or whether a pixel has segments at all. A rank the metadata does not
state is insufficient evidence, never incompatibility; an asset that cannot be read is unavailable, with Refresh.
Options' break-analysis band naming a complete measure is not yet validated.

- **Evidence.** The shared segment-asset description carries the asset's typed bands, from the metadata response it
  already reads (`ccdc/segmentsAsset.js`). `resolveEvidence$` stays registered for Masking over Slice.
- **Saved-layer provenance.** The observation declares `savedLayerSource`: the source registry records the source
  the saved layers were styled for when the recipe is first observed, by whoever watches
  ([evidence watches](gui-source-runtime.md#evidence-watches)).
- **SRC.** The compact Asset/Recipe selector sits in the input's label row; changing the type clears the asset, the
  recipe and the date representation, and a recipe with nothing selected starts on Recipe. The picker offers recipes
  of types that may provide segments (`mayProvideSegments`) - Masking among them - and keeps a saved selection
  selected. The asset picker no longer judges band suffixes; it prefills the date representation from the asset's
  property when that asset is first selected, or when none is configured. SRC names its input (`input`), so a
  candidate it refuses is that input's error and holds Apply back; the toolbar marks SRC through
  `withSourceProblems`. Slice declares no cross-section advisory.
- **Chart and actions.** The chart watches what `PIXEL_SEGMENTS` needs, offers the measures the chart requirement
  establishes, holds new requests while the source is checked, withdraws what it drew once the source is refused,
  and charts again once one suits. Chart and Retrieve actions use the shared
  [availability](#operation-availability).

### BAYTS Alerts REF

BAYTS Alerts declares two requirements over the reference selected in REF (`baytsAlerts/sourceRequirement.js`), by
the role its source edge already has (`PRIMARY_IMAGE`), and registers its existing observation
(`baytsAlertsObservation`) so layers and Retrieve check it outside the editor:

| Requirement | Section | Gates | Required to apply | Advises |
|---|---|---|---|---|
| `baytsHistoricalStats.monitorable` | REF | the alerts, their layers and Retrieve (`IMAGE_OUTPUT`) | yes | - |
| `baytsHistoricalStats.monitoredPasses` | PRC (`options`) | the same | yes | REF |

They are derived from what reads the reference. The alerts (`lib/js/ee/src/bayts/bayts.js`, `baytsAlerts.js`) read it
whole. For each radar image of a pass they monitor, they select the bands whose names end in that pass's suffix
(`_asc`, `_desc`), strip it, and read `orbit` by name and the `_mean`, `_std` and `_speckle` bands each as a pair
matched against VV and VH by position; statistics of other passes are never read. A pass is held where any of its
statistics is, and usable where it has all seven - `VV_mean`, `VV_std`, `VH_mean`, `VH_std`, `orbit`, `VV_speckle`,
`VH_speckle` - as scalars, VV stored before VH, with no other band of that pass read as one of them. Each pass is judged
on its own:

- **REF** needs at least one usable pass. Where none is, a pass that may be usable but whose ranks are not stated
  leaves it insufficiently evidenced; otherwise the held passes' problems refuse it, and a reference holding none is
  refused as such.
- **PRC** needs every pass it monitors (`options.orbits`; both where none are stated, as execution does) to be usable.
  Passes saved as anything but a list of orbit passes are refused as malformed; otherwise a pass the reference does not
  hold is refused naming the usable ones, then an incompatible monitored pass, then one
  whose ranks are not stated. Passes not monitored are not judged. PRC has no input to show it on, so its toolbar
  button is marked; the requirement advises REF, whose status gains the aggregate warning while nothing else holds it
  back. Applying PRC judges the edited passes against the evidence already held for the reference, reading nothing.

A computed BAYTS Historical builds every statistic of the passes it is configured with, so only those passes are
asked of it; Masking over one is followed through its provider chain, and Masking over anything else is refused from
the held records. The first and last radar observations a layer can show build a radar mosaic over the reference's
geometry, masked by a direct asset reference's mask, and read none of its statistics, so neither requirement gates
them.

Asset metadata does not establish which pass's imagery the statistics were computed from, how they were filtered,
anything of an image collection beyond its first member, or per-pixel validity. An asset that cannot be read is
unavailable, with Refresh. The statistics come from the asset metadata response the observation already reads for the
processing options (`historicalStats`, `baytsAlerts/historicalStatistics.js`); no second lookup is made. Processing
options are not an execution requirement: options that cannot be parsed, or that state passes BAYTS Historical would
refuse (`baytsHistoricalRefusals`), seed nothing and leave the statistics to be judged.

REF does not own pass coverage: it would refuse a candidate before the prefill that follows Apply could align the
passes. Validity does not depend on that prefill; where the reference describes its passes, the prefill resolves the
mismatch PRC reports.

- **REF.** The compact Asset/Recipe selector sits in the input's label row; changing the type clears the asset and
  the recipe, and a recipe with nothing selected starts on Recipe. The picker offers recipes of types that may provide
  the statistics (`mayProvideHistoricalStats`) and keeps a saved selection selected. REF names its input (`input`): a
  candidate it refuses is that input's error and holds Apply back, a check is its busy indicator, and a reference that
  cannot be read is its error, with Refresh; the toolbar marks REF through `withSourceProblems`. The failure toast is
  gone. Only the selection is written: the bands, dates and visualizations an older GUI saved beside it are read by
  nothing, and are dropped when the reference is next applied.
- **PRC.** Where REF establishes the passes the reference supports - its verdict's usable passes
  (`supportedPassesOf`) - PRC's pass choices are limited to them: an unsupported pass cannot be chosen, and once for
  each answer the form keeps the passes chosen that are supported, or chooses every supported pass where none of them
  is. A choice made after that, clearing every pass included, is left as made; no pass chosen is the Orbits field's
  required error, shown beside its label (`Form.Buttons`' opt-in `errorMessage`), and holds Apply back. Passes saved as
  anything but a list count as none chosen. While the reference is checked, unreadable or refused nothing is inferred.
  This is the form's only: Cancel keeps the saved passes, and the PRC requirement still judges saved settings and
  changing evidence. BAYTS Historical's own panel is given no support, shows no required error, and is unchanged.
- **Prefill.** The processing options are applied as before, only while the editor watches; evidence a layer or
  Retrieve obtained configures nothing until the editor opens and processes it once.

### Operation availability

Whether an operation over a recipe may start is one shared assessment (`operationAvailability.js`), derived from the
type's declared requirements, the recipe's current configuration and the current evidence. It is not a separate
validation system and adds no rules: it reads the same requirement reads the request gates read. The action opening
an operation, the panel carrying it out and the requests it makes consume this one assessment, so they cannot
disagree. Availability is per operation; there is no recipe-wide validity flag.

Implemented for two operations:

- **Segment chart** (`pixelChartAvailability`): the `PIXEL_SEGMENTS` request gate, and the measures the chart
  requirement establishes, narrowed to the bands the chart's observations show. A type supplies those bands as a
  fact (`observedBands(recipe)`); Change Alerts names the bands its monitoring data observes (`monitoringData.js`).
  Established, but with none of its measures observed (`noChartableBand`), the chart is not available; while what
  can be plotted is still being checked, that is not known, and the gate alone holds the chart back. The chart
  panel takes its segment gate, band choices and `noChartableBand` from the same assessment, so the action and the
  open chart cannot disagree about whether there is a band to plot.
- **Retrieve** (`retrieveAvailability`): the `IMAGE_OUTPUT` source-requirement gate. Retrieve's submission decision
  (`retrieveOutput.js`) takes its source gate from the same assessment. Retrieve's other readiness - the recipe
  listing, unsettled drafts, asset authority and the output itself - does not hold the action back. Opening the
  panel is what renews the listing and starts watching the output that the asset authority is read for, so gating
  the action on them could keep it closed for good; and the panel is where their diagnosis is said. The panel and
  the submission decide from them as before.

The shared Chart and Retrieve toolbar actions are disabled while their operation's prerequisites are being checked or
are not met. They use the buttons' existing disabled state, which also takes them out of keyboard focus. They add no
tooltip, message or busy indicator: why a prerequisite is not met is said where the section's status says it. A pixel
selection started before the chart became unavailable is let go, a pending long press is cancelled and the coordinate
input is closed, and the input neither opens nor charts coordinates while the chart is unavailable, so a later map
click or coordinate cannot open the chart. The actions become available again by themselves as the evidence or configuration
recovers. Each action is held back only by its own operation: a chart that cannot plot leaves Retrieve available, and
a monitored measure the reference lacks leaves the chart available.

Disabling the opening action replaces no protection inside an already open panel: the chart still withdraws and
recovers what it shows, and Retrieve still decides at submission. The evidence the actions read is kept current by
whatever watches the recipe - its editor, an open panel or a layer - and the actions add no watch of their own. A type
that declares no requirements is never held back.

Requirements over a recipe's own configuration feed the same assessment ([local
requirements](data-sources.md#validation-boundary-review)): one not met refuses its operations with
`CONFIGURATION_UNMET`, naming its section, and withdraws what they drew, as a source found unsuitable does. Retrieve
refuses on it whatever the output reads as. Extending availability to other operations belongs to the
[declarative validation roadmap](data-sources.md#declarative-validation-across-model-properties), not to this
assessment's current scope.

### Execution readiness

Implemented for declared `IMAGE_OUTPUT`, `PIXEL_OBSERVATIONS`, `PIXEL_SEGMENTS` and `TRAINING_DATA` operations
(`lib/js/shared/src/recipe/output/readiness.js`). Coverage is operation- and recipe-specific; the
[current release checkpoint](#current-release-checkpoint) separates remaining work from completed migrations.
It closes the gap [dependency-scoped descriptions](gui-source-runtime.md#reading-a-recipes-own-output)
leave open: a description that is `READY` over a `VALID` closure is not permission to run. One rule produces findings,
shared readiness combines them, and GUI declarations explain them; no rule is copied. It adds no validation framework:
it reuses the declarations, the closure, the output read and its acquisition, its caches, and the requirement reads
consumers already share.

**The gap it closes.** Read for its description alone, a Remapping over a Random Forest Classification with no
training data, and a Masking using that Classification as its mask, were `READY`. Remapping describes its class band
from its legend and reads no input, and Masking's preserving provider reads only its primary image. Both execute
their inputs, and Earth Engine failed training on an empty collection. A Masking whose mask is unselected has no mask
edge at all, and failed in Earth Engine (`lib/js/ee/src/masking.js`). Readiness refuses all of these, and adding
training data or a mask restores them.

#### Description and readiness

They answer different questions, and neither stands in for the other:

- **Description** - which bands a configured recipe provides, and what is established about them. Unchanged: only
  what its provider reads can fail it, and a refusal there means the schema itself cannot be stated.
- **Readiness** - whether one operation over the recipe can run. It combines:
  1. the recipe's own **configuration requirements** for that operation;
  2. its description, where the operation builds its image: a description refusal is also a readiness finding;
  3. the description and readiness of every dependency the operation needs an image from - whether or not the
     provider read it;
  4. structural soundness, `dependencyValidity`, unchanged and still required beside it.

A Classification without training data is described, with its classifier's bands, and is not ready. Its bands still
serve styling, presets and band choices, and nothing draws or exports it.

#### Result contract

Readiness is `{status, findings, needs}`, answered by the same read as the description and in the same vocabulary as
its acquisition:

| Status | Meaning | Who answers it |
| --- | --- | --- |
| `READY` | Every requirement is met, over everything the operation needs | the pure read |
| `NEEDS_EVIDENCE` | No finding, and some record or observation the operation needs is not held; `needs` names them | the pure read |
| `UNAVAILABLE` | No finding, and what it needs could not be had: a closure that failed, an observation that failed, an asset found missing | the settled read, the GUI runtime's terminal, or Task's settled read |
| `NOT_READY` | At least one confirmed finding | the pure read, kept by every later answer |

- `findings` are `{code, path, recipePath}`: the originating recipe is the tail of `recipePath`, the location its own
  model path, however far up the closure.
- A confirmed finding outranks missing or failed evidence and is never lost to it. `NOT_READY` keeps every finding
  established so far, and its `needs` still name what it waits for. Within one evaluation, evidence settling can only
  add findings. A finding lasts only while the records and evidence it was found in are current: a repair, an
  explicit refresh, a new revision or a changed asset version is another evaluation, and a finding it no longer
  establishes is gone.
- A failed read that settles nothing - a transient or inconclusive failure - blocks new execution as `UNAVAILABLE`.
  It is never a finding, and marks no section as wrong. Pending evidence is `NEEDS_EVIDENCE`, never a finding; an
  unknown stays unknown.
- A recipe or asset found definitively missing or inaccessible keeps what establishes that today. A change image's
  FROM/TO edge read as gone is marked on its section, and an asset found missing is named (`ASSET_UNAVAILABLE`); both
  withdraw the layer. Readiness's `UNAVAILABLE` for the same answer changes neither.
- `needs` joins the description's `needs`. The existing acquisition loop - the GUI runtime's DESCRIBE/EXPLAIN keys and
  Task's settled read - requests what either names. A read whose description is `READY` but whose readiness needs
  evidence still names its acquisition.
- A finding settles readiness as a definitive diagnosis settles a description: a settled read that finds one refuses at
  once, requesting nothing more for it, so an export names what it found first. An editor's question explains it as it
  explains a refused description: `EXPLAIN` loads the closure, observes once what readiness and the description still
  need, and adds the findings that evidence establishes beside those already found. A Remapping over a Classification
  without training data, of an asset lacking a band it selects, is explained with both findings.
- Readiness is recomputed from the current records and evidence. No flag is stored or cleared: adding training data
  restores every recipe over the Classification at the next read.

#### Rule ownership

A rule that execution needs lives once, in the type's shared definition (`lib/js/shared/src/recipe/type/`), and every
consumer reads its finding. It is not restated in a layer guard, a panel or Earth Engine. What else holds an execution
rule today:

| Kind | Examples | Direction |
| --- | --- | --- |
| Shared description refusal | band sets an input lacks; Stack mapping and names; Band Math output bands; Class/Index Change bands; LandTrendr and BAYTS product parameters | Stays. It is also a readiness finding. |
| GUI declaration over a shared finding | `inputImageryRequirements`, `changeImageRequirements`, `trainingDataRequirements`, `remappingRequirements`, Band Math's calculation declaration | Stays. It supplies messages, items, sections and editors, and no predicate. |
| GUI-only execution rule | optical scene selection | Becomes a shared configuration requirement, one type per packet; the guard then goes. |
| GUI rule duplicating a shared one | Classification's `canClassify` saved-data branch; Band Math's local output-image and output-name rules beside `NO_OUTPUT_BANDS`/`DUPLICATE_BAND_NAME`; Stack's band-name form rules | The shared finding is authoritative. A form rule may stay for drafts only, and must agree with it. |
| Earth Engine-only failure | Masking's unselected mask; a missing AOI where one is required; PyEO band set specs | Becomes a shared configuration requirement; the Earth Engine error remains a backstop. |
| Draft-only form rule | required fields while a panel is edited, such as a data set's reference data | Stays at the panel. It never changes the applied recipe's readiness. |
| Presentation policy, not validity | the collecting UI's two-class safeguard on the Classification layer | Stays a GUI rule over the editor's state. It is not readiness. |

"Has training data" is a configuration requirement of Classification and Regression for `IMAGE_OUTPUT`, not a
checklist item. Both declare it through `trainingDataRequirement` (`lib/js/shared/src/recipe/trainingData.js`), each
with its own condition, over one `noTrainingData` predicate.

A **configuration requirement** is part of the type's definition:

```js
configurationRequirements: [
    {code: NO_TRAINING_DATA, operations: [IMAGE_OUTPUT], findings: model => [{path: ['model', 'trainingData', 'dataSets']}]}
]
```

It returns located findings or none, and is evaluated whatever the provider reads. Most requirements read only the
recipe's model. A requirement over configured source references can additionally use `describedInputs(role)` from
the same readiness resolution pass: only successful current descriptions, resolved with the existing per-read
memoization. Missing evidence remains the traversal's pending/unavailable result, never an invented missing band.
This keeps evidence-dependent execution failures separate from output descriptions that are already known.
The declarations include:

- Classification's `NO_TRAINING_DATA`, for trained classifiers (`requiresTraining`, `noTrainingData`). The
  Classification stays described.
- Regression's `NO_TRAINING_DATA`, whatever its classifier (`noTrainingData`): its execution trains the classifier
  configured, and uses no supplied tree as given. The Regression stays described.
- Masking's `MISSING_ROLE` at `['model', 'imageMask']` when no mask is selected. The Masking is refused as incomplete,
  not turned into a pass-through recipe. Its MSK section says "Select a mask" (`maskRequirements.js`).
- PyEO Alerts' `MISSING_ROLE` at `['model', 'sources', 'classification']` when no classification is selected, and
  `NO_CHANGE_CLASSES` at `['model', 'sources', 'changeFromClasses' | 'changeToClasses']` for an empty class list:
  execution loads the classification and compares the two lists. Its report bands stay declared. SRC and the field
  concerned say so (`pyeoAlerts/sourcesRequirements.js`). The Classification stays a `REFERENCE` need. Its
  `UNSUPPLIED_CLASSIFIER_INPUTS`, at the data sets or the classification, requires the monitoring scenes
  (`sceneBands`) to carry what the Classification's classifier reads; `UNAVAILABLE_GATE_INDEX`, for an enabled gate
  only, requires its index of the scenes and of the Classification's input. They read the Classification record
  (`recordsOf`) and that input's description (`describedSourceInputs`, only with the gate on); an unobserved input is
  an observation needed, not a finding. AOI, band specifications and encoding are not migrated here.
- Class Change's `MISSING_LEGEND` at `['model', 'fromImage' | 'toImage', 'legendEntries']` for each image whose legend
  is not a non-empty list: execution codes transitions from both legends' entries. The rule is the editor's existing
  `notEmpty`; its ten-entry limit stays an editor rule, since execution does not need it. The Class Change stays
  described. Its FRM or TO section and its editor's legend say so (`classChange/legendRequirements.js`).
- `MISSING_ROLE` at `['model', 'inputImagery', 'images']` when the input list holds no image, for Classification,
  Regression, Unsupervised Classification, Stack, Band Math and Remapping (`inputImageryRequirement`,
  `source/inputImagery.js`): execution zips the images and builds nothing from none. Their descriptions stay as they
  are: Band Math keeps `NO_OUTPUT_BANDS` beside it.
- Remapping's `MISSING_CONSTRAINT_INPUT` and `CONSTRAINT_BAND_NOT_INCLUDED`, at each constraint
  (`['model', 'legend', 'entries', i, 'constraints', j]`) naming an input the list no longer holds, or a band its input
  does not include (`constraintInputRequirement`, `constraintBandRequirement`, `type/remapping.js`). The Remapping stays
  described.
- Remapping's `MISSING_INPUT_BAND`, at an included input band that a constraint reads but its successfully described
  source does not provide (`constraintSourceBandRequirement`). Unused selections are not checked by this rule.

#### Operation scope

Requirements and needs are declared per operation, and an operation inherits nothing:

- `IMAGE_OUTPUT` is the recipe's canonical image, which Preview draws and Retrieve exports.
- A named map product (LandTrendr's annual mosaic, BAYTS Alerts' radar observation, Change Alerts' collection mosaic)
  declares its own requirements and needs, reusing common declarations by reference where they apply. It does not take
  every requirement of the final image: an intermediate observation or mosaic may legitimately run before that image
  is configured.
- An operation a type does not declare readiness for keeps today's behaviour. The first slice declares `IMAGE_OUTPUT`
  only, so products are unchanged by it.
- **Analysis prerequisites** are the exception to inheriting nothing: what the configured analysis needs whatever runs
  it (`analysisPrerequisites: {needs: {[role]: need}, requirements: [{code, findings}]}`, `output/readiness.js`). Every
  operation the type declares and every map product it names is held to them; an operation adds its own needs and
  requirements and may not name a role the prerequisites need, so it cannot weaken them. A named product is read as an
  operation by its name: the prerequisites, the `executionNeeds` and `configurationRequirements` naming it, and
  `REFERENCE` for any other role. Its readiness is read beside its configuration-only description (`readReadiness`),
  never through the canonical image, so a product neither describes nor builds that image to be judged; the read
  acquires only the evidence its needs name. A product of a type declaring none of these is not judged
  (`judgesMapProduct`) and its layer draws from its description alone, as before. Time Series and CCDC declare the
  selected Classification so (S3); CCDC's count adds the breakpoint bands' classified-output requirement, since it
  collects them. Phenology keeps its operation-scoped, conditional policy. LandTrendr's annual mosaic, BAYTS Alerts'
  radar observation and Change Alerts' collection mosaic declare none and are unchanged.

#### Dependency semantics

Edges stay `{reference, role, path}`; the graph stays the only authority for loading, closure and cycles. Each type
declares, per operation, what that operation needs from each role it emits:

```js
executionNeeds: {[IMAGE_OUTPUT]: {[PRIMARY_IMAGE]: IMAGE_OUTPUT, [MASK_IMAGE]: IMAGE_OUTPUT}}       // Masking
executionNeeds: {[IMAGE_OUTPUT]: {[INPUT_IMAGE]: IMAGE_OUTPUT, [TRAINING_DATA_SOURCE]: REFERENCE}}  // Classification
```

- `IMAGE_OUTPUT`: the operation builds the source's image. The source's description - its refusals included - and its
  readiness for `IMAGE_OUTPUT` count, as if the provider had read it. A recipe source that cannot yet be described
  makes the parent `NEEDS_EVIDENCE` and names what it needs. An asset source counts through its description - its
  observation, which also establishes that it exists - and a missing one is `UNAVAILABLE`.

  This can need evidence the parent's description never asked for. A Remapping over a Classification over an asset
  is not `READY` until that asset is observed and the Classification's band checks pass. The existing acquisition
  requests it and the runtime shares it. Correctness takes precedence over acquiring less.
- `REFERENCE`: only the source's resolution is checked, which `dependencyValidity` already does. This is an explicitly
  limited check during migration, and it does not establish readiness for what is read.

  A Classification trained from another recipe runs that recipe's `getSamples$()`. That builds the referenced
  recipe's input imagery and samples its points over it, unscaled. Its classified output need not be ready, but its
  imagery matters, and so do its points. That role is now `TRAINING_DATA`, which checks the provider's imagery (see
  "Reused training data" below). `NO_TRAINING_DATA` follows held providers recursively to establish configured
  absence of points; missing records never establish absence. An `AOI` edge is
  `REFERENCE` until geometry is an operation.
- **Unclassified roles.** A role must be classified for the operation it is evaluated in. When readiness evaluates an
  actual edge whose role the type does not classify, it is a definitive finding (`UNCLASSIFIED_ROLE`) at that edge. It
  is found once per edge, in the same memoized traversal, with no rescan per consumer. The structural audit over
  representative models stays as a migration guard. It cannot prove that a dynamically emitted role is classified;
  the check above does. Registration requires a type with an image to declare `executionNeeds.IMAGE_OUTPUT`.
- **As declared now.**
  - `IMAGE_OUTPUT`: every image-input role whose provider already reads it (the Classification family's, Stack's,
    Band Math's, the change recipes' images, CCDC Slice's and Asset Mosaic's sources, Masking's primary image), plus
    Remapping's inputs and Masking's mask.
  - `REFERENCE`, a recorded limitation: `AOI`; the collection recipes' `CLASSIFICATION_SOURCE` and `SOURCE_IMAGERY`;
    the training sources; the BAYTS Alerts reference, previous alerts and wetland mask; and Change Alerts' reference,
    whose segments and statistics its source requirements already judge.
- Editor-only and display-only references are not edges and never block. Classification's sampled provenance
  (`recipeIdToSample`, `assetToSample`), Masking's copied band snapshots, imported legends and Sampling Design's
  `displaySources` keep that status ([non-edges](#structured-source-edges)).

What a type needs of a source is its own declaration. A consumer never asks what type its source is.

#### Consumers

One read answers every consumer, so they cannot disagree:

- **Rendering.** `canPreview` requires readiness `READY` beside `READY` and `VALID`:
  - `NOT_READY` withdraws the layer, on its own map or another's;
  - `NEEDS_EVIDENCE` waits;
  - `NEEDS_EVIDENCE` and `UNAVAILABLE` withhold new drawing. A drawing already shown stays while nothing it was drawn
    from changed and the answer is transient: readiness being read again or not had for now, over dependencies not
    found invalid and no asset found missing. A finding, invalid dependencies or a missing asset take it away.
- **Request gates and Retrieve's action.**
  - Output declarations hold their operations as before.
  - Where no read a type declares holds `IMAGE_OUTPUT`, a confirmed finding still does (`OUTPUT_READINESS` in
    `sourceRequirements.js`). A Remapping is held whatever its type declares to explain it.
  - Pending or unavailable readiness does not hold Retrieve's action of a type that declares nothing over its output.
    The action is what starts watching the output, so holding it on evidence nobody watches would keep it closed.
    The layer and the submission still wait for that evidence.
- **Retrieve.** Availability and submission (`retrieveDecision`) require it:
  - `NOT_READY` is `BLOCKED`, naming the section or the upstream recipe;
  - `UNAVAILABLE` is `BLOCKED` as unavailable, not as a configuration error;
  - `NEEDS_EVIDENCE` is resolving.
- **Marks.** Output declarations (`sourceRequirements.js`) read the findings this recipe owns, from description and
  readiness alike, and mark its item and section. Within one recipe, dependent sections do not repeat an originating
  error (for example, CALC does not mark OUT). Across recipes, input-list declarations additionally mark IMG and each
  affected recipe-reference row with a short translated message naming the directly referenced recipe and the
  confirmed originating recipe(s). For B reading A: “A needs attention” when A owns the problem, or “A cannot run
  because Band Math needs attention” when Band Math owns it. Intermediate recipes are omitted; repeated findings
  from the same origin are deduplicated by ID, and multiple origins are all named. If both A and upstream recipes
  own findings, say “A needs attention. It also depends on Band Math, which needs attention.” Exclude A from that
  upstream list by ID, use plural wording for multiple upstream origins, and retain all attribution metadata. The detailed diagnosis stays in its originating recipe. The dependent's held status still names
  the owning recipe (`refusedBy`). Readiness's `UNAVAILABLE` and `NEEDS_EVIDENCE` add no
  mark, and leave definitive missing-source marks as they are. A declaration may leave its section's toolbar button
  unmarked (`toolbarMark: false`), a presentation choice: its finding still holds the operations, which still name the
  section, and the section's other declarations still mark it. Classification's `NO_TRAINING_DATA` is declared so
  (`unmarkedTrainingDataRequirements`); Regression's is not. `wizardStepMark: false` waits only while a set-up wizard has
  the section open as its step (`missingInputImageryRequirement`, Masking's missing mask). Meanwhile the declaration's
  editor, where it has one, says its finding only beside an input already showing its own validation error - as a field
  does once interacted with - so arriving at the step shows no error, while what holds Next or Done still holds it. A
  section not yet reached is not marked either. Outside set-up, toolbar and editor say it at once.
  Reference feedback (`referenceFeedback.js`) is a presentation-only output declaration: `upstreamReferences`
  names declared source roles, and `itemOf` maps their actual edge locations to rows. It has no operations.
  The feedback retains `referenceFeedback: {reference: {id, name}, origins: [{id, name}]}` in its diagnostic and
  item status, independent of translated text. The last hop of each confirmed `recipePath` establishes its origin;
  absent an established origin, the direct-reference message is used. The bridge matches every confirmed finding's
  first recipe hop to the declared recipe edges; it never
  guesses from the first diagnostic, uses an origin's field path as a local input path, or marks an asset with the
  same bare ID. Reads reuse the existing output-requirement memoization. The shared input helpers register this for
  Stack, Band Math, Remapping, Classification, Regression and Unsupervised Classification. Other source-section
  editors have not been opted into this feedback.
  The shared input-image editor binds the same declaration to its recipe selector through `OutputCandidate` and
  standard field feedback. It reads the draft input alone, using the existing explain query where other local
  configuration is already invalid. `blocksApply: false` makes this binding explanatory only; it adds no Apply rule.
  Panels combine output declarations so Classification's existing band-set validation remains active alongside it.
  Opening remains unedited; changing the draft selection or repairing an upstream recipe updates the explanation.
  Cancel preserves applied configuration, marks and gates. Pending or failed reads add no confirmed-reference error.

  Attribution limit: readiness visits each shared recipe once. In a diamond graph, a finding may contain only one
  route to the origin. Only the reported route is marked; other routes are not guessed. Complete feedback for all
  converging routes needs a separate attribution decision. This packet does not change readiness traversal or
  acquisition to manufacture those routes. All existing execution blocking remains in force.
- **Drafts.** An editor's candidate (`outputCandidate.js`) is read through the same rules, apart from the applied
  recipe. Its findings guide the panel and its Apply, and never change the applied recipe's availability. Form field
  rules stay entry-level.
- **Backend.** Task's image asset export (`modules/gee/src/jobs/task/export/imageOutput.js`, single images and image
  collections) resolves the closure itself and already requires `VALID` and `READY`. It requires readiness through the
  same shared function, from the same closure, and refuses the export otherwise. It builds the image beside that check
  (`forkJoin`), so a refused export may already have started Earth Engine work. What is promised is that the export is
  refused. The other recipe image exports pass the same check before they build anything, and build the image and
  its geometry only once the recipe is ready: CCDC's Segments asset export at `ccdcAssetSource$` (`ccdcAssetExport.js`,
  the source both its task and the asset-export sources in `assetSources.js` build from), and the Drive and SEPAL
  workspace image exports at their recipe-aware entry points (`imageDriveExport.js`, `imageWorkspaceExport.js`), before
  a Drive folder or workspace destination is prepared. Establishing readiness may still read Earth Engine for the
  closure and its evidence. Time Series downloads (`export/timeSeries.js`) are held to the same `IMAGE_OUTPUT`
  readiness, though they export an indicator of the collection rather than the `count` image: every requirement that
  operation declares (the classifier inputs) concerns the collection both build, and the indicator is not required to
  be an image band. Each of the three requests checks on its own - the tile ids (`timeSeriesTiles$`) before the AOI
  is resolved or tiled, a tile's date ranges (`timeSeriesChunks$`) before any imagery check, and a chunk's export
  (`startTimeSeriesChunkExport$`) before tiling, building the collection, preparing a destination or submitting -
  so calling the export without planning bypasses nothing. This does not validate the indicator itself.
- **Pixel observations.**
  - **What is judged.** A pixel chart's observation request (`/timeSeries/loadObservations`,
    `jobs/ee/timeSeries/loadObservations.js`) is held to the readiness its recipe's type declares for observations of
    the requested bands, before the pixel geometry or the collection is built or anything evaluated. It is judged as
    `PIXEL_OBSERVATIONS`, and, where a requested band is an output the Classification computes, then for that output's
    capability and as `CLASSIFIED_COLLECTION` (`requireRequestedBands$`, `jobs/requestedBands.js`; see "CCDC's
    requested chart bands"). This uses `requireExecutable$` in `jobs/executionReadiness.js`, over `settledReadiness$`
    and `readReadiness`.
  - **Time Series and CCDC** declare both operations, needing the Classification's `CLASSIFIER` readiness for the
    stage (`CLASSIFIED_COLLECTION_NEEDS`), and the classifier-input requirement lists both.
  - **What the read describes.** Nothing of the recipe's own image is described: neither the Time Series count nor
    CCDC's catalogue. A requirement asking for its inputs' observed bands still has them acquired, and their failures
    reported, as any read's are.
  - **The point stands in for the AOI.** The recipe judged has its AOI replaced by the clicked point, without changing
    the one submitted. An AOI the chart does not read is no dependency of it.
  - **Undeclared types.** A typed recipe whose type declares nothing for the operation is refused
    (`UNDECLARED_OPERATION`).
  - **Change Alerts (implemented 2026-10-21).** Its chart sends the applied Change Alerts recipe. The job derives the
    collection it monitors with `observedCollection` (`lib/js/shared/src/recipe/changeAlerts/observedCollection.js`),
    beside `mosaicRecipe.js`. That is a `TIME_SERIES` recipe, keeping the Change Alerts id, built from:
    - its Sources without the copied `classification`;
    - its options;
    - the calibration start to monitoring end from `monitoringDates`.

    That recipe is held to Time Series' `PIXEL_OBSERVATIONS` at the clicked point, before the pixel or collection is
    built, and is what `getCollection$` builds. So the request names its real consumer, and is judged by declarations
    that already describe that collection.
    - **Not read:** the reference, whose segments the chart plots beside the observations and which observations never
      execute, is not in that recipe, so its closure is not loaded. Neither is a Classification the Sources copied.
    - **Not over-read:** passing the whole Change Alerts recipe with its existing declarations would not do. The
      closure loads every declared edge, so it would read the reference and its own dependencies. A witness at the
      previous job showed a typed Change Alerts request refused for an unreadable reference.
    - **Refusals:** an incomplete monitoring period is refused before any chart work, and so is a Planet Sources entry
      that names no asset (`MALFORMED_REFERENCE`). Settings naming no recipe type are refused with a 400 instead of
      bypassing readiness.
    - **Compatibility:** Time Series and CCDC requests, which name their recipe, are unchanged. A browser tab running
      the previous GUI, which sent the bare settings, is refused until it reloads.
  - **Limitation.** A `REFERENCE` dependency is still loaded with its own transitive dependencies, which then count.
- **Pixel segments.** A segment chart's request (`/ccdc/loadSegments`, `jobs/ee/ccdc/loadSegments.js`) is held to
  readiness before any segments image is built or anything is read at its pixel:
  - **A CCDC charted itself** is held to `PIXEL_SEGMENTS`, whose only requirement is the classifier inputs. It is
    judged and segmented as the same recipe: the submitted one with its AOI replaced by the clicked point, without
    changing what was submitted. A configured AOI that cannot be read, or refers back, holds nothing.
  - **A recipe selected as a source** (`RECIPE_REF`) is held to its own `IMAGE_OUTPUT` readiness, which covers its own
    requirements (a Masking's mask, say) and those of every recipe its image builds, over their own AOIs, before
    `withSegmentSource$` runs as before.
  - **Nothing it builds is described.** Read for readiness alone, a recipe it builds is judged without being
    described - no CCDC catalogue, no mask band evidence - while what a requirement reads is still acquired.
  - **An asset** is read as before, with no backend check of its segment layout.
  - **Errors** pass through unchanged: a finding is `cannot run: CODES`, a read failure is the read's own error.
- **Lower-level exporters.** The exporters the guarded exports hand a built image to (`toAsset.js`, `toDrive.js`,
  `toWorkspace.js`) know nothing of recipes and add no check; whatever calls them directly is held to nothing here.

**Outside the guarantee in this packet.** These build recipe images with no shared check, and still fail in Earth
Engine:
- Preview (`/preview`), guarded only by the client's `canPreview`.
- Bands, image JSON, histogram, distinct values, sample and geometry/bounds routes.
- The LandTrendr chart loader, an asset's segments through `/ccdc/loadSegments` (its layout unchecked), Change Alerts'
  observation requests through `/timeSeries/loadObservations`, and `nextReferenceDataPoints`.
- Sampling Design steps and stratum areas.

Preview and the LandTrendr chart route stay as they are for now. Server-side Preview validation waits on a
measured assessment of its cost.

#### Performance

- Readiness is computed inside the shared output read, after the description and with the same per-recipe and
  per-asset memoization, into a diagnostic list of its own. A source the description already resolved is not resolved
  again. It is not a second pass per consumer.
- The GUI keeps it in the session read already cached by records and identity (`readRecipeOutput`). Request gates,
  marks, layers and Retrieve read that one answer, and `readOutputRequirements` keeps its cache.
- Configuration requirements are pure over one record.
- Evidence a needed dependency requires is acquired by the runtime's existing operations and shared observations,
  never in `mapStateToProps`.
- Added acquisition:
  - A Masking observes its mask: an asset's typed bands, or a recipe's description.
  - A Remapping observes its inputs, and what their descriptions need.
  - A recipe's request gate now reads its output for every type, whatever it declares. It is the session read the
    layer reads already.
  - Recipes whose providers already read their inputs - the Classification family, Stack, Band Math, the change
    recipes, CCDC Slice - observe nothing more.

#### Located findings and other declarations

`sourceRequirements.js` drops a declaration's generic refused read (`outputState`) where another of the recipe's output
declarations locates the refusal at an item, so the gates name that item's section. It is dropped only where it would
add no protection: for each operation it actually holds - by the gate each operation asks (`reasonFor`), through
`operations` or `providerOperations` - a located read holds it too. A refusal does not hold a `providerOperations`
operation, which only a provider refusal does, so naming one is no reason to keep it. A generic read that is pending
or unavailable is never dropped.

#### Compatibility

- Classification's `NO_TRAINING_DATA` is a configuration requirement, not a description refusal. The Classification
  is described; a Stack over it is described and not ready, rather than `INVALID`.
- A Remapping or Masking over a recipe that is not ready, through any role its image needs, is withdrawn from the map,
  cannot be retrieved, and has its asset export refused. Before, all three failed in Earth Engine.
- Such wrappers wait for observations of inputs their description never read.
- A Masking without a mask is refused as incomplete.
- The asset export refuses a recipe that cannot run with `Recipe X cannot run: CODES`, or, where what it needs could
  not be read, `Recipe X cannot run: what it needs could not be read`.
- The Classification layer's `canClassify` saved-data branch is redundant with the read. The at-least-one-input layer
  guards are gone; the collecting safeguard stays.
- Saved recipes keep their model: readiness reads configuration and evidence, and stores nothing.
- A Regression whose data sets store no point, and read none from another recipe, cannot run, and its TRN section is
  marked. Before, its own layer was withheld only when it had no data set at all, and an empty one - an Earth Engine
  table read as empty, a sampled image with no samples - was drawn, retrieved and exported until Earth Engine failed
  to train.
- A recipe listing no input image cannot run, and its IMG section says "Please add at least one image." Before, its
  own layer was withheld by a GUI guard, while Retrieve, the asset export and every recipe over it ran until Earth
  Engine built nothing.
- Remapping now declares a requirement its output read judges, as the Classification family does, so while what its
  image builds is being read its Retrieve waits rather than offering its class, and its toolbar watches its output.
- A Remapping whose constraint reads a removed input or a band its input does not include has its asset export refused,
  and so has every recipe whose image builds it, which is withdrawn and cannot be retrieved. Before, only the Remapping's
  own layer and Retrieve were held, by a GUI local requirement: the export and every recipe over it ran, until Earth
  Engine failed on a removed input - or, for a band an asset input stores but does not include, built the image. Such a
  Remapping that exported before is now refused. Where its input list is empty too, Retrieve names Input imagery before
  Mapping.

#### First packet (implemented)

It covers the shared mechanism and the Classification → Stack, Remapping and Masking cases: evidence waiting, refusal
and recovery. It does not migrate every outstanding rule.

1. **Shared.**
   - `configurationRequirements` and `executionNeeds` per operation in `defineRecipeType`, for `IMAGE_OUTPUT`, with
     roles classified for every registered type;
   - readiness in `readImageOutput` and in the settled read, with its needs joining the description's;
   - `UNCLASSIFIED_ROLE` at evaluated edges;
   - Classification's `NO_TRAINING_DATA` as a requirement scoped to trained classifiers;
   - Masking's `MASK_IMAGE` needing `IMAGE_OUTPUT`, and its missing mask refused.
2. **GUI.**
   - `readRecipeOutput` carries readiness and names an acquisition while it needs evidence;
   - `canPreview` and `retrieveDecision` require it;
   - output declarations read its findings, with a message for Masking's missing mask;
   - the `outputState` filter covers `operations` and `providerOperations`.
3. **Backend.** `imageOutput.js` requires readiness.
4. **Tests.**
   - extended where they are today: `inputBandSets.test.js`, `outputRequirements.test.js`, `trainingDataChain.test.jsx`
     (Remapping and Masking beside Stack), `imageAssetExport.test.js`;
   - cases:
     - a Remapping waiting for its Classification's input observation;
     - a confirmed finding kept beside pending and failed evidence;
     - repair restoring the chain;
     - a `RECIPE` training set staying unknown;
     - a refused candidate leaving the applied recipe available;
     - an unclassified role.

#### Reused training data (first slice implemented 2026-10-21)

**What users can select.** A Classification's `RECIPE` training data set selects another Classification
(`recipeSection.jsx` filters to `CLASSIFICATION`), and a Regression's selects another Regression. Sampled data sets
(`SAMPLE_CLASSIFICATION`, `SAMPLE_IMAGE`) store their points when configured, so they are no runtime reference.

**What execution does.** A Classification consumer runs the provider's `getSamples$()`
(`lib/js/ee/src/classification/classification.js`); a Regression consumer runs its provider's `getTrainingData$()`
(`regression/regression.js`):
- It builds the provider's input imagery, each image as its `IMAGE_OUTPUT`, with the provider's auxiliary covariates.
  It does not apply the provider's normalisation: a normalising Classification consumer scales the reused samples by
  its own statistics (see "Reused Classification samples' normalisation").
- It samples the provider's stored points over that imagery.
- It puts the samples of the provider's own `RECIPE` sets, recursively and in configured order, before the provider's
  own.
- The provider's classifier is never trained, and its image is never classified.

**Implemented.**
- **Operation.** `TRAINING_DATA` (`output/readiness.js`), with an execution need of the same name: the edge's source
  is judged as its `TRAINING_DATA`, not as its image.
- **Declarations.** Classification and Regression declare:
  - `IMAGE_OUTPUT: {INPUT_IMAGE: IMAGE_OUTPUT, TRAINING_DATA_SOURCE: TRAINING_DATA}`;
  - `TRAINING_DATA: {INPUT_IMAGE: IMAGE_OUTPUT, TRAINING_DATA_SOURCE: TRAINING_DATA}`;
  - `inputImageryRequirement` for both operations.
- **Traversal** (`resolveImageOutput.js`).
  - A source is visited once per operation, keyed by recipe and operation, so a recipe needed both as an image and
    for its training data is judged both ways.
  - A source whose type does not declare a non-image operation it is needed for is refused (`UNDECLARED_OPERATION`).
  - Under `describesBuilt`, the provider is never described, because its image is not built. Its input images are,
    through their `IMAGE_OUTPUT` need.
- **Refused at the recipe each finding concerns:**
  - a provider whose input image cannot run;
  - a provider without input imagery, whose samples execution would silently drop;
  - the same for nested providers.
- **Unchanged:**
  - a mixed set with an empty provider stays ready, since `NO_TRAINING_DATA` stays `IMAGE_OUTPUT` only;
  - cycles stay `INVALID`;
  - a provider not held is pending, and the runtime reads it with the closure. The GUI's output read therefore
    withholds the consumer's bands until it has.
- **Provider band sets (implemented 2026-10-21).** `inputBandSetRequirements([TRAINING_DATA])` (`bandSets.js`) are
  declared by Classification and Regression. They apply the same refusals their image's description makes
  (`inputBandSetRefusals`) to producing training data, with one requirement per code so the codes and paths are kept:
  `MISSING_INPUT_BAND`, `UNDERIVABLE_INPUT_INDEX` and `INSUFFICIENT_INPUT_BANDS` at
  `model.inputImagery.images[i].bandSetSpecs`.
  - They read `describedInputs(INPUT_IMAGE)`, so the provider's input images are described and observed, but never
    the provider's own image.
  - An input not yet observed is pending, and one that could not be observed is unavailable; neither is a confirmed
    missing band.
  - `IMAGE_OUTPUT` keeps its description refusal alone, so it has no duplicate diagnostics.
  - Export readiness (`requireExecutable$`) now observes the provider's input bands too.
- **GUI.** The training-data section declares the existing `referenceFeedback` for `TRAINING_DATA_SOURCE`, and both
  training-data panels show each item's problem (`withItemProblems`). Classification's TRN button stays unmarked, as
  its other training-data declarations are; Regression's is marked.
- **Regressions:**
  - `lib/js/shared/test/recipe/output/trainingDataReadiness.test.js`, for both types;
  - `classification/reusedTrainingDataFeedback.test.jsx`, mounted: missing imagery, and a missing selected band,
    marked and cleared on repair;
  - existing tests updated where they pinned the old behaviour: a provider without imagery, a provider not loaded,
    and the readiness-needs validation message.

**Configuration-known absence of training data (implemented 2026-10-21).**
- **Context extension.** `recordsOf(role, of = recipe)` (`resolveImageOutput.js`) can be asked of a record the
  requirement already holds, over the same resolved graph. It is null while any selected record is not held.
  `declares(record, operation)` says whether that record's type declares an operation (`declaresOperation`,
  `output/readiness.js`), the same judgement `UNDECLARED_OPERATION` is made by.
- **Rule** (`trainingData.js`, beside `NO_TRAINING_DATA`). `noTrainingData(model, {recordsOf})` establishes absence
  only where:
  - no data set stores a point;
  - each `RECIPE` set resolves to a held record;
  - that record's type declares `TRAINING_DATA`, asked through the context's `declares(record, operation)`, which uses
    the traversal's own `readinessFor`;
  - and it establishes the same, recursively.
  - **Memoised per call.** A diamond's shared provider is judged once.
  - **Nothing else establishes absence.** A provider reached again while it is still being judged establishes
    nothing; a cycle stays the `dependencyValidity` problem. Nor do a missing or unreadable record (pending or
    unavailable, as before), a reference resolving to no record (malformed), or a provider whose type produces no
    training data, which keeps only its `UNDECLARED_OPERATION`, whatever its model holds.
  - **Without the read's records** (no context, as for the GUI's collection guard `hasTrainingData`), a reused recipe
    is never taken for none.
  - **Classification.** `missingTrainingData(model, context)` keeps the decision-tree exemption first.
  - **Role.** `TRAINING_DATA_SOURCE` now lives in `trainingData.js`, and both types re-export it.
- **Where it is found.** Absence is a finding of the consumer's `IMAGE_OUTPUT` only, at its training data. An empty
  provider's `TRAINING_DATA` stays ready, so no training-data item is marked.
- **GUI.** The existing `NO_TRAINING_DATA` declaration says it: Regression's TRN is marked and Classification's stays
  unmarked, while Retrieve, layers and recipes over it hold.
- **Backend.** `requireExecutable$` refuses an export with `NO_TRAINING_DATA` before building anything.
- **Regressions:**
  - `lib/js/shared/test/recipe/trainingDataAbsence.test.js`, both types: direct and nested empty chains, mixed
    branches, missing and malformed references, a diamond, a cycle, repair and reversal, an empty provider staying
    ready for `TRAINING_DATA`, the call without context, and the decision tree;
  - the unsupported-provider case in `trainingDataReadiness.test.js`, kept without `NO_TRAINING_DATA`;
  - `reusedTrainingDataFeedback.test.jsx`, mounted: Retrieve held, toolbar policies, no item marked, repair;
  - `imageAssetExport.test.js`: an export refused and then repaired upstream.
- **Boundary.** This establishes that configured points exist, not that they survive masking, cover the imagery or
  suffice for training.

**Sampled-feature compatibility (implemented 2026-10-21).** A consumer's reused training data must carry every
feature the consumer trains on.

- **Execution contract** (`classification.js`, `regression.js`):
  - **Assembly.** The consumer's `getImage$` trains on its own `getTrainingData$`. For a Classification, that is each
    reused recipe's raw samples (`getSamples$()`), in data-set order, scaled by the consumer's statistics where it
    normalises, then its own samples. A Regression takes each reused Regression's `getTrainingData$()` instead. The
    samples are flattened into one collection, with `band_order` set to the consumer's band names.
  - **Provider samples.** Each recipe samples its stored points with `sampleRegions`:
    - over its own image, after its own covariates, unscaled;
    - at its own `scale || 1`.

    Each sample carries every band of that image, plus `class` or `value`.
  - **Nesting.** Classification providers return raw samples without `band_order` or statistics. The final consumer
    sets `band_order` and, when normalising, applies its statistics once. Regression retains its `getTrainingData$()`
    path.
  - **Training.** `train` passes no `inputProperties`, so `band_order` decides the features (`temporalSegmentation.js`
    relies on the same default).
- **Rule** (`trainingFeaturesRequirement`, `trainingData.js`). `MISSING_TRAINING_FEATURES` is a finding of the
  consumer's `IMAGE_OUTPUT`, guarded in Classification by `requiresTraining`.
  - **Scope.** Each recipe in a `RECIPE` data set's reuse closure that stores a point must sample every consumer
    feature. A union across recipes proves nothing.
  - **Exempt.** A recipe storing none contributes no samples and requires nothing, though the recipes it reuses still
    count. Extra provider features are ignored.
  - **Where it is found.** At the consumer's data set (`model.trainingData.dataSets[i]`), with `provider` (the
    recipe whose samples lack them) and `features`. A recipe that two data sets reach is found at each.
  - **Walk.** It walks the closure as `noTrainingData` does (`recordsOf`, `declares`, memoised, cycle-safe).
  - **Consumer input.** The consumer's own input is asked for only where some recipe in the closure stores points.
- **Sampled names** (`sampledFeatures`, `bandSets.js`), for one input image with described bands `B`:
  - `IMAGE_BANDS` and `INDEXES`: what `availableSelections` provides;
  - `PAIR_WISE_EXPRESSION`: `${b1}_${b2}_${operation.toLowerCase()}` for each pair of included bands, ordered by `B`
    (`combinePairwise`, `extensions/image.js`), so the same selection over differently ordered inputs gives other
    names;
  - auxiliary covariates' bands (`auxiliaryBands`).

  Each name appears once, as execution merges band sets and covariates with overwrite.
- **Auxiliary covariates.** Their names have one owner, `lib/js/shared/src/recipe/auxiliaryImagery.js`.
  `lib/js/ee/src/auxiliaryImagery.js` builds them and selects those names; Classification, Regression and
  Unsupervised Classification use it instead of three copies.
- **Context.** `describedInputs(role, of)` (`resolveImageOutput.js`) can be asked of a record `recordsOf` handed out.
  That record is resolved under the chain it was first reached through, so a diagnosis upstream keeps its full
  `recipePath`.
- **Establishes nothing:**
  - a record not held, or whose type produces no training data;
  - an input not yet observed (pending) or not observable (unavailable);
  - a recipe refused for its own band sets, which is said there;
  - an input image without band sets;
  - band combinations of one set that share a name (`a_b` with `c`, `a` with `b_c`), which execution suffixes as it
    adds them. A name given by two band sets is overwritten, so it counts as one feature;
  - a consumer or provider over several input images.
- **GUI.** The training-data declarations (`trainingDataRequirements.js`) mark the data set, naming the recipe and the
  missing features (`process.classification.panel.trainingData.missingFeatures`). Classification's TRN button stays
  unmarked and Regression's is marked. Retrieve, layers and recipes over the consumer hold.
  - **Repair:** drop the features from the consumer, add them to the provider, or remove the data set. Readiness is
    recomputed from current records.
- **Backend.** `requireExecutable$` refuses an export with `MISSING_TRAINING_FEATURES` before building anything.
- **Regressions:**
  - `lib/js/shared/test/recipe/trainingFeatures.test.js`, both types:
    - compatible and incompatible providers, pair order and an auxiliary covariate;
    - per-recipe rather than union, nested, empty and shared providers;
    - repair, pending and unavailable evidence, upstream attribution, several inputs, and the decision tree;
  - `modules/gee/test/ee/classification/sampledFeatures.test.js`: the real executions over a band-tracking stand-in
    agree with `sampledFeatures`;
  - `reusedTrainingDataFeedback.test.jsx`, mounted: the data set is marked, Retrieve is held, and both clear on repair;
  - `imageAssetExport.test.js`: refused, then exported after repair.
- **Deferred, establishing nothing for now:**
  - several input images, and Earth Engine's suffix rule for names they repeat;
  - sampling-scale and raw value-encoding mismatches, which can give matching names over different values;
  - legend and value semantics;
  - points masked in only some bands;
  - Earth Engine's behaviour when training on a sample missing a property named by `band_order`: an error or a silently
    dropped sample. The browser check below establishes the preflight refusal, not that execution behaviour. Establishing
    the latter needs a separate controlled Earth Engine probe and is deferred, not a browser acceptance criterion.

  Normalisation of prediction imagery and reused Classification samples is implemented, with the live numerical
  verification recorded below; it is no longer part of this deferred list.
- **Manual check before pushing:**
  This is included in the consolidated browser batch, check 1 under "Verification status"; its recovery must produce
  an actual preview, not merely enable Retrieve.
  1. A Classification `Provider` over an image, with `IMAGE_BANDS [red, nir]` and a few collected points. A
     Classification `Consumer` over imagery with `IMAGE_BANDS [red, nir]` and its own points, plus a `RECIPE` data set
     reusing `Provider`. The consumer can be retrieved.
  2. Remove `nir` from `Provider`'s band set. The consumer's `Provider` data set names `Provider` and `nir`, and
     Retrieve is held.
  3. Restore `nir`. The mark clears and Retrieve is available again.
  4. Repeat for Regression.

Sample counts after masking and sampling are known only to Earth Engine.

**Classification consumers' training readiness (audited 2026-10-21; PyEO, Phenology, CCDC's breakpoint bands and
Time Series' chart band implemented).** Time Series' image and Retrieve, and CCDC's chart observations, reach their
Classification through `CLASSIFICATION_SOURCE: REFERENCE`. That checks only that it resolves, so none of the
Classification's training checks apply to them. PyEO Alerts needs its Classification's `IMAGE_OUTPUT`. Phenology, for its image, and CCDC, for its image
and segments, need its `CLASSIFIER` where a saved band - Phenology's `band`, CCDC's `breakpointBands` - is classified,
and keep `REFERENCE` for native bands.

- **Confirmed behaviour.** When the shared collection (`timeSeries/collection.js`) uses a Classification, it reads the
  record, calls `getTrainingData$()` with no bands and classifies each scene with `classifyImage`. `band_order` is
  therefore the Classification's own features. It uses one only for a requested `regression` or `probability_*` band,
  never for a decision tree (`supportRegression`, `supportProbability`), and never builds the Classification's image.

  | Consumer and operation | Uses the Classification when | Trains | Builds its image | Checked today |
  |---|---|---|---|---|
  | Time Series `IMAGE_OUTPUT` (count) | never (`bands: [0]`) | no | no | `UNSUPPLIED_CLASSIFIER_INPUTS` all the same |
  | Time Series pixel chart | the chart band is classified | yes | no | the Classification's `CLASSIFIER` readiness for a classified band (`CLASSIFIED_COLLECTION`), classifier inputs; output capability before training, refused as execution refuses it |
  | Time Series Retrieve | a Retrieve indicator is classified | yes | no | `IMAGE_OUTPUT` as before; then requested capability and `CLASSIFIED_COLLECTION` over the indicators each request builds |
  | Phenology `IMAGE_OUTPUT` | `sources.band` is classified | yes | no | the Classification's `CLASSIFIER` readiness for a classified band, classifier inputs, `UNSUPPORTED_CLASSIFIED_OUTPUT` |
  | CCDC `IMAGE_OUTPUT`, `PIXEL_SEGMENTS` | classified `breakpointBands`, or a classified export or map band | yes | no | the Classification's `CLASSIFIER` readiness for classified breakpoints, classifier inputs, breakpoint outputs; for export bands, requested capability and `CLASSIFIED_COLLECTION` over the measures they fit; map bands only at run time |
  | CCDC pixel chart (`PIXEL_OBSERVATIONS`, `PIXEL_SEGMENTS`) | the chart band is classified, or for segments a breakpoint band | yes | no | classifier inputs; the configured breakpoints' findings; then requested capability and `CLASSIFIED_COLLECTION` over the bands each request builds |
  | CCDC Slice, Change Alerts over a CCDC recipe | that CCDC's classified breakpoint bands, or a Slice base band | yes | no | through the CCDC, as above |
  | PyEO Alerts `IMAGE_OUTPUT` | always | yes, except a decision tree | yes (`getImage$`, its baseline) | the Classification's `IMAGE_OUTPUT` readiness, classifier inputs, gate index |
  | LandTrendr | never (no selector, an optical index) | no | no | nothing |

- **Gap.** A PyEO Alerts was `READY` over a trained Classification that had no points, that reused a recipe without
  input imagery, or that reused one sampling fewer features, though its run trains on that training data.
- **PyEO's need is `IMAGE_OUTPUT` (implemented 2026-10-21).** `CLASSIFICATION_SOURCE` is an `IMAGE_OUTPUT` need of
  PyEO's `IMAGE_OUTPUT` (`type/pyeoAlerts.js`). Its execution builds the Classification's image as its baseline, and
  classifies the scenes with the classifier that image trains.
  - **Reuse.** The Classification's own `IMAGE_OUTPUT` readiness supplies every check: input imagery, band sets through
    its description, `NO_TRAINING_DATA` with the decision-tree exemption, providers' `TRAINING_DATA` and
    `MISSING_TRAINING_FEATURES`. It adds no operation and no requirement.
  - **Attribution.** Findings sit at the recipe they concern: `NO_TRAINING_DATA` and `MISSING_TRAINING_FEATURES` at
    `[pyeo, classification]`, a provider's `MISSING_ROLE` at `[pyeo, classification, provider]`.
  - **Index gate.** Turning the gate off still avoids every index-specific check. The Classification's baseline imagery
    is validated either way, so its input is observed with the gate off too, and a band it lacks is refused there.
  - **Pending and unavailable.** The Classification's input, and its providers' inputs, are acquired as the
    Classification's own read acquires them. Pending holds PyEO and finds nothing; a failed observation makes it
    unavailable and finds nothing.
  - **Acquisition cost.** Records already in the closure need no further record discovery. Describing an input can
    still need evidence:
    - in the tested cases, an asset input is one band observation each, for the Classification and for each provider;
    - a Sentinel-2 mosaic input is described from its configuration and observes nothing;
    - another recipe input costs whatever describing that recipe costs, including its own evidence or catalogue reads,
      which these tests do not establish.
  - **GUI.** PyEO's Sources declares `referenceFeedback` for `CLASSIFICATION_SOURCE`, bound to the classification field
    (`blocksApply: false`). The field names the Classification, whose own sections say why, while Retrieve and the
    operations over PyEO hold.
  - **Backend.** `requireExecutable$` refuses the export with the Classification's code before building anything.
  - **Unchanged.** `UNSUPPLIED_CLASSIFIER_INPUTS` (the native-band policy), the gate check and the operation-specific
    output checks.
  - **Regressions:**
    - `lib/js/shared/test/recipe/pyeoTrainingReadiness.test.js`:
      - missing points, a provider without imagery and a provider lacking features;
      - the control, the decision-tree exemption and repair;
      - pending and failed observations, and a mosaic input observing nothing;
    - `readiness.test.js`: the gate cases now also observe and validate the baseline;
    - `pyeoAlerts/classificationFeedback.test.jsx`, mounted: explained beside the field, Retrieve held, cleared after
      repair;
    - `imageAssetExport.test.js`: refused, then exported once points are added;
    - `pyeoAlerts/sourcesRequirements.test.js`: its Classification fixtures are now trainable;
    - `modelDerivedOutput.test.js`: PyEO's output read waits for a Classification not yet loaded, naming it.
- **Original remaining work and decisions (2026-10-21).** The collection consumers below belonged to the initial
  request-dependent readiness packet; native-band policy and multi-input expansion were outside that packet.
  S3 and S4 subsequently implemented those changes. The list below retains the former stage design as history;
  use the [current release checkpoint](#current-release-checkpoint) for unfinished work.
  - **The collection consumers** train only for requested classified bands. Readiness has no requested-band input,
    and a static need would refuse configurations that never train.
    - Phenology's `band` and CCDC's `breakpointBands` now select a conditional `CLASSIFIER` need (see "Phenology's
      configured classified band").
    - Time Series' and CCDC's chart bands add `CLASSIFIED_COLLECTION` (see "CCDC's requested chart bands").
    - Time Series Retrieve indicators add it too (see "Time Series Retrieve's classified indicators").
    - CCDC's export bands add it too: to Earth Engine assets (see "CCDC's requested export bands") and to Drive and
      SEPAL (see "CCDC's Drive and SEPAL image exports"). Map bands, which previews request, are still request
      parameters readiness does not see.
  - **Native-band policy.** It refuses a Time Series count image, which never reads its Classification, for
    unsupplied classifier inputs.
  - **Run-time-only band checks.** Requested classified outputs are checked for capability only at run time, for every
    request-parameter consumer; for Time Series Retrieve and CCDC export and chart bands, training is too.

- **Completed behaviour and retained policies.**
  - **Normalisation (implemented).** Prediction imagery and reused samples now use the consumer's transformation;
    see "Classifier normalisation on other imagery" and "Reused Classification samples' normalisation" below.
  - **Classified outputs of an unselected Classification (implemented 2026-10-21).** `selectedClassificationOfState`
    now lets the applied `model.sources.classification` decide whether there is a Classification. With none, it offers
    no classifier or legend capabilities, whatever `ui.classification` copy remains. With one, the precedence is
    unchanged: session record, resolved record, then the copy while unresolved. The Time Series and CCDC charts and
    Time Series Retrieve therefore offer no classified output after deselection. Stored copies are not deleted, and
    nothing is loaded for this.
    - **Regressions.** `unselectedClassification.test.jsx`, mounted over the real Sources panel, chart and Retrieve:
      - clearing the Classification through Sources and Apply stops the Time Series and CCDC charts (CCDC's breakpoint
        bands native) offering or requesting a classified band, and they chart a native one;
      - Retrieve stops offering classified outputs, drops the selection under its existing policy, and submits nothing
        until a native band is chosen;
      - controls: reselection offers the outputs again, and Cancel leaves the applied options;
      - `retrieveClassifiedOutputs.test.jsx` covers a selected Classification still pending.
  - **Retaining a broken choice is a separate matter.** Phenology deliberately keeps a classified band already chosen
    but no longer provided, so that `UNSUPPORTED_CLASSIFIED_OUTPUT` can say what is wrong beside the field and the user
    can repair it. That is a retained choice, explained and validated, not a new offer, and it is unchanged.

- **Outside this rollout.**
  - **Several input images** are refused only at run time (`classifyImage`, PyEO). PyEO's Sources panel checks this
    when proposing a selection, but that does not guard an applied selection after its Classification changes. The
    2026-10-23 browser recheck reproduced an internal layer error; the active S2 follow-up below calls for a shared
    single-input finding at SRC, acquired by client and server readiness.
  - **LandTrendr** declares `CLASSIFICATION_SOURCE` without a selector, and `landTrendr.js`'s comment about always
    resolving it is stale.
- **Manual check before pushing.** Add to the accumulated batch:
  Included in consolidated browser check 3 under "Verification status"; check 9 adds the SVM normalisation smoke run.
  1. A PyEO Alerts over a Classification that has input imagery and no training points. Sources' classification
     field names the Classification, and Retrieve is held.
  2. Add training points to the Classification. The explanation clears and Retrieve is available.
  3. Optionally turn the index gate off and on. Neither changes the hold while the Classification has no points.

**Classifier normalisation on other imagery (implemented 2026-10-21).** A Classification with an SVM or
minimum-distance classifier scales its features by its training imagery's per-band range, unless `normalize: 'NO'` is
set; `YES` is the GUI default. Prediction now scales the imagery the Classification is applied to by that same range.

- **Gap (confirmed by a numerical probe over the real execution).** The exported `classifyImage`, used by the Time
  Series collection (SVM `probability_*`) and PyEO's monitoring scenes (`class`), classified raw features with a
  classifier trained on scaled ones. PyEO's baseline, the Classification's own image, was scaled, so its baseline and
  monitoring scenes were classified on different scales. Normalising each scene by its own range would not be
  equivalent: the transformation is the training imagery's range.
- **One preparation owner** (`classification.js`).
  - `prepared(features)` takes the Classification's prepared imagery: `addCovariates` per input, so indexes, band
    combinations and auxiliary covariates come first, then the inputs combined. It computes the statistics once, with
    one `reduceRegion(minMax)` over that imagery at `scale || 30` (`bestEffort`, at most 1e6 pixels). It scales the
    imagery once, clipped to its footprint, its properties kept.
  - Training samples that image, and `getImage$` classifies it. `getImage$` now prepares once; it used to prepare
    again through `getTrainingData$`.
  - **Carrier.** The statistics are set as `feature_statistics` on the consumer's final training collection, beside
    `band_order`. A reused recipe's statistics, set on its own collection, do not survive flattening.
  - **Prediction.** The exported `classifyImage` scales only the features `addCovariates` derives from the given
    image, with the statistics of the training data it is given. Other bands of that image stay raw, and its callers
    are unchanged.
- **Formula, unchanged:**
  - `(x - min) / (max - min)`, or `x / max` where the range is one value;
  - values beyond the training range stay beyond it;
  - a band constant at zero is zero, since `ee.Image.divide` returns 0 for division by zero. That is documented Earth
    Engine behaviour, not verified live.
- **Preserved:**
  - native-only requests;
  - output modes;
  - masks;
  - scene properties;
  - output scaling;
  - the multi-input own path, scaled once;
  - `normalize: 'NO'` and the other classifiers, untouched.

  Readiness and settings are unchanged. Reused samples are scaled by the consumer, as described under "Reused
  Classification samples' normalisation".
- **Cost.** Classifying more scenes constructs no further reduction expression. The tests count constructed
  expressions, not Earth Engine evaluations: whether Earth Engine evaluates the shared statistics once per computation
  or once per tile is not established.
- **Expected change to existing outputs.** Settings stay as saved, but outputs change wherever such a Classification
  classifies other imagery: Time Series probabilities, CCDC's classified bands and PyEO's monitoring classification.
  Earlier exports differ from re-exports. The Classification's own image is unchanged.
- **Regressions.** `modules/gee/test/ee/classification/featureNormalisation.test.js`, over a numeric stand-in:
  - training and prediction agreeing for SVM and minimum distance;
  - values beyond the range left unclamped;
  - extra scene bands left raw;
  - derived features prepared before scaling;
  - constant and zero-constant bands;
  - the `NO` and Random Forest controls;
  - consumer-owned statistics with a reused provider;
  - one constructed reduction however many scenes are classified;
  - the multi-input own path scaled once.
- **Unresolved:**
  - how `bestEffort` coarsens the statistics' scale on real imagery;
  - how often Earth Engine evaluates them.
- **Manual check before pushing (live, controlled).** Steps 1 and 2, the numerical check, were run on 2026-10-21 and
  passed (see "Verification status"). Step 3 belongs to the browser batch the user reported complete on 2026-10-23;
  unmentioned checks are passing under the user's reporting convention. Keep that report separate from the detailed
  numerical evidence and recheck affected smoke paths after execution changes.
  1. Run `modules/gee/verify/classifierNormalisation.mjs`:
     `docker exec -w /usr/local/src/sepal/modules/gee gee node verify/classifierNormalisation.mjs`.
     It applies the exported `classifyImage` to the Classification's own input scene with its own training data, for
     normalising SVM and minimum distance beside a non-normalising SVM and a Random Forest.
  2. Accept only a run whose every line is `PASS` and which exits 0:
     - training features: each training sample's class and features, compared as a whole row, equal the scene's raw
       features at its point, scaled by the carried `feature_statistics` with the transformation the script computes
       itself (within 1e-5); for the controls, raw with no statistics. This inspects what is trained on, not the
       features prediction is given;
     - predictions: those features are judged only through what prediction gives. Class, and the SVM's probability,
       must be identical pixel by pixel to the Classification's own image, with pixels valid in both;
     - footprint: the same bounded area;
     - mask: nothing classified where the scene is masked.

     A comparison without samples or jointly valid pixels fails. Before this change, the normalising cases' prediction
     check is expected to fail.
  3. As browser smoke tests, open an ordinary Time Series `probability_*` chart and run a PyEO Alerts over an SVM
     Classification. Both should run and look plausible.

**Reused Classification samples' normalisation (implemented 2026-10-21).** A Classification trains on the samples of
the recipes it reuses, and those are now transformed by the consumer alone.

- **Gap (confirmed numerically over the real execution).** Reused samples arrived already normalised by each
  provider's own classifier: scaled by its own range for a normalising SVM or minimum-distance provider, raw
  otherwise. The consumer trained on them beside its own and never rescaled them. Every reuse case mixed feature
  spaces, including Random Forest reusing a normalising provider and nested chains. Controls without reuse matched.
- **Raw samples** (`getSamples$()`, `classification.js`). A Classification's samples for another recipe to train on
  are its reused recipes' raw samples, in configured order, followed by its own points sampled over its unscaled
  features (`addCovariates`) at its own points and `scale`. They carry no `band_order` and no statistics, and
  construct no reduction. Reuse keeps its meaning: each provider samples its own imagery, never the consumer's.
- **The consumer's transformation, applied once.**
  - `reusedSamples$` takes each reused recipe's `getSamples$()`.
  - Where the consumer normalises, `scaledSamples` maps every `band_order` feature of every reused sample with the
    consumer's statistics: `(x - min) / (max - min)`, or, where the range is one value, `x / max`, and 0 for a band
    constant at zero.
  - A feature a sample lacks, or holds as null, is left as it is. It is never made a number, so
    `MISSING_TRAINING_FEATURES` validation and Earth Engine's own refusal still apply.
  - Its own samples are sampled over its already scaled image, which is pointwise the same transformation.
  - Nested samples are raw all the way down, so they are transformed once, by the final consumer.
- **Order is unchanged at every level:** reused data sets in configured order, then the recipe's own samples.
- **Kept as they were:**
  - the consumer's `band_order` and `feature_statistics`;
  - labels and masks;
  - extra provider features, which stay raw and unused;
  - the public `getTrainingData$` that the Classification's own image, the Time Series collection and PyEO call;
  - the `TRAINING_DATA` operation, which describes what producing samples needs (comments updated), with no new
    operation;
  - Regression, sampling scale, readiness and saved settings.
- **Costs.** Acquisition is unchanged. No provider constructs a statistics reduction to serve samples. Reused samples
  gain a per-sample, per-feature map where the consumer normalises. The tests count constructed expressions, not
  evaluations.
- **Expected change to outputs.**
  - **Changes:** a Classification that reuses training data and either normalises itself or reuses a recipe that did,
    and what Time Series, CCDC and PyEO compute with it. A provider that itself reuses data may also change, since the
    correction applies to its own training too.
  - **Unchanged:** a Classification without reuse, and a chain in which none normalises.
- **Regressions.**
  - Gee tests over the numeric stand-in, now shared as `numericEarthEngine.js`, compare whole training rows in order
    (`reusedSamples.test.js`; `featureNormalisation.test.js` unchanged in substance):
    - consumer and provider transformations, including Random Forest beside normalising recipes;
    - nested chains transformed once;
    - order at every level;
    - an empty contributor;
    - no provider reduction;
    - an extra provider feature;
    - zero-constant statistics never manufacturing a missing or null property;
    - a constant band;
    - a provider's own no-reuse output unchanged;
    - controls.
  - `classifierNormalisation.mjs` (live) adds a provider over another date of the same path and row. Its two
    consumers, a normalising SVM and a Random Forest, must train on the provider's raw features scaled by the
    consumer's statistics (raw for Random Forest), then their own rows: both blocks non-empty, compared as whole rows
    in order. Prediction, footprint and mask are checked for them too.
- **Unresolved:**
  - small floating-point differences between scaling a sampled number and sampling a scaled image, absorbed by the
    live tolerance;
  - whether Earth Engine evaluates the shared statistics once;
  - whether Earth Engine keeps a flattened collection's order, which the live order check relies on;
  - what Earth Engine's training does with a reused sample lacking a feature, or holding null. Execution never fills it
    in, and `train` documents that every feature must hold every input property;
  - the explicit 0 for a band constant at zero, which the stand-in cannot tell apart, since it divides by zero to 0
    as `ee.Image` does.

**Phenology's configured classified band (implemented 2026-10-21).** When Phenology's saved
`sources.band` is a classified output (`regression` or `probability_*`), execution trains the selected
Classification's classifier: `getTrainingData$` builds its imagery and samples its training data, and `classifyImage`
is applied to every scene. It never builds the Classification's image. Readiness used to keep the Classification a
`REFERENCE`, so none of its training requirements applied. It is now a `CLASSIFIER` need for a classified band.

- **Gap (confirmed by a temporary readiness probe before the change).**
  - With `regression` or `probability_1` as the band, Phenology is `READY` over a Classification without points, one
    reusing a recipe without input imagery, and one reusing a recipe sampling fewer features. It acquires no evidence
    for any of them.
  - With native `ndvi`, the same Classifications are `READY`. These controls must stay so, with no training requirement
    and no new acquisition.
  - The existing checks still run either way: classifier inputs (`UNSUPPLIED_CLASSIFIER_INPUTS`) and output capability
    (`UNSUPPORTED_CLASSIFIED_OUTPUT`).
- **Alternatives considered.**
  - **`IMAGE_OUTPUT` need.** Rejected: it would describe, and refuse by, an image Phenology never builds.
  - **`TRAINING_DATA` need.** Insufficient: it deliberately lets an empty provider through, and `NO_TRAINING_DATA` and
    `MISSING_TRAINING_FEATURES` belong to `IMAGE_OUTPUT` alone.
  - **A Phenology configuration requirement walking the Classification itself.** Rejected: it would repeat the
    traversal, nested providers, acquisition and attribution that readiness already owns.
- **Implemented: a classifier-training operation and a conditional need.**
  - **Scope.** Phenology only. Conditional needs are flat, with both branches validated as known
    needs at registration; they are not a general policy language. `CLASSIFIER` does not describe the Classification's
    output, while the existing requirements explicitly acquire the input evidence they need. Preserve PyEO's
    explanation-only editor policy for upstream problems (`blocksApply: false`) in the corresponding Phenology
    reference feedback, alongside the existing local output-capability validation.
  - **Operation.** `CLASSIFIER` (`output/readiness.js`): training a Classification's classifier to apply to other
    imagery. Its training data is produced and trained on, its image is not built.
    - Classification declares `CLASSIFIER: {INPUT_IMAGE: IMAGE_OUTPUT, TRAINING_DATA_SOURCE: TRAINING_DATA}`, the same
      needs as `TRAINING_DATA`, shared as one constant.
    - It extends the `operations` of the requirements that already own these rules: `inputImageryRequirement`,
      `inputBandSetRequirements`, `trainingDataRequirement` (with `requiresTraining`'s exemption) and
      `trainingFeaturesRequirement`. `inputImageryRequirement`'s operations are extended in Classification's own
      declaration, so the other types sharing it are unchanged. `trainingDataRequirement` and
      `trainingFeaturesRequirement` take an `operations` argument defaulting to `[IMAGE_OUTPUT]`, so Regression and every
      other caller keep their behaviour.
    - Regression declares nothing for it. A source that does not declare it gets `UNDECLARED_OPERATION`.
  - **Conditional need.** `conditionalNeed({when, then, otherwise})` (`output/readiness.js`) is a role's need that
    follows the saved model. Phenology declares `[CLASSIFICATION_SOURCE]: classifiedOutputNeed('band')`, the
    `conditionalNeed` choosing `CLASSIFIER` where `band` is a classified output and `REFERENCE` otherwise (see "CCDC's
    breakpoint bands").
    - **Validation.** `validateReadinessDeclarations` accepts a need or a conditional need, but only one whose `then`
      and `otherwise` are needs and whose `when` is a function. Malformed declarations still fail at registration.
    - **Resolution.** `executionNeed(definition, operation, role, model)` resolves it. Its one caller, the traversal in
      `resolveImageOutput.js`, passes the recipe's model.
    - **Traversal.** It visits any need that is an operation (`need !== REFERENCE`), not only `IMAGE_OUTPUT` and
      `TRAINING_DATA`. `declaresOperation` and the static needs of every other type are unchanged.
  - **One owner per decision:**
    - the classified-band predicate (`isClassifiedOutput`, already shared with execution and
      `classifiedOutputRequirement`);
    - each training rule (its existing requirement);
    - the closure walk, evidence and attribution (the traversal);
    - need resolution (`executionNeed`).

    Nothing new validates, resolves, caches or subscribes. The one repetition is Classification's `CLASSIFIER` needs
    map, identical to `TRAINING_DATA`'s and declared from the same constant.
- **Behaviour.**
  - **Classified band:**
    - findings sit at the recipe they concern: `NO_TRAINING_DATA` and `MISSING_TRAINING_FEATURES` at
      `[phenology, classification]`, a provider's `MISSING_ROLE` at `[phenology, classification, provider]`;
    - a Classification not held is a record need;
    - unobserved inputs are pending, and a failed observation is unavailable;
    - a supplied decision tree is already refused as `UNSUPPORTED_CLASSIFIED_OUTPUT`, and `requiresTraining` exempts it
      from training rules.
  - **Native band:** today's `REFERENCE` behaviour exactly.
  - **Acquisition,** only for a classified band: the Classification's input observations and its providers'. A recipe
    input costs what describing it costs.
  - **GUI.** `classificationReferenceFeedback(sources)` (`collectionClassifierRequirements.js`) declares
    `referenceFeedback` for `CLASSIFICATION_SOURCE`, bound to the Sources `classification` field with
    `blocksApply: false`. Phenology and PyEO both use it, replacing PyEO's inline copy. Retrieve, layers and recipes
    over the recipe hold.
  - **Backend.** `requireExecutable$` refuses the export with the Classification's code.
  - **Preserved:**
    - normalisation;
    - Phenology's retained unsupported choice, and its `UNSUPPORTED_CLASSIFIED_OUTPUT` explanation;
    - the native-band classifier-input policy.
- **CCDC's breakpoint bands (implemented 2026-10-21).** CCDC's execution adds its `breakpointBands` to the collection
  bands of every segmentation: its image for exports and maps (`timeSeries/ccdc.js`) and its segments at a pixel
  (`loadSegments.js`). A classified breakpoint therefore trains the Classification for `IMAGE_OUTPUT` and
  `PIXEL_SEGMENTS`. `PIXEL_OBSERVATIONS` reads only the chart band and keeps `REFERENCE`.
  - **One owner for the need.** `classifiedOutputNeed(field)` (`classifiedOutputs.js`) is the conditional
    `CLASSIFIER` need of a recipe choosing classified outputs at `field`. It reads that field as
    `classifiedOutputRequirement` does, through the same helper, so need and output check agree on which bands count.
    Phenology declares `classifiedOutputNeed('band')` and CCDC `classifiedOutputNeed('breakpointBands')` for both
    operations. Phenology's inline condition is gone.
  - **Over a CCDC recipe.** CCDC Slice and Change Alerts reach it as their segment source, so they inherit the
    readiness through the traversal.
  - **GUI.** CCDC's Sources declares `classificationReferenceFeedback`. Its local breakpoint-output validation and
    retained invalid choices are unchanged.
  - **Unchanged and deferred:**
    - optional chart, export and map bands, which are request-dependent and add no request contract;
    - `PIXEL_OBSERVATIONS`;
    - the native-band policy;
    - normalisation.
  - **Regressions:**
    - `classifiedOutputTraining.test.js`, which replaces `phenologyClassifier.test.js`, runs every case above for
      Phenology's `IMAGE_OUTPUT` and CCDC's `IMAGE_OUTPUT` and `PIXEL_SEGMENTS` (42 tests). Reverting CCDC's need
      fails its 17 classified cases; the Phenology rows and the native and decision-tree cases pass either way.
    - `referencedSegments.test.js`: its SVM fixture stores points, so a classified breakpoint over it is refused for
      the output alone.
    - Mounted (GUI):
      - `ccdc/classificationFeedback.test.jsx`: the field explained, Retrieve held, Apply available, repair, a native
        control, and a retained invalid breakpoint;
      - `ccdc/panels/classifiedBreakpointChart.test.jsx`: an open chart closes, cancels its segment request and disables
        its button when training becomes invalid. Repair re-enables it, a new pixel requests segments again, and native
        breakpoints keep it open;
      - `chartPixelButton.test.jsx` and `pixelObservationsChart.test.jsx`: their Classification fixtures, under a
        classified breakpoint, now store points over a mosaic described from configuration.
    - gee:
      - `ccdcAssetExport.test.js`: an export refused with `NO_TRAINING_DATA` before anything is built, then exported
        after repair, with a native control. The file now stubs Earth Engine for its asset reads;
      - `loadSegmentsReadiness.test.js`: segments refused before any collection is built or evaluated, then read after
        repair, with a native control.
- **Regressions.**
  - **Shared:**
    - `recipeType.test.js`: `conditionalNeed` validation. A predicate that is not a function, a branch that is no need,
      a missing branch or a nested condition are refused at registration, while a valid one is retained.
    - `classifiedOutputTraining.test.js` (formerly `phenologyClassifier.test.js`), Phenology with a classified band over:
      - no points, a provider without imagery, a provider lacking features, an input lacking a selected band (refused
        once, without describing the Classification's image), and a working Classification;
      - a type that trains no classifier (`UNDECLARED_OPERATION`), and a decision tree (only
        `UNSUPPORTED_CLASSIFIED_OUTPUT`);
      - repair, pending and unavailable evidence, and a record not held;
      - native-band controls over the broken Classifications, `READY` and observing nothing.
    - `classifiedOutputs.test.js`: its fixture Classification is now trainable and its input observed, so its cases
      still pin output capability alone.
    - The Classification's own `IMAGE_OUTPUT` and `TRAINING_DATA` tests are unchanged.
  - **GUI (mounted):** `phenology/classificationFeedback.test.jsx`: the classification field explained, Retrieve held,
    cleared on repair, and the native control. `collectionClassifierRequirements.test.js`'s output-capability fixture
    is now trainable and over a mosaic described from configuration, so its controls still pin output compatibility
    alone.
  - **gee:** `imageAssetExport.test.js`: a Phenology export with a classified band refused with `NO_TRAINING_DATA`, then
    accepted after repair; a native band exports.
  - **Witnesses:**
    - Phenology's need reverted to `REFERENCE`, or the traversal visiting only `IMAGE_OUTPUT` and `TRAINING_DATA`, fails
      every classified case; the native controls and the decision tree pass either way.
    - Validation accepting any condition fails the four malformed-declaration cases.

**Time Series' classified chart band (implemented 2026-10-21).** A band a Time Series chart observes that its
Classification computes (`regression`, `probability_*`) trains that Classification and applies it to every image at the
pixel (`collection.js`). The operation below, `CLASSIFIED_PIXEL_OBSERVATIONS` chosen by `pixelObservationsOperation`,
has since been generalised as the stage `CLASSIFIED_COLLECTION` (see "CCDC's requested chart bands"); this entry keeps
the names it was implemented with.

- **Gap (confirmed by failing witnesses before the change).** The request was judged as `PIXEL_OBSERVATIONS`, whose
  `CLASSIFICATION_SOURCE` need is `REFERENCE`. So `/timeSeries/loadObservations` built and evaluated the collection,
  and the GUI requested it, over a Classification that stores no points, one reusing a recipe without input imagery,
  or one reusing a recipe that samples fewer features than it trains on. Native bands over the same Classifications
  read none of their training data, and are rightly answered.
- **Why the request has to count.** The band is a request argument: unlike Phenology's `band` and CCDC's
  `breakpointBands`, no model holds it, and readiness reads only records and evidence. A static `CLASSIFIER` need would
  refuse native-band charts that never train, which would change the native-band policy. Stale capability options are
  no reason: the resolved-record view already fixed those.
- **Alternatives compared.**
  - *Request arguments to readiness* (`executionNeed(…, request)`, `when(model, request)`, scoped to the root). Every
    place that identifies a question by operation would also carry the bands: the GUI's session-read cache, the
    acquisition key, `watchOutput$`, the runtime's asset interest and `requireExecutable$`. Yet readiness depends on the
    request by one fact, whether any band is classified. Keying by bands would split one question per native band, and
    keying by that fact is a second operation in disguise.
  - *The bands saved in the model.* Request parameters are not recipe configuration.
  - *A check of the Classification in the loader.* A parallel validator, outside the GUI's holds and attribution.
  - **Chosen: an operation the request chooses.** `CLASSIFIED_PIXEL_OBSERVATIONS` (`output/readiness.js`) is reading
    the observations of a band the Classification computes. `pixelObservationsOperation(bands)` (`classifiedOutputs.js`,
    with `isClassifiedOutput`) is the one place the bands decide. Readiness, the traversal, evidence acquisition, the
    server gate and every GUI identity are unchanged, since they already key by operation.
- **Declarations.**
  - Time Series: `CLASSIFIED_PIXEL_OBSERVATIONS: {CLASSIFICATION_SOURCE: CLASSIFIER, SOURCE_IMAGERY: REFERENCE}`. The
    Classification's own `CLASSIFIER` readiness supplies every training rule. `collectionClassifierRequirement` lists
    the operation, so the classifier-input policy is the same for both operations.
  - CCDC declares it with its `PIXEL_OBSERVATIONS` needs, so a classified CCDC chart band is not refused as undeclared.
    Holding it to training is CCDC's follow-up.
- **Server.** `loadObservations.js` judges `pixelObservationsOperation(bands)` over the recipe and bands it builds: at
  the pixel, and for Change Alerts the collection it monitors.
  - **Order and the capability contract.** A classified band is judged in the order execution finds things:
    `PIXEL_OBSERVATIONS` (closure, classifier inputs), then output capability, then `CLASSIFIED_PIXEL_OBSERVATIONS`.
    Capability uses the existing rule over the Classification's record (`unprovidedClassifiedOutputs`). It is read
    once per request, since the recipe scope caches it. An output not provided is refused with execution's own error
    (`unsupportedClassifiedOutput`, `lib/js/ee/src/timeSeries/classifiedOutputRefusal.js`, which `collection.js` now
    shares): a `ClientException`, 400, `UNSUPPORTED_CLASSIFIED_OUTPUT`. That holds whether or not the Classification
    can be trained.
  - **Cost.** A classified request settles readiness twice over one closure, and the second settling observes the
    Classification's inputs. Native requests are unchanged.
- **GUI** (`timeSeries/panels/chartPixel.jsx`).
  - **The action.** It and `CHART_OPERATIONS` stay `PIXEL_OBSERVATIONS`, so the action is band-independent and stays
    offered for native bands.
  - **The open chart.** While a classified band is charted at a pixel, the chart also reads and watches that band's
    operation (`BAND_OPERATIONS`) through `pixelOperationsAvailability` and `watchOperations`.
  - **Holds.** That band's gate holds the band without closing the chart: it reaches `pixelChartUpdate` with
    `withdraw: false`. So the existing hold, cancellation and recovery apply. Pending or unavailable evidence requests
    nothing, and a finding lets the request go and is said in the chart (`classifiedBandWithheld`). Another band can
    be chosen, and repair reads the band again. A finding of `CHART_OPERATIONS` still closes the chart.
  - **Unchanged machinery.** `recipeForOperation` treats the operation as a pixel operation. The draft gate holds the
    request until the Classification's save is acknowledged.
- **Abstraction cost.** One operation, one selection function and two declarations, plus, in the chart, a second
  availability read, a watch and a message. Nothing new for readiness to take, cache or load. The pattern costs an
  operation per request-dependent consumer, and does not extend to `IMAGE_OUTPUT`. CCDC's export and map bands are
  requested of its `IMAGE_OUTPUT`, which is also how other recipes consume a CCDC. The operation is a local answer to
  one binary distinction: assess a broader operation-context design before extending the pattern to Retrieve or
  exports.
- **Regressions.**
  - `classifiedOutputTraining.test.js` (shared): a Time Series row beside Phenology and CCDC. It covers every
    training finding at the recipe it concerns, a type training no classifier, repair, pending and unavailable
    evidence, a record not held, and native controls. A supplied decision tree is refused for nothing by readiness: the
    route refuses output capability.
    - Its `settle` helper used to settle `IMAGE_OUTPUT` whatever operation it was given, so the CCDC `PIXEL_SEGMENTS`
      row's unavailable case passed through CCDC's image. It now settles the operation itself. Reverting that need
      fails the case.
  - `loadObservations.test.js` (gee):
    - each training finding is refused before any chart work, and the request is answered after repair;
    - unobservable input fails as a read;
    - an unprovided output is refused with the 400 `UNSUPPORTED_CLASSIFIED_OUTPUT` client error before any chart work,
      over a trainable and over a point-free Classification, but only after unsupplied classifier inputs, as before;
    - native bands over each broken Classification are answered without observing its input;
    - a CCDC classified band is answered.
  - `timeSeries/panels/classifiedBandChart.test.jsx`, since moved to `recipe/classifiedBandChart.test.jsx` (GUI,
    mounted over the real runtime, chart and action):
    - a classified band over a Classification without points is never requested, the chart says why, stays open at
      another pixel, and its action stays offered;
    - a request in flight is cancelled when points are removed;
    - repair reads the band again, and a repair waits for its save to be acknowledged;
    - pending imagery holds the band until it is observed, and unavailable imagery holds it without a finding;
    - a native band is read instead, and without waiting.
  - **Witnesses.** Every native control passes either way.
    - With Time Series' classified need at `REFERENCE`, today's need, 5 gee and 9 shared cases fail.
    - With the GUI chart and `operationReadiness.js` restored from `HEAD`, 7 of the 8 GUI cases fail.
    - Without the capability step, both capability cases fail: the point-free one with a plain `NO_TRAINING_DATA`.
      Judging capability before the classifier inputs fails the order case.
- **Remaining.**
  - Time Series Retrieve: `timeseries.download` is held to `IMAGE_OUTPUT`, and its classified indicators need the
    same training readiness.
  - CCDC's chart: its classified observations, and the segments it fits to the chart band, which `PIXEL_SEGMENTS`
    judges by `breakpointBands` alone. The GUI hold is the same.
  - CCDC export and map bands.

**CCDC's requested chart bands (implemented 2026-10-21).** Slice 1 of the architecture checkpoint's sequence: the
stage generalised, the band hold shared, and the CCDC chart integrated.

- **Gap (confirmed by failing witnesses).** A CCDC chart band the Classification computes trains it in both requests:
  segments fit `[band]` with the breakpoint bands (`fittedMeasures`), and observations build `[band]`. The segment
  request was judged by `PIXEL_SEGMENTS`, whose need follows `breakpointBands` alone. The observation request's
  classified operation needed only `REFERENCE` for CCDC. The GUI chart read the band without holding it. With native
  breakpoints, a Classification without points, with an unusable reused provider, or with reused features missing,
  was trained on at execution.
- **The stage** (`CLASSIFIED_COLLECTION`, `output/readiness.js`) is the collection classified by its Classification,
  wherever its images are read.
  - Its needs are declared once, `CLASSIFIED_COLLECTION_NEEDS` (`collectionSources.js`): the Classification's
    `CLASSIFIER`, which reuses its existing training requirements, and the source imagery resolving. Time Series and
    CCDC both declare it, and the classifier-input requirement lists it.
  - It is AOI-independent. Routes judge it over the recipe without its AOI (`withoutAoi`), and the GUI lists it among
    the operations `recipeForOperation` strips the AOI for. Only the consumer's AOI goes: the Classification's own
    imagery keeps its AOIs.
- **Effective bands** are each execution owner's. Observations build the bands requested. CCDC's segments build
  `fittedMeasures(model, requested)`, which `ccdc.js` now also uses for the collection's bands instead of repeating the
  union inline. `requestStages(effective)` (`classifiedOutputs.js`) is the one selector: constant lists, the stage or
  none, so watchers tell them apart by identity. There is no type switch: each caller passes its own bands.
- **Server sequence** (`requireRequestedBands$`, `modules/gee/src/jobs/requestedBands.js`), extracted from
  `loadObservations.js`:
  1. the base operation and every configured finding, a classified breakpoint's training and capability included;
  2. the capability of the outputs the request names, by `unprovidedClassifiedOutputs`, refused with execution's
     `unsupportedClassifiedOutput` (400, `UNSUPPORTED_CLASSIFIED_OUTPUT`);
  3. the stages the effective bands add.

  A native request runs the first alone, reading nothing more. `loadObservations.js` and the direct CCDC branch of
  `loadSegments.js` use it before anything is built. The recipe-reference and asset segment branches are unchanged.
- **GUI** (`operationAvailability.js`).
  - `pixelBandAvailability({operations, bandOperations})` is the shared hold. A finding of the chart's own operations
    closes the chart, as before. The band's gate holds that band without closing: it is passed to `pixelChartUpdate`
    as non-withdrawing, so obsolete requests are cancelled, pending or unavailable evidence holds without a finding,
    the draft gate waits for saves, and clearing reads once. A finding of the band is explained
    (`process.chartPixel.classifiedBandWithheld`, shared by both charts).
  - `BandOperationWatch` watches the band's operations while they are the band's, and releases them on another band or
    on unmount.
  - Time Series passes `requestStages([band])`. CCDC passes `requestStages(fittedMeasures(model, [band]))`, which covers
    both its streams, so they are held, cancelled and resumed together.
- **Decisions consolidated:**
  - the stage order, from `loadObservations.js` into one server helper;
  - the band hold and its watch, from Time Series' panel into two shared GUI helpers;
  - which bands make a request classified, into one selector;
  - the stage's needs, into one declaration;
  - CCDC's fitted bands, into `fittedMeasures` for execution and route alike.
- **New abstraction:**
  - one stage operation, replacing an operation-specific variant;
  - one server helper and two GUI helpers, each used by both charts;
  - nothing new for readiness to take, cache or load.

  The pixel projection is still defined three times (the GUI's `recipeForOperation`, the routes' `atPixel` and
  `withoutAoi`); a shared projection remains optional.
- **Preserved:**
  - native requests succeed without training;
  - CCDC's native observations don't depend on classified breakpoints;
  - configured breakpoint findings take precedence over everything a request adds;
  - Time Series' chart behaves as before; only its message key moved to the shared one, with the same text.
- **Regressions.**
  - `loadSegmentsReadiness.test.js` (gee):
    - each training finding refused before anything is segmented, with native controls answered, fitting `ndvi` and
      observing nothing of the Classification's input;
    - repair, fitting the band with the breakpoint bands;
    - unobservable input failing as a read;
    - the four combinations where several things are wrong: a classified breakpoint's `NO_TRAINING_DATA` before an
      unsupported requested output; the 400 before training; a configured unsupported breakpoint's finding before the
      requested one; unsupplied classifier inputs before anything request-added.
    - Readiness's own evidence evaluation is now told apart from chart work in its Earth Engine stand-in. Repair runs
      each request in its own recipe scope.
  - `loadObservations.test.js` (gee): a CCDC classified band refused over a Classification without points, and native
    observations answered over classified breakpoints without observing the input.
  - **Guard agreement.** Both gee files record the operations each request is judged by, through the real readiness:
    native requests their base operation alone, classified ones `CLASSIFIED_COLLECTION` after it.
    `classifiedBandChart.test.jsx` records the runtime's actual watches: the chart's operations, plus
    `CLASSIFIED_COLLECTION` while a classified band is charted, released on a native band and on unmount. That is the
    union of the two routes' guards.
  - `classifiedOutputTraining.test.js` (shared): Time Series and CCDC rows for the stage. They cover every training
    finding, pending and unavailable evidence, repair and native controls.
  - `recipe/classifiedBandChart.test.jsx` (GUI), moved from `timeSeries/panels` and run for both charts:
    - each case for Time Series and CCDC;
    - CCDC holding and cancelling both streams together;
    - a classified breakpoint's finding closing the chart rather than holding the band;
    - a classified band read over an AOI the session cannot resolve.
- **Witnesses.**
  - CCDC's stage at `REFERENCE`: the CCDC observation case and 9 shared cases fail.
  - `loadSegments.js` from `HEAD`: 7 gee cases fail (training, repair, unavailable, the coded refusal, the judged
    operations). The precedence cases where configured findings win pass, as they did before.
  - The CCDC chart panel from `HEAD`: 9 GUI cases fail, while the Time Series cases and native controls pass.
  - The stage removed from the GUI's AOI-free operations: the unresolved-AOI case fails.
- **Focused campaign** (two workers at most):
  - shared `test/recipe`: 1270 passed;
  - gee `test/jobs`, `test/ee/timeSeries` and `test/ee/classification`: 1198 passed;
  - GUI: 75 files and 1408 tests passed, covering every top-level recipe test, Time Series, CCDC, CCDC Slice, Change
    Alerts, Phenology, the source runtime and translations.

  The full GUI suite was not repeated.
- **Outside this slice:** preview gating, propagated requests, dependency-loading changes, and the Retrieve and export
  integration.

**Time Series Retrieve's classified indicators (implemented 2026-10-21).** Slice 2 of the architecture checkpoint's
sequence.

- **Gaps (confirmed by failing witnesses).**
  - **Server.** The three download requests were held to `IMAGE_OUTPUT` alone, which needs only `REFERENCE` of the
    Classification. A classified indicator over a Classification without points, with an unusable reused provider or
    with reused features missing was tiled, built and exported, and trained at execution. Capability surfaced only at
    the chunk, after planning.
  - **Open panel.** Retrieve's request path never consulted the image output's readiness once open. The toolbar
    button holds on it, but an open panel submitted a native download after the Classification's features stopped
    suiting the scenes. Only classified options awaiting the Classification's record or save were held.
- **Server** (`modules/gee/src/jobs/task/export/timeSeries.js`).
  - Each entry point runs `resolveImageOutput$`, unchanged: the description and `IMAGE_OUTPUT` readiness over the
    download's AOI, with its configured findings. Then `requireRequestStages$` (`jobs/requestedBands.js`, split out of
    `requireRequestedBands$`) runs: the requested capability (400, `UNSUPPORTED_CLASSIFIED_OUTPUT`), then
    `CLASSIFIED_COLLECTION` without the AOI. This all happens before tiling, building, preparing a destination or
    submitting an export.
  - Tiles and date ranges judge every indicator (`image.indicators`, or the single `image.indicator` older tasks send).
    A chunk judges its own `image.indicator`, so a native chunk of a mixed download does not train. Native-only
    requests run `resolveImageOutput$` alone, as before.
- **GUI.**
  - `MosaicRetrievePanel`'s request path gains a two-prop contract:
    - `requestGate(state, selected)`, which returns `null` or `{wait, message}`. It is judged in the panel's
      `mapStateToProps` for Apply and the explanation, and again from the store's current state when a submission
      arrives, by Apply or the form alike.
    - `onRequestSelection(selected)`, which tells the owner each selection.
  - Without a `requestGate`, the panel behaves as before for every other recipe.
  - Time Series Retrieve implements the gate with `requestedBandAvailability`, the chart helper renamed now that it
    holds requests generally: `[IMAGE_OUTPUT]`, plus `requestStages(selected)`. It watches that selection's stage with
    `BandOperationWatch`, so selecting only native indicators releases it.
  - Base findings are said with Retrieve's existing `configurationUnmet` message. A classified-only finding, pending
    evidence and evidence that can't be read each get a message of their own. The existing pending-options hold, and
    its capability resolution from the Classification's record, are unchanged.
- **Behaviour change.** A native indicator is now held while the image output's readiness is being read, or while a
  dependency's save is unacknowledged: the toolbar button and the image-output path already hold then. Two
  `retrieveClassifiedOutputs.test.jsx` cases that pinned submission in those states now pin the hold and its release.
  Its Classification fixture stores points, and its input is observable, so classified cases still pin capability
  alone.
- **Consolidation versus coordination.**
  - **Consolidated:** the download's stage order now runs through the routes' shared helper, and its hold reuses the
    charts' availability and watch helpers.
  - **Coordination added:** one owner/panel contract of two props. It removes the panel's blind spot rather than
    adding a mechanism. The gate is the existing operation-readiness read, so there is still one readiness mechanism.
  - **Still repeated:** the AOI projection, now in `withoutAoi` for both the chart and download routes.
- **Regressions.**
  - `task/export/timeSeries.test.js` (gee):
    - the three training findings refused before tiling, with native controls planned without observing the input;
    - mixed downloads refused in full;
    - an earlier release's single indicator judged;
    - date ranges refused before any imagery check;
    - each chunk judging its own indicator;
    - repair, and unobservable input failing as a read;
    - the coded 400 over trainable and point-free Classifications, after unsupplied classifier inputs.
  - `retrieveTrainingReadiness.test.jsx` (GUI, mounted):
    - a held, explained classified selection, by Apply and the form;
    - a mixed selection released by deselecting its classified indicator;
    - repair, and save agreement through the save coordinator;
    - a submission made before the panel re-renders, refused from current state;
    - pending imagery holding without a finding, then submitting; unobservable imagery held;
    - a native indicator not waiting for training evidence;
    - a base finding arising after Retrieve opened, held and explained by Apply and the form, then released by repair;
    - the operations watched: `IMAGE_OUTPUT` alone, plus `CLASSIFIED_COLLECTION` while a classified indicator is
      selected, released on deselection and on unmount. These match the routes' guards.
- **Witnesses.**
  - The export route from `HEAD`: 11 cases fail; native, own-chunk and inputs-first controls pass.
  - The GUI from `HEAD` (the owner, the panel and the availability helpers): 7 of the 10 new cases fail, including the
    open-panel gap and the late submission.
  - A submission judged from the last render's props, not current state: that case fails.
- **Focused campaign** (two workers at most):
  - gee `test/jobs`, `test/ee/timeSeries` and `test/ee/classification`: 1214 passed;
  - task `timeSeriesExport.test.js`: 9 passed;
  - GUI: 100 files and 1954 tests passed. That covers every GUI test that mentions Retrieve, every top-level recipe
    test, Time Series, CCDC, Mosaic, the source runtime and translations.

  The full GUI suite was not repeated.
- **Legacy single indicator (fixed 2026-10-21).** An earlier release offered one indicator and saved it as the value
  itself (`"ndvi"`), which the multi-select control dropped as no list, leaving Apply disabled until it was chosen
  again. On the request path - Time Series Retrieve's form, its only user - the panel now selects that value as a
  list when it opens (`selectSavedSingleRequest`, `retrievePanel.jsx`), before the control reconciles it. Lists are
  kept as they are, and the gate, holds and submission are unchanged.
  - **Settled options reconciled by the panel.** Selecting it as a list exposed an existing gap for lists: once Sources
    applied no Classification, a saved `["regression"]` was no longer offered but stayed selected until the request
    control next updated, and Apply submitted it meanwhile. A legacy string had escaped that only because the control
    dropped it as no list. Once the options are settled, the panel now lets go of a selection they no longer offer
    (`reconcileRequest`), as the image path does (`reconcileBands`).
  - **Offer judged at submission.** Reconciling after a render cannot cover a submission in the same batch as the change.
    Time Series Retrieve's gate now derives what is offered from the state it is given, as the render does
    (`requestOffer`, `retrieve.jsx`): indicators not offered hold, naming them (`bands.unavailable`), and indicators of
    a Classification not yet established wait, before readiness is judged. The panel asks the gate again at submission
    from the store's current state, so Sources applying no Classification, or a classifier that does not compute the
    indicator, refuses a submission made before the panel re-renders.
  - **Regressions.** `retrieveTrainingReadiness.test.jsx` opens native and classified legacy selections: the native
    one submits `["ndvi"]`; the classified one is held while untrainable, or while its imagery is pending, keeps its
    selection, and submits once released. Two cases change the session and submit in the same batch: Sources applying
    no Classification, and its classifier changed to SVM C_SVC, which does not compute `regression`; neither submits,
    and the native indicator is then submitted alone. `unselectedClassification.test.jsx` clears the Classification
    over a regression saved as a list and as a single indicator.
  - **Witnesses.** With the panel from `HEAD`, the 3 legacy cases and the list case fail. Without the reconciliation,
    both clearing cases fail. With the owner from `HEAD`, or its gate not judging the offer, both same-batch cases fail.
    The existing cases pass either way.
  - **Focused campaign** (two workers): Time Series, CCDC, the shared, Masking and CCDC Slice Retrieve panels,
    `retrieveOutput`, the chart band tests, `unselectedClassification` and `wizardSectionMarks`, 28 files and 348
    tests passed. The full GUI suite was not repeated.
- **Outside this slice:** CCDC exports, previews, propagated requests and dependency loading.

**CCDC's requested export bands (implemented 2026-10-21).** Slice 3 of the architecture checkpoint's sequence.

- **Gap (confirmed by failing witnesses).** The two asset-export routes were held to `IMAGE_OUTPUT` alone. CCDC's need
  there follows `breakpointBands`, so a requested classified measure with native breakpoints was built and trained at
  execution. This held over a Classification without points, with an unusable reused provider, or with reused
  features missing. `imageAssetExport` also built the image beside its check, so even a configured refusal had
  already constructed the product.
- **One derivation.** `requestedMeasures({selection, outputBands, visualizationType})` (`type/ccdc.js`) is how execution
  reads a request: the measures the physical bands are built from (`measuresFor`), otherwise the selection, and none
  for the count product. Segment timing bands come from no measure, and an unknown band throws as before.
  - `timeSeries/ccdc.js` now uses it, and fits `fittedMeasures(model, requestedMeasures(...))` for its collection.
  - The routes call the same function, so a route can't read a request differently from the image it guards.
  - No physical-band string is matched for being classified: measures are derived first, then judged.
- **Routes.** `requireCcdcImageStages$(recipe, request)` (`jobs/requestedBands.js`) runs `requireRequestStages$` with
  `requested = requestedMeasures(request)` and `effective = fittedMeasures(model, requested)`. Each route runs, in
  order:
  1. `resolveImageOutput$`, unchanged: the description and `IMAGE_OUTPUT` over the export's AOI, including the
     configured breakpoint findings;
  2. the capability of the requested measures, as the coded 400;
  3. `CLASSIFIED_COLLECTION` without the CCDC's AOI.

  How each route uses it:
  - `ccdcAssetExport.js` passes its `bands`, which are measures, as the selection.
  - `imageAssetExport.js` passes `withOutputBands(bands)` for a direct CCDC root, and builds only after the check, from
    the image output already resolved (resolved once).
  - Any other root keeps building beside its check. A Masking or other wrapper over a CCDC is a downstream request,
    still outside.
  - Native effective bands run the first step alone, and never train.
- **Drive and SEPAL image exports.** Not guarded by this slice; they run the same sequence now (see "CCDC's Drive and
  SEPAL image exports").
- **GUI preflight.** Not in this slice; CCDC Retrieve now holds the measures chosen too (see "CCDC Retrieve's classified
  measures").
- **Consolidation.**
  - `requestedMeasures` removes a repeated decision: execution's reading of the request now has one owner, shared with
    the routes.
  - `requireCcdcImageStages$` is a two-line composition shared by both routes; on its own it consolidates nothing
    further.
  - The generic image exports recognise CCDC by its type, in one place (`judgesRequest`, `imageOutput.js`). That is
    one type check in the generic export path, rather than a new recipe-type declaration with a single user. CCDC's
    own export judges every recipe as a CCDC, whatever type it states.
- **Regressions.**
  - `ccdcAssetExport.test.js` (gee):
    - the three training findings refused before the segments are built, with native measures exported without
      observing the Classification's input;
    - repair, and unobservable input failing as a read;
    - a classified breakpoint refused whatever native or unsupported measure is requested;
    - the coded 400 over trainable and point-free Classifications, a configured unsupported breakpoint's own finding,
      and unsupplied classifier inputs first;
    - the asset's `sample` pyramiding, region, date metadata and visualization properties after repair.
  - `imageAssetExport.test.js` (gee), for a direct CCDC root:
    - each finding for a coefficient band, refused before any product factory, build or export;
    - RMSE, magnitude and mixed selections refused;
    - timing-only and empty selections exported over an untrainable Classification;
    - a classified breakpoint refused for a native band;
    - repair, preserving the built image, region, empty encoding, pyramiding policy and visualization metadata;
    - unobservable input, the coded 400 and inputs first.
    - Its factory stand-in now tells readiness's catalogue read apart from product construction.
  - `type/ccdc.test.js` (shared): `requestedMeasures` and `fittedMeasures`, covering physical, timing, selection, count
    and unknown bands.
- **Witnesses.** With both routes from `HEAD`, 19 cases fail. They include the ordering cases, where a configured
  finding refused after the image was built. The configured-precedence controls on the CCDC route pass, as before.
- **Focused campaign** (two workers at most):
  - shared `test/recipe`: 1275 passed;
  - gee `test/jobs` and `test/ee`: 1307 passed;
  - task export tests: 49 passed;
  - GUI CCDC, CCDC Slice, Change Alerts, `retrieveOutput` and the chart band tests: 26 files and 356 tests passed.

  The full GUI suite was not repeated.
- **Outside this slice:** the Drive and SEPAL image exports of a CCDC and CCDC Retrieve's preflight (both since done,
  below), previews, downstream request propagation and dependency loading.

**CCDC's Drive and SEPAL image exports (implemented 2026-10-21).** The image exports to Drive and the SEPAL workspace
of a direct CCDC root, held as its asset exports are.

- **Gap (confirmed by failing witnesses).** `imageDriveExport.js` and `imageWorkspaceExport.js` went from
  `resolveImageOutput$` straight to product construction. A requested classified measure with native breakpoints was
  built, a destination prepared and an export started, over a Classification without points, with an unusable reused
  provider, or with reused features missing.
- **One sequence.** `resolveRequestedImageOutput$(recipe, request)` (`imageOutput.js`) resolves the image output once,
  then, for a direct CCDC (`judgesRequest`), runs `requireCcdcImageStages$` over the request the image is built with.
  It emits the description. The generic image exports use it:
  - Drive and SEPAL pass `withOutputBands(bands)`, the request `ImageFactory` builds with, and build only after it;
  - `imageAssetExport.js` uses it for a CCDC and keeps building any other recipe beside `resolveImageOutput$`.

  `ccdcAssetExport.js` does not: it builds segments as a CCDC's whatever type the recipe states, so it runs
  `requireCcdcImageStages$` unconditionally after `resolveImageOutput$`. A regression holds a `TIME_SERIES` root with
  CCDC settings, asking for a classified measure over a point-free Classification, to `NO_TRAINING_DATA` before
  anything is built; with the type-conditional helper there, it reached the exporter.

  The order is the asset exports': the image output and configured findings over the export's AOI, the requested
  capability as the coded 400, `CLASSIFIED_COLLECTION` without the CCDC's AOI, then product construction, destination
  preparation and submission. Referenced imagery keeps its own AOIs. Non-CCDC roots are unchanged.
- **Readiness, not destination support.** CCDC's bands are arrays. These routes now refuse an export that cannot be
  trained. They do not establish that a Drive or SEPAL raster file can hold array bands, and do not validate that
  (see the export-compatibility rule under "Resolved descriptions and capability lineage", and the deferred list). The
  CCDC Retrieve panel offers only Earth Engine assets, so these routes are reached by direct requests alone, and there
  is no browser check for them.
- **Regressions** (`ccdcImageFileExport.test.js`, gee), each run against both routes:
  - the three training findings for a coefficient band, refused before any product factory, build, destination or
    export, with native bands exported without observing the Classification's input;
  - RMSE, magnitude and mixed selections refused; timing-only, empty and absent selections exported over an
    untrainable Classification;
  - a classified breakpoint refused before a native band and before an unsupported one;
  - repair releasing the guard, over the CCDC's own region; unobservable input failing as a read;
  - the coded 400 over trainable and point-free Classifications, and unsupplied classifier inputs first.

  Its Earth Engine substitute accepts any image: a started export there shows readiness released it, nothing about the
  file. The existing Drive and SEPAL tests' CCDC fixture now names `ndvi_coefs`; it named `ndvi`, which CCDC does not
  build and execution's derivation refuses. Their authentication, destination and non-CCDC cases are unchanged.
- **Witnesses.** With both routes from `HEAD`, 20 of the 38 cases fail. The 18 that pass are the native, timing-only,
  default-selection, configured-breakpoint and classifier-input controls. Judging the stages before the image output
  fails the classifier-input order case on both routes.
- **Focused campaign** (two workers): gee `test/jobs` and `test/ee`, 1346 passed. Lint and `git diff --check` are
  clean. Shared, task and GUI code are unchanged, and the full GUI suite was not repeated.
- **Outside:** destination compatibility for array bands, CCDC Retrieve's preflight (since done, below), previews,
  propagated requests and dependency loading.

**CCDC Retrieve's classified measures (implemented 2026-10-21).** The panel now holds what the server refuses.

- **Gap (confirmed by failing witnesses).** CCDC Retrieve took the image-output path alone (`ccdcMeasureSelection`),
  held by the retrieve decision. Nothing judged `CLASSIFIED_COLLECTION` for the measures chosen, so a classified measure
  over an untrainable Classification was offered Apply and submitted, and the server refused the task.
- **Panel contract, extended narrowly.** `MosaicRetrievePanel`'s optional `requestGate(state, selected)` and
  `onRequestSelection(selected)` now work on the image-output path too, with no new prop:
  - the hold sits beside the retrieve decision, which still alone judges the description, capability, destination
    and submission;
  - it holds Apply, is said under the measures, and keeps the selection;
  - `retrieve` asks the gate again from the store's current state before it reads the output, so a submission the
    gate holds sends nothing and remembers no destination, however the form is submitted.

  On the request path nothing changes.
- **CCDC's gate** (`ccdc/panels/retrieve/retrieve.jsx`) judges only what the measures add, as the server derives it:
  `requestStages(fittedMeasures(model, requestedMeasures({selection})))`, read with `pixelOperationsAvailability`.
  - There is no second `IMAGE_OUTPUT` read or watch; native effective bands add nothing and release the hold.
  - A finding says `classifiedWithheld`; evidence or a Classification draft's save still awaited says `checking`;
    evidence that could not be read says `uncheckable`.
  - A `BandOperationWatch` follows the selection, and the applied breakpoint bands on every update, and is released
    on unmount.
  - A classified breakpoint band adds the stage whatever is selected, as on the server. The image output's own check
    still holds it first and says where (`source.unsuitable`).
- **Coordination.** The gate is a second hold beside the retrieve decision, but not a second authority: it judges
  only the stage, which `IMAGE_OUTPUT` cannot express (see the architecture checkpoint). The panel now has one gate
  contract for both paths rather than one per path. CCDC and Time Series Retrieve share the stage, the reads, the
  watch and the messages; each keeps a short local mapping of its gate to those messages. No loader, cache, validator or
  framework was added.
- **Regressions** (`ccdc/panels/retrieve/retrieveTrainingReadiness.test.jsx`), the real panel, runtime and submission
  with storage, Earth Engine, tasks and the asset check substituted:
  - a classified measure over a point-free Classification kept, explained and held through Apply and form submission,
    with the project's destination untouched;
  - a mixed selection held, and the native measure submitted alone once the classified one is deselected;
  - repair, submitting the measures to the asset with its type, sharing, strategy, scale and tile size, and
    remembering the destination;
  - a Classification draft's save awaited; imagery pending (`checking`, selection kept) and unavailable (`uncheckable`);
    a native measure submitted without waiting;
  - points lost just before submission refusing it;
  - a classified breakpoint held by the base check, for a native measure;
  - watches following the selection and the breakpoint bands, and released on unmount.

  The unusable-provider and missing-feature findings take the same withdraw path as missing points here. Their rules
  are covered by the shared stage and server route tests, so no GUI case was added for them. The session's save
  coordinator outlives a test, so the harness forgets each recipe's save state afterwards (`forgetRecipeSaveState`).
- **Witnesses.** With the panel and CCDC Retrieve from `HEAD`, 6 of the 10 cases fail. The 4 that pass are controls:
  native submission, the classified-breakpoint base check, repair's outcome, and save agreement, which the image
  output already awaits because the Classification is in its graph. With only the panel from `HEAD`, 5 fail. Without
  the submission recheck, the form-submission and last-moment cases fail. A watch that ignores configuration changes,
  or measures fitted without the breakpoint bands, fails the watch case.
- **Focused campaign** (two workers): CCDC, CCDC Slice, Change Alerts, Time Series, Classification, the shared and
  Masking Retrieve panels, `retrieveOutput`, the chart band tests and the other mounted Retrieve and requirement tests,
  50 files and 756 tests passed. ESLint and `git diff --check` are clean. The full GUI suite was not repeated.
- **Outside:** previews, downstream request propagation, dependency loading and file-format compatibility.

**Verification status of the readiness and normalisation changes (2026-10-21).** Checked against commits up to
`3ea2e7f04`, plus two fixes to the verification script, which were defects in the script itself.

- **Automated.**
  - Full GUI suite with two workers: 309 files and 4475 tests passed (326 s).
  - gee focused tests and the verify helper tests: 212 and 55 passed.
  - **Later pre-commit GUI run (2026-10-21), including classified Time Series chart readiness and the origin merge:**
    314 files, 4506 tests, 4503 passed and 3 failed (309 s, two workers). All three failures are in
    `recipeGeometryLayer.test.jsx`: a Classification without input imagery still requests an outline, and removing or
    restoring its last input does not cancel or resume as expected. The same three failures reproduce against committed
    `2d1590763`, using temporary read-only source overlays, so they predate this chart slice. The geometry guard checks
    `inputImageryRequirement` by object identity; the Classification declaration copied it when extending its operations
    in `e8f8d8253`. Correct this before push, preserving geometry availability when only training data is missing.
  - **Outline correction (2026-10-21).** The geometry guard now recognises the requirement by its rule:
    `isInputImageryRequirement` (`source/inputImagery.js`) compares a declaration's `findings` with the shared
    requirement's. Its stated operations can be extended; Classification's local `CLASSIFIER` extension and every
    other type's list are unchanged. That was the only consumer relying on requirement-object identity, and
    Classification's is the only copied declaration.
    - Before editing, the 3 failures reproduced in `recipeGeometryLayer.test.jsx` (3 failed, 2 passed). After it, all
      5 cases pass with their assertions unchanged:
      - a Classification without points still has an outline;
      - removing the last input cancels the request and notifies nothing;
      - restoring an input requests and shows the outline again.
    - Nearby: the map's AOI and geometry layers, the table layer and the Classification recipe tests, 9 files and 96
      tests, passed, and so did the shared recipe tree (1256).
    - **Full GUI suite rerun (two workers): 314 files and 4506 tests, 4505 passed and 1 failed (312 s).** The failure
      was `remapping/panelActivation.test.jsx`, "opens with no panel open", which timed out at the 5 s default under
      suite load. Run alone, the file passed 15 of 15, twice.
  - **Full GUI suite at `8d04b160b` (2026-10-21, two workers): 316 files and 4547 tests passed, none failed (310 s).**
    The tree was clean at that commit. It includes the request-dependent Retrieve work through the legacy-indicator and
    submission-offer fixes, and the `panelActivation` timeout above did not recur.
  - **Request-dependent export guards (2026-10-21).** Verified by focused campaigns only, recorded with each slice; the
    gee one, for "CCDC's Drive and SEPAL image exports", ran `test/jobs` and `test/ee` (1346 passed); the GUI one, for
    "CCDC Retrieve's classified measures", 50 files and 756 tests. The Drive and SEPAL routes have no browser check:
    CCDC Retrieve offers no Drive or SEPAL destination.
- **Live Earth Engine.** `modules/gee/verify/classifierNormalisation.mjs` passed all 24 checks and exited 0 (66 s).
  - **Training rows.** The provider was `LC08_231062_20170730`. Each reusing consumer trained on 15 rows: 6 from the
    provider, then 9 of its own. Each non-reusing case trained on its 9.
  - **Predictions.** They were identical over 213,507 jointly valid pixels per band, and the footprints were identical.
  - **Mask.** With the scene masked, 0 pixels were valid where it was masked and 106,711 elsewhere.
  - **Witnesses.** `classification.js` from `23f230f5f`, before the normalisation fix, failed 7 checks: the
    normalising cases' training rows and predictions, and every reuse row check. From `0a84dd54c`, before the reuse
    fix, only the 2 reuse training-row checks failed.
  - **Script fixes during the run.** The comparison area was built before Earth Engine was initialised, and
    `isUnbounded()` was negated with an unavailable `.not()`. Both are now evaluated as other verify scripts do.
    Acceptance criteria are unchanged.
- **Browser batch: completed by the user, with reported issues (2026-10-23).** The user has finished the manual tests
  and reported all issues; unmentioned tests are passing under their explicit reporting convention. The feedback,
  subsequent decisions and implementation slices below are the correction work, not an unfinished initial test run.
  This is user-reported browser evidence, not an agent-observed run; deployed build/browser details and per-case task
  or asset ids were not supplied. The consolidated inventory below is retained as reference, including fixture-based
  variants; it is not an instruction to repeat the whole batch or a claim of individual evidence for every variant.
  After fixes, recheck the affected paths and nearby controls. Do not mark the batch clean until reported issues are
  resolved or explicitly scoped out. The earlier lack of a signed-in agent browser no longer makes this batch pending.
  - **Run record:** date, SEPAL URL/build, deployed GUI and gee git commits, browser/version, and tester. Confirm the
    tested deployment contains the fixes; a local commit alone does not establish what the browser or worker runs.
    Reload the app before starting, so an old tab does not keep the earlier untyped Change Alerts request contract.
  - **Fixtures:** use a test project, small AOIs and short periods with known imagery. Keep working copies and the
    original point sets for repair. Classification examples need enough points in at least two classes; Regression
    examples need a working spread of values. Use a Random Forest where regression is requested, and SVM C_SVC only
    in the capability and normalisation cases that name it. Keep training inputs compatible with the scene collection.
  - **Evidence:** for every subcase record pass, fail or untested, recipe/asset ids and the actual result. For a failure
    include the reproduction, message, network response and console error where relevant. Record completed task ids and
    output paths for downloads/exports. An enabled button, accepted task or automated pass does not pass an execution
    check. A missing fixture or a pending/cancellation state too brief to observe is untested, not passed.
  - **Network checks:** keep DevTools open. Use throttling where needed to observe an in-flight read or unacknowledged
    save. Check that an obsolete response does not restore old chart data after cancellation or closure. Wait for save
    acknowledgement before judging settled behaviour, except where the subcase explicitly tests the save wait.

  To run it (record subcases separately, including Classification/Regression and Time Series/CCDC variants):
  1. **Reused features (Classification, then Regression).**
     - Set up Provider and Consumer, both over imagery with `IMAGE_BANDS [red, nir]` and collected points. Consumer
       adds a `RECIPE` data set reusing Provider. Confirm Consumer previews and can be retrieved.
     - Open Provider and remove `nir` from its band set. Consumer's Provider data set names Provider and `nir`, and
       Retrieve is held.
     - Restore `nir`. The mark clears, and the preview renders.
     - Keep Provider's points but remove its last input image. List removal updates the model immediately; do not
       expect to Apply an empty list. Consumer's reusing data set names Provider's problem, Retrieve is held, and
       adding the original imagery back restores the preview.
     - With an upstream image recipe supplying a band already selected by Provider, remove or rename that band
       upstream. The problem is attributed to Provider and its band-set field, not to absent training points. Restore
       the upstream band or repair Provider's saved selection, and confirm Consumer renders again. The picker need
       not let a user select a band that was already unavailable.
  2. **Empty chain.**
     - Give Consumer only the data set reusing Provider, and Provider points.
     - Delete all of Provider's points. Consumer is held: Regression's TRN says "Add training data", and Retrieve is
       held for both.
     - Restore Provider's original working point set, not a single point: clearing `NO_TRAINING_DATA` does not
       establish that enough samples or classes exist to train. Consumer is released, and its preview renders.
     - Repeat through an intermediate recipe that reuses Provider and has no points of its own. Absence and repair
       must propagate through the nested chain, for Classification and Regression.
     - Add a separate empty provider with valid input imagery beside the working branch. The empty branch alone must
       not block training. When every branch has no points, the explanation belongs to Consumer's training-data
       section, not an error on an otherwise valid empty provider item. Classification's TRN stays unmarked by policy;
       Regression's is marked.
  3. **PyEO and Phenology.**
     - Set up a PyEO Alerts over a Classification that has imagery but no points, with the index gate off. Sources'
       classification field names the Classification, and Retrieve is held.
     - Restore a working point set to the Classification. The explanation clears, Retrieve is offered, and a preview
       renders.
     - Repeat with the gate on.
     - **Phenology:** choose a supported classified band over a working Classification and confirm its preview renders.
       Remove the Classification's points and save: the classification field names it, and Retrieve is held. Restore
       the original working point set: the explanation clears, Retrieve is offered, and the preview renders again.
       With a native Phenology band, removing those points must not add a training restriction.
  4. **Charts.**
     - Open a Time Series pixel chart over a Classification-backed band, with the Time Series monitoring optical data.
     - Make a compatible upstream edit, such as adding a point: the chart reloads with data.
     - Make an incompatible one: switch the Classification's input from optical to radar features, keeping the Time
       Series monitoring optical. (Removing a feature usually leaves it compatible.) The chart closes, its action is
       disabled, and Sources explains the incompatible classifier inputs.
     - Repair it by switching the input back. The chart is offered again and returns data.
     - **CCDC breakpoints.** Open a CCDC with breakpoint bands `ndvi` and a classified `probability_<class>` over a
       working Classification, with its pixel chart open on segments.
     - Remove the Classification's points: Sources' classification field names it, Retrieve is held, the open chart
       closes, and the chart action is disabled.
     - Restore the original point set: Retrieve is offered, and reopening the chart returns segments.
     - With native breakpoints and a native chart band, removing the points adds no training restriction. Classified
       chart bands have their own hold, tested below.
     - **CCDC classified export measure.** With native breakpoint bands (`ndvi`), open Retrieve over a Classification
       without points and select `ndvi` and `probability_<class>`. Both stay selected, the panel says the
       Classification cannot be trained for them, Apply is held, and pressing Enter in the form submits no task.
     - Deselect `probability_<class>` and export `ndvi` alone while the Classification has no points: it completes.
     - Restore the original point set, select both again and export. The task must complete, and the asset must exist
       with the `probability_<class>` coefficient, RMSE and magnitude bands: an accepted submission is not enough.
     - **Time Series classified band.** Open a Time Series over a working Classification, also open in its own tab,
       with its pixel chart on `probability_<class>`. Observation data points show.
     - Remove the Classification's points. Once the save is acknowledged, the chart shows no data and says the
       classification cannot be trained to compute this band. It stays open, and the toolbar's chart action stays
       enabled. In the network panel, no further `loadObservations` request names the classified band.
     - Choose `ndvi`: data points show. Choose the classified band again, close the chart and chart another pixel: it
       opens and says why again, rather than closing.
     - Restore the original point set. Until the save is acknowledged no request is sent; then the classified band's
       data points show again.
     - **CCDC classified chart band.** Open a CCDC with native breakpoint bands (`ndvi`) over a working Classification,
       also open in its own tab, with its pixel chart on `probability_<class>`. Segments and observation data points
       show.
     - Remove the Classification's points. Once the save is acknowledged, the chart shows neither, says the
       classification cannot be trained to compute this band, and stays open; the toolbar's chart action stays
       enabled. In the network panel, no further `loadSegments` or `loadObservations` request names the classified
       band.
     - Choose `ndvi`: segments and observations show. Restore the original point set and choose the classified band
       again: until the save is acknowledged nothing is requested, then both show again.
     - With a classified breakpoint band instead, removing the points closes the chart and disables its action, as
       before.
     - **Pending/unavailable evidence, both direct charts.** If a Classification input-evidence read can be kept pending
       or made unavailable, the classified band sends no chart-data request and shows no confirmed training finding.
       Restore the evidence: current data returns once, after save agreement. Distinguish that evidence request from
       `loadObservations`/`loadSegments` themselves, whose request errors close the chart. Record this subcase as untested
       if the evidence state cannot be isolated in the browser.
     - **Change Alerts observations.** Open a Change Alerts over a CCDC reference, monitoring Landsat, with its
       pixel chart open. The observations series must show actual data points for the selected band, not only an
       empty chart. In the browser's network panel, the `loadObservations` request names the recipe:
       `type: CHANGE_ALERTS` and its id.
     - Edit the referenced CCDC so its own segments cannot run, for example a classified breakpoint over a
       Classification without points. The chart closes, as it does for any reference that cannot run.
     - Restore the CCDC, and reopen the chart at the same pixel. Observation data points and segments show again.
     - The server's independence from the reference is covered by the gee tests, since the GUI closes the chart while
       the reference cannot run. So are its refusals, an incomplete period or a Planet entry naming no asset, which
       the editors do not let through.
     - **Pixel versus export AOI.** For direct Time Series and CCDC charts, choose a pixel just outside the consumer's
       small configured AOI but within known scene coverage. Native observations, and CCDC segments, still return at
       the clicked pixel. This does not establish the separate referenced-recipe AOI contract; do not remove or change
       the Classification's own input AOIs to make the test pass.
  5. **Classified outputs.**
     - Use a Time Series over an SVM Classification (C_SVC). Chart `probability_<class>`: it returns values without a
       regression error.
     - Retrieve offers only outputs the Classification supports: probabilities, and no regression for SVM.
     - Clear the Classification through Sources and Apply. Time Series and CCDC charts and Time Series Retrieve offer
       no classified outputs; obsolete selections cannot be requested. For this CCDC check, use native breakpoint
       bands so clearing the Classification does not leave an invalid classified breakpoint.
     - Reselect the Classification and Apply: supported outputs return. Clearing it and then cancelling instead must
       preserve the applied choices. In Time Series Retrieve, clearing it drops the obsolete classified selection and
       submits no task until a native band is chosen.
  6. **Multiple-indicator Time Series Retrieve (origin merge).**
     - Over a small AOI with known imagery, select two native indicators and retrieve them. The task finishes and its
       files contain both indicators in their respective directories.
     - Select a native indicator and a supported class probability together. A pending Classification save holds that
       selection; once storage agrees, both remain selected and one retrieval produces both indicators.
     - If enabling the additional SITS output, confirm it produces SITS files alongside the ordinary outputs.
     - **Classified indicators and training.** Open Retrieve over a working Classification and select `ndvi` and
       `regression`. Remove the Classification's points and save. Retrieve holds the selection, says the
       classification cannot be trained, Apply stays disabled, and Enter submits no task.
     - Deselect `regression`: Apply is enabled and `ndvi` alone retrieves.
     - Restore the original point set and select `regression` again. Until the save is acknowledged Retrieve holds;
       then retrieve. The task must finish and produce actual files for both indicators: an enabled Apply or a started
       task is not enough.
     - With Retrieve open on a native indicator, switch the Classification's input to radar features. Retrieve holds and
       says the settings need attention; switch back, and the native download runs.
     - With only a native indicator selected, an unacknowledged Classification save still holds Retrieve under the
       existing base dependency policy; once storage agrees it downloads. On a cold open, an unresolved selected
       Classification's record also holds the native selection until it is read, without adding training evidence.
     - **Scalar UI-state compatibility (automated, not an old-recipe manual fixture).** Retrieve accepts a scalar
       indicator already present in session UI state and normalizes it to a list. `recipe.ui` is excluded from saved
       recipe content, so finding an old saved recipe with this selection is not a required browser check. The
       scalar-selection and classified-hold paths have mounted regression coverage.
  7. **Working execution.** For every recovery in this batch, confirm an actual response, not only an enabled
     button: a preview tile for Classification, Regression, PyEO and Phenology (these have no pixel charts), and a chart
     response for the Time Series, CCDC, CCDC Slice and Change Alerts charts. Download checks need completed tasks and
     actual files; asset-export checks need completed tasks and an asset with the requested bands.
  8. **Classification outline.** Open a Classification with one input image and no training points: its outline
     shows on the map. Remove that last input: the outline disappears, the network panel shows the pending geometry
     request cancelled and no new one, and no error notification appears. Add the input back: the geometry is
     requested again and the outline shows.
  9. **Normalisation smoke tests (part of the completed user batch).**
     - Use an SVM C_SVC Classification with normalisation `YES`, compatible optical imagery, a working two-class point
       set and a rendering own-image preview. A Time Series using it returns `probability_<class>` observations, with
       values in the displayed probability range and no regression error.
     - Run a PyEO Alerts using that SVM Classification, with valid monitoring imagery. Its preview returns actual
       tiles. Repeat a preview with the index gate on and off. An all-masked result or an empty chart is not evidence
       of a working computation; use a fixture with known coverage.
     - These are application smoke checks, not a numerical equality test between different scenes. The controlled
       `classifierNormalisation.mjs` check already passed all 24 checks on 2026-10-21, including reused samples,
       predictions, masks and footprints. It is not pending browser work. If rerun, record its deployed commit,
       command, exit code and all results separately; do not overwrite the earlier evidence.
  10. **Stored Classification versus the Sources copy.**
      - Start with a working Random Forest selected by Time Series and CCDC, and charts last on `regression`; CCDC's
        breakpoint bands stay native. Keep a regression selection in Time Series Retrieve too. In a second browser
        session, change the Classification to SVM C_SVC and save it, leaving the consumers' stored Sources copies old.
      - In the consumer session, close any Classification tab and reload/reopen the consumers without opening that
        Classification. Once the stored record has been read, both chart pickers and Time Series Retrieve offer
        probabilities and no regression. Charts replace regression with a native band before requesting data; Retrieve
        drops the unsupported selection and submits nothing until another band is chosen.
      - Change the stored classifier back to Random Forest in the other session. Once the newer revision is listed
        (refresh/reopen if needed), regression becomes offered again. This checks stored-record refresh, not just a
        record already open in the same session.
      - With the Classification open in the consumer session, an edited classifier's options follow that session
        record. If its save can be kept pending, classified chart/Retrieve requests stay held until storage agrees,
        keeping an otherwise supported selected measure. Record an unobserved save window as untested.
  11. **Change Alerts' inherited settings and native-only monitoring.**
      - Over a working CCDC recipe, let Change Alerts propose monitoring settings, then edit and apply its own data
        sets/options. Change only the producer's native breakpoint bands, then only its selected Classification
        (keeping the producer runnable). Re-observation must not overwrite the user's monitoring edits.
      - Change a real producer monitoring setting, such as its data sets or corrections. The existing prefill policy
        still updates the proposal. Observing those same producer settings again leaves subsequent user edits alone.
      - Repeat the ignored-settings check with a re-exported segments asset whose `recipe_sources` metadata changes
        only its breakpoint bands or Classification. Record this asset variant separately if no replacement fixture
        is available.
      - With an accessible shared segments asset naming an inaccessible producer Classification in its metadata,
        native monitoring and its chart work without loading that Classification or producer recipe. A referenced
        recipe's genuine dependencies still count, unlike the shared asset's producer history.
      - If a legacy Change Alerts fixture has a copied Classification or breakpoint bands, reopening it neither
        requires them nor cleans them out of the saved model. If it has a classified monitored band saved, the chosen
        band stays visible with the Sources explanation and Retrieve is held; choosing a native monitored band repairs
        it. The segment chart remains available for a native chart band when its reference is sound. These legacy and
        sharing cases require fixtures; mark them untested if unavailable rather than editing production data by hand.
  12. **Referenced segment charts: CCDC Slice and Change Alerts.**
      - For each consumer, chart a working CCDC recipe through a Masking with a valid mask. Make the Masking
        unrunnable, for example by removing the input imagery of a recipe supplying its mask. The action is disabled,
        the chart closes, and any in-flight request is cancelled. Repair that input and reopen: segments return, and
        Change Alerts also shows observations. An old response must not redraw after closure. Testing a missing mask
        itself needs a saved fixture if the mask editor prevents applying that state; do not count editor prevention as
        observing the downstream refusal.
      - Change a compatible upstream segmentation setting, such as CCDC's `lambda`, keeping the offered measures and
        assets the same. The open chart cancels obsolete work and requests the updated segments after save agreement;
        Change Alerts re-requests its observations too. Record the request sequence, not only a similar-looking graph.
      - Change only a producer title/layout, or an unrelated recipe. No new chart request should be sent. A draft
        reference choice in SRC/REF followed by Cancel also leaves the applied chart and requests unchanged.
      - Open each consumer over an accessible segments asset instead. It charts without reading the producer's recipe
        closure. If source evidence can be held pending, confirm it holds new requests without reporting a confirmed
        configuration problem; recovery requests current data. Keep unobservable timing cases marked untested.
  13. **Field feedback and saved invalid choices.**
      - Save a CCDC regression breakpoint and a Phenology regression band over a trainable Random Forest, then change
        the Classification to SVM C_SVC. Each saved invalid choice stays shown, with the unsupported-output explanation
        beside its own field. Reopening Sources unedited still explains it; Cancel preserves the applied choice.
      - Repair to a native measure and Apply: the field explanation clears, and CCDC segments / the Phenology preview
        return. Check that upstream training feedback does not prevent opening Sources or applying a repair.
      - For Time Series and PyEO, an incompatible classifier-input selection is explained beside the classification
        field. Cancel preserves the applied configuration; applying compatible inputs clears the explanation and the
        corresponding chart or PyEO preview works. Pending evidence must not appear as a broken-field validation error.
  14. **Shared-runtime control smoke checks.** Open existing working Masking, Stack, Band Math and Remapping recipes
      over compatible inputs, save/reopen, and confirm previews plus a small supported Retrieve still work. These are
      controls for the shared traversal and panel changes, not acceptance of deferred classified-band propagation
      through wrappers. Record missing fixtures as untested.

  **Result format for targeted rechecks:** record affected subcases (including both recipe types/consumers) as
  `check/subcase | pass/fail/untested | recipe ids | response/task/output evidence | notes`. Record the final deployed
  commit again after fixes. The initial batch is complete with the user-reported issues below; the remaining browser
  work is targeted verification of corrections, not a second full manual campaign. Explicitly untested fixture/timing
  variants remain visible rather than being invented as individually verified evidence.

  **Not additional acceptance work for this batch:** direct map-preview training gates, request propagation through
  wrappers, executed-edge dependency loading and CCDC array-file destination compatibility remain deferred. The generic
  Drive/SEPAL CCDC guards have mocked server coverage; CCDC Retrieve offers no such destination, and those tests do not
  establish that array bands can be written to raster files. The unknown Earth Engine outcome for missing/null sample
  features needs a separate controlled probe; the GUI now refuses known missing features before it can expose that
  outcome. The completed live numerical check above and the user's browser results are different evidence.

#### Browser feedback: partial results (2026-10-22)

User-reported results from the shortened browser checklist, not an independently observed run. Deployment/build and
recipe ids were not supplied. The user says to treat unmentioned checks in the supplied batch as passing; the rest of
the batch will be supplied later. These results do not mark the whole browser batch complete. No production behaviour
has been changed in response to this feedback.

- **Reused training data (short checklist 5), Classification and Regression:**
  - Removing Provider's `nir` shows "Provider samples no nir, which this recipe is trained on" on Consumer's training
    data item. Regression marks TRN; Classification does not. Opening the item's editor shows no explanation or repair
    guidance and offers Apply; applying again leaves the finding. The lack of editor feedback is a reported UX gap.
  - Removing Provider's last input image shows an item finding for both types, and a TRN mark only for Regression.
    Neither item's editor explains the problem. Both recover correctly when the input is restored.
  - **Correction to schedule:** Classification suppresses all training-data toolbar marks, including broken-provider
    and missing-feature findings. Replace that blanket suppression with marks for actual applicable findings,
    consistently with Regression; an operation requiring training is already held by readiness. Preserve the
    decision-tree exemption and distinguish pending/unavailable evidence from configuration findings.
  - **Sampling direction clarified with the user:** reused Classification points must still be sampled over Provider's
    input imagery, not Consumer's. The proposed change is to derive Consumer's required features over that imagery,
    independent of Provider's own selected training features. Removing `nir` from Provider's band selection should
    therefore work if its underlying imagery can still supply `nir`; an imagery source that genuinely cannot supply a
    Consumer feature remains incompatible. This is a design direction, not implemented. Nested providers must retain
    their own imagery and points; do not silently change Consumer's selected features to remove a finding.
  - **Collection cost constraint (user-confirmed):** assemble the reused samples and Consumer's training data once per
    collection computation, outside the per-scene classification loop, and reuse them across scenes. The current
    `collection.js` calls `getTrainingData$()` before constructing its mapped collection; preserve that boundary.
    Add one-scene versus many-scene coverage, including reused/nested points, when implementing the feature-selection
    change. This is not a cross-request cache or a claim about Earth Engine's internal evaluation count.
  - Provide an understandable repair from the item editor, whether through opening the offending Provider, replacing
    or removing the reuse selection, or explaining the Consumer feature change needed. The final interaction is not
    yet agreed; Apply must not be presented as though re-applying an unchanged reference repairs its upstream recipe.
- **Referenced charts and Change Alerts (short checklist 6):**
  - CCDC Sources should show its advanced ("More") view when a Classification is selected, so that selection is visible.
  - Switching CCDC from compatible Optical to Radar shows classifier-input incompatibility beside the data-set field;
    the user expects attribution beside the Classification field. The declaration currently binds this code to both
    fields; review presentation ownership rather than adding a new validator.
  - With Change Alerts monitoring Optical `nbr`, switching its CCDC producer to Radar reports "The selected source has
    no segments for band nbr. Choose a band it has segments for: VV, VH, ratio_VV_VH and 1 more." Opening Sources shows
    Radar automatically selected and no corresponding field explanation. The user reports that the recipe remains
    chartable. Investigate the applied-model/editor mismatch and the actual bands the chart chooses. The follow-up
    direction is to disable/close this analysis chart while its configured monitoring band cannot be supplied, rather
    than silently chart another reference band. Do not turn that into a full alerts-image readiness requirement.
  - **Sync policy:** the user questions automatic Optical-to-Radar switching. CCDC PRC changes also overwrite
    Change Alerts overrides for properties the producer did not change. Code inspection confirms that a changed
    monitoring snapshot merges all supplied Sources/options, rather than only changed fields. Preserve this observed
    behaviour as a reported issue. The user's direction is less implicit syncing: if a setting must equal the source,
    show the effective source value as read-only in the consumer, with its ownership explained. An editable consumer
    setting belongs to the consumer and must not be silently overwritten by unrelated source edits. Identify which
    processing settings actually must match before disabling controls; no concrete mandatory-setting list has yet been
    established. For asset references, linked values must come from the asset's recorded settings, not require access
    to its producer recipe. Do not implement this merely by greying out a stale copied value; execution and the shown
    effective value must use the same ownership rule. No production sync behaviour is changed yet.
- **Quick regression controls (short checklist 7):** reported passing.
- **Additional feature request:** copy/paste visualization parameters between layers; recorded separately from readiness
  regressions and not implemented.
- **Checklist correction:** `recipe.ui` is stripped from persisted recipe content and recipe exports. The earlier
  instruction to find a saved Time Series with a string `ui.retrieveOptions.bands` is not a valid ordinary saved-recipe
  acceptance case. Scalar UI-state normalization has automated coverage; do not require an old saved recipe fixture.
  For Change Alerts, leftover Classification/breakpoint fields under `model.sources` are persisted but ignored, with
  automated regressions; no separate legacy fixture is required in addition to an ordinary existing-recipe smoke test.
  A saved classified monitoring band is a distinct, explicitly refused configuration. Shared segments-asset checks
  simply mean using a CCDC segments asset as the source of CCDC Slice and Change Alerts. Isolated slow/failed evidence
  checks may be left to automated coverage when they cannot be reproduced naturally.

#### Browser feedback: further results (2026-10-23)

Further user-reported results from the shortened checklist. Unmentioned checks in the submitted portions are treated
as passing, as requested; the unfinished remainder is not implicitly passed. No deployed build, recipe ids or network
captures were supplied with this report. These observations are not independently reproduced and no production fix is
claimed by recording them.

- **Working baseline:** starting a chart, switching to another recipe tab, waiting for completion and switching back
  leaves the layout squeezed into the top-right corner. Investigate hidden-tab measurement and reactivation, without
  assuming the graph or panel is the cause. Direct CCDC/Time Series charts return data outside the consumer AOI;
  referenced CCDC Slice/Change Alerts charts do not. That AOI distinction is expected: direct pixel operations replace
  the consumer AOI, while references retain their own computation AOIs. Do not "fix" it by stripping upstream AOIs.
- **Missing Classification points, Time Series:** the classified-band-only chart hold appears as designed, but the
  user prefers closing/disabling the chart and marking Sources, consistently with CCDC's classified-breakpoint case.
  Retrieve always shows "These bands are no longer available from this recipe: . Select from the bands offered
  above", even in working configurations. This is a reported independent bug, not a valid empty missing-band finding.
  The selected Classification should be visible on opening Sources ("More" enabled/expanded) and its problem explained
  beside the classification field. Highlighting individual broken bands was considered, but a whole-selected-source
  validity policy is the user's preferred direction for assessment.
- **CCDC:** with classified breakpoints, the chart closes, Retrieve is held and Sources explains the Classification
  problem. Classified bands remain selectable and recovery works after repairing the Classification; the user prefers
  retaining that selection/recovery behaviour. The proposed change is to apply the source hold even when breakpoints
  and requested bands are native. Phenology and PyEO training-hold behaviour is reported correct in the tested cases.
- **Incompatible inputs:** PyEO marks both SRC and OPT. The user questions OPT because the reported incompatibility
  cannot be repaired there. Determine whether this is the same upstream fault presented twice or a distinct enabled
  index-gate requirement, and locate each explanation where it is actually repairable. Do not assume both codes are
  duplicates or remove all OPT validation; see F10.
- **Capabilities and stale copies:** reported good. WebSocket notification of upstream recipe updates is a separate
  future feature, not required to pass these manual checks.
- **For later:** CCDC Slice displays raw chart-band names even for a recipe reference; AOI layers redraw on recipe
  changes that should not alter their geometry; show the charted location on the map. These are captured below as
  follow-ups, not silently included in the readiness-policy implementation.

**User completion confirmation (2026-10-23):** "I've been through the manual tests now - I've reported all the issues."
This supersedes the earlier partial/pending status. Under the user's instruction, unmentioned tests pass; reported
issues remain open until corrected. S2's later browser feedback also covers the misleading TRN absence message,
removal of Open Provider from the modal, simpler repair wording, and the agreed PyEO SRC/OPT prerequisite behaviour;
the agreed CCDC family/view heights and keyboard band-add improvement are recorded with their own scope. There is no
further initial manual-test report expected. Preserve these results and ask only for focused rechecks after fixes.

#### Regression training data (implemented)

- **Shared.** `trainingData.js` holds `noTrainingData` and `trainingDataRequirement`. Classification uses them with
  `requiresTraining`; Regression uses `noTrainingData` alone. A `RECIPE` data set counts as training data unless the
  recipes it reuses are known to store none (see "Configuration-known absence of training data"). Every other data set - an Earth Engine table, image samples - runs on the points
  it stores, so none stored is none at all. Whether enough points survive masking, or lie within the imagery, is not
  judged.
- **GUI.** Regression declares `trainingDataRequirements` beside `inputImageryRequirements`, its TRN button is a
  `SectionButton` saying "Add training data", and its layer's `dataSets.length` guard is gone: the output read withholds
  the layer. The data set editor keeps its own draft rules (a name, a table or image, reference data), which never
  change the applied recipe's readiness; the data set list's Apply stays held while it lists no data set.
- **Tests.** `regression.test.js` (shared), `trainingDataReadiness.test.jsx` (TRN, layer and Retrieve agreeing, a
  Remapping of the predictions, a reloaded table cancelled and applied), `imageAssetExport.test.js`.

#### Required input imagery (implemented)

- **Shared.** `inputImageryRequirement` finds an empty input list, for `IMAGE_OUTPUT` and `TRAINING_DATA`. A
  Classification or Regression whose training data another reuses is judged by it as a provider: producing that
  training data samples over its input images, and with none its samples are silently dropped (see "Reused training
  data"). A named map product is not judged by it. An input selected but not yet read, failing, gone or
  lacking a band it selects is not this finding: the closure, the description and the input's evidence say what it is.
- **GUI.** `missingInputImageryRequirement` (`panels/inputImagery/inputImageryRequirements.js`) says it on IMG for
  every type listing input images - through both input imagery declarations, and Remapping's own - with the list's own
  wording, "Please add at least one image." It is `wizardStepMark: false`: while the set-up wizard has IMG open as its
  step, where the list's form holds Next and Apply until it lists an image, the toolbar does not say it; a section not
  yet reached is not marked either, and once the wizard moves on it is marked. Band Math's and Remapping's toolbars use
  `SectionButton`, so their marks follow the wizard as the others' do. The layers' at-least-one-input guards are gone.
  The outline of a recipe without an area of interest of its own (`RecipeGeometryLayer`) is its first input image's
  geometry, so it is withdrawn, its request cancelled, while the list holds none - not while it cannot run for another
  reason, such as missing training data.
- **Tests.** `inputImageryRequirement.test.js` (shared), `outputRequirements.test.js` (IMG, Retrieve and previews
  agreeing for each type, a Remapping over an empty Classification, a missing asset said as that),
  `recipeImageLayer.test.js`, `wizardSectionMarks.test.jsx`, `inputBandSets.test.jsx` (the last input removed, one
  added in the editor, cancelled and applied), `imageAssetExport.test.js`.

#### Remapping constraint references (implemented)

- **Shared.** `constraintInputRequirement` and `constraintBandRequirement` (`type/remapping.js`) carry the rule the GUI
  held as a local requirement, with the same semantics: a constraint's `image` must be the `imageId` of a listed input,
  and its `band` one that input's `includedBands` names. Each finding is located at its constraint. They read the
  configuration alone: an input not yet loaded or unreadable is never a broken reference. The later source-band
  requirement below checks source descriptions separately, without repeating these configuration diagnoses.
- **GUI.** `remappingRequirements` is an output declaration over both codes: each finding's legend entry is its item,
  named with the first problem and the others listed, each once in constraint order, as the local read said them. The
  local predicate is gone. The constraint editor keeps its own draft check of the inputs and bands it offers, which never
  changes the applied recipe's readiness; Cancel writes nothing, and a repair can be applied while the applied recipe is
  refused. The outline (`RecipeGeometryLayer`) is not held by it.
- **Tests.** `type/remapping.test.js` (shared), `remappingRequirements.test.js` (entry messages, gates, Retrieve, a
  Remapping of it held and restored), `constraintReferences.test.jsx` (including automatic reconnection on applying the
  same source again, saving/reopening, source changes, missing bands, ambiguous legacy references and Cancel), `remappingLayer.test.jsx` unchanged,
  `recipeGeometryLayer.test.jsx`, `imageAssetExport.test.js`.

#### Validation and source recovery roadmap (2026-10-15)

The source-recovery audit reported mounted GUI probes, including save/reopen and downstream checks; it did not run
live Earth Engine or browser tests. Both Band Math packets and the used-source-band Remapping packet below are implemented; the remaining follow-ups are listed
separately:

1. **Band Math calculation references in shared readiness (implemented).** The audit found that successful synthetic
   observations could make a broken Band Math and its dependent report READY. That demonstrated a validation gap,
   not successful Earth Engine execution. `INVALID_CALCULATION` findings now locate
   the originating calculation and carry the existing reference/syntax details. The shared analyzer and scope rules
   check expression variables and physical bands, reducer input IDs and bands, removed calculations, self/forward
   references, syntax, function arity and whole-image band counts. Cycles remain invalid through their self/forward
   references. The editor and synchronization reuse those same utilities; the parser versions match the existing GUI.
   GUI calculation declarations now present shared findings instead of evaluating local applied predicates. Only
   originating problems are diagnosed; dependent outputs and recipes are blocked through readiness without copying
   that diagnosis. Dependent input-list recipes now mark their declaring reference with the upstream recipe's name,
   as described under Marks above. Descriptions remain available where known, and pending/failed source evidence is never a
   fabricated missing-reference finding. Repairs restore downstream rendering, Retrieve and the existing asset-export
   path. Draft edits remain isolated until Apply; Cancel changes nothing. Asset exports with broken references are
   now refused deterministically, including exports of a Remapping over Band Math.
   Verified by shared reference/readiness tests, GUI marks and Apply/Cancel tests, a downstream preview layer and
   Retrieve checks, and the mocked asset-export path. Output-selection validation beyond existing shared checks and
   additional backend routes remain separate work.
2. **Band Math recovery of preserved input references (implemented).** Applied input changes/removal retain
   `imageSource` on calculations' existing `usedBands`, using `inputSourceKey` and Remapping's reconciliation helper.
   The existing input ID, variable name and band IDs supply the remaining identity; no historical-input registry is
   added. Existing working references acquire metadata before removal or on input Apply, and source changes refresh
   it. Valid expression snapshots use the existing shared analysis, including bands added by whole-image derivation;
   unresolved snapshots stay intact. Metadata survives save/reopen.
   An unambiguous returning source is offered its former variable name only while unused by inputs/calculations and
   not claimed by conflicting retained references. Other sources keep the name-allocation guard; explicit draft names
   are respected. Apply reconnects reducer/expression reference IDs atomically with the input, without rewriting
   expression text or calculation settings. Referenced band IDs are retained so Sync preserves calculated output
   selections and custom names. Missing selected bands still block shared readiness until included and applied.
   Cancel changes no applied references. Occupied names are not stolen; unresolved reducer IDs remain invalid.
   Expressions keep their existing variable-name semantics, including any explicit reassignment the user already made.
   Older orphans without retained identity require explicit repair; ambiguous legacy sources are not chosen arbitrarily.
   Mounted add/remove/apply tests cover both source kinds, save/reopen, source changes, missing bands, Cancel, collisions,
   whole-image expressions, calculated output stability, downstream preview recovery and Retrieve/readiness agreement.
   Deleted direct outputs, their custom names, deleted calculations and Stack aliases are not restored.

3. **Remapping used source bands (implemented).** `constraintSourceBandRequirement` uses the existing readiness
   traversal's successful input descriptions. A constraint reading an included band its source no longer provides
   produces `MISSING_INPUT_BAND` at the input's included band. Existing missing-input/not-included findings stay
   distinct. The output's known `class` description is unchanged; rendering, Retrieve and existing asset exports
   are blocked for the Remapping and its consumers. Returning bands clear the finding on current evidence without
   changing constraints or automatic recovery metadata. Pending, failed and superseded evidence produces no missing
   band. No new acquisition type, cache, saved validity or assessment work type was added.
   The existing input requirements bridge supplies concise row/IMG feedback. The constraint modal reads its actual
   draft through `OutputCandidate` and presents the shared finding beside the selected band; no error is copied to
   MAP or downstream sections. A repair is applicable independently of other entries; draft edits and Cancel leave
   applied readiness unchanged. Tests cover assets, upstream recipe output removal, downstream preview/availability,
   asset exports, evidence currency and repair. A live read-only EE probe confirms used-band failure downstream and
   the differing unused-selection cases below.

#### Source-reference editor audit (2026-10-16)

Mounted GUI tests use mocked source responses, not live Earth Engine or browser appearance checks. The shared input
fix and the Masking and Change Alerts Sources field explanations are implemented; the remaining notes below are
reported for a separate decision, not changed here.

| Callers | Editor behaviour and evidence | Smallest next action |
| --- | --- | --- |
| Stack, Band Math, Remapping | Shared reference explanation now appears beside the recipe selector. Mounted tests cover opening unchanged, a healthy draft replacement, Cancel, and Remapping upstream repair while open. Existing input-band tests cover selected unavailable bands. | Implemented through the existing output-candidate binding; no new validation. |
| Classification, Regression, Unsupervised Classification | Same selector binding, mounted for each caller. Existing Classification band-set tests retain the separate field/chip validation and repair flow. | Implemented; retain both declarations in the editor. |
| Class Change / Index Change FROM and TO | `changeImageRequirements` already binds source disappearance to the source field and missing bands to their band fields. Mounted cases cover repair/Apply, Cancel, pending and transient errors. | No presentation fix identified for these existing marks. General upstream-reference messages are not registered here. |
| Masking | The mask editor binds the existing `MISSING_ROLE` declaration (`maskRequirements.js`) to the selector of the kind its draft shows, asset or recipe. A draft choosing no source of that kind is judged as selecting no mask, so an empty selector of a set-up Masking says "Select a mask"; it clears once a mask is chosen and returns when the draft switches to a kind with nothing chosen. At the wizard's mask step it is `wizardStepMark: false`: arriving shows no error and leaves MSK unmarked, and the explanation follows the selector's own error after interaction. Presentation only: the selector's own required rule still holds Apply and the wizard's Done. Both selectors, IMG's and MSK's, time that rule as agreed for new required fields: the panel opens with the selector focused and neutral; leaving it empty says it is required, and focusing it again keeps that; choosing a source clears it at once; using the picker's options counts as staying in the field; switching Asset/Recipe focuses the selector now shown, neutral (a programmatic reset, `set(value, {validate: false})`, `form.jsx`). Next, Done and Apply stay held while a source is missing, shown or not. Verified in Chromium against a fixture page and in `maskEditor.test.jsx`; other forms keep their timing (shared form validation consistency, below). `maskEditor.test.jsx` covers opening, the recipe kind, draft repair, Cancel, Apply, a set-up Masking with a mask and the wizard. The primary image still uses a plain activation button. Opening IMG or MSK reloads its saved source and leaves the panel unedited, Apply not offered: `ImageForm` (`masking/panels/inputImage/imageForm.jsx`) clears `bands` only when a source other than the one they describe starts loading, and writes an answer back only when the form is edited or the answer differs from the copied snapshot. A source changed under the recipe can still offer Apply; an answer for a source no longer selected is ignored. Covered by `maskEditor.test.jsx` (IMG and MSK reopening) and `imageForm.test.js`. | Implemented. |
| Change Alerts REF | Existing `SourceCandidate` and `sourceInputFeedback` put confirmed capability problems on the recipe/asset field; mounted tests cover replacement, Refresh, Cancel and pending versus unavailable responses. | No gap identified in REF. |
| Change Alerts Sources | The Sources section names the field from the draft's refusal (`SourceCandidate.refusal()`, passed to `section.input`): `NO_AVAILABLE_MEASURE` on the type of data, `NO_OBSERVED_MEASURE` on the data sets, `MONITORED_MEASURE_ABSENT` and `MONITORED_MEASURE_UNOBSERVED` on the band, each as its message asks. A refusal naming none of these settings stays on the toolbar button. Pending or unreadable reference evidence is REF's to say: Sources says nothing of it. `referenceRequirement.test.jsx` covers each field, opening unedited, draft repair, Cancel, Apply and pending versus unavailable; Apply policy unchanged. | Implemented. |
| BAYTS Alerts REF (and dependent PRC) | REF already uses standard source-field feedback, with mounted replacement, pending, Refresh and Cancel tests. PRC deliberately reconciles unsupported orbit selections to supported ones in the draft, offers Apply and preserves applied passes on Cancel; its toolbar diagnosis is not repeated on the orbit field. | No missing corrective action in PRC; any added explanation should describe the existing draft reconciliation, not duplicate validation. |
| CCDC Slice Source | Existing source-field binding explains capability problems and separate chart advisories; mounted tests cover repair, pending/unavailable, Refresh and Cancel. | No gap identified. |

Transient failures in capability editors have explicit unavailable/retry feedback, distinct from a confirmed
unsuitable source; pending checks show busy feedback. This audit does not equate every red field-feedback icon with
configuration invalidity. It does not opt additional recipe types into upstream-reference presentation, change their
validation coverage, or change existing seeding/reconciliation of drafts. Temporary probes were removed after recording
these results; permanent tests retain the implemented shared editor cases.

#### Request-dependent readiness: architecture checkpoint (2026-10-21)

A design assessment of the remaining request-dependent work, Time Series Retrieve and CCDC's optional chart and export
bands, against the current readiness model. It made no production change. Caller flows were traced from the code.

**Verdict.** The pieces are one contract, with one kind of fact missing and three decisions repeated.

- **The contract.** An operation names what is built. Configured edges and per-operation needs say what that reads.
  A projection gives the recipe that operation runs: the pixel for charts, `observedCollection` for Change Alerts'
  observations. The routes enforce it before building; the GUI holds the same questions.
- **The missing fact.** Readiness cannot see bands a request adds to what execution trains on. The collection
  classifies whenever the bands it is asked for include a classified output (`collection.js`). Which bands those are
  depends on the operation: observations build only the requested bands, while CCDC's segments and image fit the
  requested measures together with `breakpointBands` (`fittedMeasures`).
- **Which callers have the gap.** For Time Series' chart that request fact is now judged. It is still unjudged in:
  - Time Series Retrieve, whose chunk export builds `[indicator]`;
  - CCDC's chart segments and observations, which build `[band]`;
  - CCDC's own export and image exports of a CCDC, which build the requested measures;
  - direct map previews of a Time Series or CCDC, which build `visParams.bands` with no server gate;
  - downstream requests: wrappers asking a CCDC source for classified measures, such as Slice base bands, Masking
    pass-through, Stack and Band Math.
- **Consolidation.** A bounded one is warranted, below. A general operation context is not, for this round.

**1. What identifies the computation.**

- **Today.** A question's identity is `(recipe, operation)` everywhere:
  - the GUI's session-read cache, per graph and operation;
  - the acquisition key `{kind: READINESS, operation, content}`;
  - `watchOutput$({recipeId, operation})`;
  - asset interest `recipeId:operation`;
  - `requireExecutable$({recipe, operation})`.

  The draft gate and currency follow the computation (`recipeContent` of the graph), so they need no request.
- **For the training checks, the request contributes one fact:** whether the effective bands include a classified
  output.
  - The effective bands are each execution owner's to derive, and only they are passed to the common stage selector.
    Time Series' and CCDC's observations use the requested bands; CCDC's segments and image use
    `fittedMeasures(model, requested)`.
  - Using `fittedMeasures` for CCDC's observations would hold native observations wherever a breakpoint is
    classified, though they never train.
  - Capability needs the band list itself. It is judged from the request and the Classification's record by its own
    rule, outside readiness, so it adds nothing to identity.
- **Alternatives, by caller.**

  | | Explicit variant per operation | Context `{recipe, operation, request}` | One collection-training stage (recommended) |
  |---|---|---|---|
  | Shape | `CLASSIFIED_PIXEL_SEGMENTS`, a classified download operation, `CLASSIFIED_IMAGE_OUTPUT`… | `executionNeed(…, request)`, `when(model, request)`; the request normalised, root-only or propagated along edges | `CLASSIFIED_PIXEL_OBSERVATIONS` generalised to an AOI-independent stage, "the collection classified": `CLASSIFICATION_SOURCE: CLASSIFIER` plus classifier inputs. A route whose effective bands are classified runs its own operation with its configured findings, then the capability of the requested outputs, then this stage |
  | Time Series Retrieve, mixed native and classified | A download operation and its classified variant. Each GUI and route site picks one | The request is keyed by its normalised fact. The same holds, with every identity widened | The GUI holds submission on the stage while any selected indicator is classified. `task/timeseries/tiles` judges the union (`image.indicators`, falling back to `image.indicator` from older runners), and each chunk judges its own indicator. Native chunks are unchanged |
  | CCDC chart (segments, observations) | `CLASSIFIED_PIXEL_SEGMENTS`. Observations flip to `CLASSIFIER` | The request applies to the root. The traversal is changed | Segments run the stage over `fittedMeasures(model, [band])`, observations over `[band]`. CCDC declares the stage. The GUI chart reuses Time Series' band hold, extracted rather than copied |
  | CCDC export and image exports of a CCDC | `CLASSIFIED_IMAGE_OUTPUT` must also be a description, so it changes `resolveImageOutput`, the product questions and every `IMAGE_OUTPUT` need site | Fits root exports | The exports run `IMAGE_OUTPUT` as today, then capability over the requested measures, then the stage, before building |
  | Direct preview of a Time Series or CCDC | Variants at the preview's gate | Fits | The same root stage over the preview's effective bands. Deferred for cost and scope: the preview has no server gate yet |
  | Downstream requests: wrappers asking a CCDC source for measures | Variants with conditional needs on each consumer, but Masking passes its request through | **Needed:** the request propagates along `IMAGE_OUTPUT` edges | Not covered: needs propagation (deferred) |
  | Identity, currency, cancellation, save agreement | Unchanged: keyed by operation | Each of the five identity sites gains the request. Without normalisation, one question per native band | Unchanged. The stage is one more operation. The draft gate covers its computation. Cancellation and recovery reuse `pixelChartUpdate`; Retrieve holds submission only |
  | Estimated change | 3–4 operations, 8–12 files, with `IMAGE_OUTPUT` special cases | 15–20 files across shared readiness, the server gate, the GUI runtime and routes | 3 slices of 6–10 files; no new identity |

- **Why the stage rather than variants.** Every remaining caller needs the same check: the Classification trains.
  That check depends on neither the operation nor the AOI; only whether it applies does, through the effective bands
  each execution owner derives. One stage removes the need for a variant per operation, and the ordering lives in one
  helper instead of each route.
- **Why not a context yet.** For root requests the context would carry only the same fact, at the cost of widening
  every identity. It becomes necessary only when a request propagates to a source, as when a wrapper asks a CCDC
  source for classified measures its configuration does not fit. A direct preview is a root request and needs no
  propagation. Neither is in this round, and the stage does not resolve the propagation gap or the dependency-loading
  gap below.
- **Precedence.** The base operation's configured findings come first, as today. CCDC's `IMAGE_OUTPUT` and
  `PIXEL_SEGMENTS` already require training for classified breakpoints (`classifiedOutputNeed`), and their capability
  (`classifiedOutputRequirement`). Next, the capability of the outputs a request adds (400,
  `UNSUPPORTED_CLASSIFIED_OUTPUT`). Last, the additional training stage. So capability precedes training only among
  the checks a request adds; it never displaces a configured finding.
  - Tests should combine invalid conditions. A classified breakpoint over an untrainable Classification, with an
    unsupported requested band, keeps the configured `NO_TRAINING_DATA`. Native breakpoints with an unsupported
    requested band over an untrainable Classification get the 400. An unsupported breakpoint with an unsupported
    requested band keeps the configured `UNSUPPORTED_CLASSIFIED_OUTPUT` finding. Unsupplied classifier inputs precede
    everything request-added.

**2. Which dependencies belong to it.**

- **Configured graph and executed reads differ.**
  - The closure descends every recipe edge (`dependencyGraph.js`, `completeRecipeClosure.js`). Readiness skips
    `REFERENCE` edges (`resolveImageOutput.js`).
  - `dependencyValidity` is all or nothing over the whole closure. So a cycle, a malformed reference, a deleted record
    or a node-limit breach anywhere under a `REFERENCE` Classification refuses a native-band chart or export. Such a
    request never reads that Classification's inputs or providers (`collection.js` reads nothing of it for native
    bands).
  - The GUI judges Change Alerts' `PIXEL_SEGMENTS` over the alerts root's closure; the server judges only the
    reference.
  - `imageOutput.js` states the over-read policy for exports.
- **Not necessary for these callers.** The new checks apply only to classified bands, where the Classification and
  what it trains on are executed: `CLASSIFIER` reads exactly that subgraph. Native requests keep today's over-read,
  which is also where the native-band classifier-input policy reads the record.
- **Keep separate.** It stays under "`REFERENCE` closure over-reading" (deferred). A later fix would scope validity to
  edges reached through executed needs, plus each `REFERENCE` target's own resolution. It would change closure loading
  and the runtime's caches.

**3. How declarations stay aligned with execution.**

Repeated decisions found:

- **The pixel projection, three times.** The GUI's `recipeForOperation` drops the AOI; `loadObservations.js` and
  `loadSegments.js` each set the clicked point. These are equivalent today: neither emits an AOI edge.
- **Which operation a request runs.** Per-panel `CHART_OPERATIONS`, plus Time Series' `BAND_OPERATIONS`, against
  per-route constants.
  - CCDC's GUI chart omits the classified step the server runs.
  - For CCDC Slice and Change Alerts charts, the GUI judges the wrapper as `PIXEL_SEGMENTS`. The route judges the
    referenced recipe as `IMAGE_OUTPUT`, hard-coded beside the types' `PRIMARY_IMAGE: IMAGE_OUTPUT`.
- **The stage order.** Configured findings, then requested capability, then training: only `loadObservations.js` has
  it.
- **Effective bands.** `fittedMeasures` is the shared owner, but `ccdc.js` repeats requested ∪ breakpoints inline for
  the collection.
- **Capability, three checks over two derivations.** `classifiedOutputRequirement` and `provided$` use
  `unprovidedClassifiedOutputs`; `collection.js` uses `getBands$`, which is `classificationBands`. The GUI's options
  use `supportRegression`, `supportProbability` and the legend (`sources.js`).
- **Change Alerts' observed collection.** Server only. The GUI judges no observations for it.
- **Gate before build.** `imageAssetExport` builds the image in parallel with its check (`forkJoin`), and the preview
  has no server gate. `ccdcAssetExport` and the chart routes gate first.
- **Retrieve's holds.** Hand-wired. The open panel takes the `requestOptions` path, which skips `authorityGate` and
  `retrieveAvailability`. Reported by the trace and still to be confirmed by a witness. The server refuses anyway.

Coverage checks proposed, each detecting a class of drift rather than one case:

1. **Training implies a guard** (gee, per route × band shape). Run each real route over stubbed Earth Engine and a
   Classification that stores no points. Bands: native, classified, mixed, and configured-classified breakpoints.
   - Where the effective bands require classification, assert a refusal before product computation or training: no
     product evaluated, no export started and no `getTrainingData$` call. Native requests over the same
     Classification succeed, without training. Either way, readiness may still acquire its evidence, input
     observations included.
   - Routes: `loadObservations`; `loadSegments`, the CCDC itself and a reference; the three time-series task routes;
     `ccdcAssetExport`; `imageAssetExport` of a CCDC with classified `outputBands`.
   - Direct preview is listed as a known unguarded route.

   Each slice adds its routes' rows. The check passes only once a route's guard exists, so no row records a known
   failure.
2. **The projection agrees** (shared). For each pixel operation over Time Series, CCDC and Change Alerts, the
   judged recipe's edges equal those of the recipe the route builds. Trivial once the projection is one shared function
   (optional step below); until then it pins the three copies.
3. **The capability derivations agree** (GUI and shared). For each classifier type, SVM type and legend, the
   classified outputs `sources.js` offers equal `classificationBands(model)`.
4. **Charts and routes agree on operations** (shared helper). The GUI's operations for a band equal the stages the
   route runs for that band, since both call the one helper.
5. **A route inventory** (gee). Every `routes.js` entry that builds a recipe names its gate, or appears in an explicit
   unguarded list. A new route fails until classified.

**Recommended sequence.**

- **Necessary for this round:**
  1. **CCDC chart, with the stage helpers extracted: implemented (2026-10-21; see "CCDC's requested chart bands").**
     Its second use was the moment to extract
     from Time Series' chart:
     - a shared stage selector, taking the effective bands each execution owner derives: requested bands for
       observations, `fittedMeasures` for CCDC's segments;
     - a server helper running, after the base operation's configured checks, the requested capability with
       execution's error and then the stage;
     - the GUI band hold.

     The stage is generalised in this slice, since segments already make `CLASSIFIED_PIXEL_OBSERVATIONS` the wrong
     name. It is renamed for "the collection classified", and is AOI-independent: judged over the recipe without its
     AOI, since training reads none. CCDC declares it as `CLASSIFIER`, and `loadSegments.js` and `loadObservations.js`
     run it. The CCDC chart holds the band for both streams. Checks 1 and 4 are added for these routes, including the
     invalid combinations above. About 10 files plus tests; Time Series' chart behaviour is unchanged.

     The stage generalisation, the shared hold and the CCDC integration land together. Preview gating, propagated
     requests and dependency-loading changes stay outside this slice.
  2. **Time Series Retrieve: implemented (2026-10-21; see "Time Series Retrieve's classified indicators").**
     - The stage generalised in step 1 applies as is: the download keeps its AOI for `IMAGE_OUTPUT`, and the stage is
       judged without it.
     - The GUI holds submission while a selected indicator is classified and the stage is not `READY`, with findings
       said in the panel.
     - The tiles route judges the union of indicators; each chunk judges its own. Native-only downloads are unchanged.
     - Precedence: `IMAGE_OUTPUT`'s configured findings as today, then requested capability with its 400, then
       training.
     - Confirm or fix the open-panel gate there.
  3. **CCDC export bands: implemented (2026-10-21; see "CCDC's requested export bands" and "CCDC's Drive and SEPAL
     image exports").** `ccdcAssetExport`, `imageAssetExport` and the Drive and SEPAL image exports run the stage over
     the requested measures, before anything is built.
- **Optional, any time after:**
  - one shared projection, `operationRecipe(recipe, operation)`, for the GUI and routes, which would also let the GUI
    judge Change Alerts' observations;
  - coverage checks 2, 3 and 5;
  - the executed-edge validity fix;
  - direct previews of a Time Series or CCDC, through the same root stage, once the preview gets a server gate;
  - a propagated operation context, for wrappers requesting classified measures of a CCDC source.

**Preserved throughout:**

- the native-band classifier-input policy;
- referenced recipes judged over their own AOIs;
- configured findings first. Requested capability is refused with `ClientException`, 400,
  `UNSUPPORTED_CLASSIFIED_OUTPUT`, before the additional training stage;
- pending and unavailable never being findings;
- training rules owned by Classification's `CLASSIFIER`, and capability by `unprovidedClassifiedOutputs` and
  `classificationBands`.

#### Next steps from browser feedback (updated 2026-10-23)

These follow-ups came from the manual results above and the subsequent discussion. **Status reconciled 2026-10-27:**
the required corrections are implemented through S1-S6; the current release gates are in the
[release checkpoint](#current-release-checkpoint). The user's direction remains Provider imagery with Consumer
features, sampling outside the collection's per-scene loop, visible repair paths and less implicit settings syncing.
The detailed records preserve the earlier proposals, decisions and verification limits.

| Order | Follow-up | Status / boundary |
| --- | --- | --- |
| F1 | Training-data toolbar marks and item-editor explanations/repair | Implemented in S2 for Classification and Regression, with confirmed findings blocking edited submissions. Empty-Provider feedback remains a separate policy decision. |
| F2 | CCDC Sources: expose the selected Classification and locate incompatibility beside it | Implemented in S2 through the shared compatibility binding and selected-Classification opening view. |
| F3 | Change Alerts: consistent applied/editor diagnostics and monitoring-band chart hold | Implemented in S6; Optical-to-Radar, retained choice, Cancel and applied repair passed the user's browser recheck. |
| F4 | Reused training samples: Consumer features over Provider imagery, once per collection computation | Implemented in S4: named-feature supply, case-insensitive unique matching, shared readiness/execution and actionable feedback. Sampling remains outside the scene map. |
| F5 | Audit ownership of Change Alerts Sources/PRC settings | Audit and agreed ownership contract completed in S5; required settings follow current producer/asset facts. |
| F6 | Replace whole-group automatic syncing with explicit ownership | Implemented in S5: seed editable defaults at the first Reference Apply during creation, then preserve them. The explicit "Use reference settings" action was dropped on 2026-10-27; the BAYTS ownership audit/correction is selected next after keyboard band addition. |
| F7 | Copy/paste visualization parameters between layers | Selected after BAYTS ownership, before recipe-scoped modals (2026-10-27); separate feature, not a release gate. |
| F8 | Chart layout after tab return; Time Series Retrieve's unconditional empty unavailable-bands warning | Implemented in S1 and S2 respectively, with their recorded browser acceptance. |
| F9 | Treat a selected Classification as required for Time Series and CCDC, including native requests | Implemented in S3 through shared analysis prerequisites; redundant request-dependent training stages and holds were removed. |
| F10 | PyEO: put incompatibility feedback in a section that can repair it | Implemented in S2 and its Stack Require drop correction; shared derivation/readiness and the user's actual-preview recovery check passed. |

The original sequencing prioritised F8 and F9 before extending request-band gates, and required the F4 sampling and
F5 ownership assessments before their implementation. Those assessments and corrections are complete. Do not
restart them from an older proposal or introduce another band-highlighting/training-hold mechanism.

**Implementation grouping after reviewing the complete feedback so far (2026-10-23).**

F1-F10 identify issues, not ten required commits. Group implementation into the six correction slices below. Each
slice includes its focused regressions and the relevant combined browser recheck; do not postpone all testing until
the end. These are review boundaries, not exact file/commit counts. New results or a genuinely unresolved technical
contract can change the split; they must not silently expand it.

| Slice | Work grouped together | Covers | Completion evidence / dependency |
| --- | --- | --- | --- |
| S1: Chart layout on tab return | Implemented: defer graph drawing while disabled and make Panel visibility follow the enabled context in the same render. | F8 layout | Focused tests and independent review passed; user reported "Looks good" after the manual checklist and approved committing on 2026-10-23. Detailed per-case browser results were not supplied; see below. |
| S2: Feedback where repairs happen | Consistent Classification/Regression training-data feedback, item-editor explanations and replacement/removal; visible Classification selection in Time Series/CCDC Sources; classifier-input attribution at Classification; repair-oriented PyEO SRC/OPT feedback; correct the empty Retrieve warning. | F1, F2, F10, F8 warning | The single-input selection check passes. Confirmed findings now hold Apply while replacement, Cancel and unchanged Close remain available; the user confirmed Classification's browser recheck passed. The separate Stack Require drop fix passed the user's actual-preview and remove/restore browser check on 2026-10-24. Empty-Provider refinement and S3/S4 remain separate. |
| S3: One selected-Classification validity contract | Require a selected usable Classification for Time Series/CCDC base operations, independently of requested/breakpoint bands; common SRC explanation/action hold; remove redundant band-training stage/watch/messages/server settling. | F9; consumes S2 presentation | Implemented and independently reviewed. User confirmed Retrieve closure/reopen and the already-broken CCDC/count-preview repair checks passed on 2026-10-25. Shared analysis prerequisites cover every operation and named map product. The timing-dependent keyboard check was not attempted in the browser; automated coverage passed. No requested browser recheck remains. |
| S4: Reused samples with Consumer features | Sample each contributing Provider's imagery at its points using Consumer's feature definition; preserve sampling scale, nesting/order and Consumer normalisation; update shared readiness to the same derivability contract. | F4 | Implemented 2026-10-26; sampling and feedback corrections pass independent review, including unsupported requested operations and neutral unknown-reason fallback. No remaining S4 review findings. User confirmed the CCDC explanation and selection-recovery browser recheck passed on 2026-10-26; see the result after "S4 use-restriction fallback: independent review". The final full GUI campaign ran on 2026-10-27; see "Final integrated verification". |
| S5: Change Alerts settings ownership | Audit Sources/PRC fields, then implement source-owned read-only required matches versus consumer-owned editable values; replace whole-group observation syncing and define initial/explicit copying. | F5, F6 | Committed as `6fc9e5874`, then integrated with origin at `78642988e`. The user accepted the PRC ownership browser recheck on 2026-10-27. The live legacy-metadata verification limit is recorded below. The explicit "Use reference settings" action was dropped on 2026-10-27; no additional copying control is planned. |
| S6: Change Alerts validation and chart agreement | Retain invalid applied choices with field explanations; hold Retrieve and close/disable the analysis chart for an incompatible configured monitoring band; remove redundant panel validation. | F3 | Implemented and user browser-accepted on 2026-10-27 after the chart fixture and shared recipe-read context corrections. The baseline chart, upstream Optical-to-Radar withdrawal, Cancel and applied Radar/VV repair all passed, including actual segments and observations. Chart scope stays operation-specific. The shared-read correction is committed as `12129ad9b` and browser-accepted. Final integrated verification ran on 2026-10-27 and is blocked by stale GUI tests; see "Final integrated verification". |

**S1: Chart layout on tab return (implemented 2026-10-23; user feedback received).**

- **Cause (reproduced in a mounted test, for Time Series and CCDC).** A recipe tab not selected leaves its layout in
  place (`tabContent.module.css`: opacity only), but its panels are not displayed: `Panel` adds `.disabled`
  (`display: none`) while the enabled context of the tab is false. Data arriving then made `Graph` build its Dygraph
  inside that hidden panel. Dygraph sizes a chart by its element when it builds it: a hidden element has no size, so it
  takes the defaults, written as inline `width: 480px; height: 320px` (`dygraphs/src/dygraph.js`, "assume the user
  will call resize"), and keeps them. Returning to the tab displayed the panel around a chart fixed at that size.
  Nothing resized it: the window did not change, and `Graph` neither watched its element nor rebuilt. A second,
  ordering cause: `Panel` displayed itself again only after the render that enabled it, through the enable detector's
  `onChange` and `setState`, so a child acting on being enabled still found it hidden.
- **Fix, in the two shared owners.**
  - `widget/graph.jsx`: `Graph` reads the enabled context (`withEnabled`). While disabled it draws nothing; once enabled
    it draws what it was last given, building the chart or redrawing it as before, compared with what it last drew. A
    chart already drawn is neither rebuilt nor redrawn by a tab switch alone.
  - `widget/panel/panel.jsx`: `Panel` renders `.disabled` from the enabled context itself (`withEnabled`), so it is
    hidden and displayed in the render that changes the context. A panel mounted inside a context that is already
    disabled is now hidden too. Its tab is invisible either way, and `Graph` waits until it is shown.
  - No data is requested again, and nothing is discarded, delayed or resized by a new mechanism. Chart data, the
    selected pixel and band, and cancellation are owned by the charts and unchanged.
- **Regressions.**
  - `recipe/chartTabReactivation.test.jsx`: the real Time Series and CCDC charts in a real `TabContent`, with Earth
    Engine and Dygraph substituted. Data arriving while the tab is not selected builds no chart. Selecting the tab
    builds one, outside a hidden panel, with the data received and no further request. A chart drawn while selected is
    neither rebuilt nor requested again across a tab switch.
  - `widget/graph.test.jsx`: drawn once enabled, from the data last given while disabled; new data while disabled
    redrawn once enabled without rebuilding; an unchanged chart not redrawn.
  - `widget/panel/panel.test.jsx`: content finds its panel hidden in the render that disables it, and displayed in the
    render that enables it.
- **Witnesses.** With both files from `HEAD`, 5 of the 12 cases fail, including both charts' hidden-arrival cases.
  With only the `Graph` fix, the charts are built while their panel is still hidden (and the panel case fails). With
  only the `Panel` fix, they are built while the tab is not selected (and the graph cases fail).
- **Focused campaign** (two workers): the widgets, the Time Series, CCDC, CCDC Slice, Change Alerts, LandTrendr,
  Mosaic, Masking, Remapping, Classification and Band Math recipes, the chart band and Retrieve tests, and the map,
  152 files and 1966 tests passed. ESLint and `git diff --check` are clean. The full GUI suite was not run for this
  slice.
- **Shared Panel risk review:** this changes visibility timing, not placement, portal targets, panel activation,
  mounting/unmounting or form state. Hidden/visible changes now happen in the enabling render rather than a later
  state update; a panel mounted already disabled now starts hidden. Remaining browser risks are content measuring
  itself while hidden, focus on reactivation and overlay behaviour. A Graph-only solution could instead wait for
  actual element dimensions, but the current enabled-only Graph fix demonstrably needs the Panel ordering change.
  Independent review with old Panel mounted read-only and current Graph fails both hidden-arrival cases while the
  already-drawn controls pass. Independently, the focused chart/graph/panel/tab set passes 50 tests, and unrelated
  form-panel, Stack and Remapping activation/Apply/Cancel tests pass another 32; these do not establish browser layout.
- **Browser feedback (2026-10-23):** after receiving the manual checklist, the user reported "Looks good" and approved
  committing S1. No deployed build or per-case outcomes were supplied, so this is overall user feedback, not a claim
  that every optional graph/Panel variant was individually verified. Retain the checklist for any outstanding cases.
- **Browser checklist:** DOM tests do not establish rendered layout. For Time Series and for CCDC, open a pixel
  chart, switch to another recipe tab before it loads, let it finish, and return. The chart must fill its panel at its
  normal size, without a further segments or observations request in the network panel. Repeat the switch a few times,
  and resize the window once. Also open a chart and switch tabs after it has loaded, and check a LandTrendr chart and
  a layer histogram (the other `Graph` users). As a small unrelated-Panel smoke check, keep an edited Sources/Retrieve
  panel open across a recipe-tab switch, confirm its values, focus and scrolling still work on return and Cancel/Apply
  behave normally; open and dismiss a modal/confirmation as well.

**S2: Feedback where repairs happen (implemented 2026-10-23; Classification's Apply-hold browser recheck passed; separate Stack index-derivation browser check passed 2026-10-24; Stack layout and the empty-Provider refinement remain separate).** Presentation and repair paths
over the existing findings; training semantics and the selected-Classification policy are unchanged (S3/S4).

- **Training data (F1).**
  - *Cause.* Classification registered every training-data declaration with `toolbarMark: false`
    (`unmarkedTrainingDataRequirements`), so its TRN said nothing that Regression's says. Neither data-set editor was
    bound to the findings: the reused-recipe `RecipeSection` rendered a bare `RecipeInput`, so the editor explained
    nothing and offered nothing to repair.
  - *Change.* Classification uses the same `trainingDataRequirements` as Regression, and the unmarked copy is removed.
    Decision trees are exempt by the shared rule (`requiresTraining`), and TRN, which is not a wizard step, is not
    marked while the wizard leads (`panelWizard.reached`); pending evidence marks nothing, as before. The reused-recipe
    reference feedback and missing-features declarations bind the data-set editor through the existing `editor`
    mechanism (`REUSED_RECIPE_EDITOR`: panel `trainingDataSet`, input `recipe`, `blocksApply: false`, `explain: true`),
    judging the recipe built from the edited data set alone: a newly chosen recipe is judged afresh, another data set's
    finding stays on its own item and the toolbar, and nothing is held, so
    replacement, removal and Cancel stay open. `ReusedRecipeInput` (both editors) offers "Open {recipe}" for the
    recipes at fault - `referenceFeedback.origins`, the recipe further up a chain of reuse where it is that one, or the
    missing-features providers, now given as ids - and says that applying the same recipe again does not repair it.
    `openRecipeInTab$` (`recipe.jsx`) selects the recipe's tab where it is open, opens a tab on the session's draft where
    it is closed with its saves unsettled (the cache rules: no storage read replaces a draft), and otherwise reads it
    from storage, deciding again from the session when the read answers, composing the existing tab actions.
  - *Regressions.* `classification/reusedTrainingDataEditor.test.jsx`, for both types over a Provider with no input
    imagery: explanation, Open and hint, nothing held; Open selects a new tab and leaves the Consumer's; a working
    replacement clears it and Apply saves it; left unchanged it still marks TRN; Cancel keeps the applied recipe; a
    chain names and opens the recipe at fault. `reusedTrainingDataFeedback.test.jsx`: both TRN buttons say so. The TRN
    expectations of `outputRequirements`, `wizardSectionMarks` and `trainingDataChain` were updated to the marked
    contract; the wizard-step cases are unchanged, and the unnamed-data-set case now has points, so it still shows its
    own finding.
- **Time Series and CCDC Sources (F2).**
  - *Cause.* Sources opened on Less unless More had been saved, hiding a selected Classification. The shared rule
    locates `UNSUPPLIED_CLASSIFIER_INPUTS` at `dataSets` where another collection would feed the classifier - the
    Optical-to-Radar edit - and the binding said it there.
  - *Change.* Both panels open on More while a Classification is selected, decided once when opened; More/Less toggles
    as before and saves `advanced` as before. `collectionClassifierRequirements` keeps both located findings and their
    own messages but says both beside the Classification (`editor.input`), which Sources show while it cannot be used;
    the data sets' own validation is unchanged. Phenology shares the binding and gets the same location; its policy
    (a refused draft cannot be applied) is unchanged.
  - *Regressions.* `sourcesClassifierInputs.test.jsx` (moved from `timeSeries/.../sourcesCompatibility.test.jsx`, now
    over both panels): opening view and toggling; Optical-to-Radar explained beside the Classification, the data sets'
    own `notEmpty` still theirs, repaired by Optical again; Cancel; an unusable Classification refused, then replaced;
    repair by Radar with Apply; a saved unusable selection explained on opening. `unselectedClassification.test.jsx`
    now reopens Sources after Apply, as Apply closes it.
- **PyEO SRC/OPT (F10).**
  - *Findings, reproduced.* Optical-to-Radar Classification input with Landsat monitoring: gate off, SRC alone
    (`UNSUPPLIED_CLASSIFIER_INPUTS` at the classification); gate on NDVI, also OPT (`UNAVAILABLE_GATE_INDEX`,
    `BASELINE`), whose message offered "choose another index", though no index the gate offers can be computed of radar
    bands.
  - *Change.* The shared rule locates a `BASELINE` gate finding at the classification where its imagery supplies none
    of `GATE_INDEXES` (moved into the shared type, one list for rule and panel); otherwise at the gate index, OPT's
    genuine choice. Sources say it beside the Classification (`noGateIndex`, `explain: true`). `MONITORING` findings and
    OPT's own panel validation are unchanged.
  - *Regressions.* `pyeoAlerts/inputIncompatibility.test.jsx`: radar with the gate off and on, SRC marked and OPT not,
    explained beside the Classification and repaired by optical imagery; imagery feeding the classifier but offering no
    gate index, SRC with the gate on and nothing with it off; an index the imagery cannot provide while it provides
    another, OPT marked until NDVI is chosen. The shared `readiness.test.js` radar case asserts the new location.
- **Time Series Retrieve's empty warning (F8).**
  - *Cause.* The panel's `selectedValues` turned the form's empty value `''` into `['']`, which the Time Series gate's
    offer check named as unavailable: "These bands are no longer available from this recipe: .".
  - *Change.* `selectedValues` drops the empty value; the gate, holds, reconciliation and submission rechecks are
    unchanged, and an empty selection meets the field's own `atLeastOne` rule.
  - *Regressions.* `retrieveTrainingReadiness.test.jsx`: opened with nothing selected, over a working and a point-free
    Classification, no warning and Apply held; a native indicator then submits.
- **Consolidated.** One training-data declaration set for both recipe types (the unmarked copy removed); one gate-index
  list for the shared rule and the panel; one classifier-input explanation location for Time Series, CCDC and
  Phenology. No validator, loader or navigation framework was added; the editor feedback uses the existing `editor`
  binding and `referenceFeedback` metadata.
- **Witnesses.** With each part's files from `HEAD`: training data 9 of 34 fail (editor binding alone 6, recipe
  sections alone 6; TRN marks, by mutation, 3); Sources 6 of 14 (binding 4, panels 2); PyEO 2 of 7 (shared rule alone 2,
  SRC binding alone 2); Retrieve 2 of 17.
- **Focused campaign** (two workers): GUI recipe suites for Classification, Regression, PyEO, CCDC, Time Series,
  Phenology, CCDC Slice, Change Alerts, Remapping, Masking, Band Math and Stack, the shared Retrieve panels and
  requirement/section-mark tests, the process panels, `recipeInput` and autosave, 102 files and 1410 tests; shared
  `test/recipe` 1275 and gee PyEO 12. ESLint and `git diff --check` are clean. The full GUI suite was not run.
- **Independent review: two corrections, applied.** The normal focused GUI cases passed (58) and the shared
  readiness/PyEO checks passed (78), but three added review scenarios failed for both Classification and Regression
  (six failures). Temporary review probes were removed; production code was not changed by the reviewer.
  - **Item isolation:** with one healthy reused data set open for editing, add another data set referring to a Provider
    with no input imagery. The healthy item's Recipe field shows the other Provider's error and Open action.
    `REUSED_RECIPE_EDITOR.candidate` keeps every data set, and `OutputCandidate.findings()` takes the first matching
    read without restricting it to the edited item. Scope the candidate or returned feedback to that data-set identity;
    a genuine problem on another item still belongs in the applied list/toolbar, not this editor.
  - **Navigation/draft safety:** delay Open Provider's storage answer; open that Provider elsewhere and edit it before
    the answer arrives. The late answer overwrites the edited model and creates a second tab with the same recipe id.
    Separately, opening a closed cached Provider with an unacknowledged save also replaces its draft with storage.
    `openRecipeInTab$` checks whether it is open only before starting the read, then calls `openRecipeRevision`
    unconditionally. Preserve held drafts using the existing cache/save rules and recheck current tab/record state
    when the read completes. Add regressions for both cases plus repeated/concurrent Open actions; do not introduce a
    parallel navigation cache or let repair navigation discard edits.
  - **Corrections.** The editor's candidate is the recipe built from the edited data set alone, as an editor candidate
    is (`recipeFormPanel.jsx`), so only its own findings reach the editor. `openRecipeInTab$` decides from the session
    before reading and again when the read answers: an open tab is selected, a held draft opened as held, and only
    otherwise is storage's record opened, in one tab. No navigation cache was added.
  - **Regressions** (`reusedTrainingDataEditor.test.jsx`, both types): the editor of a healthy reused data set beside a
    broken one says nothing and offers no Open, while the toolbar still marks TRN; a Provider opened and edited while
    its read is pending keeps its edit and one tab; two Opens before the read answers open one tab; a closed Provider
    whose save is unacknowledged opens as held, reading nothing. The harness forgets each recipe's save state after a
    test, as the session's save coordinator outlives it.
  - **Witnesses.** With the pre-review `openRecipeInTab$`, the three navigation cases fail for both types (6); with the
    candidate keeping every data set, the isolation case fails for both (2). The editor file passes 20 of 20.
  - **Correction review:** no further code findings. An independent run of the editor, recipe opening/closing,
    save-coordinator, listing and cache-claim tests passed 92 tests in six files. ESLint on the corrected files and
    `git diff --check` passed. Browser verification remains separate.
- **Subsequent browser feedback and scope correction (2026-10-23):**
  - **Open Provider: remove, user decision.** The action switches recipe tabs from inside a modal and is broken in the
    browser; the user wants recipe-scoped modals handled separately, with generic recipe-opening in the selector later.
    Remove the action from both training-data editors rather than repairing modal ownership or building a special
    navigation route for this slice. This supersedes the earlier Open Provider requirement and its browser checks.
    `openRecipeInTab$` and its new `showHeld` helper currently have only this caller: remove them, their now-unused
    imports, the Open/open-error translations and tests dedicated to the removed operation. Preserve the item-isolation
    correction and its tests, along with the rest of S2. Earlier navigation review/witness results above are historical.
  - **Repair wording:** the user found "Applying this recipe again does not repair it..." awkward. Recommended wording
    is "Fix the problem in {recipe}, or select another recipe." The located finding should say what is wrong; the hint
    should not discuss re-applying implementation mechanics or imply a direct Open action still exists.
  - **Empty training data versus a broken data set:** the user questions a red TRN instruction "Add training data",
    since collecting points on the map is another valid route. The recommendation is neutral setup guidance for no
    points yet ("Collect points on the map or add a training data set"), while retaining readiness holds and marking
    TRN for a genuinely unusable configured data set. Do not restore blanket suppression of broken-Provider feedback.
    This recommendation is recorded separately from the explicit decision to remove Open Provider.
  - **PyEO OPT still shows an upstream fault:** the user confirms SRC marks the Classification, but opening OPT still
    gives an index validation error for the radar-feature Classification versus optical monitoring case. The whole
    PyEO analysis is already invalid through classifier-input compatibility, independently of the gate; switching the
    gate off cannot repair that. `Options.explainGateIndex()` still derives and sets its own field error regardless of
    the failed source prerequisite, so moving the toolbar finding alone was insufficient.
    **Agreed form behaviour (2026-10-23):** one actionable compatibility explanation at SRC/Classification; retain the configured gate,
    index and threshold visibly but disable the gate controls while source compatibility is invalid or not yet
    established, with neutral guidance to resolve SRC (or a checking state). Do not automatically clear the gate or
    replace its index. Independent alert controls may remain editable. No duplicate red index error for that upstream
    fault. When the source is compatible again, resume normal local gate editing/validation. Implemented under
    "Browser corrections" below; see revised F10. A compatible Classification with an unsupported optional gate is OPT's own
    repair case, including turning the gate off when none of its indexes can be supplied.
- **Browser corrections, applied (2026-10-23):**
  - **Open Provider removed.** `ReusedRecipeInput` renders the reused recipe's `RecipeInput` with no label action.
    `openRecipeInTab$` and `showHeld` are removed (`recipe.jsx` is as at `HEAD`), with the `reusedRecipe.open` and
    `process.recipe.openError` translations and the editor test's five Open cases and their harness (delayed answers,
    held draft, save-state cleanup). The single-data-set candidate, explanation, replacement, removal, Cancel and the
    isolation case are kept.
  - **Repair hint.** "Fix the problem in {recipe}, or select another recipe." ("Fix the problems in ..." for several),
    naming `referenceFeedback.origins`.
  - **No training data versus a broken data set.** `NO_TRAINING_DATA` is declared `toolbarMark: false` for both types
    (`classificationTrainingDataRequirements`, `regressionTrainingDataRequirements`: one factory, differing only in the
    guidance). It still holds Retrieve, layers and dependent recipes; the shared rule, decision-tree exemption, wizard
    and pending semantics are unchanged. The Training data panel shows its message as neutral guidance - an info
    message above the list, or the empty list's own message - read from the list's item (`TRAINING_DATA_LIST`):
    Classification "Collect points on the map or add a training data set."; Regression, which collects nothing on its
    map, "Add a training data set." Missing-features and reused-recipe findings still mark TRN, the item and its editor.
  - **PyEO gate.** Shared rule: `UNAVAILABLE_GATE_INDEX` is judged only where `UNSUPPLIED_CLASSIFIER_INPUTS` finds
    nothing - an analysis the monitoring data cannot classify has nothing to gate - and is always located at the gate
    index, naming as `alternatives` the other offered indexes both the baseline and monitoring may supply. S2's
    relocation of a no-index `BASELINE` finding to the classification, and its `noGateIndex` SRC declaration and
    message, are removed. OPT binds `options.gateIndex` as its editor, so the draft's index is judged by that rule;
    `Options.explainGateIndex` and `gateIndex.unsupported` are removed. With no alternative, the message says to turn
    the gate off (`gateIndex.noAlternative.*`). OPT reads `gateDependencyOf` over the recipe's output requirement reads
    (`withOutputRequirementReads`, `selectedSource.jsx`): `INCOMPATIBLE` where SRC's classifier-input declarations hold
    a located finding, `CHECKING`/`UNAVAILABLE` where their output read is that. Meanwhile the gate's on/off, index and
    threshold stay shown as saved and disabled, with neutral guidance (`useIndexGate.dependsOnSources.*`); the
    detection count stays editable and nothing is cleared. The offered index list and default index followed Sources'
    last read of the classification's bands until the freshness correction below.
  - **Regressions.** `reusedTrainingDataFeedback.test.jsx`, both types: no training data says how to add some in the
    panel, marking neither TRN nor a data set, Retrieve held; a reused recipe storing no point likewise; a Provider
    without input imagery still marks TRN and gives no such guidance. `reusedTrainingDataEditor.test.jsx`, both types
    (12): explanation and the new hint, no action in the recipe field's label, nothing held; replacement and Apply;
    unchanged; Cancel; isolation; a chain naming the recipe at fault. `regression/trainingDataReadiness.test.jsx`: the
    guidance in the mounted panel and an unmarked TRN, through the editor's reload, Cancel and Apply.
    `wizardSectionMarks.test.jsx`: a Regression without training data unmarked through its wizard; its wizard-reach
    cases now use an unnamed data set. `outputRequirements` and `trainingDataChain` are back to the unmarked contract.
    `pyeoAlerts/panels/options/options.test.jsx`, rewritten over the real runtime and recipe types (12): incompatible
    source (controls disabled with guidance, choices kept, no index error, detection count editable), recovery with
    choices kept, checking then answered, unavailable, an unsupported index repaired by another, no alternative repaired
    by gate-off, Cancel, On disabled where no index is offered, default-index selection.
    `inputIncompatibility.test.jsx`: radar gate on/off marks SRC alone with one explanation; visible-band imagery with
    the gate on marks OPT ("turn the gate off"), not SRC. Shared `readiness.test.js`: radar refused at the
    classification alone; `alternatives` named, and none.
  - **Witnesses.** With the pre-correction S2 files (`recipe.jsx`, `reusedRecipeInput.jsx`,
    `trainingDataRequirements.js`, both recipe types, both panels), 20 of 136 training-data tests fail. Restoring an
    Open-style label button fails the label-action case for both types (2); a candidate keeping every data set fails
    isolation for both (2). With the pre-correction shared rule, PyEO declarations, OPT panel and `selectedSource.jsx`,
    7 of 79 PyEO GUI tests and 3 of 71 shared readiness tests fail.
  - **Verification.** Focused GUI campaign (two workers): Classification, Regression, PyEO, Time Series, CCDC,
    Remapping, Masking, Stack, Band Math, Change Image, Change Alerts, `sourcesClassifierInputs`,
    `unselectedClassification`, `wizardSectionMarks`, `outputRequirements`, recipe opening/closing, save-coordinator,
    listing, autosave, cache claims and `recipeInput`: 93 files and 1278 tests passed; translations 2. Shared
    `test/recipe` 1277; gee PyEO, model-derived bands and asset export, 4 files and 137 tests. ESLint and
    `git diff --check` are clean. The full GUI suite was not run.
  - **Earlier policy: empty Providers stay neutral; questioned again in the subsequent browser recheck below.** A data set reusing a recipe that stores no point is also `NO_TRAINING_DATA` alone, so it is now
    unmarked and guided like an empty list; the shared finding does not tell the two apart.
    **Review recommendation:** keep this neutral. An empty Provider is valid beside another data set contributing
    points; a wholly empty chain needs recipe-level setup guidance, rather than declaring each Provider broken. No
    extra detail on the shared finding is needed for that policy.
  - **Independent correction review (2026-10-23): PyEO index choices still use stale evidence.** The shared gate
    validation now follows the current Classification, but `Options.gateContext()` still reads
    `ui.classificationBands`, which only Sources refreshes. Two temporary mounted probes changed the Classification's
    input without changing that UI copy: visible-only imagery repaired to red/NIR leaves the gate's On button
    disabled; red/NIR changed to NIR/SWIR leaves NBR absent from the offered repair choices. Both probes fail on the
    current code. The existing recovery test's `holdInput` also updates the UI copy, so it does not cover an upstream
    repair alone. Derive the offered/default indexes from the same current resolved evidence as the gate rule, keep
    selected choices through checking/unavailability, and add regressions that do not write Sources' UI copy. Do not
    require reopening Sources or add another loader/cache. This remaining repair gap is not a claim that the stale
    UI copy was introduced by the browser corrections.
    **Independent checks:** the six focused GUI files (`options`, reused-data editor/feedback, PyEO input
    incompatibility, Regression readiness and wizard marks) passed 86 tests; shared readiness and PyEO passed 80.
    ESLint on the reviewed changed sources and OPT tests, and `git diff --check`, passed. The two failing freshness
    probes were removed; the reviewer changed only this roadmap, not production code or permanent tests. No browser
    recheck or full GUI suite was run.
  - **Freshness correction, applied (2026-10-23).** OPT offers, and turns the gate on with, the indexes the shared gate
    rule finds readable now: `GateIndexCandidates` (`pyeoAlerts/gateIndexCandidates.js`) judges the recipe as applied
    with the gate on each of `GATE_INDEXES` through the existing `OutputCandidate` and the exported gate declaration
    (`GATE_INDEX_REQUIREMENT`), each watched while OPT is open and sharing the runtime's observations; one refused is
    not offered, one still being judged is not ruled out. NDVI is preferred, then the first readable. OPT no longer
    reads `ui.classificationBands` (its `mapRecipeToProps` and `gateContext` are removed); Sources' first-set-up
    proposal still uses its own read through `gateIndexes.js`. No loader or cache was added, and Sources need not be
    reopened. Choices are kept through checking and unavailability as before.
    **Regressions** (`options.test.jsx`, 14): the fixtures no longer hold the UI copy, and `holdInput` changes only the
    Classification. Visible-only imagery changed to red/NIR enables On, which takes NDVI and Apply saves it; red/NIR
    changed to NIR/SWIR, gated on NDVI, says so beside the index and offers NBR, which repairs it and Apply saves it.
    **Witness:** with the copy-based choices restored and the copy seeded at opening, those two fail as reproduced (On
    stays disabled; no NBR option); the other 12 pass. **Checks:** PyEO GUI 9 files and 81 tests; with Classification,
    Time Series, CCDC, `sourcesClassifierInputs`, `outputRequirements` and `wizardSectionMarks`, 39 files and 428
    tests (two workers). ESLint on the changed files and `git diff --check` are clean. Shared code is unchanged since
    its 1277-test run. No browser recheck or full GUI suite was run.
    **Independent correction review:** no further code findings. The offered/default indexes use the same gate
    declaration and current candidate-read evidence as validation, with all three candidate watches stopped when
    OPT unmounts. The two reported freshness failures are covered without a UI copy. Independent GUI runs passed
    214 tests in 14 files: PyEO and `sourcesClassifierInputs` (95), then the runtime, output registry, output
    requirements and training-data editor (119). ESLint on the four correction files and `git diff --check` passed.
    The reviewer changed only this verification record. The targeted browser recheck remains pending; no full GUI
    suite was run.
- **Further browser recheck feedback (2026-10-23; user reported, not independently browser-observed).** The user
  reports the checks below completed; unmentioned behaviour is treated as passing, as requested. This supersedes
  "browser recheck pending" above for that run, not the historical automated results or the need to recheck fixes.
  Production code and tests have not been changed in response to this new feedback.
  1. **Unchanged data-set editor offers Apply.** Reported for Classification. Reproduce opening an existing reused
     data set without editing it, including an upstream error, and keep Close rather than Apply when its applied
     settings are unchanged. Inspect mount-time initialization (`PanelSections` sets the wizard step; `RecipeSection`
     loads the selected recipe and sets the name) and distinguish real edits from acquired metadata/defaults. No root
     cause is confirmed yet. Do not change the shared form's dirty contract merely to hide this one symptom. Cover
     Classification and Regression, a genuine replacement/edit, Cancel and a delayed recipe answer.
  2. **One actionable editor explanation.** The blue "Fix the problem in Provider, or select another recipe" repeats
     the existing red "Provider needs attention" feedback. Consolidate the repair instruction into the existing
     field feedback, retain correct upstream-origin names and any useful cause, and remove the duplicate blue hint.
     Keep list/toolbar feedback, editor isolation and replacement/removal/Cancel. This may remove the need for the
     dedicated `ReusedRecipeInput` wrapper; do not expand every generic reference message for this local repair.
  3. **Empty selected Provider: policy question reopened.** Neutral guidance for a recipe with no training data passed.
     The user asks whether explicitly selecting a point-free Provider should instead mark that data set invalid.
     Revised recommendation: retain neutral guidance where no training data has been configured; where a Consumer
     explicitly selects a Provider and its entire training closure is known empty, locate the absence at the selected
     data set so the user can repair it. Do not refuse a Consumer that has points from its own data or another branch
     solely because one branch is empty; that branch can be explained without blocking valid training. Reuse asks for
     samples, not the Provider's trained image; a Provider with no own points can also reuse a non-empty chain. The
     Consumer must still be held when its whole closure is known empty. This refines the earlier blanket neutral
     presentation and requires detail on the existing absence finding, not another recursive validator. Agree the
     item-level presentation/strict policy before implementation; checking the Provider's `IMAGE_OUTPUT` is not the
     appropriate substitute.
  4. **PyEO redundant SRC guidance and terminology.** With a confirmed SRC error, the neutral sentence explaining that
     the index gate depends on SRC is redundant; retain the disabled dependent controls and their values without a
     second explanation of that fault. Short checking/unavailable status can still explain an otherwise unexplained
     disabled group. User-visible messages should call the option "Require drop", as its field does, rather than
     "index gate"; internal identifiers need not change. Treat these as wording/presentation corrections.
  5. **PyEO single Classification input is an operation prerequisite.** The user supplied a server trace from
     `pyeoAlerts.js:72`: "the classification must have exactly one input image", surfaced as "Failed to load layer /
     Internal error". Code confirms execution always requires one input, with Require drop off or on. Sources only
     rejects a newly proposed multi-input selection (`onClassification(..., proposing)`); applied selections and
     upstream edits bypass that check. Declare this in shared PyEO readiness, bind it to SRC/Classification, and hold
     client actions and server execution before product work. Reuse the held Classification record; pending/unavailable
     records establish no cardinality finding. Suppress dependent index errors while this prerequisite fails. Test
     one-to-two inputs and repair, gate off/on, an initially saved unsupported selection, and server refusal.
  6. **Require drop reads imagery, not training-feature selections.** The user's correction is right: whether a
     spectral index can be obtained depends on the Classification's baseline input image and the monitoring scenes,
     independently of which of those bands its classifier selects. The prior browser instructions did not make that
     distinction or the input-type distinction below clear enough. Keep index availability separate from classifier
     feature compatibility, and test changing the source output rather than only `bandSetSpecs.included`.
  7. **Recovery through Stack remains unresolved.** Adding nir back to an optical Stack over an EE asset did not
     re-enable Index/Require drop in the user's browser. Current tests use direct `ASSET` inputs; they do not prove
     this recipe-reference path. Code tracing establishes a relevant distinction: `baselineSuppliesIndex` accepts raw
     red/nir for an asset, but a `RECIPE_REF` must currently expose a band literally named `ndvi`; execution likewise
     asks a recipe input for that named band instead of deriving it from raw bands. A local call confirms raw
     red/nir => true for ASSET, false for RECIPE_REF; adding a named ndvi => true for RECIPE_REF. This could explain
     availability without establishing the entire cause of the reported disabled controls. Reproduce the real
     Asset -> Stack -> Classification -> PyEO chain, including Stack mappings, current evidence, saves and gate
     on/off. Distinguish a genuinely unavailable index from a stale/pending read before changing freshness again.
     Recommended product direction, not implemented: allow deriving Require drop's index from suitable raw baseline
     bands for recipe inputs too, preserving index units/masks and existing provided-index behaviour, rather than
     requiring users to add a redundant ndvi output to a Stack. Change execution and shared availability together;
     merely enabling the UI while execution still asks for a missing named band is insufficient. This is a separate
     bounded execution/readiness correction if it cannot remain within S2's presentation scope.
  **Next correction order:** finish the unchanged-editor/duplicate-message and PyEO presentation corrections; add the
  shared single-input prerequisite; reproduce and decide the Stack/index derivation correction. Keep S2 uncommitted
  until those intended corrections are reviewed. Do not silently include the still-open empty-Provider policy or the
  independent Stack layout work as an agreed semantic change.
- **Corrections from that feedback, applied (2026-10-23).** Items 1, 2, 4 and 5 above; items 3, 6 and 7 and the Stack
  layout stay separate follow-ups, unimplemented. The Stack recovery failure is unresolved: the tests below use direct
  `ASSET` inputs and establish nothing about the Asset -> Stack -> Classification -> PyEO path.
  - **Unchanged editor offered Apply (item 1).** *Cause:* `PanelSections` sets the wizard step to 0 when it mounts,
    and Classification's `modelToValues` gave `wizardStep` no value, so its initial "" differed and the form was
    dirty on opening - for every Classification data set, working or broken; Regression's editor has no step. A
    second cause, independent of it: `RecipeSection` renamed the data set after the reused recipe's loaded title on
    every load, so a saved name differing from that title was an edit too. *Change:* `wizardStep: 0` in Classification's
    `modelToValues`; both `RecipeSection`s keep the saved name while the recipe loaded is the one the data set was saved
    with, and name it after the recipe otherwise. A recipe chosen while the saved one is still being read keeps its
    name: `RecipeInput` already cancels the earlier read. The shared form's dirty contract is unchanged.
  - **One explanation (item 2).** The editor bindings say their findings through a new optional `editor.message`
    (`recipeFormPanel.jsx`, string-input editors only; others say the requirement's message as before):
    reference feedback as "Fix the problem in {recipe}, or select another recipe." naming the origin recipe at fault,
    the actual upstream recipe in nested reuse; missing features as their cause, then that instruction. Lists, toolbar
    and other reference messages are unchanged. `ReusedRecipeInput` and its blue hint are removed; both
    `RecipeSection`s render `RecipeInput` directly again.
  - **PyEO presentation (item 4).** With a confirmed SRC finding OPT says nothing more; Require drop, Index and the
    threshold stay disabled with their values, and the detection count editable. Only `CHECKING`/`UNAVAILABLE` keep a
    short status. User-facing PyEO messages say "Require drop" instead of "index gate"/"the gate" (OPT's messages,
    including `useIndexGate.unavailable`); identifiers are unchanged.
  - **Single input (item 5).** Shared `MULTIPLE_CLASSIFICATION_INPUTS`, judged on the held Classification record
    (`recordsOf`), located at `sources.classification` with its `count`; a record not held or unreadable establishes
    nothing, and one with no input is that recipe's own refusal, said as before. While it holds, PyEO judges neither
    classifier inputs nor the gate, so one SRC explanation stands, gate on or off. GUI: bound beside Classification
    in Sources (`multipleInputs`) and part of `gateDependencyOf`, so OPT's gate waits on it as on an incompatible
    classifier. Server: exports to Drive and Workspace are refused by the same readiness before anything is built.
    Sources' selector-only refusal (`singleInputRequired`) is removed: a newly chosen classification of several
    inputs is now refused by the shared rule like a saved one, holding Apply.
  - **Regressions.** `reusedTrainingDataEditor.test.jsx` (22, both types): unchanged editors over a broken and a working
    Provider offer Close; a saved name is kept; another recipe offers Apply and names the data set; a recipe chosen
    while the saved one is being read stays chosen when that read answers; one explanation, no blue hint, no label
    action; missing features with their cause; the nested origin; isolation, Apply, Cancel.
    `inputIncompatibility.test.jsx`: one input to two and back, gate off and on; saved with two (one radar), saying
    only the count; chosen in Sources, Apply held. `options.test.jsx`: two inputs keep the gate disabled as saved with
    no index error or SRC sentence, and repair restores it; a confirmed incompatibility shows no sentence. Shared
    `readiness.test.js`: two inputs refused at the classification alone, gate off and on; no record held, no finding.
    gee `imageDriveExport.test.js`: a PyEO export over two inputs refused, gate off and on, before any build, folder or
    export.
  - **Witnesses (targeted mutations, each restored).** `wizardStep` default removed: 4 editor cases fail
    (Classification); saved name not kept: 2; `editor.message` hook removed: 6. Shared rule removed: shared 2, gee 2,
    GUI 5; its SRC binding/OPT dependency removed: GUI 5; OPT's SRC sentence restored: 2; selector-only refusal restored:
    1.
  - **Verification (two workers).** GUI: Classification, Regression, PyEO, Time Series, CCDC, Remapping, Masking,
    Stack, Band Math, Change Image, Change Alerts, `sourcesClassifierInputs`, `unselectedClassification`,
    `wizardSectionMarks`, `outputRequirements`, recipe/close/autosave/cache claims, `recipeInput` and translations, 92
    files and 1254 tests. Shared `test/recipe` 1280. gee PyEO and image exports, 5 files and 111 tests. ESLint and
    `git diff --check` are clean. No full GUI suite or browser run.
  - **Slip during witnessing:** a restore script ran a bare `git checkout -q`, which with no paths changes nothing; the
    working tree and index were confirmed unchanged.
  - **Independent review of these corrections (2026-10-23):** no further code findings. The unchanged-editor fixes
    initialize the existing step and preserve the saved name without changing shared dirty tracking; the optional
    message hook preserves the default for other editors. The shared multi-input rule uses the held record, with
    client feedback and dependent-control handling bound to that finding. Independent runs passed 189 GUI tests in
    14 files (editor, PyEO, Regression readiness, Sources, wizard marks and output requirements), 83 shared
    readiness/PyEO tests, and 15 Drive/Workspace export tests. ESLint on the reviewed changed files and
    `git diff --check` passed. The reviewer changed only this verification record. No browser run or full GUI suite;
    Stack recovery and the other separate follow-ups remain unverified by these checks.
- **Latest browser recheck result and editor-policy correction (2026-10-23; user reported).**
  - **Training-data editor:** the user reports the remaining issue is selecting a Provider that samples no nir, seeing
    the combined cause/repair validation, and still being able to Apply. Code confirms `REUSED_RECIPE_EDITOR` is
    `blocksApply: false`, inherited by the missing-features editor; this was intentional in the earlier presentation-only
    policy. **New user requirement:** a confirmed finding on the edited reused data set must hold Apply. Use the
    existing candidate/form blocking mechanism for both Classification and Regression; no second validator. Keep
    choosing another recipe, removal, Cancel and Close for an unchanged item available. A compatible replacement
    clears the finding and enables Apply. Preserve item isolation, and do not turn pending/unavailable evidence into
    a confirmed error. Cover the disabled Apply and direct form submission, repair, an unchanged broken item's Close,
    and a healthy item beside a broken one. This supersedes earlier S2 acceptance that deliberately allowed applying
    a known-broken selection. Other items in this training-editor recheck were not reported as failures.
  - **PyEO multi-input check:** choosing a Classification with two input images now gives the correct validation,
    confirmed by the user. This is evidence for that browser case, not a claim of an independently observed run.
  - **PyEO same-asset versus Stack comparison:** Require drop/Index work for the optical asset directly but remain
    unavailable when the Classification uses a Stack containing a subset of the same asset's bands, including red
    and nir. With Require drop already on, selecting the Stack-based Classification gives the no-alternative NDVI
    error. This matches the traced ASSET/RECIPE_REF asymmetry: recipe inputs are asked for a named ndvi band rather
    than calculating it from raw red/nir. The existing validation matches current execution, so changing only the
    dropdown is insufficient. Next bounded follow-up: reproduce this exact chain, then align shared availability
    and execution so recipe inputs can derive the index from suitable raw bands, preserving existing index output
    units/masks and the provided-index path. Test actual Stack output/mapping changes, not only direct assets or the
    Classification's selected training features. A PyEO layer rendering with Require drop off is expected because
    the optional drop requirement is not executed; with it on, an unavailable index must hold execution.
  - **Scope:** finish the confirmed-finding Apply hold before committing S2. Keep the Stack execution/readiness
    correction as the next separate fix; the other deferred policies and layout work are unchanged. No production
    code or tests changed while recording this feedback.
- **Browser recheck instructions used for that run:**
  1. Classification and Regression: open an existing reused data set, working and broken, and leave it untouched:
     Close, not Apply. Choose another recipe: Apply. Cancel keeps the applied one.
  2. Over a Provider with no input imagery: the recipe field says only "Fix the problem in Provider, or select another
     recipe."; no blue hint. In nested reuse it names the recipe at fault.
  3. PyEO over a radar-feature Classification: SRC explains it; OPT shows Require drop, Index and threshold disabled
     with their values and no extra sentence. All OPT messages say "Require drop".
  4. PyEO: add a second input image to its Classification in that recipe's tab: SRC says so beside Classification, gate
     off or on, OPT's gate disabled; layers and Retrieve held. Remove it again: repaired. Choosing a two-input
     Classification in Sources is refused, Apply held.

- **Editor-policy correction, applied (2026-10-23).** A confirmed finding on the edited reused data set now holds
  Apply. `REUSED_RECIPE_EDITOR` no longer sets `blocksApply: false`, so it - and the missing-features editor built on
  it - holds Apply through the existing candidate/form blocking (`recipeFormPanel.jsx` `blocked()`, `inputFeedback`),
  which `Form.Panel.apply()` refuses on every submission path, Enter and form submission included. Close of an
  unchanged item is unaffected: it is offered whenever the form is clean, valid or not. Pending or unreadable evidence
  holds nothing, as `OutputCandidate` refuses only confirmed reads; isolation is unchanged, the candidate being the
  edited data set alone. This supersedes S2's earlier explanation-only acceptance for these editors. No validator,
  loader, cache or operation was added; shared dirty tracking is unchanged.
  - **Regressions** (`reusedTrainingDataEditor.test.jsx`, now 32, both types): in a healthy data set's editor,
    choosing a Provider sampling no nir, or one without input imagery, shows the one explanation (cause and repair,
    or repair), disables Apply, and a submitted form saves nothing; repairing that Provider upstream clears it and
    Apply saves it; a compatible replacement saves; Cancel keeps the applied recipe. Existing cases kept: an unchanged
    broken item closes; a broken item's compatible replacement saves; isolation; nested origin. The name and
    delayed-answer cases now choose a compatible spare recipe instead of the broken Provider.
  - **Witnesses.** With `blocksApply: false` restored, the six refusal/recovery cases fail (three per type). With
    `Form.Panel.apply()`'s invalid guard removed and the binding blocking, the four submitted-form cases fail.
  - **Verification (two workers):** Classification and Regression suites, `wizardSectionMarks`, `outputRequirements`,
    `unselectedClassification`, `widget/form` and `recipeInput`, 15 files and 214 tests. ESLint on the changed files
    and `git diff --check` are clean. No shared code changed, so nothing broader was run; no full GUI suite or browser
    run. The PyEO multi-input browser result above stands; the Stack Require drop derivation, empty-Provider
    refinement, Stack layout, S3/S4 and Sources sizing remain untouched.
  - **Independent review (2026-10-23):** no further code findings. Both editor declarations now use the existing
    candidate/form blocking; the form's invalid guard covers direct submission and clean Close remains available.
    Independent editor, feedback, Regression readiness and form runs passed 87 tests in seven files. ESLint on the
    binding and editor test, and `git diff --check`, passed. The reviewer changed only this roadmap; no production
    code or tests, no full GUI suite or browser run.
  - **Browser result (2026-10-23):** the user reports "Classification verified - all good" for the latest Apply-hold
    recheck. Record Classification as passed; Regression was not explicitly included in that confirmation. The PyEO
    Stack Require drop issue remains separate and unresolved by this result.
  - **Browser recheck (pending):** Classification and Regression, in a working data set's editor: choose a Provider
    sampling no nir - the cause and repair show, Apply is disabled, Enter applies nothing; choose one without input
    imagery - likewise; choose a working recipe - Apply saves it; Cancel keeps the applied one. Open a broken data set
    unchanged: Close works. Mounted tests cover upstream repair; recipe-modal navigation remains a separate follow-up.

- **Require drop over a Stack input: index derivation, applied (2026-10-23; separate execution/readiness fix).**
  - **Cause, confirmed in code and tests.** Readiness (`baselineSuppliesIndex`) and execution agreed, but only for
    assets: an `ASSET` input's index was calculated of its spectral bands, while a `RECIPE_REF` input had to output a
    band literally named after the index, which execution then selected (`imageFactory(input, {selection: [index]})`).
    A Stack exposing red and nir but no ndvi was therefore refused - in OPT as "no alternative", by readiness, and it
    would have failed in execution - while the same asset used directly was accepted. With the old rule restored,
    the Stack regressions below fail and the direct-asset controls pass. Not reproduced in a browser by the agent.
  - **Derivation contract.** One shared decision, `baselineIndexSource(baseline, index)`
    (`lib/js/shared/src/recipe/type/pyeoAlerts.js`), over the input's type and output band names: `PROVIDED` where a
    recipe outputs a band of the index's name; otherwise `CALCULATED` where it outputs every band
    `REQUIRED_BANDS_BY_INDEX` names (an asset always takes this path, as before); `null` where neither; `undefined`
    while the bands are not known, which refuses nothing. `baselineSuppliesIndex` (readiness, OPT's choices and its
    candidates, Sources' set-up proposal) and execution's `baselineGateIndex$` (`lib/js/ee/src/pyeo/baselineGateIndex.js`)
    both follow it. A recipe's names are those its declaration outputs - a Stack's mapping (`stackOutputNames`) - not
    the asset beneath or the Classification's selected training bands.
  - **Execution.** An asset's index is calculated of the whole asset as before. A recipe providing the index is
    selected as before, already stored at ×10000 int16, never scaled again. A recipe otherwise is asked for only the
    required bands (`selection`), and the index calculated with the existing `calculateIndex` - which divides by
    `OPTICAL_STORED_PER_UNIT` - then ×`INDEX_SCALE` (10000) and int16, as monitoring stores its indexes, so the
    threshold scaling is unchanged. A masked input pixel stays masked; the Stack's own footprint is that of the image
    it builds. Built once, outside the monitoring-scene map, and not at all with Require drop off. Classifier inputs,
    training, normalisation and the single-input rule are unchanged.
  - **Costs.** Require drop on over a recipe input adds one `getBands$` of that recipe (a Stack's reads its mapping
    alone, without Earth Engine) and selects only the required bands. Readiness reads nothing new: the input's
    description it already acquires names the bands. Off, nothing.
  - **Regressions.** Shared `readiness.test.js` over Asset -> Stack -> Classification -> PyEO, the Classification
    training on red alone: NDVI, NDMI and NBR run over the Stack's raw bands; a provided ndvi band runs; red without
    nir, or nir renamed `b8`, refused with no alternative; asset not yet observed, nothing refused; observation
    failed, nothing of the gate; Require drop off, ready. gee `test/ee/pyeo/baselineGateIndex.test.js`: the real index
    definitions over a numeric image double - NDVI [7142, 4418, 0, masked], NDMI [4634, 886, -4634, 5384], NBR
    [5348, 0, -5348, 7307] of Stack outputs, bands read by the Stack's output names, a provided ndvi band passed through
    unscaled, a renamed band refused, the direct asset unchanged. `pyeoIndexGate.test.js`: the Stack asked for its
    required bands, monitoring asked for the index, one calculation, nothing read with Require drop off.
    `pyeoGateReadiness.test.js`: a Drive export over a Stack without nir refused (`UNAVAILABLE_GATE_INDEX`) before
    anything is built, then started once nir is restored. GUI `options.test.jsx` over the real runtime: Require drop
    on NDVI offered and saved over a Stack of red and nir; NBR offered with swir2; removing nir from the Stack says to
    turn it off, restoring it recovers with choices kept; a renamed nir keeps On disabled - only the Stack changing,
    no Sources reopened and no UI copy written.
  - **Witness.** With `baselineIndexSource` judging recipe inputs as before (their own index band only): shared 3,
    gee 6 and GUI 3 of these regressions fail; the asset, provided-index, renamed, pending/unavailable and Require drop
    off controls pass.
  - **Verification (two workers).** Shared `test/recipe` 1289. gee: baseline index, PyEO AOI and gate, the PyEO,
    Drive, Workspace and asset export tests and the classification numeric tests, 181. GUI: PyEO, Stack,
    `sourcesClassifierInputs` and `outputRequirements`, 15 files and 181 tests. ESLint and `git diff --check` clean.
    No full GUI suite, live Earth Engine or browser run: the numeric double establishes the arithmetic and scaling of
    the code path, not Earth Engine's own evaluation.
  - **Independent review (2026-10-24):** no code findings. The shared source decision preserves direct-asset
    calculation and provided recipe indexes, while the new recipe calculation selects the required output bands.
    The extra band read and image construction use the existing execution scope's cached recipe revision; no new
    loader/cache is introduced. Independent checks passed 92 shared readiness/PyEO tests, 37 gee numeric,
    orchestration, AOI and export-guard tests, and 181 GUI tests in 15 files. ESLint on the reviewed sources/tests
    and `git diff --check` passed. Only this roadmap was changed by the reviewer. No live Earth Engine or browser
    run; an actual PyEO preview and Stack remove/restore recovery remain to be checked.
  - **Browser result (2026-10-24; user reported):** in response to the focused Stack checklist, the user says
    "This works exactly like it should". Record NDVI Require drop with an actual PyEO preview, removing nir giving
    the index error and holding preview, then restoring nir clearing it and rendering again with NDVI/threshold
    preserved, as passed. The agent did not run the browser; no exact build, asset ids or numeric comparisons were
    supplied. This closes that browser check, not the separate deferred work or a controlled numerical EE comparison.
  - **Browser check instructions:** with the same optical asset directly and through a Stack mapping red and nir (no
    ndvi), the Classification training on red: turn Require drop on with NDVI in OPT and Apply, and obtain an actual
    PyEO preview for both. In the Stack's tab remove nir: OPT says to turn Require drop off and the preview is held;
    restore nir: OPT recovers with NDVI and its threshold kept, and the preview renders again.

- **Combined browser recheck instructions used for that run:**
  1. Classification and Regression over a Provider with no input imagery: TRN, the data set and its editor say what is
     wrong, with "Fix the problem in Provider, or select another recipe." and no Open action. A working recipe clears
     it; Cancel keeps the applied one; a healthy second data set's editor shows nothing.
  2. A new Classification and a new Regression: TRN is not red; its panel shows the guidance; Retrieve is held.
     Collecting a point (Classification) or adding a data set clears it.
  3. PyEO over a Classification switched to radar imagery, gate on NDVI: SRC explains it, OPT is unmarked. In OPT the
     gate, index and threshold are shown disabled with the SRC guidance, with no red index error, and the detection
     count is editable. Restoring optical imagery re-enables the gate with its choices unchanged.
  4. PyEO over imagery that feeds the classifier but provides no gate index (visible bands only), gate on: OPT says
     to turn the gate off, SRC is unmarked; Off and Apply clear it. Over red/NIR imagery gated on NBR, choosing NDVI
     repairs it.
  5. With OPT open (gate off) over visible-only imagery, change the Classification's input to red/NIR in its own tab
     and return without reopening Sources: On is enabled and takes NDVI. Gated on NDVI, change it to NIR/SWIR: NBR is
     offered and repairs it.

  Time Series/CCDC Sources and the Retrieve warning are unchanged by these corrections.

**S3: One selected-Classification validity contract (implemented, independently reviewed and focused browser rechecks passed through 2026-10-25).**

- **Policy.** A Classification a Time Series' or CCDC's Sources select is part of the configured analysis. It is
  declared once, as the analysis prerequisites of both types (`selectedClassificationPrerequisites`,
  `source/collectionSources.js`; see "Analysis prerequisites" under Operation scope): its `CLASSIFIER` readiness and
  the collection's images carrying what its classifier reads (`UNSUPPLIED_CLASSIFIER_INPUTS`). Every operation and named
  map product of either type is held to them, whatever bands are requested or fitted: Time Series `IMAGE_OUTPUT`
  (count) and `PIXEL_OBSERVATIONS`; CCDC `IMAGE_OUTPUT` (segments), `PIXEL_OBSERVATIONS`, `PIXEL_SEGMENTS` and its
  `COUNT` map product. The Classification's own requirements decide it
  (training data, reused recipes' input imagery and sampled features, input bands); its image is not described. No
  selection needs nothing; a supplied decision tree needs no training. This deliberately replaces the native-band
  bypass: a native request is now held while the selected Classification cannot be trained, until it is repaired or
  deselected. It is a policy, not an execution need: native execution still reads nothing of the Classification
  (`collection.js`), while readiness acquires the evidence training would read - the Classification's input imagery,
  observed even for a native request. Phenology is unchanged (`classifiedOutputNeed` for its classified band only).
- **Inventory and inheritance.** Server routes guarded: pixel observations (`loadObservations.js`), CCDC pixel
  segments (`loadSegments.js`), Time Series download planning/chunks (`task/export/timeSeries.js`), CCDC Segments asset
  export (`ccdcAssetExport.js`), CCDC Drive/Workspace/asset image exports (`imageOutput.js`). GUI: both charts and
  their action (`CHART_OPERATIONS`), both Retrieve panels, canonical-output previews and SRC. CCDC's named count
  preview remains a confirmed gap (below). Downstream consumers inherit through
  their existing need of a CCDC's image: CCDC Slice (image and segment chart), a Change Alerts' segment chart over a
  CCDC, a Masking of a CCDC. A Change Alerts' own image only references its source and is unaffected. Pixel AOI
  projection is unchanged (`recipeForOperation`, `atPixel`); referenced recipes keep their own AOIs. Previously
  unguarded server routes - preview tiles and other map-layer requests - remain unguarded, as before; deferred.
- **Removed.** `CLASSIFIED_COLLECTION` (operation), `CLASSIFIED_COLLECTION_NEEDS`, `requestStages`, the extra server
  stage settling it without the AOI (`requireRequestStages$`, `requireCcdcImageStages$`, `withoutAoi`, the `effective`
  bands parameter), `requestedBandAvailability`, `BandOperationWatch`, the charts' band gates/watches and
  "classified band withheld" message, Time Series Retrieve's band gate and selection watch, CCDC Retrieve's own
  `requestGate`/watch/hold (its export is held by its image output, judged at submission), and the translations
  `process.chartPixel.classifiedBandWithheld` and `process.retrieve.form.bands.classifiedWithheld`. No panel-specific
  SRC validator replaces them.
- **Kept.** Requested-output capability checks (`requireProvidedOutputs$`, `requireCcdcRequestedOutputs$`, coded 400
  `UNSUPPORTED_CLASSIFIED_OUTPUT`), the configured classified-output requirement (CCDC breakpoints, Phenology band),
  `requestedMeasures`/`fittedMeasures`, Time Series Retrieve's current-state offer checks, legacy single-indicator
  normalisation and reconciliation, the draft/save agreement gate, evidence handling, chart lifecycle
  (`pixelChartUpdate`: a finding closes and cancels, pending/unavailable clears and waits).
- **GUI presentation.** Time Series now declares `classificationReferenceFeedback`, as CCDC does: an upstream training
  problem is named beside Classification in SRC and marks SRC; editing stays possible (presentation, Apply not held).
  `sectionOfFindings` (`operationReadiness.js`) also locates an upstream finding through a declaration naming that
  edge's role, so chart and Time Series Retrieve holds name the same section SRC marks. A supported classified band or
  indicator stays selected through the failure and is charted or submitted after repair.
- **Error precedence (changed intentionally).** The configuration is judged first, the Classification's training
  included; requested-output capability second. A training failure therefore now precedes the coded 400 for an
  unprovided requested output; the 400 is unchanged where the configured source is otherwise valid. The former
  capability-before-additional-training order no longer holds.
- **Tests.** Shared `classifiedOutputTraining.test.js` (every operation, native and classified, CCDC native and
  classified breakpoints, each training finding, decision trees, pending/unavailable evidence, repair, no selection,
  Phenology's native bypass kept); `referencedSegments.test.js` (CCDC Slice/Change Alerts segments inheriting the
  policy, waiting for the Classification's input); `operationReadiness.test.js` (fixtures now trainable; what is
  observed restated). gee `loadObservations`, `loadSegmentsReadiness`, Time Series download, CCDC asset, Drive,
  Workspace and image-file exports: native and classified requests refused before product computation, building or
  training; one operation judged; precedence; no selection and decision tree; the existing collection test still
  shows native execution reads nothing of the Classification. GUI: `selectedClassificationChart.test.jsx` (renamed from
  `classifiedBandChart.test.jsx`: close and cancel on a finding, reopen after repair, save or deselection, pending and
  unavailable without closing, operations watched); CCDC `classifiedBreakpointChart`; CCDC `classificationFeedback`;
  new `timeSeries/classificationFeedback.test.jsx` (SRC and the operations naming the same problem); both Retrieve
  readiness tests (native and classified held by Apply and direct submission, choices surviving repair, last-moment
  loss of points, pending/unavailable without a finding). Fixtures now needing a trainable Classification, because a
  Time Series or CCDC selecting one requires it: `unselectedClassification`, `resolvedClassificationBands`,
  `collectionClassifierRequirements`, `pixelObservationsAvailability`, `sourceRuntime` (one case also answering the
  input's observation), the export/observation/segment gee fixtures. `classifiedOutputSources.test.jsx` toggles Less
  before More, since CCDC Sources open on More while a Classification is selected (an S2 behaviour this file had not
  been run against). `selectedClassificationChart.test.jsx` now forgets save states after each test; a save leaked
  between tests before.
- **Witnesses.** With every S3 production file restored from `HEAD` and the new tests kept: shared 60 of 132, gee 44 of
  276 and GUI 38 of 162 fail; the three GUI files still passing are fixture-only updates. Targeted mutations: removing
  Time Series' `classificationReferenceFeedback` fails 5; removing the upstream branch of `sectionOfFindings` fails 6.
- **Verification (two workers).** Shared `test/recipe` 1330. gee unit tests (all, excluding integration) 107 files and
  1424 tests. GUI `src/app/home/body/process` plus translations, 203 files and 3021 tests, every top-level recipe test
  included. ESLint and `git diff --check` clean. No full GUI suite, live Earth Engine or browser run.
- **Independent review (2026-10-24; correction needed).** The base-operation declarations and removal of band-specific
  training holds fit the chosen policy. Independent focused checks passed 132 shared tests, 276 gee tests and 68 GUI
  tests in six files. A server-boundary regression remains: `ccdcAssetExport.js` always builds CCDC segments, and the
  Time Series download job always builds its collection, but both now obtain training readiness solely from the
  request's stated recipe type. In fully mocked probes, changing an otherwise identical root to `MOSAIC`, with a
  selected point-free Random Forest and requested `probability_1`, bypassed `NO_TRAINING_DATA`. The CCDC probe reached
  both the segments builder and exporter; the Time Series chunk request also completed instead of refusing. The
  existing non-CCDC-root regression uses `TIME_SERIES`, which now declares the same training need and therefore hides
  this case. These specialised boundaries must judge the computation they actually build, or explicitly reject
  incompatible root types under an agreed endpoint contract. Add regressions with a type that does not declare
  `CLASSIFIER`; keep the refusal before product work. No production code was changed by the reviewer, both temporary
  probes were removed, and no external Earth Engine work or exports were started. Browser verification remains pending.
- **Correction, applied (2026-10-24).** The two specialised boundaries now judge the computation they build, whatever
  type the request states: the CCDC Segments export (`ccdcAssetExport.js`) judges the recipe as a CCDC - image output
  readiness, then the measures named - and the Time Series download (`task/export/timeSeries.js`, tile ids, date ranges
  and chunk export alike) as a Time Series. Endpoint compatibility is unchanged: no stated type is rejected for itself,
  and the builders still receive the recipe as submitted. No band-stage machinery returns. **Regressions:**
  `ccdcAssetExport.test.js` - a root stated as `MOSAIC` (beside the existing `TIME_SERIES` case) over a point-free
  Classification refused with `NO_TRAINING_DATA` before the segments are built or submitted, and exported as before
  once the Classification can be trained; `timeSeries.test.js` - a root stated as `MOSAIC` refused at its tile ids, date
  ranges and chunk export before anything is tiled, checked or built, and planned and exported once trainable.
  **Witness:** judging the stated type again fails both `MOSAIC` refusals (the `TIME_SERIES` case still passes, as the
  review found). **Checks:** gee unit tests 1428 (107 files); ESLint and `git diff --check` clean. Shared and GUI code
  unchanged since their recorded runs.
  **Independent recheck:** no remaining code findings. Both readiness checks project only the root type to the
  computation the endpoint builds, retain its id/model/AOI, and leave the submitted recipe passed to the builders
  unchanged. All three Time Series entry points use that check. The two affected backend suites passed 75 of 75;
  ESLint on both routes and their tests and `git diff --check` passed. No production changes by the reviewer; the
  browser checklist remains pending.
- **Browser feedback (2026-10-24; user reported).** Both Retrieve panels stayed open after the selected Classification
  became untrainable. Time Series said "The settings under SRC need attention. Open SRC to see why." CCDC said "The
  source selected under SRC cannot be used. Open SRC to see why." and offered Refresh. The user reports the rest of
  the focused checks behaved as expected; record those as passed, without an agent-run browser session or exact build
  evidence. **Decided correction (applied; see the next entry):** a confirmed configuration finding closes an open Retrieve,
  as it closes a chart. Retrieve/chart actions stay disabled and affected layers withheld; SRC owns the repair
  explanation. No configuration-error message or Refresh action should keep Retrieve open. Implement this through
  the shared operation lifecycle for both Retrieve paths, using existing readiness, rather than another SRC validator.
  Pending/unavailable evidence and unacknowledged saves still hold submission without establishing invalidity; local
  selection/destination errors remain in Retrieve. Keep current-state submission checks and server guards for the race
  before closure. Preserve saved retrieval settings and normal close semantics; do not autosave unsubmitted edits or
  reopen automatically after repair. **Regressions needed:** both panels close on upstream invalidity, submit nothing
  even in the same event batch, and become available to reopen after repair; pending/unavailable evidence does not
  close them, and local form errors remain editable. **Targeted browser recheck:** open Retrieve in each working
  consumer, remove the Classification's points and save, confirm automatic closure and disabled actions, then restore
  the original working points and save: Retrieve can be reopened with its saved settings. The other passed browser
  checks need no repeat for this correction.
  **Design checkpoint:** when an error leads to blue information text in a panel, stop and analyze whether the panel
  should still be open, where the cause is repairable and which owner should explain it. Simplify the lifecycle and
  remove redundant explanatory states rather than treating another message as the default repair. Neutral checking,
  setup and genuine recovery information remain appropriate; see `behavior-contracts.md`.
- **Retrieve closure correction, applied (2026-10-24).** One rule for both Retrieve paths, in the shared panel
  (`mosaic/panels/retrieve/retrievePanel.jsx`): an open Retrieve closes, through its activatable's normal
  `deactivate`, while the assessment that disables the toolbar's Retrieve action (`retrieveAvailability`,
  `operationAvailability.js`) withdraws it - a source found missing or unsuitable, or a configuration found unmet,
  the selected Classification's training among them. The panel closes only for what disables its action, so it cannot
  reopen into a closure. `retrieveAvailability` now answers with `requestGate`'s `withdraw`, and `requestGateOf`
  (`sourceRequirements.js`) puts a withdrawing reason before one still to be checked or unavailable: a finding is not
  hidden by another requirement's missing evidence. Checking, unavailable or expired evidence and unacknowledged saves
  hold the submission with the panel open; an empty selection or incomplete destination stays repairable in Retrieve.
  Closing saves nothing edited since the last submission; settings last submitted are kept, and repair re-enables the
  action without reopening it. Current-state submission checks and the server guards are unchanged.
  **Lifecycle defect found by the real-lifecycle tests:** Time Series Retrieve's image-output watch was taken by its
  outer component, which is mounted whenever the toolbar is, so it was never let go when the panel closed; the panel now
  takes it for as long as it is open (`watchRequest`, replacing the unused `onRequestSelection`). **Removed:** the
  panel's `SOURCE_MISSING`, `SOURCE_UNSUITABLE` and `CONFIGURATION_UNMET` messages with their Refresh for a confirmed
  configuration problem; the translations `process.retrieve.source.missing` and `process.retrieve.source.unsuitable`;
  `onRequestSelection`/`notifyRequestSelection`; `sourceRequirementGate` (its one test caller uses `requestGate`).
  **Kept:** Time Series' `process.retrieve.source.configurationUnmet` hold, for an image-output readiness finding the
  action is not withdrawn for (an AOI or source reference, say), with the evidence messages and their Refresh.
  **Observed then, corrected in the next entry:** a submission Retrieve refused was still committed and closed the
  panel. **Regressions:** both
  `retrieveTrainingReadiness.test.jsx` files now mount the real activation, toolbar Retrieve action
  (`RetrieveButton`), SRC section mark (`withSourceProblems`, the watch the toolbar keeps) and panel instead of an
  always-active activatable: an open Retrieve closes over a classified and a native selection once the Classification
  stores no points, its action disabled, SRC marked and nothing submitted; repair re-enables without reopening, and the
  reopened panel submits what was last submitted, not an edit made before closing; removal and submission in one event
  batch submit nothing and leave the project's destination; Time Series' unusable classifier inputs and CCDC's
  classified breakpoint band close it too; pending and unobservable imagery and an unacknowledged save hold it open;
  an empty selection and an unnamed workspace folder or asset keep it open and repairable; closing lets go of the
  panel's watch, leaving SRC's mark watching, and repair re-enables without reading the imagery again. Assertions that
  expected these panels to stay open with a configuration message are replaced; scenarios that opened the panel over
  an already-broken Classification now find the action disabled. `operationAvailability.test.js`: a finding withdraws
  Retrieve although another requirement is unchecked. **Witnesses:** with the pre-correction production code and the
  new tests kept, 10 of 36 Retrieve tests fail - exactly the closure, repair-reopen and watch-release cases on both
  paths; restoring only Time Series' outer-component watch fails its watch-release case; the old first-reason order
  fails the priority case. **Verification (two workers):** GUI `src/app/home/body/process` plus translations, 203
  files and 3028 tests; ESLint on the changed files and `git diff --check` clean. No full GUI suite or browser run.
  **Browser recheck (pending):** in a Time Series and a CCDC whose Classification works, open Retrieve; in the
  Classification's tab remove its points and save: Retrieve closes by itself, its button is disabled and SRC is marked.
  Restore the points and save: the button is enabled, the panel stays closed, and opening it shows the settings last
  submitted.
- **Independent closure review (2026-10-25; one contract correction still needed).** The common withdrawal check,
  withdrawing-reason priority and panel-scoped Time Series watch match the intended confirmed-finding lifecycle.
  Independent focused GUI verification passed 223 tests in ten files, covering both Retrieve paths, the shared
  destination and Masking panels, output decisions, source requirements, gate priority, CCDC Slice and chart lifecycle.
  A refused keyboard submission remains a contract gap, although its underlying form behavior predates this slice.
  Temporary mounted probes on both paths kept imagery pending, then submitted the form: no task was sent, but both
  panels closed. The Time Series probe also changed the draft folder from `downloads/series` to
  `downloads/unsubmitted`; the refused submit wrote that edit to `ui.retrieve.workspacePath`. `RecipeFormPanel`
  commits action-form values before the Retrieve guard runs, and `Form.Panel` then treats the refusal as a completed
  Apply. Existing pending tests click disabled Apply, so they do not exercise keyboard submission. **Required:**
  reject before committing form values and preserve the open panel/draft for a non-withdrawing hold; an accepted
  submission follows the normal commit/close path. Add real form-submit regressions for both paths, checking task,
  project destination, saved UI values and panel state. Keep unrelated form behavior stable and retain current-state
  and server guards. A separate malformed-AOI probe did close and disable Retrieve correctly; no additional finding
  is established by that case. The probes were removed; the reviewer changed no production code. No browser or
  external-service work was performed. The confirmed-finding closure/reopen browser recheck remains pending.
- **Refused submission correction, applied (2026-10-25).** For the finding above, acceptance is now decided at the form's single submission point, before anything is committed or closed: `Form.Panel`
  (`widget/form/panel.jsx`) takes an optional `accepts(values)`, which `RecipeFormPanel` passes through; refused, nothing
  is applied and the panel stays open as it is, its edits still in the form. Retrieve's `accepts`
  (`retrievePanel.jsx`) refuses whatever disables its Apply (`holdsSubmission`: loading, destination check or
  reconciliation, its output decision, pending or held selections) and, from the session as it now stands, its owner's
  `requestGate` or the export decision (`retrieveDecision`); the hold check formerly inside `retrieve()` moved there,
  and the submission itself still decides again before submitting. Forms passing no `accepts` are unchanged.
  **Regressions:** both `retrieveTrainingReadiness.test.jsx` files submit the form from the keyboard
  (`requestSubmit`, what Enter in a field does) while the Classification's imagery is observed, after editing the
  folder (Time Series) or asset (CCDC): the panel stays open, `ui.retrieve` keeps the last submitted value, no task is
  submitted and the project is unchanged; once observed, the same submission submits the edited value and saves it.
  Time Series' two refused race cases now also stay open. `widget/form/panel.test.jsx`: a submission its owner does not
  accept applies nothing and stays open; one it accepts applies and closes. **Witness:** with `Form.Panel`'s check
  removed and the former hold check restored in `retrieve()` (the pre-correction behaviour), 5 of 51 fail: both
  keyboard regressions, the two Time Series race cases and the unit case. **Verification (two workers):** GUI
  `src/app/home/body/process`, `src/widget/form`, `src/app/home/user` (other action forms) and translations, 216 files
  and 3177 tests; ESLint on the changed files and `git diff --check` clean. No full GUI suite or browser run.
  **Independent recheck (2026-10-25):** no remaining code findings. The optional acceptance hook runs before the
  action-form commit, confirmation and close; Retrieve shares its rendered hold checks and also judges the submitted
  values from current state. Existing forms without the hook retain their previous path. Independent verification
  passed 266 tests in 17 files: both Retrieve readiness suites, the shared destination and Masking panels, all form
  widget tests and the user action-form tests. ESLint on the reviewed sources/tests and `git diff --check` passed.
  Only this roadmap was changed by the reviewer; no production changes or browser run.
  **Browser recheck (pending):** with Retrieve open and the Classification's imagery still loading, edit the folder or
  asset and press Enter in a field: nothing starts, the panel stays open with the edit, and closing and reopening shows
  the previous value.
- **Further browser feedback and independent trace (2026-10-25; CCDC count-preview correction pending).** The user
  reports the first focused recheck passed: Retrieve closes on invalidation, stays closed on repair and reopens with
  the previously saved settings. The second, timing-dependent keyboard/pending check was too complicated and was not
  attempted. Keep it untested in the browser; automated coverage remains passed, and no repeat of that timing exercise
  is requested now. Outside the script, opening a CCDC whose selected Classification has no training data produced
  "Failed to load layer / No valid training data were found." This is a configuration fault that should hold preview
  and be explained in SRC before a new layer is requested.
  **Confirmed bypass:** CCDC defaults its layer to the named `COUNT` map product (`ccdc/bands.js`).
  `recipeOutput.js` intentionally describes a map product with no readiness, and `recipeImageLayer.jsx` asks the source
  gate for the product name `COUNT`; the Classification's needs and findings apply to `IMAGE_OUTPUT`, so they do not
  hold that request. In a temporary probe using the real GUI registry, store and runtime, a fully held point-free
  Classification yielded `SOURCE_UNSUITABLE` for the CCDC's image gate, but a null count gate, null count readiness and
  an allowed preview. Both native breakpoints and `ndvi, probability_1` failed the expected hold; a trainable control
  passed. This is not limited to a race while records load. Execution's count branch still requests fitted breakpoint
  measures (`timeSeries/ccdc.js`), so classified breakpoints can train and reach Earth Engine's empty-training failure.
  The exact live notification was not independently reproduced against Earth Engine.
  **Required shared correction (user clarified):** all analysis entry points must honor the common prerequisites of
  the configured recipe, including layers, named map products, charts and Retrieve. A broken selected Classification
  makes the Time Series/CCDC analysis invalid for all of them under S3. Use existing shared readiness as the authority;
  operations may add their own requirements. Do not add a CCDC count-specific validator, per-visualization checks or a
  cached/stored validity flag. The count preview is a regression case exposing the missing common gate. Keep product
  descriptions independent of authorization and of the canonical image catalogue; sharing analysis prerequisites
  does not require every map product to build or describe the canonical image. Add real layer-request regressions
  for opening an already-invalid recipe, native/classified breakpoints, lazy or pending evidence, repair and
  no-Classification/decision-tree controls, and check other named-product entry points against the same shared
  contract. Broader server preview gating remains separate deferred work; preserve operation-specific semantics
  beyond the common analysis prerequisites. The
  temporary probe was removed; no production code or external services were changed by the reviewer.
  **Next browser recheck after the correction:** open the same already-broken CCDC: SRC explains the Classification,
  no new preview is requested and no layer-error notification appears; restore the original working points and confirm
  an actual count preview returns. The other passed checks need no repeat.
- **Count-preview correction, applied (2026-10-25).** One shared contract replaces the per-operation copies of the
  selected-Classification policy. `output/readiness.js` adds `analysisPrerequisites`, applied by `executionNeed` and
  `configurationFindings` to every operation a type declares and every named map product (`declaresOperation` now counts
  those); `validateReadinessDeclarations` refuses an operation naming a prerequisite role and a prerequisite requirement
  scoped to operations; `judgesMapProduct` says whether a product's readiness can find anything. `collectionSources.js`
  declares `selectedClassificationPrerequisites` (the `CLASSIFIER` need and `collectionClassifierRequirement`, now
  operation-free); Time Series and CCDC declare it once instead of `[CLASSIFICATION_SOURCE]: CLASSIFIER` in each
  operation and the requirement's operation list; Phenology scopes the requirement to its `IMAGE_OUTPUT` as before. CCDC
  adds `COUNT` to its breakpoint classified-output requirement. In the GUI, `mapProductGate` (`operationAvailability.js`)
  reads a judged product's readiness with the existing `readOperationReadiness` and the shared operation gate, and the
  generic `recipeImageLayer.jsx` holds the layer on it beside `requestGate` and watches that operation while it shows the
  product (`watchOperations`): a finding withholds or removes the layer, what is pending or unavailable draws nothing new
  and finds nothing, and SRC explains through the existing output-requirement marks. No type, product or recipe name is
  tested in the layer, and no validator, cache or stored flag is added. **Acquisition cost:** for CCDC's count, one
  readiness read of the Classification and its input imagery's observation - what training reads - shared with the
  toolbar's and other consumers' reads; the CCDC's own collection is never described for it, and products of other types
  read nothing new. **Unchanged:** charts, Retrieve and server guards judge the same needs as before, the prerequisites
  folded in; pixel operations keep their point AOI and referenced recipes their own; server preview gating stays
  deferred. **Regressions:** `ccdc/countLayer.test.jsx` mounts the real layer, store, runtime and SRC marks: an
  already-invalid saved CCDC over native and classified breakpoint bands requests no preview, constructs no layer and
  raises no notification while SRC is marked; a drawn count is removed once the points are removed; repair draws it;
  pending or unobservable imagery and a Classification record not yet loaded draw nothing and find nothing (`wait` or
  `SOURCE_UNAVAILABLE`), a record arriving untrainable then being found; controls - a trainable Classification, no
  Classification with native breakpoints, a decision tree without points - draw; judging reads only the Classification's
  input asset, never the CCDC's description. Shared `analysisPrerequisites.test.js`: the count can run once what
  training reads is observed while the CCDC image still needs its own observation; it needs only that observation;
  CCDC's count is judged and the three other named products are not; the declaration's validation.
  `classifiedOutputTraining.test.js` adds `COUNT` to its per-operation campaign (each training finding, decision tree,
  pending evidence, repair, unprovided classified breakpoint, no selection). **Witnesses:** the pre-correction layer
  (`recipeImageLayer.jsx` from `HEAD`) fails 8 of 12 layer tests; not applying prerequisites to named products fails
  19 of 139 shared tests and 8 of 12 layer tests. **Verification (two workers):** shared `test/recipe` 1362; gee unit
  tests 1428 (107 files); GUI `src/app/home/body/process`, `src/app/home/map`, `src/widget/form` and translations, 235
  files and 3461 tests, including the accepted Retrieve closure and refused-submission tests; ESLint on the changed
  files and `git diff --check` clean. No full GUI suite or browser run.
  **Browser recheck (pending):** open the same broken CCDC: SRC explains it and no layer-error notification appears;
  restore its working points: an actual count preview renders.
- **Caller consolidation over the shared prerequisites, applied (2026-10-25).** Each analysis entry point was checked
  for readiness checks, watches and configuration messages the shared verdict now covers. **Became shared:** Time
  Series Retrieve is held as any Retrieve is. `withRetrieveOutput` reads and watches the image output for every panel
  (its `isImageOutput` option is gone), and a request about something other than the output's bands is decided by the
  same read without a band selection (`outputDecision`, `retrieveOutput.js`): readiness - the analysis prerequisites
  among it - validity, listing, asset and save authority, judged at render and, through `accepts`, from the current
  session at submission. Its pending and unestablished states are said as an export's are (checking; the shared
  unavailable message with Refresh). `readRetrieveOutput` now also answers `recordOf`, the closure records the held
  answer read, from which Time Series offers a Classification the session does not hold. **Removed:** Time Series'
  separate base-readiness gate (`pixelOperationsAvailability` over `IMAGE_OUTPUT` and its `holdOf` messages), its
  `IMAGE_OUTPUT` operation watch and `readOperationReadiness` read for offers, the panel's `watchRequest` hook that
  carried that watch, and the translations `process.retrieve.source.configurationUnmet` and
  `process.retrieve.form.bands.uncheckable`; per-operation copies of the selected-Classification need (previous entry).
  The request path keeps no initial loading view and no output-dependent destination control: its choices are its own.
  **Remains specific, and why:** Time Series' indicator offers and their hold (`requestGate`, `offerHoldOf`, the
  draft-pending offer), which concern the request rather than the output; charts' pixel operations and band offers
  (`pixelOperationsAvailability`, `CHART_OPERATIONS`), already the shared verdict over operations with the point AOI;
  CCDC Slice's and Change Alerts' segment-capability gate (`pixelChartAvailability`, `watchEvidence$`), a requirement of
  the selected source rather than an analysis prerequisite, beside the shared operation verdict both already close on;
  their chart lifecycle stays for S6. Layers judge the image by its read and named products by `mapProductGate`. The
  toolbar's action and the GUI requirement declarations (`collectionClassifierRequirements`,
  `classificationReferenceFeedback`) stay: they present the shared findings where they are repaired. Not in scope:
  visualization-reconciliation ownership, pixel-projection consolidation, reference-settings synchronization (S5).
  **Regressions:** Time Series Retrieve's watch tests now expect only the output question every Retrieve watches,
  released on closing; an unobservable input shows the shared unavailable message with Refresh on both paths; a
  Classification the session does not hold is offered and submitted from the shared read's records
  (`retrieveTrainingReadiness.test.jsx`); `retrieveDestinationCompatibility.test.jsx` replaces the case that pinned a
  request reading nothing with one holding it while the output is read and submitting it once it can run;
  `retrieveClassifiedOutputs.test.jsx` and `unselectedClassification.test.jsx` pass unchanged over the shared read.
  **Witness:** taking offers' records from nothing again fails the not-held-Classification case. **Verification (two
  workers):** GUI `src/app/home/body/process`, `src/app/home/map`, `src/widget/form` and translations, 235 files and
  3462 tests; ESLint on the changed files and `git diff --check` clean. No full GUI suite or browser run.
- **Independent prerequisite/consolidation review (2026-10-25; one layer-precedence correction needed).** The shared
  analysis declaration, named-product traversal and removal of Time Series Retrieve's extra base gate match the
  requested design. Independent focused verification passed 164 shared tests, 280 gee route tests and 278 GUI tests
  in 11 files, including count-layer, existing named-product, Retrieve, form and chart cases; lint on the reviewed
  sources/tests passed. A known withdrawal can still be ignored while the output description is transient:
  `recipeImageLayer.jsx`'s `drawableLayer` returns `preserved(imageOutput)` when `canPreview` is false, before it checks
  `sourceGate` or the new `productGate`. With an already drawn layer, unchanged drawing inputs and a description in
  `NEEDS_EVIDENCE`, a gate with `withdraw: true` therefore returns the old layer. A temporary component-boundary probe
  failed for each gate; the control without a confirmed finding preserved the old layer as intended. This is an
  ordering issue in the shared renderer, not another recipe-specific requirement or a live-browser reproduction.
  **Required:** apply confirmed withdrawals before any transient-preservation return; retain existing preservation
  where there is no confirmed finding. Add the two precedence regressions and that control to the shared layer tests.
  No new mechanism is needed. The probe was removed and no production code changed by the reviewer. The focused
  already-broken-CCDC/repair browser check remains pending; no repeat of the timing-dependent Enter check is requested.
- **Layer-precedence correction, applied (2026-10-25).** `drawableLayer` (`recipeImageLayer.jsx`) now takes the drawing
  away for a withdrawing `sourceGate` or `productGate` before anything else is decided; only then does a description
  that cannot be previewed preserve the existing drawing, and a gate still checking keeps it as before. No new
  mechanism. **Regressions** (`recipeImageLayer.test.js`, for each gate): a drawn layer whose description is read again
  (`NEEDS_EVIDENCE`) is removed for a confirmed finding, nothing new constructed; the control, a gate still checking,
  keeps the unchanged drawing. The existing no-gate preservation cases are unchanged. **Witness:** the former order
  fails both finding cases; the controls pass. **Verification (two workers):** GUI `src/app/home/body/process` and
  `src/app/home/map`, 230 files and 3437 tests; ESLint on the changed files and `git diff --check` clean. The CCDC
  opening/repair browser check remains pending.
  **Independent recheck (2026-10-25):** no remaining code findings. Both withdrawing gates are now evaluated before
  the transient-description preservation path, while a checking gate preserves the unchanged drawing. Shared layer,
  CCDC count-layer and output tests passed 113 of 113 in three files; ESLint on the changed source/test and
  `git diff --check` passed. No production changes or browser run by the reviewer. Only the already-broken CCDC and
  restored count-preview browser check remains for this correction.
  **Browser result (2026-10-25; user reported):** responding to that two-step checklist, the user says "It works
  well". Record opening the already-broken CCDC with SRC feedback and no layer-error notification, then restoring
  its original working points and obtaining an actual count preview, as passed. The agent did not run the browser;
  no exact build, recipe/asset ids or network trace were supplied. This closes the remaining requested S3 browser
  recheck. The timing-dependent pending/Enter browser case remains unattempted, with its automated tests passed;
  no additional manual timing exercise is required by this correction. Historical pending records above describe
  their status at the time and are retained.
- **Browser checklist.**
  1. Time Series and CCDC with a Classification storing no points: SRC marked and naming it beside Classification;
     chart action disabled; Retrieve disabled; the map preview held - for native and classified
     bands, native and classified CCDC breakpoints.
  2. With a chart open, remove the Classification's last training point in its own tab: the chart closes; restore the
     point (saved): the chart can be opened again, on the band it charted.
  3. Open Retrieve with a classified and a native indicator selected; break the Classification: the panel closes and
     submits nothing, and Retrieve is disabled. Repair: Retrieve can be reopened with its saved settings; no automatic
     reopening or clearing of saved choices.
  4. Deselect the Classification in Sources and Apply: charts and Retrieve work natively.
  5. A decision-tree Classification without points: nothing held. A Classification still loading: holds without
     an error. A CCDC Slice over a CCDC with an untrainable Classification: held, naming that recipe.

**Generalization audit of the recent work (2026-10-25; structural review, not additional confirmed bugs).**

The user's rule applies throughout: types declare the facts and prerequisites peculiar to their analysis; the shared
mechanism enforces readiness and owns the consequences for execution and operation panels. A copied validator,
per-panel interpretation of invalidity, or type-name exception in a generic component merits review. This is a bounded
audit of the paths changed in this campaign, not an exhaustive audit of the application. The common-prerequisite and
named-product implementation and its layer-precedence correction have now passed independent code review; the user
also confirmed the focused CCDC count-preview browser recheck passed on 2026-10-25.

Already consolidated: band-dependent training operations/holds are removed by S3's configured-analysis policy;
Retrieve's confirmed-finding closure and acceptance-before-commit use shared components; PyEO's one-input check moved
from its selector to shared readiness; its index derivation is shared by evidence, offers and execution. Keep these
corrections rather than adding replacement recipe-specific gates.

| Candidate | Evidence in current callers | Direction / priority |
| --- | --- | --- |
| Time Series Retrieve's extra base gate | Its image-output read, watch and readiness-to-message mapping previously overlapped the shared panel. Its indicator offers are genuinely request-specific. | Consolidation implemented and independently checked on 2026-10-25: all panels use `withRetrieveOutput` and the common output decision; Time Series keeps only its current-state indicator-offer checks. See the caller-consolidation record above. |
| Chart lifecycle in CCDC Slice and Change Alerts | Both panels combine segment-capability and operation-readiness gates and separately implement close, cancel, wait and resume. Time Series/CCDC already use `pixelChartUpdate`. | Use common gate precedence and lifecycle decisions where equivalent. Keep segment/observation computation and asset-reference handling explicit; a capability check and an execution-readiness check establish different facts. Do this with the S5/S6 work where its final policy matters. |
| Type-name exceptions in the shared layer component | `recipeImageLayer.jsx` has `SELF_MANAGED_VISUALIZATIONS` for BAYTS Alerts, Change Alerts and LandTrendr to avoid two writers reconciling the same selection. | Declare reconciliation ownership on the type and let the generic component consume it. Preserve behavior and regression coverage; this is a structural cleanup, not a new reproduced rendering bug. |
| Repeated request projection | The GUI's `recipeForOperation` drops the consumer AOI, while observations and direct CCDC segments separately project to a clicked point. Change Alerts observations use their own shared monitoring projection. | Consolidate the shared computation identity/projection so judged and built requests agree, preserving referenced recipes' own AOIs. Existing projections are deliberate; duplication is the risk, not evidence that pixel charts should acquire the consumer AOI. |
| Reference settings and background initialization | Change Alerts' `referenceObservation.js` uses `applyAccepted` to merge producer Sources/options into the consumer. The manual feedback already established unwanted overwriting, assigned to S5. | Apply one ownership contract: required source-owned values are effective/read-only; consumer-owned editable values survive background reads; defaults have a defined proposal action. Fields remain recipe-specific declarations. Do not introduce a generic synchronization framework or silently settle the initial-copy decision. |

**Disposition agreed with the user (2026-10-25).** The bounded amendment has been sent to the running implementor:
finish the common S3 gate, audit its layer/product/chart/Retrieve callers, and remove base gates, watches and
configuration messages made redundant by it, especially Time Series Retrieve's. Keep genuine indicator-offer,
current-state submission and save-agreement checks. Check the wrapper charts consume the same verdict; broader
CCDC Slice/Change Alerts chart-lifecycle consolidation belongs with S6, after S5 settles ownership. Reference-setting
synchronization remains S5. Visualization-reconciliation ownership (the shared layer's type-name allowlist) and
pixel-projection consolidation remain recorded structural follow-ups outside the current amendment; assess their
small implementation scope after S3, without making them new pre-commit blockers or assuming five extra slices.

Retained domain adapters are not automatically missing generalization. `requestedMeasures`/`fittedMeasures` belong to
CCDC; PyEO's supported indexes and input cardinality belong to PyEO; Classification's training rules belong to
Classification. The CCDC dispatch in generic image-export request capability handling is a deliberate single-consumer
adapter; revisit it if more types need the same request contract, rather than adding a declaration framework solely
to remove a short dispatch. The current review adds no production changes or new failing tests. Finish and review the
shared S3 gate first; assess the bounded candidates alongside the existing S4-S6 sequence instead of treating them as
newly discovered blockers or an approved broad rewrite.

S1 and S2 can proceed independently of the semantic changes. S3 precedes S4 to avoid adapting sampling work to a
request-stage design scheduled for removal. Start the read-only F5 audit early, but land S5's ownership behaviour
before S6's final editor/gate consolidation. If S5 reveals a need to change persisted structure, describe its old/new
shape and compatibility separately before implementation; no migration is approved by this plan.

**Product choices still to settle for these slices:**

1. **S3's strict selected-source contract.** The user's preferred direction and the recommendation are to hold Time
   Series/CCDC native downloads/charts and their count outputs too when a selected Classification is untrainable,
   until it is repaired or explicitly deselected. This is a deliberate product policy, not an execution necessity for
   native bands. Confirm that full consequence before retiring the additional band-training gate. Apply it to these
   two families first; do not silently change native Phenology or every recipe that happens to hold a reference.
   **Status:** confirmed by the S3 request and implemented for Time Series and CCDC (2026-10-24); Phenology unchanged.
2. **S5's editable defaults.** Agreed 2026-10-26: seed on the first reference Apply during new-recipe creation only,
   preserving editable values on replacement/reopen/refresh. Explicit copying through the normal form's Apply/Cancel
   flow is a deferred follow-up. Required matches are separately source-owned/read-only; unknown asset values remain
   labelled and editable, and recorded/reference speckle settings are followed.

Which PRC fields must match, how to derive Consumer features over multiple inputs, and what optional/required metadata
existing assets actually contain are technical discovery tasks, not arbitrary user preferences. Return with evidence
and a bounded choice if they expose a real tradeoff. Do not invent a mandatory-field list or automatically refuse
older assets before doing that work. The collection sampling-once constraint, source imagery ownership and the rule
that pending/unavailable evidence is not a finding are already established directions.

**Independent improvements, after the correction slices unless reprioritised:**

- P1: chart context/presentation — readable CCDC Slice band names and a map marker for the charted pixel. Keep request
  identity unchanged and make marker lifetime follow the active chart/recipe. These can share a small UI slice.
- P2: AOI update efficiency — measure redraw triggers and prevent redraws on irrelevant edits while preserving real
  geometry changes and cancellation. Keep this performance investigation separate from the S1 layout fix.
- P3: visualization Copy/Paste — F7 as a separate feature, using existing layer/visualization ownership and validation.
- P4: keyboard band addition — Enter adds the highlighted band, then highlights the next available band so consecutive
  bands can be added with repeated Enter. Separate small widget follow-up; see the later usability notes below.
- P5: CCDC Sources sizing — agreed family/view heights: stable heights for Optical/Radar/Planet and More/Less, with
  the existing viewport cap and scrollable body. Decision recorded below; not implemented.
- WebSocket recipe-update notification stays outside this implementation round; stale-copy checks were reported good.

The direct-versus-referenced chart AOI difference is expected and has no corrective slice. The invalid legacy
Time Series saved-UI fixture is removed from manual acceptance, and the passed controlled numerical checks are not
unfinished browser work. Preserve successful manual results and re-run affected cases after each slice; missing
the initial manual batch is now reported complete, with fixes and targeted rechecks outstanding. One final integrated
automated checkpoint follows the completed correction set.

**F1. Make a training-data problem visible and repairable where it is edited.**

- `classification/trainingDataRequirements.js` currently maps every Classification declaration to `toolbarMark: false`.
  Mark real findings consistently with Regression. Keep operation applicability and the decision-tree exemption with
  the existing rules; do not invent a second toolbar validator or mark an evidence read as a configuration error.
- Both training-data lists receive `withItemProblems`, but their `RecipeSection` editors only render a `RecipeInput`.
  Carry the existing finding into the selected data-set editor, naming the Provider and explaining the needed repair.
  Keep replacing/removing the reuse selection possible. For nested findings, identify the actual offending recipe,
  not just the first reference in the chain. Per the subsequent browser decision, do not add an Open Provider action
  inside this modal. Generic selector navigation depends on separate recipe-scoped-modal work.
- Re-applying the unchanged reference must not imply that it repaired an upstream error. Explain that distinction;
  do not indiscriminately disable Apply and trap the user in an editor from which a repair could be selected. An edited
  reference must not keep a stale finding belonging only to the old Provider.
- **Acceptance:** for both recipe families, an unusable Provider shows matching toolbar, list and item-editor feedback;
  opening/repairing Provider clears it, replacement/removal and Cancel behave correctly, and the Consumer renders
  after recovery. Cover real remaining feature incompatibility after F4, not a Provider selection change that F4 makes
  valid. Existing current-behaviour witnesses remain historical evidence.
- **Status:** implemented in S2 with its browser corrections (2026-10-23): no training data at all is neutral panel
  guidance, not a TRN mark, for both types; a broken configured data set is marked. Browser recheck pending.

**F2. Keep the selected Classification and its explanation visible in CCDC and Time Series.**

- Open Sources in the advanced ("More") view when a Classification is selected. Allow Less/More to be toggled normally;
  this is about the initial view and visibility, not forcing it open on every render or disabling the More button.
  The 2026-10-23 feedback requests the same initial visibility for Time Series Sources; cover both panels rather than
  leaving the selected dependency hidden in one of them.
- `collectionClassifierRequirements` binds `UNSUPPLIED_CLASSIFIER_INPUTS` to both `classification` and `dataSets`.
  Make the Classification field the explanation/repair location for CCDC's selected incompatible Classification,
  including the Optical-to-Radar edit. Keep the data-set control's own validation. Review other users of this shared
  declaration so a CCDC presentation fix does not silently change their editor policies.
- **Acceptance:** a saved selection is visible on opening; incompatible collection inputs explain the problem beside
  Classification; compatible edits and clearing/replacing the Classification repair it; Cancel preserves applied
  settings. Reuse the same shared readiness finding and form binding, without a CCDC-specific compatibility checker.

**F3. Align Change Alerts' applied settings, Sources editor and analysis chart.**

- Reproduce the reported `nbr` case through the actual producer update and source observation. Determine separately
  what the applied model holds, what the editor initially displays, and whether its controls replace an unoffered
  selection. A changed form draft must not make an applied Sources error disappear without explaining the difference.
- Retain an unsupported applied monitoring band visibly with its located explanation and an explicit repair. Do not
  silently switch the monitoring data family or choose another band to make the form or chart look valid. The final
  Sources/PRC ownership comes from F5/F6, rather than another local defaulting rule.
- The Sources `MONITORED_MEASURE` declaration currently applies to `IMAGE_OUTPUT`, while chart availability uses
  `PIXEL_SEGMENTS` and reference chartability. Extend the relevant shared requirement/availability declarations so an
  incompatible configured monitoring band disables the chart action, closes an open chart and cancels obsolete work.
  Use the configured band consistently; repair restores segments and monitoring observations.
- Do not hold the chart to every alerts-image requirement: incomplete output dates or an unrelated export requirement
  are not automatically chart failures. Preserve valid recipe-reference and segments-asset paths, server observation
  guards, and pending/unavailable semantics. Keep backend and GUI operation coverage aligned where the chart actually
  uses the configured monitoring band.
- **Simplification goal (2026-10-22 discussion):** SRC explains findings from the same shared, operation-specific
  readiness decision that holds retrieval and charting. Panels consume that decision rather than independently
  inspecting Sources settings or reimplementing compatibility rules. Do not add an "SRC toolbar is red" check beside
  the existing gates: toolbar presentation is not the authority, and an unapplied editor draft is not applied state.
  Inventory the chart/Retrieve checks touched by this work and explicitly remove those made redundant by the shared
  requirements, while preserving their existing behaviour in focused regressions.
- Keep necessary consumer responsibilities: request-selected bands/measures add their applicable requirements;
  pending/unavailable evidence has its own hold state; chart cancellation/closure/recovery remains lifecycle handling;
  Retrieve rechecks current state at submission; server guards enforce the same requirements. These are not duplicate
  configuration validators to delete. A relevant applied SRC finding disables the affected action, but SRC stays
  accessible for repair. Implement this as consolidation of existing decisions, not another validation layer.
- **Acceptance:** the Optical-to-Radar reproduction has consistent toolbar/editor messages and no chart request for
  a substituted band; repair returns both chart streams. Confirm cancellation prevents late redraw, native compatible
  controls still work, existing assets do not acquire their producer's recipe dependencies, and an unrelated output
  finding does not disable a valid chart. The change report must identify which repeated checks were removed and which
  request/lifecycle/submission guards remain necessary.

**F4. Sample the Provider's imagery with the Consumer's feature definition.**

- Trace both Classification and Regression reuse before implementing: the feature-selection issue exists in both,
  although Classification's `getSamples$` and Regression's `getTrainingData$` are different execution paths. Apply the
  same imagery/feature ownership principle, preserving class versus value labels and Regression's unnormalised path.
- Provider owns its points and input imagery; Consumer defines the bands, derived indexes/combinations and covariates
  it trains on. Derive those features on each point-contributing Provider's imagery, even if Provider's own band
  selection omits them. Nested providers retain their own imagery, locations and sampling scale. Do not resample
  everything over Consumer's imagery, mutate Consumer's selected bands, or persist sampled rows into either recipe.
- Update execution and the shared training requirements as one contract. Currently `missingTrainingFeatures` compares
  Consumer features to `ownFeatures(record.model, describedInputs(...))`, and Provider `TRAINING_DATA` validates its
  own band sets. Reassess both against the features actually sampled for Consumer: changing only execution would leave
  valid reuse refused, and removing the refusal would leave genuinely unsupported features unguarded. Provider's own
  image/classifier still uses its own selections and keeps its own applicable findings.
- Describe the Consumer feature definition once and establish whether each contributing Provider input can derive it.
  Reuse shared band/index/covariate rules and the existing graph, evidence acquisition and finding attribution. Do not
  add a parallel validator, recipe loader, stored validity flag or an operation for every band selection. Explicitly
  assess how Consumer-specific sampling affects the existing operation identities before extending any public
  readiness API. Establish input correspondence for multiple-input recipes before making claims about those cases;
  existing unknown cases must not become guessed success or guessed incompatibility.
- Assemble the sampling expression/training data outside the per-scene mapping, as `collection.js` already does for
  `getTrainingData$()`, and reuse it for the collection. Preserve configured row ordering and empty/mixed/nested reuse
  semantics. Apply Consumer normalisation once with Consumer's statistics; Provider classifier settings must not
  transform those reused rows. No global cache or Earth Engine internal evaluation-count guarantee is implied.
- **Acceptance:** Provider selects `red` over imagery containing `red,nir`, Consumer requests both, and reuse succeeds;
  truly missing/underivable Provider imagery still gives a located finding; removing all Provider imagery remains
  refused and repairs recover. Cover nested and mixed branches, indexes/covariates, unchanged no-reuse controls and
  missing/unavailable evidence. Compare one-scene and many-scene construction to show no per-scene resampling, then
  extend the controlled live numerical check to the new contract and retain its whole-row/prediction comparisons.

**S4 design assessment and numeric witness (2026-10-25, from 6ccb604f6; no production change).**

**Current proposal (2026-10-25, named-feature contract; design only, no production change).** The Consumer requests
named training features; each point-contributing Provider supplies every one of them from its own imagery at its
own points - located by name, or derived with the Consumer's own rule - or the Consumer gets a located finding.
Input counts and saved order do not matter; a requested name supplied by no input, or by more than one, is refused,
never resolved by first input or generated suffix. No `role`, binding or mapping field is added; source roles,
bindings and positional matching are withdrawn. Users give names consistent meanings and units; S4 establishes no
scientific comparability. The trace and witnesses below are evidence about current execution and simulations.

- **Traced today.** Classification reuse calls each Provider's `getSamples$()`
  (`lib/js/ee/src/classification/classification.js`): the Provider's own `features$` - its input images through
  `addCovariates` with *its* band sets and auxiliary imagery, masked by the image mask - sampled at its own points and
  `scale`, its nested reuse first, recursively, each over its own features; nothing scaled. The Consumer sets
  `band_order` to its own feature names, scales reused rows once with its own statistics (`scaledSamples`) where it
  normalises, and trains. Regression reuse calls each Provider's `getTrainingData$()` (`regression/regression.js`),
  likewise over the Provider's own image, then sets the Consumer's `band_order`; it never normalises. Classification
  reuses only Classification and Regression only Regression (`recipeSection.jsx`). Time Series/CCDC/PyEO obtain the
  Classification's training data once, outside the per-scene map (`collection.js`), and apply its band sets to each
  scene (`classifyImage`). Readiness: `trainingFeaturesRequirement` compares the Consumer's `sampledFeatures` with each
  point-storing Provider's *own* `sampledFeatures`, and Provider `TRAINING_DATA` also applies its own
  `inputBandSetRequirements`; `sampledFeatures` establishes nothing for several input images.
- **Numeric witness** (temporary probe over `test/ee/classification/numericEarthEngine.js`, removed; "intended" ran the
  real execution with each point-storing Provider carrying the Consumer's band sets and auxiliary imagery; rows are
  whole training rows, Provider rows first):
  - Provider selects `red` over imagery `red,nir`, Random Forest Consumer needs `red,nir`. Current Provider rows are
    `{class, red}` only (no `nir`, while `band_order` names it); intended `{class:1, red:100, nir:1000}`,
    `{1, 300, 3000}`, `{2, 500, 9000}`, `{2, 900, 17000}`, then the Consumer's own rows unchanged.
  - Normalising SVM Consumer: intended Provider rows scaled once by the Consumer's statistics (`red` 0, 0.5, 1, 2;
    `nir` 0, 0.25, 1, 2); current lacks `nir`. `normalize: NO`: raw, as Random Forest.
  - Provider imagery genuinely lacks `nir`: rows lack `nir` either way - readiness must refuse it, located.
  - Nested: Consumer `red,nir` reuses a middle recipe selecting `swir1` (storing points) that reuses a `red`-only
    Provider. Current rows `{red}` x4, `{swir1}` x4, own; intended `red,nir` from each recipe's own imagery, in
    configured order (nested before middle's own), then own.
  - Index: Consumer `red,ndvi`, `red`-only Provider over `red,nir`: current lacks `ndvi`; intended derives `ndvi` from
    the Provider's own `red`/`nir` (0.818, 0.818, 0.895, 0.899).
  - Regression, same `red`-only Provider: current `{value, red}`; intended `{value, red, nir}` from the Provider's
    imagery, unnormalised.
  - No-reuse controls (Random Forest, SVM, Regression): current equals intended.
  The stand-in establishes row content, order, label, scaling and derivation arithmetic, and that the change is local
  to Provider sampling. It does not establish Earth Engine's handling of a missing training property (the stand-in
  yields `undefined`; Earth Engine's behaviour - dropped rows or a training error - needs the live check), masks,
  real index scaling, or evaluation counts.
- **Promise.** Reusing training data gives the Consumer a shared training basis: each Provider's labelled points,
  sampled from the Provider's own imagery, carrying the features the Consumer trains on. It covers a standalone 2021
  Classification reusing a 2020 one with one or several inputs, a Classification applied to a sensor collection, and
  Regression. Fixed-model reuse, probability calibration and units/encoding/measurement compatibility are outside S4.
- **Established facts (code and UI).** An input is saved as `{imageId, type, id, bandSetSpecs, …}` in
  `model.inputImagery.images`; `imageId` is generated per recipe (`uuid()` in the input editor). The editor
  (`panels/inputImageryWithDerived`, shared by Classification and Regression) edits an input in place - its source can
  be replaced, keeping `imageId` - adds and removes inputs, and offers no reordering. Nothing names what an input
  represents. A reuse data set is `{dataSetId, type: 'RECIPE', name, recipe}`, with nothing per input. Execution
  builds each input's features separately (auxiliary covariates added per input) and concatenates them in saved
  order, a repeated name suffixed (`red_1`, `latitude_1`); `band_order` then matches rows by those names.
- **Correction: position is not a correspondence.** Two inputs can expose identical bands while measuring different
  things, so a reversed pair passes every feature check. Probe (temporary, removed): Consumer inputs dry-season and
  wet-season, both `red,nir`; Provider saved wet, dry. By position the Provider's first row is `{class:1, red:11,
  nir:101, red_1:101, nir_1:1001}` - wet-season values under the Consumer's dry-season features (its own first row
  `red:100, nir:1000`) - with no missing feature; associated by meaning it is `red:101, nir:1001, red_1:11, nir_1:101`.
  The previous revision's statement that missing-feature validation exposes reversed inputs was wrong: it exposes only
  inputs whose bands differ. Position, `imageId`s of independent recipes, titles, equal counts and overlapping bands are
  therefore not used to associate inputs.
- **Earlier multiple-input witness (positional revision; its inputs were built to correspond, so it shows sampling,
  not correspondence).** Over the real execution and stand-in: matched two-input selections unchanged
  (`{class:1, red:120, nir:1200, red_1:130, nir_1:1300}`); a Provider selecting `red` from input 1 and `nir` from
  input 2 gives today `{red:120, nir:1300}` - input 2's `nir` under input 1's name - against `red:120, nir:1200,
  red_1:130, nir_1:1300` with per-input sampling; a `DIFFERENCE` over a permuted Provider input gives
  `red_nir_difference = 130 - 1300 = -1170` ordered like the Consumer; `nir` missing from input 1 but present in input 2
  is misattributed today and by naive per-input sampling alike, which the per-input selection refuses; an empty
  intermediate forwards; Regression keeps `value`; unequal-count reuse runs today by flattened names; no-reuse rows
  unchanged. From the single-input probe: copied band sets alone gave `nir_red_difference` = 900, 2700, 8500, 16100;
  ordered like the Consumer, `red_nir_difference` = -900, -2700, -8500, -16100. The stand-in models a `_1` suffix rule,
  not Earth Engine's own, nor masks, index scaling, a missing training property or evaluation counts.
**Current named-feature design details (superseding the withdrawn source-association proposals).**

- **What names identify (traced).**
  - *Raw input band names*: an input's described bands - an asset's names, a recipe's output names (an optical
    mosaic's include its indexes, `ndvi` among them, `selectableBands`), a Stack's chosen `outputName`s.
  - *Derived names*: an index is named for itself and derived only from the standard band names it requires
    (`REQUIRED_BANDS_BY_INDEX`, e.g. `ndvi` from `red` and `nir`); a combination is `${b1}_${b2}_${operation}`, `b1`
    and `b2` taken in its input's band order (`combinePairwise`); auxiliary covariates (`latitude`, terrain, water)
    are location functions added to every input (`addCovariates`).
  - *Explicit renames*: a Stack's Band names panel maps `originalName` to `outputName` and refuses duplicate output
    names (`DUPLICATE_BAND_NAME`). The Classification/Regression input editor selects bands but cannot rename them.
  - *Generated names*: concatenating inputs suffixes a later input's repeated name (`red_1`, `latitude_1`).
  - *The Consumer's `band_order`*: its concatenated names, generated ones included.
- **Requested features.** The Consumer's per-input feature names before concatenation - what `featuresOf` gives for
  each of its inputs - in its order. They must be unique across its inputs, so `band_order` holds them unchanged,
  except the built-in auxiliary covariates `auxiliaryImagery` configures (not input bands merely named `latitude` or
  `elevation`): one repeated per input (`latitude`, `latitude_1`) is the same raw location value, supplied once and
  copied under each generated name, each output column then scaled by the Consumer's own carried statistics as any
  column is (agreed by the user). Any other repeated requested name - two seasonal
  inputs both requesting `red` - is `AMBIGUOUS_TRAINING_FEATURES` at the Consumer, reported only when it reuses
  training data; its own-point training is unchanged. A generated suffix is never taken as meaning.
- **Feature form.** Each requested feature has the form in which the Consumer itself produces it, decided by the
  existing band-set rule over the Consumer's described input: a raw band (a provided index included, such as a
  mosaic's stored `ndvi`); a calculated index - one the input can derive from its standard bands, which
  `addCovariates` then calculates in physical units, overwriting any provided band of that name; a combination of two
  raw bands; or a built-in covariate. The forms are not interchangeable: SEPAL stores a mosaic's indexes at
  `OPTICAL_STORED_PER_UNIT` (10000, `encoding.scale` 1e-4), while a calculated index is physical - `ndvi` 0.818 against
  8181 (review probe). The Consumer's form, and so its no-reuse representation, is unchanged.
- **Supply rule, per point-storing Provider.** A requested feature from Consumer input *i* is supplied by Provider input
  *j* only in the same form: a raw band where *j* holds that literal band, selected directly (a provided index included);
  a calculated index where *j* holds the standard bands it needs; a combination where *j* holds both its bands,
  operands in the Consumer's order (`orderLike`); a configured built-in covariate from its generator. An input holding
  both a provided index and its spectral bands can supply either requested form, using the requested construction;
  the extra spectral bands do not disqualify its literal provided band. A provided index alone never supplies a
  calculated feature, and calculating an index never supplies a raw/provided feature when its literal band is absent:
  such a feature is `MISSING_TRAINING_FEATURES`, its reason the form. Cross-form fallback is unsupported in S4, as no
  equivalent representation is established. The Consumer's existing per-input rule establishes the requested form;
  suppliers are checked against that form. Do not rerun a Provider-side rule that would overwrite a requested
  provided index with a calculated one. No encoding is inferred from values.
  Exactly one Provider input must supply each requested feature: none is `MISSING_TRAINING_FEATURES`, several is
  `AMBIGUOUS_TRAINING_FEATURES`, both naming the Provider, the feature and the inputs. Two known suppliers establish
  ambiguity even while another input is undescribed; no known supplier beside an undescribed input establishes nothing,
  nor does one known supplier beside an undescribed input establish unique supply. Duplicates among Provider bands no requested feature uses are irrelevant.
  Nothing is combined across inputs: `red` from one input and `nir` from another derive neither `ndvi` nor
  `red_nir_*`; that is reported missing, with the reason. Operands and output names are the Consumer's, because the
  derivation is the Consumer's over imagery ordered like its input. Auxiliary covariates are always supplied.
- **Masks, projection, footprint.** Acceptance follows Earth Engine's `sampleRegions`: a pixel with a masked band is
  excluded. Each supplied data feature keeps its supplying input's mask. Built-in covariates retain their generator's
  native masks and coverage: a location function is not necessarily unmasked (terrain has missing edge values).
  Repeated built-in columns copy the same raw value and intrinsic mask; they must not unmask required data or silently
  expand eligible points, including an auxiliary-only request. Preserve the applicable Provider imagery support.
  Inputs supplying nothing are not sampled and no longer remove rows. Keep the Provider's own `scale`. Specify an
  explicit single Provider band for the sampling projection, tracing the current selected feature image's first band:
  the first raw input's projection is not automatically identical, and a multi-projection image has no single
  projection to read without selecting a band. Verify the anchor against existing valid controls and document any
  intentional sampling-grid change when different bands are requested. Points are filtered by the assembled image's
  footprint; check that assembly does not accidentally narrow or expand it. The live check verifies masks, projection
  and footprint with mixed projections as well as a common-grid control; the stand-in proves none of them.
- **API and data flow.** Shared rules, `lib/js/shared/src/recipe/bandSets.js`: `featuresOf(bandSetSpecs, auxiliaryImagery,
  bands)` (today's per-input `sampledFeatures` body), `orderLike`, `requestedFeatures(model, describedInputs)` (per
  input, with the Consumer-side ambiguity), and `featureSupply(requested, providerModel, describedInputs)` (per requested
  feature, the supplying input, or missing/ambiguous/unknown). Execution, one shared function beside `addCovariates`
  (the classification/regression copies consolidated): for each Consumer input *i* and Provider input *j*, the
  candidate constructed in the Consumer's requested form, reusing the existing raw/index/combination helpers and
  `orderLike(P_j, inputBands_i)`; blindly applying `addCovariates` is insufficient where its index overwrite would
  change a raw/provided request into a calculated feature. Each requested feature is
  selected from the one candidate holding it, chosen in Earth Engine by band presence
  (`ee.ImageCollection(candidates).filter(ee.Filter.listContains('system:band_names', name))`), and the selections are
  assembled in the Consumer's order under its `band_order` names, auxiliary duplicates copied. The Consumer passes its
  definitions (`bandSetSpecs_i`, `inputBands_i` and the requested names as server-side lists) - nothing new evaluated on
  the client. Classification `getSamples$(definitions)` and a new Regression `getSamples$(definitions)` (its reuse stops
  calling a Provider's `getTrainingData$`) sample their own points at their own `scale` and forward the definitions
  unchanged along reuse; the Consumer's own sampling, `band_order`, normalisation and the collection's
  once-per-computation assembly are unchanged. Execution enforces the supply rule itself, since server preview gating
  stays deferred: a candidate counts only if it can fulfill the Consumer's requested construction (literal band
  present for a raw/provided request, required spectral bands present for a calculated request), determined from the
  Consumer's band-set rule and both server-side band lists; the feature is taken only when exactly one candidate
  counts, and zero or several fail the
  evaluation with a message naming the feature, never falling back to the first.
- **Operations and findings.** One reuse operation, `TRAINING_DATA`: inputs present and described (`INPUT_IMAGE:
  IMAGE_OUTPUT`, `inputImageryRequirement`), nested `TRAINING_DATA`; its own band-set requirements dropped, its
  selections not being what it samples; no association or naming rule. Consumer-side, in `trainingFeaturesRequirement`
  (Classification `IMAGE_OUTPUT`/`CLASSIFIER`, Regression `IMAGE_OUTPUT`), for each point-storing recipe in its reuse:
  `MISSING_TRAINING_FEATURES` (code and data-set location kept) and `AMBIGUOUS_TRAINING_FEATURES`; for the Consumer's
  own inputs, `AMBIGUOUS_TRAINING_FEATURES` when it reuses. An input not yet described makes the features it could
  supply unknown - no finding, ambiguity included - and erases no finding established elsewhere. An empty intermediate
  is not judged here and forwards the definitions; a recipe building its own image validates the training data it
  reuses as a Consumer. Collection application keeps its separate constraint: `CLASSIFIER` gains
  `MULTIPLE_CLASSIFIER_INPUTS` (execution already throws); PyEO keeps its own finding.
- **Unused inputs.** Sampling uses only supplying inputs; readiness stays conservative: `TRAINING_DATA` needs every
  Provider input described and closure loading reads every input, so a broken input that supplies nothing still holds
  the Consumer, located at that Provider. Narrowing that belongs with closure loading and executed-edge validity,
  outside S4.
- **Identity, memoization, acquisition.** Provider `TRAINING_DATA` is judged once per read, for nothing that depends on a
  Consumer; each Consumer's supply check runs in its own visit from its own definitions, so two Consumers sharing a
  Provider in one graph cannot share an answer, and execution carries definitions per call with no cache. Evidence
  acquired: the Provider inputs' descriptions, as today. Execution constructs one candidate per Consumer input and
  Provider input, but the same `sampleRegions` as today - one per recipe in the reuse, empty point collections included
  - and assembly stays outside the scene map. No count of Earth Engine evaluations is claimed.
- **Named-feature witness** (temporary probe, removed: current rows from the real execution; proposed simulated with the
  real one-input derivation per Consumer input and Provider input, ordered like the Consumer's, each requested
  feature taken from its unique supplier; first Provider rows):
  1. `red`-only Provider over `red,nir`: current `{class:1, red:120}`; proposed `{class:1, red:120, nir:1200}`.
  2. 2020 -> 2021, Consumer [optical `red,nir`, DEM `elevation`], Provider [DEM, optical selecting `red`]: current
     `{elevation:5, red:120}`; proposed `{red:120, nir:1200, elevation:5}` - order irrelevant.
  3. One-input Stack Provider holding `red,nir,elevation` for that two-input Consumer: both
     `{red:120, nir:1200, elevation:5}`.
  4. Unused duplicate (`red` in both Provider inputs, Consumer requesting `nir, elevation`): proposed
     `{nir:1200, elevation:5}`, no finding. Requested `red` held by both: `AMBIGUOUS` (`p0`, `p1`) - today `red` from
     the first input and `red_1` ignored. Stack-renamed `dry_*`/`wet_*` over a Provider listing wet first: current
     lacks `dry_nir`; proposed `{dry_red:120, dry_nir:1200, wet_red:11, wet_nir:101}`.
  5. Two seasonal inputs with identical bands, Provider saved wet then dry: current `{red:11, nir:101, red_1:120,
     nir_1:1200}` - wet values under the Consumer's dry names, nothing missing; proposed: `AMBIGUOUS` at the Consumer.
  6. `ndvi` and `DIFFERENCE` of `red, nir` over Provider imagery `[nir, red]` selecting `red`: current `{red:120}`;
     proposed `{red:120, ndvi:0.818, red_nir_difference:-1080}` (`120 - 1200`). The same combination with `red` and
     `nir` in two Provider inputs: missing (today also absent). Review probe: a provided-only SEPAL-style `ndvi` gives
     `ndvi:8181` where the calculated form is `0.818`, and nothing under `INDEXES: [ndvi]`; under the supply rule it
     does not supply a calculated `ndvi`.
  7. Requested `swir1` absent: missing. 8. `latitude` on two Consumer inputs: `band_order` carries `latitude` and
     `latitude_1`; the Provider supplies the location covariate for both. 9. Regression `red`-only Provider:
     `{value:10, red:120}` becomes `{value:10, red:120, nir:1200}`.
  The stand-in establishes row content, labels, derivation and its `_1` suffix rule; not Earth Engine's own suffixing,
  masks, the `system:band_names` selection, index scaling or evaluation counts.
- **Repair for indistinguishable names.** Build a Stack over the inputs whose names repeat - e.g. the dry and wet
  mosaics - and give its output bands distinct names in the Band names panel (`dry_red`, `dry_nir`, `wet_red`,
  `wet_nir`); use that Stack as the input in both Provider and Consumer. Renaming spectral bands stops automatic index
  derivation, which needs the standard names: to keep NDVI per season, select the mosaic's own `ndvi` output in the
  Stack and name it `dry_ndvi`/`wet_ndvi` (Band Math is the alternative for other expressions). Traced in code and
  saved settings; not exercised in a browser this round.
- **Supported cases.**

  | Case | Result |
  | --- | --- |
  | Standalone Classification, own points only (any inputs, duplicates) | Unchanged |
  | 2020 -> 2021 with distinguishable names, any counts or order | Supported; Consumer features from Provider imagery |
  | Provider selection narrower than its imagery | Supported where derivable |
  | Requested feature missing, derivable only across inputs, or only in another form (provided vs calculated index) | `MISSING_TRAINING_FEATURES` |
  | Requested feature in several Provider inputs | `AMBIGUOUS_TRAINING_FEATURES` |
  | Consumer requesting one name from several of its inputs, reusing | `AMBIGUOUS_TRAINING_FEATURES` at the Consumer |
  | Classification applied to a collection | One applied input (`CLASSIFIER`); Providers of any shape supply by name |
  | Regression | Same contract; label `value`, no normalisation |
  | Intermediate storing no points | Forwards; not judged |

- **Compatibility effects.** No saved-structure, task-payload or no-reuse change. Reuse whose requested features are
  each supplied once keeps running, its rows now carrying the Consumer's features (different where the Provider's
  selection, order or derivation differed, or today's concatenation took a value from the wrong input). Newly refused,
  with a located finding: a reusing Consumer requesting one name from several of its own inputs (today trained by
  position, correct only when the two recipes list them alike), and a requested feature found in several Provider
  inputs (today the first input's). Repair as above. Multiple-input Classifications applied to collections already
  failed; they get a finding.
- **Regression plan.** Shared rules: `requestedFeatures` (Consumer ambiguity, auxiliary duplicates), `featureSupply`
  (raw by name across inputs, index derived or provided, combination within one input, missing, ambiguous, unused
  duplicate, unknown while undescribed), `orderLike` JavaScript and Earth Engine forms agreeing. Numeric whole labelled
  rows: the witness cases; normalisation on/off once; labels, `scale` and supplying masks; nested and empty
  intermediates forwarding; a trained input image starting its own definition; no-reuse controls, including duplicate
  names on own points. Shared readiness: each finding at its location, undescribed inputs finding nothing, two
  Consumers sharing a Provider in one graph, the broken-unused-input conservative result, repair. Callers: Time Series
  and CCDC held with SRC explaining, training-data feedback, gee guards before product work. One-scene versus
  three-scene collection: identical `sampleRegions` constructions. Index forms, with the real calculator: calculated-only,
  provided-only and both present, on each side, `IMAGE_BANDS` and `INDEXES`; a provided index never supplying a
  calculated one or the reverse; no-reuse representations unchanged. Execution-level supplier count: a duplicate
  supplier and a missing one each fail the evaluation with readiness bypassed. Built-in covariates: shared under
  generated names and scaled per column, an input band named `latitude` not treated as one. Live check
  (`verify/classifierNormalisation.mjs`): a one-input pair with a narrower Provider selection, and a two-input pair in
  different orders with `ndvi`, a combination and `latitude` on both inputs; whole rows, predictions, footprint,
  projection, and a masked required band excluding its point.
- **Smallest coherent boundary.** One slice: the shared rules and sampling function, `TRAINING_DATA` and the Consumer
  findings, `getSamples$(definitions)` for both types, feedback and messages, tests. Execution and readiness land
  together.
- **Case matching and diagnostic amendment (user agreed 2026-10-26).** Reuse resolves requested feature names
  case-insensitively only when the result is unique, keeping the Consumer's exact output spelling. Do not prefer an
  exact-case candidate over another case-equivalent candidate: `red` and `Red` are an ambiguity, even within one input.
  Apply the same rule to required operands for calculated indexes and combinations, in shared readiness and Earth
  Engine execution, including the bypassed-readiness guard. Do not change persisted names, no-reuse feature
  construction or feature-form/encoding rules; perform any necessary aliasing only in the reuse construction.
  Case leniency introduces no fuzzy spelling, source ranking, band-coverage scoring, first-match choice or
  arbitrary selection among inputs with identical band sets. Unknown evidence keeps the existing supply semantics.
  Consumer-side duplicate requests are also compared without case when reuse is configured.

  Findings must name the requested feature, Provider and relevant source inputs, retaining original spellings for
  case collisions, and give a concrete repair. Missing derived features name the required operands; ambiguous ones
  explain how distinct names in a Stack's Band names can be used consistently in both recipes. Use the existing
  error location and message, without an extra blue repair paragraph. Add regressions for a unique case-only match,
  exact plus differently cased collisions within/across inputs, missing and ambiguous derivation operands,
  Consumer spelling retained, unchanged no-reuse behavior, and readiness/execution agreement.

- **Remaining decision.** None. The built-in covariate exception is agreed; provided-to-calculated index fallbacks are
  left unsupported in S4 rather than converted.

**Final named-feature amendments: review (2026-10-25).** The Consumer-form and exactly-one-supplier corrections
resolve the preceding review's core concerns. The implementation can proceed under this contract with the following
bounded corrections, now reflected above: an input holding both an index band and its spectral bands can satisfy
the requested provided form by literal selection; built-in covariates preserve intrinsic masks; and the sampling
projection must be anchored to an explicit Provider band and checked against the actual old feature-image grid,
not assumed from an arbitrary raw image. These are implementation/acceptance requirements, not new source roles,
bindings or product decisions. Add the both-forms raw-request regression, a masked terrain covariate, an
auxiliary-only case and a mixed-projection control to the existing plan.

The official [terrain reference](https://developers.google.com/earth-engine/apidocs/ee-terrain-products) documents
missing edge values, and [Image.projection](https://developers.google.com/earth-engine/apidocs/ee-image-projection)
throws when a multi-band image's projections differ. Current `addCovariates` selects/derives features before adding
auxiliary imagery and applying the input mask, so neither unmasked covariates nor equality with a whole raw input's
projection is established by the current code. This review changed documentation only and ran no live Earth Engine
check. Verification remains the planned numeric, shared, mounted/route and controlled live campaign.

**Named-feature proposal: independent review (2026-10-25; focused correction required).** The feature-name contract
is the agreed direction. The built-in auxiliary-covariate exception is reasonable as raw-value reuse, subject to
preserving sampling masks and scaling each output column with the Consumer's own carried statistics. It applies to
the covariates actually configured by `auxiliaryImagery`, not arbitrary input bands coincidentally named `latitude`
or `elevation`. Keep no-reuse construction and output unchanged.

- **Provided and calculated indexes are not interchangeable merely by name.** Current Classification
  `addCovariates` calls `calculateIndex` without storing the result at a new scale; `optical/indexes.js` computes in
  physical units. Optical Mosaic `addIndexes` explicitly multiplies by `OPTICAL_STORED_PER_UNIT=10000` and stores
  int16. A read-only numeric probe of the real Classification over the committed stand-in, with identical
  `IMAGE_BANDS: [ndvi]`, produced `{class:1, ndvi:0.8181818181818181}` from `{red:120,nir:1200}`, but
  `{class:1, ndvi:8181}` from a provided-only SEPAL-style NDVI input. With `INDEXES: [ndvi]`, the provided-only input
  produced no feature at all. Therefore the proposed provided-index supply outcome is not established by applying
  today's per-input derivation. Define supplied-versus-calculated precedence and representation consistently for
  readiness and execution. Do not accept a stored index as a fallback for a calculated feature in different units,
  infer encoding from value ranges, or silently change the Consumer's/no-reuse feature representation. For a bounded
  S4, leave a fallback unsupported where equivalent representation is not established; a universal units/encoding
  framework remains outside scope. Add real-calculator numeric coverage for provided-only, calculated-only and both
  forms together. The probe used standard input, left no scratch file and made no external call.
- **Ambiguity must not fall back to the first candidate in execution.** Filtering candidates by band presence and
  then taking the first would silently choose when more than one candidate supplies the feature. Require exactly one
  candidate for both the missing and ambiguous cases, even when readiness is bypassed (server preview gating remains
  deferred). Keep the shared readiness finding for normal GUI and guarded routes; add an execution-level duplicate
  supplier regression. Two known suppliers establish ambiguity even while another input is unknown; zero known plus
  an unknown input does not establish missing, and one known plus an unknown does not establish unique supply.
- **Masks have a documented expected result.** Earth Engine's
  [sampleRegions reference](https://developers.google.com/earth-engine/apidocs/ee-image-sampleregions) says a pixel
  with a masked band is excluded. Use that as the acceptance criterion for required sampled features, then verify
  that the new assembly actually preserves it in the controlled live check. Copying a built-in covariate must not
  accidentally unmask required data or expand the eligible point set. The reference also documents first-band
  projection defaults; explicitly trace the sampling projection/footprint when assembling features from different
  Provider inputs and preserve Provider sampling scale. Do not claim numeric stand-ins prove masks or projections.

This is a review of the proposal and current code, not verification of a new implementation. No production source
was changed and no live Earth Engine run occurred. The earlier statement deferring units checks does not justify a
known factor-of-10000 mismatch between SEPAL's own index paths. Resolve the index supply rule before implementation;
the remaining points are focused implementation and verification requirements, not a new source-mapping design.

**Independent S4 assessment review (2026-10-25; proposal corrections needed before production implementation).**

- **Scope recommendations:** a single-input first slice is sensible; leave units/encoding compatibility outside S4
  and record that it is not established. These are reviewer recommendations, not evidence of a multi-input mapping
  or a new units guarantee. Keep each Provider point's stored `class`/`value` unchanged; Consumer owns the requested
  features and its transformation, not a relabeling of Provider rows.
- **Legacy fallback and validation must remain paired.** The proposal cannot both retain current sampling for
  multiple-input cases and unconditionally remove Provider `TRAINING_DATA` band-set requirements. A read-only
  readiness witness used a two-input Consumer and a Provider selecting `red,nir` over imagery containing only `red`:
  current readiness was `NOT_READY` with the Provider's `MISSING_INPUT_BAND`; simulating the proposed removal of those
  rules yielded `READY`, while the Consumer feature comparison remained unknown for multiple inputs. Specify the
  fallback boundary, including mixed and nested branches, and preserve its applicable guards alongside its execution.
  An intermediate recipe must not replace the original Consumer definition when forwarding to descendants. Define
  the consumer-dependent versus consumer-independent validation split before claiming the existing identities suffice.
- **The effective feature definition includes combination ordering.** `extensions/image.js`'s `selectExisting` keeps
  source-image band order, and `combinePairwise` uses it for both operands and output names. A shared-rule witness
  with identical `PAIR_WISE_EXPRESSION` settings (`included: [red, nir]`, `RATIO`) produced `red_nir_ratio` from source
  order `[red, nir]` and `nir_red_ratio` from `[nir, red]`. Execution also reverses the ratio operands in those two
  orders. Therefore `featureDefinition(model) = {bandSetSpecs, auxiliaryImagery}` alone does not establish equivalent
  Consumer-defined combination features over another image. Define how Consumer's effective ordering/names are
  carried and applied, using the same rule in readiness and execution, while keeping no-reuse results unchanged.
  Include numeric tests with permuted Provider band order, asymmetric combinations, auxiliary features and existing
  collision/unknown cases. Do not treat a provided raw band as absent just because its input position differs.
- **Cost evidence:** count constructed sampling expressions in the actual paths, including empty contributors;
  current code can construct `sampleRegions` for an empty local point collection too. The collection invariant is
  that sampling/training assembly is outside per-scene prediction, not an unmeasured claim of exactly one expression
  per point-storing recipe or one Earth Engine evaluation.

Only this roadmap was changed by the reviewer. Both witnesses ran directly against synthetic records using the
shared code; no files were swapped, no production code changed, and no external service or live Earth Engine work
was performed. Amend the proposal for fallback and effective feature ordering before implementing execution and
readiness as one contract. The remaining acceptance and live-check plan still applies.

**Amended S4 proposal: independent design review (2026-10-25; ready for implementation).** The effective feature
definition now carries Consumer input ordering, and `orderLike` preserves all Provider bands while ordering shared
ones consistently for asymmetric combinations. `TRAINING_POINTS` is justified as a distinct, generic sampling
contract with Consumer-independent Provider requirements; it is not a per-feature operation or a second validator.
`TRAINING_DATA` retains the legacy production and guards, resolving the previous multi-input fallback finding.
Consumer-specific feature derivability remains in the actual training Consumer's requirement, so Provider readiness
can still be shared across feature definitions without storing them in a validity flag or cache.

Implement the propagation exactly as proposed: the input-count condition selects a mode for a recipe starting its
own training; `TRAINING_POINTS` then recurses as `TRAINING_POINTS`, and legacy `TRAINING_DATA` as `TRAINING_DATA`.
An intermediate's own input count determines only how its own points are sampled and guarded; it does not change
the inherited mode or definition for descendants. Separately trained imagery referenced as an input starts its own
Consumer definition, rather than inheriting the outer recipe's sampling definition. Keep this distinction in the
memoization/identity tests, including a shared Provider reached from more than one training Consumer in one graph.
Preserve each point's stored label, no-reuse output, unknown/collision behavior and matching JS/EE ordering rules.

No further design blocker is established by the amended proposal. Single-input-first and deferring units/encoding
checks are the review recommendations; multiple-input correspondence remains open. This is approval of the design,
not verification of an implementation or a live Earth Engine result. Only the roadmap changed; `git diff --check`
is the applicable check for this review update. Execution, readiness, tests and message changes should land together
under the amended S4 acceptance plan.

**Superseded in part (2026-10-25, user clarification):** the legacy fallback and `TRAINING_POINTS` above are withdrawn,
and so, later, is the single-input restriction that replaced them. Positional matching is also withdrawn; the current
proposal under F4 recommends named input roles with `TRAINING_DATA` as the single reuse operation. The ordering, recursion, label, identity and one-graph
requirements of this review still apply.

**User scope clarification (2026-10-25): single-input support for reused Classification training in Time Series.**
The user clarifies that the aim is useful leniency, not support for every case, and that multiple input images should
not be supported in the workflow of reusing Classification training data to classify a Time Series. This supersedes
the proposed multi-input fallback for that workflow: use one Consumer-feature sampling contract, and refuse an
unsupported multi-input Classification or point-contributing Provider through shared readiness before product work.
Do not retain a second Provider-feature sampling path merely to accommodate that case. One input image may itself
be a Stack containing many bands; neither multiple bands nor several reused Providers is the same restriction.

The next S4 proposal/implementation brief must reflect this boundary and reassess whether both sampling operations
are still necessary. Define the affected collection-classification contract once and let generic gates locate its
findings; no Time Series panel-specific validator or runtime-only throw. The clarification concerns this workflow:
standalone generation from a recipe's own multiple inputs and Regression's separate contract are not silently banned
by it. Trace and state any broader compatibility effect before implementation. Multi-input correspondence is outside
the supported Time Series workflow rather than a reason to invent or carry a fallback there. The earlier design
reviews above describe their then-current proposal; they do not override this later scope decision.

**User rationale for the supported reuse workflow (2026-10-25).** The aim is to reuse a Classification's training
points for classification of a sensor-backed Time Series (Landsat, Sentinel-2, Sentinel-1 or Planet), with useful
leniency when the source Classification's selected bands differ. The samples derived from the source imagery must
still represent measurements comparable to those of the monitored scenes: compatible feature meaning, scaling,
units and processing. Matching feature names or successful derivation alone does not establish this. Values may
vary by location/date; the measurement contract must remain meaningful.

The single-input boundary is a deliberately limited supported workflow, avoiding arbitrary multiple-input fusion
and its unresolved correspondence; it is not a scientific guarantee of similarity. A Stack that selects or renames
bands from suitable imagery can be one input, while wrapping incompatible data in a Stack does not establish
comparability. Only the features Consumer actually uses need that correspondence; unused Provider bands or a
different Provider band selection need not invalidate reuse. S4 should be lenient about selection and derivation,
preserve measurement semantics, and refuse known structural incompatibilities through shared readiness. No automatic
sensor-similarity test, new units/encoding validator, or universal guarantee of training suitability is approved by
this rationale; those checks remain outside the agreed scope unless separately established from reliable metadata.

**Standalone year-to-year reuse (user clarification, 2026-10-25).** The same leniency is required when a regular
Classification for 2021 reuses a Classification for 2020. This belongs to training-data reuse itself, including
standalone Classification, rather than a special Time Series path. The Provider's 2020 labels stay attached to
features sampled from its 2020 imagery at its own points; the Consumer requests its feature definition there and
applies the trained classifier to its 2021 imagery. A different Provider band selection is acceptable when its
imagery can derive those features. The supported single-input reuse contract above covers this case too.

Current execution already preserves Provider imagery, points and labels and applies the Consumer's normalisation,
but still samples the Provider's own feature selection. Thus existing reuse works where those sampled features
supply the Consumer's requirements; the broader derivation leniency remains proposed S4 work. Keep the standalone
2020-to-2021 case in the regression plan alongside collection classification. Shared training data supports the
comparison; it does not itself establish matching class meanings, feature definitions or model settings across
recipes, or guarantee comparable probability estimates.

**Review of the single-input S4 proposal (2026-10-25; superseded by the multiple-input clarification below).** One Consumer-feature
sampling contract and the single `TRAINING_DATA` operation fit standalone Classification, collection classification
and Regression. The reviewer supports the documented compatibility tightening for multiple-input reuse across these
callers: reject it through the shared finding, keep multiple-input own-point classification unchanged, and carry no
fallback. A Stack may explicitly assemble one image with suitable output names; wrapping imagery does not establish
scientific comparability. No new operation context, per-feature operation or second sampling responsibility is needed.

Keep these invariants explicit in implementation and regressions:

- A Provider used only to forward nested points is judged as a Provider, not as an independently training Consumer.
  Its two inputs do not trigger the Consumer-side multiple-input reuse finding when it stores no points. It forwards
  the original definition unchanged; its own missing-imagery prerequisites remain as declared. Independently building
  that recipe's own trained image still judges it as its own Consumer.
- Input counts and whether a recipe stores configured points are facts of the held model. A known unsupported count
  produces its finding even while band evidence is pending or unavailable. Unknown band evidence establishes no
  missing-feature finding; it does not erase an independently confirmed structural finding.
- Cover the standalone 2020-to-2021 reuse case as well as collection classification. Labels stay with their Provider
  imagery and Consumer normalisation stays Consumer-owned. This gives a shared training basis, not a fixed-model or
  calibrated-probability guarantee; a new model-reuse/cache contract is outside S4.

Review was by tracing current operations, requirement ownership, sampling callers and the revised proposal. No
production changes or new test results are claimed by this design approval. Earlier reviewer additions to
`behavior-contracts.md` and `source-resolution.md` remain part of the documentation working tree.

**Multiple-input reuse must remain supported (user correction, 2026-10-25; assessment required).** A standalone
Classification with two input images must be usable as a training-data Provider for another standalone Classification
with two input images. The reviewer approved a restriction broader than the user's collection-classification scope
justified; that approval is withdrawn. Do not implement the proposed blanket `MULTIPLE_TRAINING_INPUTS` refusals or
require users to replace their existing multi-input Classifications with Stacks. Standalone multiple-input reuse and
the existing one-input limit when applying a classifier to a sensor collection are different contracts. Regression
must not acquire a broader reuse prohibition merely to share the Classification implementation.

A read-only numeric probe of the real committed Classification over `numericEarthEngine.js` confirms that matched
two-input reuse runs today. The Consumer selects `red,nir` from input 1 and `red` from input 2; a Provider with the
same selections gives `band_order=[red,nir,red_1]` and its first reused row is
`{class:1, red:100, nir:1000, red_1:10}`. Changing only the Provider's selections to `red` from input 1 and `red,nir`
from input 2 gives the same names but `nir:20000`, from input 2, although input 1 still contains `nir:1000`. Applying
the Consumer's selections to the corresponding Provider inputs restores `nir:1000`. This last case simulates a
proposed per-input definition using the existing execution, not an implemented new API. It establishes numeric row
content over the stand-in, not Earth Engine evaluation, real masks or scientific comparability. The probe ran from
standard input, left no scratch file and made no external call.

**Next design assessment:** generalise the Consumer definition to an ordered list of input definitions, preserving
which input supplies each feature before concatenation. Assess matching Consumer input 1 to Provider input 1, input 2
to input 2, and so on: execution already uses saved input order to assemble the feature image and assign duplicate
name suffixes. Single-input reuse is then the one-entry case of the same algorithm, not a fallback or second sampling
implementation. Input ids from independent year-specific recipes are not established semantic correspondence keys.
Position matching is a reviewer proposal to assess, not a user-approved automatic mapping. Equal counts alone do not
prove that corresponding inputs represent comparable measurements; do not guess correspondence from flattened band
names, especially when they repeat.

Before implementation, state the matching rule and its user-visible meaning, behaviour for unequal input counts or
unmatched inputs, and the compatibility effects for existing Classification and Regression reuse. Preserve Consumer
operand/band order within each matched input, current assembly/name semantics for unchanged cases, Provider imagery
and point labels, sampling scale/masks, nesting, Consumer normalisation once, and collection sampling outside the
scene map. Empty intermediates forward the original complete definition; trained recipes used as input imagery
still start their own definition. Keep Consumer-dependent derivability in the Consumer's shared requirement and
Provider-independent prerequisites in its reuse operation; reassess operation identities with the input list.

Required evidence includes an unchanged working two-input-to-two-input reuse case, different selections deriving the
Consumer's features from the correct Provider inputs, duplicate names and asymmetric combinations, missing bands in
one input despite their presence in another, nested/shared Providers, Regression compatibility, single-input
collection controls and no-reuse controls. This amendment changes documentation only; the production design remains
pending the revised assessment.

**Named-role proposal: independent review (2026-10-25; product choices pending, not implementation approval).**
Named roles are a viable way for users to declare correspondence, independent of order and overlapping band names.
The proposed optional field is a persisted Classification/Regression model change and must be presented as such.
The one-input exception in F4 already preserves unnamed pairs while refusing two explicitly conflicting names;
keep that distinction in the shared rule and tests.

Required corrections or limitations before implementation:

- **Bindings are not inherently unable to handle nesting.** Per-edge composition is one representation, not the only
  one. A Consumer can instead bind its input ids directly to the input ids of each point-contributing Provider reached
  through its data set. That handles empty intermediates but requires more configuration, contributor discovery and
  maintenance when the reuse graph changes. Compare roles and bindings on ownership and complexity, not a claim of
  impossibility. Roles require edit access to each Provider needing names; renaming a shared Provider role affects its
  Consumers. An unnamed read-only multi-input Provider cannot be repaired by a Consumer using this proposal.
- **Empty intermediates must remain association-independent.** Adding `DUPLICATE_INPUT_ROLE` unconditionally to
  Provider `TRAINING_DATA` would reject an empty intermediate despite the proposed guarantee that it needs no roles.
  Apply association-related role checks only where relevant to point contribution, preserving independently declared
  input-existence/source prerequisites. Cover an empty intermediate with duplicate roles and an independently
  trained image of that same recipe as separate cases. Do not accidentally add role-related holds to unchanged
  own-point/no-reuse workflows.
- **Unused sampling inputs are not yet excluded from readiness.** `TRAINING_DATA` still declares all `INPUT_IMAGE`
  edges as `IMAGE_OUTPUT`; the current `describedInputs(INPUT_IMAGE, provider)` API resolves all inputs in that role,
  and closure validity also reaches unused references. Thus an unrequested Provider input's broken recipe, missing
  source or unavailable observation may still hold the Consumer, even if its mask no longer affects sampled rows.
  State this conservative limitation if closure/acquisition changes stay deferred. Do not claim that unrequested
  inputs cannot block or are never read. Add a regression recording the intended result for a broken unused input,
  and distinguish the confirmed sampling-mask change from evidence/closure behavior.

Reviewer recommendations for the pending product choices, subject to the user's decision: prefer roles if editing
Provider input names is acceptable; allow a one-input collection Classification to request exactly one explicitly
associated input from a multi-input Provider (the Provider contributes points, its multi-input classifier is not
applied to the collection); and use normal located findings to repair unnamed existing reuse rather than a separate
one-time prompt. None of these recommendations claims automatic measurement compatibility or approves a new mapping
UI. The collection's own applied Classification still has one input. Roles need to be configurable on a Provider
even when it itself uses no reused training data.

This review traced the proposed rules against the existing input extraction, `TRAINING_DATA` declarations and
readiness input-acquisition/traversal APIs. No production changes, new probes, test results or live Earth Engine
verification are claimed. The outstanding choice is the ownership/cost of association, not a requirement to carry
two sampling implementations.

**S4 implementation (2026-10-26; named-feature contract with the case-insensitive amendment; browser checks pending).**
Execution, shared readiness, feedback and regressions landed together; nothing is staged or committed.

- **Shared rules** (`lib/js/shared/src/recipe/bandSets.js`). `featuresOf(bandSetSpecs, auxiliaryImagery, bands)` gives
  each input's features once, with the form execution builds: `RAW` (a band as it is, a provided index included),
  `CALCULATED` (an index of its standard bands, overwriting a band of its name), `COMBINED` (operands in the input's
  band order, operation), `COVARIATE` (configured `auxiliaryImagery` only). `requestedFeatures` gives the Consumer's
  features per input - unknown for an undescribed input - and the names its inputs give more than once, whatever their
  case, covariates excepted. `featureSupply` judges each requested feature against each Provider input's described
  bands: an input supplies it where it holds every band the feature is built of (`requiredBands`) exactly once,
  whatever its case (`matchingBands`), and collides where it holds one of them more than once (`red` beside `Red`,
  whichever matches the spelling asked). Nothing is ranked or combined across inputs. Provider band sets play no
  part. `sampledFeatures` keeps its role (a recipe's own one-input features) over `featuresOf`.
- **Readiness** (`trainingData.js`). `trainingFeaturesRequirements` replaces the single requirement: for each recipe
  storing points in a data set's reuse, `MISSING_TRAINING_FEATURES` (no supplier, no input unknown; `requires` names
  each derived feature's bands) and `AMBIGUOUS_TRAINING_FEATURES` (several suppliers, or a collision, whatever is
  unknown; `conflicts` gives each input's matching bands as spelled), at the data set; and, while the recipe reuses
  training data, `AMBIGUOUS_TRAINING_FEATURES` at each of its own input images giving a repeated name. An undescribed
  input establishes no missing feature and no unique supply; two known suppliers still establish ambiguity. A recipe
  storing no points is not judged and forwards the definition; a recipe used as input imagery is judged by its own.
  A Provider without input images is refused for that alone, with no feature finding. Classification's
  `TRAINING_DATA` no longer carries its own band-set refusals (they stay for `CLASSIFIER`, which applies its band
  sets to scenes); Regression's carries none. Inputs-described and nested `TRAINING_DATA` needs are unchanged.
- **Execution** (`lib/js/ee/src/classification/features.js`, used by both types). `addCovariates` is consolidated
  there. A Consumer passes `featureDefinition(inputs, auxiliaryImagery)` - per input its band sets, input band names and
  feature names, as Earth Engine lists - to each reused recipe's `getSamples$(definition)`; Regression gains
  `getSamples$` and no longer reuses `getTrainingData$`. A Provider storing points samples `definedFeatures(images,
  definition, provider)` of its own inputs at its own points and `scale`; one storing none builds and samples nothing
  of its own and forwards the definition along its reuse, nested before own, in configured order. For each Consumer
  input and Provider input a candidate is built in the Consumer's form - bands matched case-insensitively and aliased to
  the Consumer's spelling, an index calculated only where its standard bands are all present, combinations ordered
  like the Consumer's input, no covariates - and each feature is taken from the one candidate holding it, in the
  Consumer's order and names; concatenation names repeats as the Consumer's does (`latitude_1`). None, several, or a
  collision fails the evaluation with an actionable error naming the feature, the Provider, the conflicting inputs or
  spellings, and an index's required bands; a Consumer repeating a name, whatever its case, fails too. Errors are
  carried by a missing-key `Dictionary.get`, as Earth Engine refuses a computed image id outright. Covariates are
  generated once per definition input under their names, keep intrinsic masks and are masked by the supporting
  Provider inputs (those supplying that input's features; all, for a covariate-only input). Inputs supplying nothing
  are not sampled. The sampling projection is explicit: the first defined non-covariate feature as supplied - what a
  Provider's own first band would have been for matching selections - or the first input's first band for
  covariates alone. Consumer sampling, normalisation once with its own statistics, `band_order`, no-reuse construction
  and the collection's once-per-computation training assembly are unchanged; the collection classifier keeps its
  one-input `classifyImage` constraint, separately.
- **Feedback.** Data-set items and their editors say missing features with the derived feature's bands, and
  ambiguity with each input's conflicting bands, both ending "Give the bands distinct names in a Stack's Band names
  panel, and use that Stack in both recipes"; the editor appends the existing repair instruction and holds Apply as
  before, with isolation and unchanged Close kept. Consumer ambiguity is said at Input imagery
  (`AMBIGUOUS_INPUT_FEATURES`). No blue paragraph, no new action. Execution keys
  `process.classification.trainingFeatures.*` are untranslated on purpose: the GUI shows the server's detailed
  message as the default (`userError.js`).
- **Compatibility.** No saved-structure, task-payload or no-reuse change. Reuse whose requested features are each
  supplied once runs, rows now carrying the Consumer's features (different where the Provider's selection, order or
  derivation differed, or concatenation took a value from the wrong input); a Provider selection narrower than its
  imagery is newly accepted. Newly refused with a located finding: a requested name supplied by several inputs or
  matched twice by case, a reusing Consumer giving one name from several inputs, and a provided/calculated index form
  mismatch. Readiness-only reads no longer observe the inputs of a Provider storing no points, which execution no
  longer builds.
- **Regressions.** Shared: `bandSets.test.js` (forms, requests, supply, case-only matches, within/across-input
  collisions), `trainingFeatures.test.js` (77: narrower selection, reordered and Stack inputs, requested versus unused
  duplicates, Consumer ambiguity, covariates and an input merely named latitude, index forms, combinations, nested,
  empty and shared Providers, a trained input image, unknown/unavailable evidence, repair, required bands and
  conflicts), and updated `trainingDataReadiness`, `classifiedOutputTraining` and `pyeoTrainingReadiness`. gee:
  `consumerFeatures.test.js` (whole labelled rows for the cases above, Regression, normalisation once, masks,
  covariate support, scale and projection anchor, one versus three scenes, execution failures with readiness bypassed,
  case aliasing under the Consumer's spelling, and readiness/execution agreement over ten scenarios), updated
  `reusedSamples` and guard fixtures (`loadObservations`, export `timeSeries`, `imageAssetExport`), over a numeric
  stand-in now modelling masks, lazy failures, a computed image id's refusal and band-less arithmetic. GUI: data-set
  marks, editor holds and Input imagery ambiguity, both types.
- **Witnesses.** With the `HEAD` shared rules, 44 of 111 shared readiness cases fail; with `HEAD` execution, 37 of 82
  numeric cases; controls pass. The live run found three execution faults the stand-in then learned to refuse: a
  computed image id (40 numeric cases fail when restored), an index calculated over a band-less image (1) and a
  band-less mask (9).
- **Verification.** Shared `test/recipe` 1424; gee unit tests 1396; GUI Classification, Regression, PyEO, Time Series,
  CCDC, Phenology, Remapping, Masking, Stack, Band Math, Unsupervised Classification, process panels and related, 90
  files and 1155 tests (two workers). ESLint and `git diff --check` clean. Live, read-only, no exports
  (`verify/classifierNormalisation.mjs`, service account): 35 checks pass - the existing whole-row, prediction,
  footprint and mask comparisons; one-input reuse with the Provider selecting one band; two-input reuse in reversed
  order over a Stack spelling `Red` and SRTM, whole rows against an independent construction (calculated NDVI,
  difference, duplicated latitude, elevation on another projection), the point outside the Provider's scene excluded;
  and a `red`/`Red` collision failing with the decoded message. The full GUI suite was not run.
- **Limitations.** An execution error for a missing combination does not list its operands (readiness does). Masks
  are verified live by footprint exclusion and the existing masked-scene checks, not by an in-scene masked required
  band. Measurement comparability, units and encoding are not established by names; multiple-input collection
  classification is still refused only in execution (`classifyImage`), with no shared finding.

**S4 implementation: independent review (2026-10-26; corrections required before commit).** The main flow follows
the named-feature ownership and normalisation contract, but targeted checks establish the following findings:

1. **[P1] Candidate construction rejects collisions in data that cannot supply the requested feature.**
   `classification/features.js` constructs candidates from all original Consumer band sets and calls `aliased`
   before establishing whether the complete requested construction can be supplied. A Consumer requesting only
   calculated `ndvi` has exactly one supplier when Provider input A has `red,nir` and input B has `red,Red` but no
   `nir`: shared `featureSupply` reports supplied, yet numeric execution and live Earth Engine both refuse B's
   irrelevant case collision. The same happens for a `red,nir` difference. Two more supplied cases also fail live:
   a configured latitude covariate overwriting a raw latitude selection, with Provider bands `latitude,Latitude`;
   and a combination overwriting a raw band of its output name, with Provider bands `red_nir_difference`,
   `RED_NIR_DIFFERENCE`, `red`, `nir`. These raw collisions are not part of the final requested feature. Construct
   effective requested features in their final form, and determine complete supplier eligibility before raising
   operand collisions. Do not make readiness reject these valid requests merely to match execution. Add all four
   regressions, retaining controls where a complete supplier is genuinely ambiguous.
2. **[P1] Two distinct combination operands differing only in case can bind to the same Provider band.**
   `bandSets.js` checks each required operand independently but does not require distinct requested operands to
   retain distinct sources. Consumer `DIFFERENCE` of `red,Red` over values `100,20` gives
   `red_Red_difference=80` for its own samples. A Provider holding only `red=120` is accepted as a unique supplier
   twice, so its reused rows train on `red_Red_difference=0`. Actual shared readiness is `READY` with no findings;
   both numeric execution and live Earth Engine confirm the zero. Reject case-colliding requested operands through
   shared readiness and the bypassed-readiness execution guard; preserve the no-reuse native calculation. Add the
   same-name-alias regression for combinations and a valid distinctly named operand control.
3. **[P2] The agreed multiple-input application finding is still missing.** A trainable two-input Classification
   over optical `red,nir` and a DEM is `READY` for both `IMAGE_OUTPUT` and `CLASSIFIER`, with no findings, while
   `classifyImage` still throws on more than one input. The omission is disclosed in the implementation report but
   was not an agreed deferral: F4 and the implementation packet require `MULTIPLE_CLASSIFIER_INPUTS` in shared
   readiness. Add it for `CLASSIFIER` only, attributed to the Classification input imagery, so dependent collection
   operations refuse before building. Keep standalone multiple-input `IMAGE_OUTPUT` and Provider sampling supported.

**Independent verification.** Actual per-file Node runs passed 132 shared tests (`bandSets`, `trainingFeatures`,
`output/trainingDataReadiness`) and 100 gee tests (`consumerFeatures`, `featureNormalisation`, `reusedSamples`,
`sampledFeatures`). Mounted GUI `reusedTrainingDataEditor` and `reusedTrainingDataFeedback` passed 58 tests in the
musl GUI container with two workers. These are passing existing regressions, not evidence against the new findings.
The read-only live probes used small constant images through the real feature construction and no production file
swaps. They confirm all four failures in finding 1 and the incorrect arithmetic in finding 2. A separate in-scene
mask control passed: of two Provider points, one where required `nir` was masked was excluded, the other retained,
even though an unused input was masked in the opposite area. Add that control to the permanent live check so its
evidence covers the originally planned masked-required-band case. Full GUI and the 35-check verification command
were not rerun; targeted live checks addressed the uncovered concerns. No exports or asset writes were started.

Only documentation was edited by the reviewer. Probes ran from standard input, created no scratch source file and
made no saved-recipe changes. No production fix, staging, commit or push was performed. `git diff --check` passed.

**S4 review corrections (2026-10-26; browser checks pending).** The three findings above are corrected; nothing is
staged or committed.

1. **Effective requests, eligibility before collisions** (`features.js`). Execution no longer builds candidates per
   Consumer band set. It derives the Consumer's requests in their final form - per band set a raw band, a calculated
   index or a combination named as the Consumer's input names it - and keeps only those that are effective: given
   by the Consumer's input, among its feature names, and not overwritten by a later band set of the same name.
   Configured covariates are no request. For each effective request, an input is eligible where it matches every
   band the request is built of at least once; only an eligible input holding one of them more than once collides.
   None eligible fails as missing (a derived feature names the bands one input must hold), several or a collision as
   ambiguous, naming each eligible input's matching bands as spelled. Readiness already judged supply this way; it is
   unchanged for these cases and its agreement is regressed.
2. **Case-only operands** (`bandSets.js`, `features.js`). A Consumer combination whose operands differ only in case
   is refused while the Consumer reuses training data: readiness reports `AMBIGUOUS_TRAINING_FEATURES` at that
   input image (shown at Input imagery), and execution, readiness bypassed, fails before matching any Provider band. Without reuse the native
   calculation (`red_Red_difference = red - Red`) is unchanged.
3. **`MULTIPLE_CLASSIFIER_INPUTS`** (`type/classification.js`). A `CLASSIFIER`-only finding at the Classification's
   `model.inputImagery.images`, carrying the count, so Time Series and CCDC operations over it refuse before building
   and the GUI names it at their classification field. `IMAGE_OUTPUT` of a multi-input Classification and its sampling
   as a Provider stay supported.

- **Live faults found by the extended check.** `ee.Number(false)` is refused client-side, and `Number.and`/`or`/`not`
  refuse the Boolean `List.contains` and `String.equals` return. Conditions now pass through one coercion
  (`truth`). The numeric stand-in learned both: it refuses a boolean `Number` and Boolean operands, and returns
  Booleans from `contains` and `equals`.
- **Regressions.** Shared (`trainingFeatures`, `classifiedOutputTraining`): an index or a combination beside an input
  lacking a band of it that holds another twice, covariate and combination overwrites, case-only operands refused at
  the input with a distinct-operand control, the two-input refusal at input imagery, and a two-input Provider still
  allowed. gee: the same cases as whole rows, including the no-reuse `red_Red_difference` and a genuinely ambiguous
  control, readiness/execution agreement, and the two-input guard in `loadObservations` and export `timeSeries`. GUI:
  a CCDC over a two-input Classification names it and holds Retrieve until one input is left.
- **Witnesses.** Collisions judged before eligibility: 3 numeric cases fail; overwritten requests built: 1; covariate
  names requested: 1; no case-only refusal in execution: 1, in readiness: 2; partial inputs eligible in readiness: 2;
  no multi-input finding: 11 shared, 4 gee and the CCDC GUI case. The previous condition helpers fail 64 of 133 numeric
  cases under the stand-in's Boolean rules.
- **Verification.** Shared `test/recipe` 1454; gee unit tests 1496; GUI Classification, Regression, PyEO, Time Series,
  CCDC, Phenology, process panels and locale, 49 files and 546 tests (two workers). ESLint and `git diff --check`
  clean. Live, read-only, no exports (`verify/classifierNormalisation.mjs`): 38 checks pass, now including, through
  the real feature construction over constant images, the in-scene control (of two Provider points the one where
  required `nir` is masked is no sample and the other is, an unused input masked at the other), an index supplied
  beside an input lacking a band of it that holds `red` and `Red`, and a Consumer combining `red` with `Red` refused.
  The full GUI suite was not run.
- **Limitations.** Measurement comparability, units and encoding are still not established by names. The live check
  covers the irrelevant-collision case for an index, not the overwrite cases, which the numeric suite covers.

**S4 review corrections: independent review (2026-10-26; one correction remaining).** The three original findings
are resolved. The four previously failing valid constructions now succeed in live Earth Engine: the index and
combination beside an irrelevant partial input, the covariate overwrite, and the combination overwrite. The
case-only combination is refused with its decoded actionable message. A separate shared read confirms a two-input
Classification is `READY` for `IMAGE_OUTPUT` and `NOT_READY` for `CLASSIFIER`, with the new finding at its input
imagery. The focused shared and mounted regressions retain multiple-input Provider support.

**[P2] A configured covariate name is also removed when it is a combination operand.** In `features.js`,
`requestsOf` filters `included` by `covariateNames` before dispatching on the band-set type. This correctly avoids
requesting a raw latitude feature overwritten by the generated covariate, but incorrectly removes a raw input band
used inside a different output. A Consumer combining its input's `red` and `latitude` into
`red_latitude_difference`, while also configuring `LATITUDE`, should request both that combination and the separate
generated latitude feature. Shared readiness is `READY`, with one complete Provider supplier and no ambiguity.
Execution instead constructs no combination request and fails selecting `red_latitude_difference`. Both the numeric
stand-in and live Earth Engine reproduce this; the no-reuse control correctly produces the combination and the
covariate together. This also affects any other combination operand sharing a configured covariate's name.

Keep operand names when deriving combinations. Exclude only requests whose final output is overwritten by a
configured covariate; do not exclude operands from an otherwise effective request. Add a readiness/execution
agreement regression for a combination using such an input band with that covariate enabled. Retain the existing
raw-covariate overwrite and no-reuse controls. This needs no change to the agreed sampling contract or persisted
settings.

**Independent verification.** Per-file Node runs passed 292 shared tests (`bandSets`, `trainingFeatures`,
`output/trainingDataReadiness`, `classifiedOutputTraining`) and 109 gee tests (`consumerFeatures`,
`featureNormalisation`, `reusedSamples`, `sampledFeatures`). Mounted GUI `reusedTrainingDataEditor`,
`reusedTrainingDataFeedback` and CCDC `classificationFeedback` passed 65 tests in the musl container with two
workers. Six read-only live evaluations cover the four repaired valid cases, the case-only refusal, and the new
covariate-operand failure. The author's full 38-check live command was not repeated. No exports, asset writes or
saved-recipe changes were made. Only this roadmap was edited by the reviewer; `git diff --check` passed. The full
GUI suite and browser checks remain pending.

**S4 covariate-operand correction (2026-10-26; browser checks pending).** `requestsOf` no longer filters band-set
names by configured covariates, so operands keep every input band. Covariates now take part in `effectiveRequests`:
a request whose output a configured covariate overwrites is not effective, beside the existing later-band-set rule. A
Consumer combining `red` with its input's `latitude` while configuring `LATITUDE` requests `red_latitude_difference`
and generates `latitude` beside it.

- **Regression.** `consumerFeatures.test.js`: for that Consumer, readiness gives no ambiguity and one supplier without
  collision, and execution trains on the Provider's `red - latitude` with the generated latitude, as whole rows. Before
  the fix it fails alone, selecting the missing `red_latitude_difference`. The raw-covariate and combination overwrite
  controls are kept; without the new exclusion the raw-covariate control fails.
- **Verification.** gee unit tests 1497. Live (`verify/classifierNormalisation.mjs`, read-only, no exports): 39
  checks pass, adding the same Consumer over a constant Provider (difference 117, latitude at each point). That live
  case was not run against the previous code here; the review above reproduced the failure live. No shared or GUI
  code changed, so those suites were not rerun. ESLint and `git diff --check` clean.

**Independent verification of the covariate-operand correction (2026-10-26).** No remaining S4 review findings.
The exclusion now applies to a request's final output name, preserving combination operands. Per-file Node runs
passed 110 gee numeric tests (`consumerFeatures` 51, `featureNormalisation` 26, `reusedSamples` 15,
`sampledFeatures` 18). Two read-only live Earth Engine evaluations independently confirm the repaired combination
(`red_latitude_difference=117`, with the generated latitude beside it) and the raw-covariate overwrite control
(the Provider's colliding `latitude`/`Latitude` bands are irrelevant to the generated covariate). The full 39-check
live command was not repeated. Shared and GUI code are unchanged since the previous review's passing runs, so
those suites were not repeated. Focused browser checks and the final full GUI campaign remain pending. Only this
roadmap was edited by the reviewer; `git diff --check` passed. Nothing staged, committed or pushed.

**S4 browser feedback (2026-10-26; partial, user reported).** In response to the new/edited data-set entry check,
the user confirms that adding `nir` back makes everything work again. The missing-band recovery check passes.
This report does not separately establish Apply/Enter refusal, completed export output, or the remaining S4
browser cases; those results have not yet been reported.

**S4 reduced browser checkpoint (2026-10-26).** The earlier five-part manual script is broader than needed for
the pre-commit checkpoint. The missing-band repair is already user-verified. Only two further checks are requested:

1. Use the repaired Consumer: Provider imagery holds `red,nir` while Provider selects only `red`, and Consumer
   selects both and reuses Provider. Obtain an actual Consumer preview and one completed Retrieve output. Count this
   as done if the user already obtained both; do not repeat it merely for this revised list.
2. Select an existing two-input Classification under SRC in either Time Series or CCDC. Confirm SRC explains the
   single-input constraint, charts and Retrieve are disabled, and no layer-error notification appears. Removing the
   extra Classification input releases the hold. The Classification's own standalone multi-input preview should
   remain supported.

No separate manual collision, covariate-operand, Regression-repeat or multi-input-reuse construction is required for
this checkpoint. Their detailed rules and arithmetic have focused automated coverage, with live Earth Engine checks
for the documented constructions. This reduces manual repetition; it does not claim unreported browser cases passed
or close S5/S6. The final full GUI campaign remains pending.

**S4 browser feedback: application-specific restriction (2026-10-26; explanation correction required).** The user
added a radar input to the Provider Classification and selected it under SRC in an optical CCDC. The field says
"classification_provider needs attention", while the Classification still renders correctly on its own. The hold
is appropriate: `CLASSIFIER` cannot apply a multiple-input Classification to each collection image. The standalone
`IMAGE_OUTPUT` is valid, and this Provider can still contribute training samples to a suitable single-input Consumer.
Do not imply that the Provider is intrinsically broken or needs its own standalone settings repaired.

- **Cause confirmed in code.** `classificationReferenceFeedback` uses the shared `referenceFeedback`, which reduces
  the finding to recipe/origin names and emits `recipeNeedsAttention`. The CCDC multiple-input mounted case explicitly
  expects that generic message, so its passing result did not establish actionable wording.
- **Required correction.** Preserve the operation-specific reason through the existing finding/feedback path and
  explain it beside the consumer's Classification field: the selected Classification has two input images, while
  application to a collection requires one. Offer selecting a single-input Classification as the repair; it can reuse
  this multi-input Provider's training data. Keep the existing shared rule and operation scope, without a separate GUI
  input-count validator, new status flag, or restriction on standalone images/Provider sampling.
- **Coverage.** Time Series and CCDC should explain the existing `MULTIPLE_CLASSIFIER_INPUTS` finding and count,
  hold the affected operations and recover after a suitable selection. The same Classification's standalone image
  remains usable. Keep ordinary upstream-failure feedback covered separately; a consumer-specific limitation must
  not be presented as a defect that can be found by opening the Provider alone.
- **Verification status.** The user confirms the standalone two-input Provider renders. This report establishes
  the misleading SRC message, not every chart/Retrieve hold or recovery step. No production change was made by the
  reviewer; this feedback correction is still to implement.

**S4 feedback scope amendment (2026-10-26; caller audit required).** The first correction packet explicitly covers
`MULTIPLE_CLASSIFIER_INPUTS` wherever Classification-reference feedback presents it. The user also asks to cover
other places where an otherwise valid recipe cannot fulfil a consumer's particular request. Do not assume fixing
the first Classification message establishes the whole presentation contract.

- **Inspection evidence.** `sourceRequirements.refusedReferences` currently reduces readiness findings to direct
  reference and origin IDs, discarding their codes, details and requested operation; `referenceFeedback` then emits
  generic "needs attention" prose. Its three caller families are Classification references (Time Series, CCDC,
  Phenology and PyEO), reused training-data references (Classification and Regression), and input-image references
  (Stack, Band Math, Remapping, Classification, Regression and Unsupervised Classification).
- **Audit those families, direct and nested.** Identify findings that can refuse the requested use while the
  referenced recipe's standalone image remains valid. Preserve enough structured information through the shared
  bridge to explain the actual use restriction at the selecting field. Do not infer a second validity answer by
  loading or judging the Provider's standalone image again. Multiple reasons must not be silently replaced by an
  arbitrary first finding; recipe/origin identities and deduplication remain intact.
- **Check equivalent selectors too.** PyEO already has a contextual single-input message; CCDC Slice and Change
  Alerts have segment-capability feedback through a separate path. Inspect these and other reference selectors for
  the same false implication, documenting unaffected paths rather than rewriting them automatically. This inspection
  establishes shared risk, not additional reproduced defects in every caller.
- **Acceptance.** Confirmed use restrictions name what the consumer needs and how to repair its selection, without
  claiming the Provider's own recipe is broken. Unknown-reason fallbacks make no stronger validity claim than the
  held evidence supports. Genuine upstream failures, pending/unavailable evidence, editor policy and operation gates
  keep their existing semantics. Add shared direct/nested coverage plus focused affected-caller regressions, and
  report a small caller inventory with outcome and coverage. Reuse the existing feedback mechanism; this is not a
  new validation framework or an expansion into S5/S6 settings ownership.

**S4 use-restriction feedback correction (2026-10-26; browser recheck pending).** A finding that makes a referenced
recipe unsuitable for what its consumer asks of it, while the recipe stays valid by itself, is now explained as the
consumer's requirement wherever reference feedback presents it. Validation, operation gates, readiness and execution
are unchanged.

- **Mechanism, in the existing bridge.** `refusedReferences` (`sourceRequirements.js`) now carries each reference's
  findings, with their codes and details (`count`), beside its origins. `referenceFeedback.js` keys use restrictions by
  finding code (`isUnsuitability`; today `MULTIPLE_CLASSIFIER_INPUTS`). The origin of such a finding is the recipe
  asking for the operation (`recipePath.at(-2)`), not the recipe it is found in. Directly selected, it is the selecting
  recipe itself, so no recipe further up is named. Each distinct restriction is explained ("{recipe} has {count} input
  images. This recipe requires a Classification with one input image. Select a single-input Classification."; further
  up, "{consumer} cannot run because {recipe} has {count} input images, while {consumer} requires a Classification with
  one input image. Select a single-input Classification in {consumer}."). Genuine causes beside them keep the existing
  "needs attention"/"cannot run because" wording; nothing is dropped for a first finding. The map layer's `refusedBy`
  uses the same origin. A Time Series layer shown elsewhere now says to review its Sources, not the Classification;
  reached through a Stack, it names the Time Series. The reused training-data editor, which replaced the message with
  "Fix the problem in …", shows the explanation instead, keeping the repair for genuine causes.
- **Inventory.** Among configuration requirements, only `MULTIPLE_CLASSIFIER_INPUTS` excludes the recipe's own
  image; the others on operations requested of references also refuse `IMAGE_OUTPUT`. This did not cover structural
  readiness findings: `UNDECLARED_OPERATION` (and `NON_IMAGE_OUTPUT`, `UNCLASSIFIED_ROLE`) can refuse a use while
  the recipe's image runs. Corrected in "S4 use-restriction fallback correction".

  | Caller | Outcome | Explanation | Coverage |
  |---|---|---|---|
  | Time Series, CCDC classification | Affected, fixed | Direct restriction at the field and SRC; Retrieve (and the TS chart) held | Mounted TS and CCDC: explanation and hold, recovery by selecting a single-input Classification reusing the two-input one's training data |
  | Phenology classification, classified band | Affected, fixed | As above; a band of the images reads no classifier and is unaffected | Mounted Phenology: classified band explained and held, `ndvi` control |
  | PyEO classification | Unaffected | Requests `IMAGE_OUTPUT`; its own `MULTIPLE_CLASSIFICATION_INPUTS` already says PyEO needs exactly one input | Existing |
  | Input images (Stack, Band Math, Remapping, Classification, Regression, Unsupervised Classification) | Affected when the input reads such a Classification, fixed | Nested restriction naming the recipe that selects it | Bridge: one and two levels down, mixed with a genuine cause, genuine nested control |
  | Reused training data (Classification, Regression) | Affected when the Provider's input reads one, fixed; editor override corrected | Nested restriction in the data set and its editor | Bridge: data set editor message |
  | CCDC Slice, Change Alerts, BAYTS segment/source requirements | Unaffected | Separate capability path, already worded as what the selected source cannot provide | Existing |
  | Map layer held upstream | Affected, fixed | Names the recipe to review by the same origin | Bridge: `refusedBy` direct, nested and genuine |

- **Regressions.** `outputRequirements.test.js`: direct (Time Series), one and two levels down (Stack), mixed with a
  genuine cause and a duplicated route, the reused data set editor, and a genuine nested failure keeping
  `recipeBlockedBy` and its `refusedBy`. Mounted `timeSeries`, `ccdc` and `phenology/classificationFeedback.test.jsx`
  replace the generic two-input expectation. Recovery selects a single-input Classification reusing the two-input
  Provider's training data, applied and reopened (the open form judges its draft). The Time Series case watches
  its output and pixel operations as Retrieve and the chart do, so the Provider's radar asset is read. Standalone
  multi-input `IMAGE_OUTPUT` and multi-input Provider sampling keep their shared coverage.
- **Witnesses.** With `sourceRequirements.js` and `referenceFeedback.js` from `HEAD` and the editor's previous
  message, 8 of 62 targeted tests fail - every new explanation case - while the genuine, recovery and band-of-the-images
  controls pass. Reverting only the editor override fails its case alone.
- **Verification.** GUI, two workers: Classification, Regression, Time Series, CCDC, CCDC Slice, Phenology, PyEO,
  Stack, Band Math, Remapping, Unsupervised Classification, Change Alerts and BAYTS directories, the process recipe
  top-level tests, process panels, map layer source and locale - 131 files, 2045 tests pass. Shared
  `classifiedOutputTraining` and `trainingFeatures` 237 pass. ESLint, translations JSON and `git diff --check` clean.
  The full GUI suite and a live probe were not run.
- **Remaining.** The restriction table holds one code. A future operation-scoped finding needs its own entry, or it
  falls back to the generic wording.

**S4 use-restriction feedback: independent review (2026-10-26; one audit correction remaining).** The direct and
nested `MULTIPLE_CLASSIFIER_INPUTS` explanations, repair attribution and editor override follow the requested
contract. Independent mounted/bridge tests passed 143 cases in seven files: `outputRequirements`, Time Series,
CCDC and Phenology `classificationFeedback`, the reused training-data editor and feedback files, and Remapping
requirements (two workers). `git diff --check` passed. No readiness or execution change was introduced by this
presentation correction.

**[P2] The audit misses an existing unsupported-use finding, and unknown reasons still imply an intrinsically
broken Provider.** `referenceFeedback.isUnsuitability` recognises only `MULTIPLE_CLASSIFIER_INPUTS`; everything else
is treated as a genuine standalone failure. The existing `UNDECLARED_OPERATION` can also refuse a consumer's
requested use while leaving the Provider's own `IMAGE_OUTPUT` ready. For example, a valid optical Mosaic named
"Working mosaic" referenced as a Classification's training-data source is refused for `TRAINING_DATA`, which it
does not provide. A shared readiness probe confirms the Mosaic's standalone image is `READY` and the Consumer is
`NOT_READY` with `{code: 'UNDECLARED_OPERATION', operation: 'TRAINING_DATA'}`. The unmodified feedback formatter,
run with a translation stub, nevertheless returns `recipeNeedsAttention` for "Working mosaic"; the editor then
directs the user to fix that Mosaic. This is a wrong reference selection, not something to repair in the Mosaic.
The shared `output/trainingDataReadiness` suite already covers this refusal, so it is not only a hypothetical future
restriction. The normal selector may prevent making that choice; persisted/requested references still receive this
supported refusal and need truthful feedback.

Explain unsupported requested operations as a restriction of the consumer's use, retaining the refusal and naming
the appropriate selection as the repair. Also complete the explicitly requested neutral fallback: an unknown reason
must not automatically assert that the Provider itself is broken. Keep genuinely established upstream-defect
feedback, nested identity and deduplication, and gate behaviour. Add bridge/editor regressions for this existing
operation refusal and a neutral unknown-reason control; no new validator or execution support is required. Correct
the inventory's claim of complete coverage to include structural readiness findings as well as configuration
requirements. Full GUI and live probes were not repeated. Only this roadmap was edited by the reviewer; nothing
staged, committed or pushed.

**S4 use-restriction fallback correction (2026-10-26).** Reference feedback now distinguishes three kinds of finding
reached through a reference, so that only an established defect says a recipe needs attention. Readiness statuses,
gates, validation and sampling are unchanged.

- **The distinction is shared.** `configurationFindings` (`output/readiness.js`) now gives a finding of a
  requirement that does not refuse the recipe's image the `operation` it refuses alone, as `UNDECLARED_OPERATION`
  already did. `UNCLASSIFIED_ROLE` found for an operation other than `IMAGE_OUTPUT` does the same
  (`resolveImageOutput.js`). Findings judging an image, and those of rules refusing it too, keep their exact shape.
- **Presentation** (`referenceFeedback.js`):
  - **Known use restrictions** are explained as the consumer's requirement with a selection repair:
    `MULTIPLE_CLASSIFIER_INPUTS`; `UNDECLARED_OPERATION` for `TRAINING_DATA` ("{recipe} provides no training data.
    Select a Classification or Regression with training data instead.") and for `CLASSIFIER` ("{recipe} has no
    classifier to apply. Select a Classification instead."); and `NON_IMAGE_OUTPUT` ("{recipe} makes no image.
    Select an image instead."). Each has an upstream form naming the recipe that selects it.
  - **Established defects** - no `operation`, or a band-set refusal, which the image's description also makes -
    keep "needs attention"/"cannot run because".
  - **Any other finding** refusing the use alone is neutral: "This recipe cannot use {recipe}. Select another
    recipe." or "{consumer} cannot use {recipe}. Review {consumer}, or select another recipe."
  - The bridge and the map layer's `refusedBy` attribute everything but established defects to the recipe asking
    for the use. The reused training-data editor shows the explanation, keeping its repair for established causes.
- **Regressions.**
  - Shared `classifiedOutputTraining`: `MULTIPLE_CLASSIFIER_INPUTS` names `CLASSIFIER`, `NO_TRAINING_DATA` names
    none.
  - GUI `outputRequirements`: the reviewer's Mosaic reused as training data, at the data set and in its editor,
    with no `refusedBy`; a Time Series selecting a Mosaic, reached through a Stack; a non-image selection; and
    neutral unknown reasons, direct and nested.
  - The existing genuine-defect cases are unchanged, including the inner Stack whose band names are refused.
- **Witnesses.**
  - The previous `readiness.js` fails the shared case in all 11 parameterised groups.
  - The reviewed `referenceFeedback.js` and `sourceRequirements.js` fail the 5 new GUI cases.
  - Treating nothing as established fails 32 genuine-defect cases.
- **Verification.**
  - Shared `test/recipe` 1465 and gee unit tests 1497.
  - GUI over the audited callers' directories, the process recipe top-level tests, panels, map layer source and
    locale: 131 files, 2050 tests (two workers).
  - ESLint, translations JSON and `git diff --check` clean. The full GUI suite and live probes were not run.

**S4 use-restriction fallback: independent review (2026-10-26).** No remaining S4 review findings. The additive
readiness metadata is a reasonable bounded change: use-only declarations identify the operation their finding
refuses, while the requirement predicates, execution needs and readiness statuses stay unchanged. Shared image
requirements retain their old shape. Presentation retains the band-set exception because those refusals also
invalidate the image's description. Structural unsupported-operation findings and known non-image selections now
give a selection repair; an unfamiliar use-only finding has a neutral direct/nested fallback.

- **Independent checks.** Per-file Node runs passed 361 shared cases in `output/readiness`, `resolveImageOutput`,
  `readImageOutput`, `analysisPrerequisites`, `trainingDataReadiness` and `classifiedOutputTraining`. Mounted/bridge
  GUI tests passed 150 cases in eight files, with two workers: `outputRequirements`, Time Series, CCDC and Phenology
  `classificationFeedback`, reused training-data editor and feedback, Remapping requirements and translations.
- **Targeted probes.** The unmodified formatter with a translation stub now explains the original
  `UNDECLARED_OPERATION/TRAINING_DATA` Mosaic finding as `providesNoTrainingData`, gives an unknown use-only finding
  `recipeUnusable`, and retains `recipeNeedsAttention` for an established `NO_TRAINING_DATA` defect. A separate
  `configurationFindings` assertion confirms a use-only requirement gains its operation while a requirement also
  applying to `IMAGE_OUTPUT` does not. No source file was swapped or changed for these probes.
- **Remaining verification.** The short CCDC field/SRC explanation and selection-recovery browser check remains
  pending, as does the final full GUI campaign. No further live arithmetic probe is needed for this presentation
  correction; the sampling code is unchanged. Only this roadmap was edited by the reviewer; `git diff --check`
  passed. Nothing staged, committed or pushed.

**S4 browser result (2026-10-26; user reported).** Responding to the short CCDC recheck, the user says "All good".
This confirms the two-input Provider gets the specific explanation and Retrieve is held, and selecting the
single-input Consumer clears the explanation and makes Retrieve available. The requested explanation/recovery
recheck is passed; do not ask for it again unless later changes affect the path. This is user-reported browser
evidence, not an agent-observed run or proof of a completed export. Build details and per-case task IDs were not
supplied. The final full GUI campaign remains pending. No staging, commit or push was performed for this record.

**S4 commit and origin integration (2026-10-26).** S4 is committed as `df7f4d019`
("feat(recipe): sample reused training data with the consumer's named features"). After fetching origin, 43
upstream commits through `5f52279983` are integrated without rewriting local history. The two content conflicts
were PyEO `panels/options/options.jsx` and its mounted test.

- **Resolution.** Keep origin's repeatability, cumulative and From/To detection thresholds, defaults, More/Less
  controls and compatibility with saved `minConsecutiveDetections`. Keep the shared readiness/candidate reads,
  disabled Require drop controls for unusable or unreadable Classification inputs, fresh index choices and the
  Asset -> Stack -> Classification index derivation. Minimum drop remains visible and disabled while Require drop
  is off or unusable, as in origin's layout. No copied-band validator is restored.
- **Coverage.** The mounted Options file retains all 19 existing readiness/Stack cases and the six new upstream
  threshold cases, plus one combined regression: thresholds remain editable and survive Apply after an upstream
  Classification repair releases Require drop. All 26 pass. The merge also preserves origin's export-submission
  notifications, task submission changes and unsettled-save leave warning.
- **Checks.** GUI 39 files / 525 tests (two workers), covering PyEO, Time Series, CCDC/CCDC Slice, export submission,
  autosave, recipe feedback and locale; shared 264 cases (`output/readiness`, `analysisPrerequisites`,
  `classifiedOutputTraining`, `pyeoTrainingReadiness`); gee 194 cases (PyEO params, baseline index, AOI, index gate,
  gate readiness, Time Series and CCDC/image asset exports). ESLint on the two resolved files and
  `git diff --check` pass. The full GUI suite and browser were not rerun for the merge.
- **Release boundary unchanged.** S5's ownership audit/implementation and S6's validation/chart agreement remain
  before push. Run final verification on the resulting tree. Nothing has been pushed.

**F5/F6. Make settings ownership explicit instead of automatically overwriting groups.**

- Audit each Sources and PRC field from producer through monitoring execution, not just matching property names.
  Record the owner, whether it must match, why a mismatch is invalid, where the effective value is read, and whether
  that value exists in segments-asset metadata. Distinguish matching units/corrections needed for comparisons from
  options that merely filter observations or configure a producer-only computation. Do not lock all of PRC by default.
- **Agreed direction:** a genuinely required match is source-owned and shown read-only, labelled as coming from the
  reference. Execution, editor values, readiness and submitted tasks use that same effective value. Do not merely
  disable a control holding a stale copy. Unrelated source changes do not overwrite editable consumer fields.
- For a recipe reference, use the authoritative current producer settings; for a segments asset, use its recorded
  settings without loading a private producer. Treat unavailable required metadata explicitly; do not assume a match,
  fetch inaccessible history, or silently invent a value. State any storage/import compatibility implications before
  changing persisted fields; existing editable overrides must not be silently discarded on opening a recipe.
- **Product policy, agreed 2026-10-26:** seed editable defaults when the first reference is applied
  while creating a new Change Alerts recipe. State in the creation flow that Sources/PRC defaults came from that
  reference; the following panels show the actual editable values. Thereafter they belong to Change Alerts. Replacing
  a reference preserves these settings by default and may expose incompatibilities through normal shared readiness.
  An explicit "Use reference settings" action for copying the new reference's editable defaults is deferred; see the
  dedicated follow-up after "S5 product decisions, agreed".
  Metadata refreshes and reopening a recipe are never requests to replace settings. Do not turn this into automatic
  Optical-to-Radar switching for fields the audit classifies as editable.
- **Acceptance:** editing producer property A cannot reset consumer override B; re-observing unchanged evidence and
  title/layout changes are inert. A source-owned value is consistently read-only and used by execution after producer
  changes. Asset-backed consumers work from metadata alone. Reopening and Cancel preserve user-owned settings; stale
  output/observation requests are withdrawn when effective computation changes, then recover through existing holds.

**F6 option assessment (2026-10-22; recommendation, not an implemented or approved policy).**

| Option for editable settings | Benefit | Main drawback | Assessment |
| --- | --- | --- | --- |
| Always start from generic Change Alerts defaults; never copy | Minimal implicit behaviour | The defaults are optical and can be a poor starting point for radar/Planet references; users must reconstruct a suitable configuration | Too much setup for initial creation. |
| Automatically copy whenever a reference is selected/replaced | Convenient matching starting values | Replacing the reference can erase deliberate consumer choices; cancelling/retrying or late metadata can make the replacement surprising | Do not use as the default for an existing configured consumer. |
| Keep automatically following producer changes, perhaps with per-field override tracking | Unedited fields remain up to date | Requires ownership/baseline tracking and conflict rules; does not guarantee editable settings must match scientifically; retains hidden changes | More machinery and more implicit behaviour than this task calls for. |
| Copy editable defaults at initial creation, then preserve them; allow explicit copying later | Useful initial setup with clear consumer ownership | A replacement can temporarily leave incompatible monitoring settings, which must be explained and repairable | Recommended, combined with source-owned read-only fields from F5. |

- **Observed implementation risk:** `monitoringSettings` compares against `ui.sourceEvidenceApplied`. That state is
  transient and initialized afresh on recipe load. Its first observation in a reopened editor can therefore propose
  settings again even though the persisted recipe already contains deliberate overrides. The implementation must
  distinguish a new, explicitly applied reference from the first metadata answer in a browser session. Do not add a
  persisted "copied once" flag merely to patch that observation callback; prefer the existing explicit creation /
  reference-Apply boundary and keep observation responsible for evidence.
- **Lifecycle cases:** first reference in a genuinely new recipe gets a coherent initial set of editable defaults;
  opening/importing an existing configured recipe does not initialize again; replacing a reference keeps consumer-owned
  settings; reapplying the same reference, refreshing metadata, a source edit and a reference draft followed by Cancel
  do not copy. Required linked fields remain source-owned under all of these cases, independently of editable copying.
- **Explicit copying:** show which editable Sources/PRC values will be replaced in the normal form flow, then commit
  them through Apply so Cancel can leave the recipe unchanged. Copy only the monitoring settings F5 identifies, as a
  coherent configuration rather than merging incompatible data families. Do not copy Classification, breakpoint
  bands, CCDC fitting parameters, monitoring dates or Change Alerts' detection thresholds. This does not require a new
  source-following mode, per-field override flags or stored producer snapshots.
- **Read-only assets and timing:** use the recipe/asset evidence already acquired for the selected reference; never
  fetch a private producer behind a shared asset. If optional editable-default metadata is absent, keep usable consumer
  defaults and explain that copying is unavailable; assess missing mandatory metadata separately under F5. A late
  metadata result must not overwrite edits or a newly selected reference. Initialization/copying must be part of the
  intended form action, not a delayed mutation after Apply when the user has moved on.
- **Targeted checks before adoption:** reopen a saved recipe with overrides in a fresh session; replace optical with
  radar with/without explicit copying; cancel the replacement/copy; edit while metadata is pending; re-export the same
  asset; and open an asset with no optional configuration metadata. Assert both the displayed values and applied model
  and keep relevant operation holds, avoiding tests that only prove one callback was called.

**S5 ownership audit and proposal (2026-10-26; audit only, no production change).** Traced from the producer and
its segments export, through `referenceObservation.js`, to Change Alerts' applied model, editors, shared readiness,
`observedCollection` and execution, on the merged branch (`5365cbc71`).

*How it behaves today.*

- **Whole groups are merged.** `changeAlertsObservation.applyAccepted` (`changeAlerts/referenceObservation.js`)
  merges the producer's `model.sources` (less `classification` and `breakpointBands`) and its whole `model.options`
  into the consumer. It does this whenever the selected source differs from, or the producer's settings differ from,
  the last evidence the policy processed (`ui.sourceEvidenceApplied`). The write happens in the evidence action, while
  an editor is open (`sourceRuntime/evidenceRegistry.js`, `#applied`). `merge: true` keeps only keys the producer
  lacks, so `sources.band` and `changeAlertsOptions` survive; every other key is overwritten. Editing producer
  setting A therefore rewrites consumer setting B.
- **Reopening overwrites saved overrides.** `ui` is never saved (`recipe.jsx`, `NON_CONTENT = ['ui', 'revision']`).
  A loaded or duplicated recipe gets only `ui: {initialized: true}` (`recipeCache.js`, `initializeRecipe`;
  `recipe.jsx`). So `previous` is undefined at the first observation of every session, and the producer's settings
  are merged over the saved ones. `assetDateFormat` has the same flaw: a corrected asset `dateFormat` is reset to the
  asset's on reopen.
- **A late observation is lost or silent.** A form initialises its values once, when it mounts (`recipe.jsx`,
  `initValues`). A merge that lands while Sources or PRC is open is discarded by that form's Apply; with the form
  closed, it changes the model without the user seeing it. This includes the creation wizard's Sources step when the
  reference evidence answers late.
- **Asset references copy nothing.** The CCDC segments export writes the GUI's `recipe_<key>` properties nested
  under one `formattedProperties` property (`gee/src/jobs/task/export/ccdcAssetExport.js`, unchanged since at least
  2023, and pinned by `ccdcAssetExport.test.js` "nests them under a single property"). The observation reads
  top-level `recipe_sources` and `recipe_options`, which that export never writes. The observation tests' asset
  fixtures assume top-level properties.
  - Whether Earth Engine keeps a dictionary-valued property on an exported image asset is not established. One
    read-only metadata read of a real segments asset would settle it.
  - What is recorded at top level: `dateFormat`, `startDate`, `endDate`, `visualization_*`, the segment band names,
    and `surfaceReflectance` (`1`, `false`, or absent - absent on one of two real assets, per that test file).
- **All readers agree, on the consumer's copy.** The Sources and PRC editors, readiness's `MONITORED_MEASURE`
  (`observedMeasures` reads `options.corrections`), the chart's `observedCollection`, the collection mosaic
  (`mosaicRecipe`) and execution (`timeSeries/changeAlerts.js`, `getObservations$` → `getCollection$`) all read the
  consumer's applied `model.sources` and `model.options`. No rule compares a required setting with the reference.
- **The algorithm decides what must match.** `analyzeChanges` takes the segment's prediction minus the observation at
  that date and divides it by the band's `_rmse` (`changeAlertsAlgorithm.js`). The producer fits through the same
  `getCollection$` (`timeSeries/ccdc.js`). So a setting that changes the monitored band's values or units must match
  the fit; one that only selects, masks or deduplicates observations need not.

*Field ownership.* "Today" is who effectively owns the value now; "Proposed" is the S5 owner.

| Field | Today | Proposed | Must match? | Evidence | Effective-value reader | Asset metadata |
|---|---|---|---|---|---|---|
| `reference.dateFormat` (asset) | REF field, prefilled and reset by observation | Asset when recorded; consumer only when not | Yes | Slices segment dates (`sliceSegments`); `segmentSource.js` uses it for assets | REF, execution | `dateFormat` |
| Segment date format (recipe) | Producer | Producer (unchanged) | Yes | `segmentSource.js`: `declared.dateFormat(record.model)` | Execution | - |
| `sources.dataSetType` | Copied | Consumer | No; must observe the band | `MONITORED_MEASURE` (`NO_AVAILABLE_MEASURE`) | Sources, readiness, mosaic, execution | Only inferable from band names |
| `sources.dataSets` | Copied | Consumer | No; selects scenes, must observe the band | `NO_OBSERVED_MEASURE` | Same | Not at top level |
| `sources.cloudPercentageThreshold` | Copied | Consumer | No; scene filter | Optical collection filter | Same | Not at top level |
| `sources.assets` (Planet) | Copied | Consumer | No; the imagery monitored | `SOURCE_IMAGERY` dependency | Same | Not at top level |
| `sources.band` | Consumer | Consumer, validated | Must be a fitted band | `MONITORED_MEASURE_ABSENT` / `_UNOBSERVED` | Sources, readiness, execution | Band names |
| `sources.classification`, `breakpointBands` | Not copied, ignored | None | No | `type/changeAlerts.js` | None | - |
| `options.corrections` `SR` | Copied | Reference | Yes: TOA or SR scale | `collection.js` `reflectance` | PRC, readiness band options, chart, mosaic, execution | `surfaceReflectance` (three-valued) |
| `options.corrections` `BRDF`, `brdfMultiplier` | Copied | Reference | Yes: transforms values | Optical collection `brdfCorrect` | Same | Not recorded |
| `options.histogramMatching` (Planet) | Copied | Reference | Yes: transforms values | `planet/collection.js` `mergedCollection` (optical ignores it) | Same | Not recorded |
| Radar `geometricCorrection` | Copied | Reference | Yes: changes backscatter | `radar/collection.js` | Same | Not recorded |
| Radar speckle filters and their parameters | Copied | Reference (recommended) | Yes: transforms values and their variance, which the `_rmse` describes | `radar/collection.js` | Same | Not recorded |
| Optical masks: cloud, shadow, snow, buffer, holes, cloud-mask thresholds; `orbitOverlap`, `tileOverlap` | Copied | Consumer | No; mask or deduplicate | Optical collection | Same | Not recorded |
| Radar `orbits`, `orbitNumbers`, `outlierRemoval`, `mask`, `minAngle`, `maxAngle`, `minObservations` | Copied | Consumer | No; select or mask | `radar/collection.js` | Same | Not recorded |
| Planet `cloudThreshold`, `shadowThreshold`, `cloudBuffer` | Copied | Consumer | No; masks | `planet/collection.js` | Same | Not recorded |
| Optical `compose`, percentiles, `filters` | Copied | None for monitoring | No; composite-only, not read by `getCollection$` | `collection.js` | None | - |
| `date`, `changeAlertsOptions` | Consumer | Consumer | No | - | Date, Options, execution | - |

*Proposed contract.*

- **Reference-owned settings are read, never copied.** The value-transforming settings above have one effective value:
  - the producer's current value, for a recipe reference (followed through a wrapper, as today);
  - the asset's recorded value, for an asset reference;
  - the consumer's saved value only where the asset records none. That case is shown as "not recorded by the asset",
    never treated as a match.

  One pure shared function (`lib/js/shared/src/recipe/changeAlerts/`) answers the effective Sources/options and each
  field's provenance, from the applied model and the reference's settings. The editors show the reference-owned
  fields read-only and labelled; `MONITORED_MEASURE`, `observedCollection`, `mosaicRecipe` and execution all use the
  same function. Execution already loads the producer record (`withSegmentSource$`) and can read asset properties.
  While the reference is not yet read, the value is pending, not a finding.
- **Consumer-owned settings are never written by observation after creation.** Reopening, refreshing, producer edits
  and reference replacement leave them alone. Whether the first reference may seed them is decision 1 below.
- **No persisted format change.** Saved copies of reference-owned fields stay in `model.options` untouched, and are
  ignored where the reference states the value. No migration and no "copied once" flag: a recipe is being created
  exactly while `!ui.initialized`, which no loaded or duplicated recipe ever is, and a new recipe is not saved before
  its wizard finishes.
- **Visible consequences.**
  - An existing recipe whose copied SR, BRDF, Planet histogram matching or radar correction/speckle settings drifted
    from its producer will compute with the producer's values: results can change.
  - Existing observation tests encoding the old policy ("supplies refreshed datasets and corrections when it
    changes", "re-export refreshes monitoring settings") are rewritten.
  - BAYTS Alerts' `applyAccepted` (`processingOptions`) has the same reopen pattern. It is left out of S5 and needs
    its own audit.

*The creation-only recommendation, against the actual lifecycle.*

| Case | Today | With creation-only copying |
|---|---|---|
| Saved overrides, fresh reopen | Overwritten by the first observation | Kept; reference-owned fields show the producer's current values |
| Producer edits an editable field | Consumer field overwritten | Unchanged |
| Producer edits a reference-owned field | Copied when the consumer's editor next processes the evidence; stale in the meantime | Effective everywhere immediately; no write |
| Reference replaced after creation | Whole groups replaced | Editable values kept. A family mismatch (optical settings against a radar reference) is refused at Sources by the existing `MONITORED_MEASURE` until repaired or explicitly copied. Reference-owned values follow the new reference. |
| Reference draft cancelled | Nothing written | Nothing written |
| Metadata answers while Sources is open | Lost on Apply, or silent if closed | After creation: nothing to write. During creation: the same race unless seeding moves into the reference Apply (see S5b). |
| Asset with no settings metadata | Nothing copied, consumer defaults kept | Same, stated as "not recorded"; never assumed compatible |

Without any seeding, a radar or Planet reference starts from optical defaults that Sources refuses until rebuilt by
hand. Seeding once at creation avoids that without surprising an existing configuration.

*Remaining product decisions, with recommendations.*

1. **Seed editable defaults from the first reference during creation:** recommended yes. The alternative is never.
   Either way, nothing is copied after creation.
2. **An asset reference that does not record a reference-owned setting** - the specialised CCDC export records none
   of BRDF, histogram matching or the radar settings at top level (narrowed in "S5 revised proposal"): recommended to
   use the consumer's value, shown as not recorded, without refusing. Refusing would retire such assets. Pair it with recording these settings at top level
   in new segments exports (additive metadata; older assets stay "not recorded").
3. **Radar speckle filtering as reference-owned:** recommended yes, because the residuals the confidence divides by
   describe filtered values. Making it consumer-owned trades that comparability for flexibility.
4. **An explicit "Use reference settings" action after creation:** recommended, in a later slice.

*Slices.*

- **S5a, the smallest coherent slice.** Stopping copies alone would leave a replaced reference's required settings
  stale, so S5a has to land the read-only effective values with it:
  - the shared effective-settings function, with provenance;
  - reference-owned fields read-only in PRC and the band options, with readiness, chart, mosaic and execution on the
    same values;
  - for assets, only `dateFormat` and `surfaceReflectance` (`1` → SR, `false` → TOA, absent → not recorded);
  - `applyAccepted` writing consumer-owned settings only while `!ui.initialized`, for a newly selected source, and
    asset `dateFormat` never written once the asset records it.
- **S5b, later.** Seeding as part of the reference Apply, so the creation race goes away; the explicit
  copy action; and recording settings at top level in segments exports.

*S5a acceptance tests* - focused, asserting both the displayed values and the applied model:

- A saved recipe with editable overrides, reopened fresh: unchanged after the observation answers.
- A producer edit of an editable field leaves the consumer alone. An edit of SR → TOA shows TOA read-only "from
  reference", and `observedCollection`, the band options and execution (gee unit test with a stub reference) use TOA,
  while the saved `model.options` stays as it was.
- Replacing optical with radar after creation keeps editable values, refuses Sources with the existing
  `MONITORED_MEASURE` finding, and shows the radar reference's corrections.
- During creation, the first reference seeds editable values once; a refresh does not seed again. Optionally, a
  replacement inside the wizard, per decision 1.
- An asset recording `surfaceReflectance: 1` and `dateFormat`: both read-only. An asset recording neither: the
  consumer's values are used, marked not recorded, and a corrected `dateFormat` survives reopening.
- A reference draft cancelled writes nothing.

*Contract S6 consumes.* S6's field validation, its retained invalid choices, and its Retrieve and chart holds judge
the effective settings from the S5 function, never the saved copy. The monitored band's options, `MONITORED_MEASURE`
and the chart's observed collection use the same SR value, and "pending" means the reference's settings are not yet
read. S5 changes neither validation messages nor chart lifecycle.

**S5 ownership audit: independent review (2026-10-26; proposal corrections before implementation).** The main
ownership direction is supported by the traced code: `referenceObservation.applyAccepted` writes whole groups
from transient previous evidence, and the confidence calculation compares observed values with the reference fit
and RMSE. Reference-owned value transformations and consumer-owned observation selection are a useful bounded
policy. Matching processing parameters is not itself proof of scientific comparability; keep that limitation clear.
No production code or tests were changed or run in this design review.

1. **The creation race belongs in the required S5 correction.** Restricting `applyAccepted` writes to
   `!ui.initialized` still lets late evidence overwrite a wizard's applied settings, or be overwritten by the Sources
   form already open. The audit explicitly reproduces the mechanism and its proposed lifecycle table leaves it in
   S5a. If creation seeding is chosen, do it at the first explicit reference Apply with the selected reference's
   evidence, preserving edits and Cancel and rejecting stale responses. Observation should not write configuration
   even during creation. This is part of fixing S5, not an optional later enhancement. Required work may land in
   several commits; only the convenience copy-again action can be deferred on that basis.
2. **Make unknown asset settings editable and distinguish effective defaults.** A value actually recorded by the
   reference may be read-only. When an asset records no value, the Consumer fallback must remain editable and be
   labelled as not recorded/unverified; otherwise the user has no way to configure an older asset correctly. Pending
   or failed metadata reads must not silently become this fallback. Missing producer keys in a recipe reference
   instead follow that producer's execution defaults (for example, radar `ELLIPSOID`/`NONE`), not the Consumer's stale
   copies. State those states and the precedence explicitly in the effective-settings contract.
3. **Narrow the metadata claim and complete the writer/reader contract.** The specialised `ccdcAssetExport.js`
   does nest `formattedProperties`, and `toAsset.js` does not flatten that property. But generic
   `imageAssetExport.js` already spreads formatted properties at top level and supports CCDC roots. Imported or
   manually annotated assets may also carry the expected properties. Thus "every existing asset lacks" these settings
   is not established. State the supported top-level and legacy nested forms, precedence and parsing behaviour;
   inspect an available real asset read-only before claiming what Earth Engine retained. Recording required
   processing metadata in new exports belongs to the completed S5 asset contract, even if a separate commit.
   Canonical processing facts must describe the recipe actually executed, not merely caller-supplied provenance.
4. **Show how every reader acquires the same reference facts.** `withSegmentSource$` already reads them for the
   Change Alerts image, but `loadObservations.js` projects to a Time Series before readiness and never calls that
   loader. The chart cannot gain reference-owned values by changing a pure `observedCollection` function alone.
   Add a reader/acquisition table for readiness, Sources/PRC drafts, observations, period mosaics and alert execution.
   Read producer settings/asset metadata through existing acquisition and request-scope facilities without building
   segments, requiring the producer's unrelated training dependencies, or fetching a private producer behind an
   asset. Record the intentional change to the previous reference-independent observations contract, including its
   regression updates. Keep pending/unavailable states and cancellation aligned with the effective settings.

**Recommendations on the open product choices (not user approval).** Seed editable defaults once on the first
reference Apply during genuinely new creation; preserve them after that. Permit explicitly labelled, editable
Consumer fallbacks for unrecorded asset values. Keep radar speckle-filter settings reference-owned when known,
without claiming this proves full measurement comparability. Defer an explicit "Use reference settings" convenience
action. BAYTS' similar mechanism needs a recorded follow-up audit rather than silently broadening S5. Also tighten
the field table to actual monitoring arguments: Planet `shadowThreshold` is currently passed by `getCollection$`
but not consumed by `planet/collection.createCollection`, so it is unused here rather than an effective mask setting.

The review changes documentation only. The implementation packet should incorporate these corrections and the
user's choices; no migration or production behaviour is authorised merely by recording this proposal. Nothing
staged, committed or pushed.

**S5 revised proposal (2026-10-26; after review, no production change).** It supersedes the S5a/S5b split above. All
of it belongs to completed S5, possibly across several commits; only the "Use reference settings" action is deferred.
The user agreed these product choices on 2026-10-26:
- seed editable defaults once, at the first Reference Apply of a new recipe;
- show labelled, editable fallbacks for settings an asset does not record;
- follow the reference's speckle settings when known.

Matching processing settings is a precondition for comparing observations with the fit, not proof of scientific
comparability.

*Corrections to the audit table.*
- **Planet `shadowThreshold`:** not a monitored-collection setting. `getCollection$` passes it, but
  `planet/collection.createCollection` ignores it; only the Planet period mosaic (`planet/mosaic.js`) uses it, so it
  stays consumer-owned there.
- **Planet `histogramMatching`:** transforms values only for daily imagery (`planet/daily.js`, `ENABLED`).
- **Asset `dateFormat`:** execution currently prefers the date format configured in REF over the asset's recorded
  one (`segmentSource.js`, `assetSourceFacts$`). S5 reverses that, as the nested-asset path already does.

*Effective-settings contract.* For each reference-owned field (corrections `SR`/`BRDF` and `brdfMultiplier`, Planet
`histogramMatching`, radar `geometricCorrection`, the speckle filters and their parameters, and an asset's
`dateFormat`), one pure shared function answers a value and a state:

| State | When | Value | Editor | Operations |
|---|---|---|---|---|
| `REFERENCE` | A recipe reference is resolved to its producer | The producer's value; a key the producer lacks takes the producer's execution default (radar `ELLIPSOID`/`NONE`, no `SR` means TOA, no `BRDF`, multiplier 4, Planet matching disabled) - never the consumer's copy | Read-only, labelled as the reference's | Use the value |
| `RECORDED` | An asset records the field (forms below) | The recorded value | Read-only, labelled | Use the value |
| `NOT_RECORDED` | The asset was read and no recognised form governs the field | The consumer's saved value | Editable, labelled "not recorded by the asset - check it matches" | Use the value |
| `UNREADABLE` | The highest-precedence form governing the field is present but malformed or invalid | None; never a lower form or the consumer's value | REF says the recorded processing settings cannot be read | Held through the existing hold path until repaired |
| `PENDING` | The reference's settings are still being read | None | Shown as checking; no fallback shown as effective | Wait (a need, not a finding) |
| `UNAVAILABLE` | The read failed | None | "Could not read the reference's settings", with Refresh | Held as unavailable; never the fallback |

Consumer-owned settings are always the consumer's applied values. The consumer's saved copies of reference-owned
fields stay in the model and are used only in `NOT_RECORDED`, so no migration is needed.

*Asset metadata contract.*
- **Reader, by precedence per field:**
  1. A canonical `processing` property (top-level JSON) written by new exports.
  2. Top-level `recipe_options` / `recipe_sources` JSON: written flat by the generic `image.GEE` export
     (`imageAssetExport.js`, which also exports CCDC roots), or by imports and manual annotation.
  3. The legacy nested `formattedProperties.recipe_options` written by the specialised `ccdc.GEE` export, if Earth
     Engine retained it.
  4. `surfaceReflectance`, for `SR` alone: `1` means SR, `false` means TOA, absent means not recorded.

  `dateFormat` is read at top level.
- **Parsing.** The highest-precedence form present governs the fields it covers.
  - A malformed or invalid governing form makes those fields `UNREADABLE`. They do not fall through to a lower form or
    to the consumer's settings.
  - A valid governing form is not rejected for a malformed lower one.
  - A failed asset read is `UNAVAILABLE`, never `NOT_RECORDED`.
- **Completeness:**
  - **Complete forms:** `processing`, complete by construction, and a `recipe_options` object that SEPAL wrote for a
    segment producer (beside a `recipe_type` naming one) record the whole producer options. A key absent from them
    takes the producer's execution default (`RECORDED`), not the consumer's old copy.
  - **Partial forms:** `recipe_options` without that producer marker - imported or annotated - records only its
    stated keys; any other key is `NOT_RECORDED`. `surfaceReflectance` covers `SR` alone.
  - Completeness and equivalence are never inferred from arbitrary properties.
- **Writer:** both segment-capable exports (`ccdcAssetExport.js` and `imageAssetExport.js` for a segments source)
  write a top-level `processing` property, derived server-side from the recipe actually executed - the segment
  producer the export resolved - not from caller-supplied `recipe_*` properties. It holds `dataSetType`, `dataSets`
  and the options `getCollection$` reads, well within the 16,384-byte property limit. Existing assets stay as they
  are: additive metadata, no rewrite.
- **Prerequisite:** read one real asset from each export, read-only, before relying on form 3. No real segments asset
  was available to this audit.

*Acquisition, per reader.* Every reader acquires the same reference facts without building segments, without loading
the producer's own dependencies (Classification, training data), and without loading a private producer behind an
asset.

| Reader | Acquisition | Pending / failure / cancellation |
|---|---|---|
| Sources, PRC, REF (`dateFormat`), monitored-band options | The applied recipe's evidence (`ui.sourceEvidence`) from `changeAlertsObservation`. It already reads the producer record (`resolveSegmentProducer`) or the asset's metadata, and it carries `processing` instead of `monitoring` | Evidence states; nothing is written into the model |
| GUI readiness (`MONITORED_MEASURE`) | `parameters(recipe)` already receives the recipe and its evidence; it reads the effective corrections | Pending is a need |
| Period mosaic description (`COLLECTION_MOSAIC`) | The caller projects the recipe with the effective settings, then describes the product from that configuration, as today; SR decides the optical band set | Waits while pending |
| Alert execution (`timeSeries/changeAlerts.js`) | `withSegmentSource$` facts gain `processing`: the producer record already loaded (`recipeRef.withRecord$` loads that record alone), or `assetProperties$` | Request scope and cancellation unchanged |
| Period mosaic execution | Same facts; `collectionMosaic` already resolves the segment source for its geometry | Same |
| Observations (`/timeSeries/loadObservations`) | **Changed contract:** for Change Alerts, the facts loader runs first (records only, under the request's scope), then the projection, then `observedCollection`, readiness (`requireRequestedBands$`) and the collection. Today this endpoint reads no reference | An unreadable reference refuses the request as unavailable instead of observing with the consumer's copy |

*Creation seeding at the first Reference Apply.*
- **When:** while `!ui.initialized` and no reference was applied before.
- **How:** the REF panel's Apply publishes, in the same action (`additionalUpdates`, `recipeFormPanel.jsx`), the
  seeded consumer-owned Sources/PRC defaults. They come from the evidence its `SourceCandidate` already holds for
  that draft selection: the producer's settings, or an asset's recorded forms.
  - **The guard already exists (confirmed in review):** `SourceCandidate.refused()` blocks the form, and
    `Form.Panel.apply()` refuses a blocked form before any write; `referenceRequirement.test.jsx` covers Apply while
    asset metadata is pending. Seeding reuses it, extending the evidence it needs if necessary.
  - The new accessor returns the current, authorised candidate facts, not any cached answer.
  - Candidate evidence belongs to the current edit, so a stale response cannot seed.
  - Cancel publishes nothing.
  - An edit made in Sources or PRC is never overwritten: only this Apply writes, before those steps open.
- **What is seeded:** the consumer-owned monitoring fields of the audit table, as one coherent set. Never
  Classification, breakpoint bands, CCDC fitting, dates or `changeAlertsOptions`. Reference-owned fields are not
  seeded; they are read.
- **When no settings are recorded:** an asset without recorded settings seeds nothing, and Sources shows Change Alerts'
  defaults.
- **Observation stops writing configuration.** `applyAccepted` (`monitoringSettings`, `assetDateFormat`) is removed
  for Change Alerts.
- **A later reference change** - in the wizard after the first Apply, or in an existing recipe - seeds nothing. A
  family mismatch is then refused by the existing `MONITORED_MEASURE` until repaired.

*Required work (S5), in commit-sized parts.*
1. Seeding at the first Reference Apply, and removing `applyAccepted` for Change Alerts.
2. The shared effective-settings function, with its states and asset forms, adopted by every reader in the
   acquisition table: editors read-only, readiness, mosaic description and execution, alert execution, and
   observations.
3. The `processing` metadata in both segment-capable exports.

Deferred: the "Use reference settings" action. Recorded follow-up: BAYTS Alerts' `applyAccepted`
(`processingOptions`) needs its own audit.

*Acceptance tests*, asserting displayed values, the applied model and operation holds:
- **Seeding:**
  - A new recipe's first Reference Apply seeds editable values in the same action. With Sources opened afterwards,
    the evidence answering again writes nothing.
  - A reference draft cancelled writes nothing. A second reference applied in the wizard seeds nothing.
  - Enter/Next submission seeds exactly as Apply does.
  - A selection or evidence change at the last moment seeds from the current selection only.
- **Reopen and producer edits:**
  - A saved recipe with overrides, reopened fresh, is unchanged.
  - A producer edit of an editable field changes nothing. An edit of `SR` → TOA shows TOA read-only, and band
    options, `MONITORED_MEASURE`, the mosaic bands, alert execution and observations all use TOA. The saved model is
    unchanged.
  - A radar producer without speckle keys is effective `NONE`/`ELLIPSOID`, whatever the consumer saved.
- **Assets:**
  - One case for each form: top-level `processing`, top-level `recipe_options`, nested `formattedProperties`, and
    `surfaceReflectance` alone.
  - An asset recording nothing: the field is editable and labelled not recorded, and execution uses the consumer's
    value.
  - Missing metadata is the editable fallback.
  - A malformed governing form is unreadable and holds operations; it does not fall through.
  - A valid higher form wins over a malformed lower one.
  - Repairing or re-exporting the asset releases the hold.
  - A complete legacy `recipe_options` lacking radar keys is effective `ELLIPSOID`/`NONE`; a partial imported one
    leaves those keys not recorded.
  - A pending read shows checking and holds; a failed read is unavailable and does not fall back.
  - A recorded `dateFormat` is read-only and wins in execution. An unrecorded one survives reopening.
- **Observations (gee):** a Change Alerts request reads the producer record or the asset's properties and builds the
  collection with its `SR`. An unreadable reference is refused as unavailable. A producer's Classification is never
  loaded. The existing reference-independent `loadObservations` cases are rewritten to the new contract.
- **Exports (gee):** both exports write `processing` from the executed producer, matching what `getCollection$`
  reads, and it reads back through the asset contract.

**S5 revised proposal: independent review (2026-10-26).** The revised ownership, first-Apply seeding, editable
unrecorded-asset fallback, export metadata and per-reader acquisition address the previous review. No further broad
ownership audit is requested before implementation. The following metadata correction can be incorporated directly
in the implementation packet rather than requiring another standalone proposal round.

- **Absent and malformed metadata are different evidence.** `NOT_RECORDED` must mean that the applicable setting is
  actually unrecorded, not that a present authoritative form could not be parsed or validated. A malformed canonical
  `processing` property must not silently fall through to stale `recipe_options` or Consumer settings and label
  them "not recorded". Report the affected processing facts as unreadable/unavailable through the existing hold
  path, with clear REF feedback. Valid higher-priority facts need not be rejected for irrelevant lower-priority
  metadata. Retain lenient editable fallbacks for genuinely absent older-asset metadata. Regress the missing,
  malformed, valid-priority and repair cases.
- **Normalise recognised metadata according to its contract.** A complete legacy producer-options record may omit
  parameters that execution defaults (for example radar geometric correction and speckle settings); where that
  legacy form establishes those defaults, do not accidentally replace them with the Consumer's old copies. State
  how complete recognised forms and genuinely partial metadata are distinguished. Do not infer completeness or
  scientific equivalence from arbitrary imported properties.
- **Reference Apply already has the relevant guard.** `SourceCandidate.refused()` reads the current section status,
  `recipeFormPanel` exposes it through the form's blocked callback, and `Form.Panel.apply()` refuses an invalid
  form before any writes. Existing `changeAlerts/referenceRequirement.test.jsx`, "shows itself busy while it is
  checked ... held back until it is known to suit", checks Apply while asset metadata is pending. Reuse that
  mechanism, extending the evidence needed for seeding if necessary; retain first-wizard-Apply, Enter/Next,
  last-moment selection/evidence changes and Cancel coverage. An accessor must return current, authorised candidate
  facts, rather than merely any cached answer.

The review continues to recommend the four product choices: first-Reference-Apply seeding once, editable labelled
fallbacks for truly unrecorded asset settings, reference-owned speckle settings when known, and a deferred copy-again
button. These recommendations are not a record of user approval. Shared observation scope deliberately changes only
to acquire the required processing facts; it must still avoid executing segments or loading unrelated training data.
Code and existing regressions were inspected; no tests were run and no production code changed in this design-only
review. `git diff --check` passed. Nothing staged, committed or pushed.

**S5 proposal ready for implementation packet (2026-10-26; final design review).** The in-place revised proposal
now distinguishes missing, malformed and failed-read metadata, defines recognised complete versus partial legacy
forms and their defaults, and reuses the existing current-candidate submission guard. No further technical design
correction is requested. Carry the documented round-trip, seeding/race, per-reader agreement and evidence-state
regressions into implementation. The nested legacy asset form remains subject to the stated read-only metadata
check; a `recipe_type` marker identifies a declared format, not independent proof of origin or scientific
comparability. The four product recommendations still await the user's agreement; this review does not record
that agreement. Only documentation was reviewed/edited; no tests were rerun, no production code changed and
`git diff --check` passed. Nothing staged, committed or pushed.

**S5 product decisions, agreed (2026-10-26).** The user says "Agreed, but make sure we capture the deferred button.
Implementation prompt." This approves first-Reference-Apply seeding once during creation, labelled editable
fallbacks for truly unrecorded asset settings, reference-owned speckle settings when known, and deferring the
explicit copy-again button. The earlier audit/review records' pending-decision notes are historical; the current
"S5 revised proposal" and its acceptance criteria are ready for implementation without asking these choices again.
S5 and S6 remain required before push. No implementation or commit is claimed by this decision record.

**S5 implementation (2026-10-26; uncommitted, browser recheck pending).**

The revised proposal and agreed product decisions above are implemented; the earlier S5a/S5b alternatives remain
historical. Change Alerts' observation has no `applyAccepted` configuration writes. It publishes processing facts
only, using the declared segment-provider chain rather than the producer's full dependency closure. The existing
closure loader accepts a scoped edge reader; other observers retain the default full closure. Asset references read
their metadata without looking up a private producer.

- `changeAlerts/processing.js` is the shared pure derivation. Each required field carries `REFERENCE`, `RECORDED`,
  `NOT_RECORDED`, `UNREADABLE`, `PENDING` or `UNAVAILABLE`. It normalises producer execution defaults, retains consumer
  scene/filter/mask/band choices, and supplies no effective fallback for unreadable or unresolved facts.
- REF seeds only consumer-owned fields on the first Apply of genuinely new creation. The current SourceCandidate
  accessor verifies its observation owner, basis and acquisition state. The existing blocked form and final Apply
  guard cover clicks, Enter and Next; the reference and defaults are one action. Family is derived from the producer
  collection when seeding, so a missing/stale producer `dataSetType` label cannot make those initial defaults incoherent.
  No later family or monitored-band choice is silently repaired.
- Sources' band options, monitored-measure checks, PRC fields, REF date format, period-mosaic descriptions and
  visualizations, alert collections, period-mosaic execution and observations use the effective settings. PRC uses
  the shared controls with presentation-only inputs; Apply preserves reference-owned saved copies, including absent
  keys. A partially recorded correction locks only that correction. Editable drafts and Cancel remain independent
  of incoming reference facts. The legacy radar `strongScatterers` toggle is not read by the time-series collection;
  this packet does not change that execution policy. The speckle filters and threshold/size parameters actually read
  by the collection follow the producer.
- Recorded asset dates take precedence in Change Alerts, including its chart interpretation. CCDC Slice keeps its
  previous date policy via the existing facts loader's default scope. The processing requirement uses the existing
  REF/operation-hold path; malformed metadata is a confirmed refusal, failed acquisition remains unavailable.
- Observations intentionally acquire reference processing before `observedCollection` and existing requested-band
  readiness. The processing facts read builds no segments and loads no producer Classification/training dependencies.
  The execution authorization added by the correction below separately follows the live reference prerequisites.
  The former reference-independent tests now assert this contract.
- Both computing-segment export paths write top-level JSON `processing` from the actual executed producer. The
  specialized endpoint remains CCDC even if the submitted type says otherwise; generic exports follow declared
  preserving edges and use that producer's date format. Unrelated exports discard caller-supplied `processing`.
  Existing segments of unknown provenance cannot acquire an invented complete producer record merely by being
  re-exported. No existing asset is rewritten.

Compatibility: results can change where a consumer's saved processing copies drifted from its reference. Saved
copies stay untouched and remain fallbacks only for genuinely unrecorded asset settings. A present malformed
metadata form holds the affected operation instead of falling through. An asset with no recorded date format still
needs the consumer to select its date representation. Existing legacy complete CCDC option records establish
execution defaults for omitted keys; unmarked partial imports establish only their stated fields.

Verification uses mounted editors and the actual form/candidate lifecycle, plus pure metadata round trips and
server tests recording real collection arguments behind substituted external services. Coverage includes atomic
first Apply/Enter/Next, pending/late/Cancel, subsequent-reference preservation, a live producer change during an
open PRC draft, partial ownership, malformed metadata and repair, scoped observations, both export routes, and
unchanged CCDC Slice behavior. Focused verification passed 721 tests: 346 GUI, 141 shared and 234 gee tests, with at
most two workers. The shared form and evidence/output-requirement tests and unchanged BAYTS consumers are included.
No full GUI suite or build was run.

Read-only live check: authentication with the existing GEE service account succeeded, but `getAssetRoots` returned
an empty list. No real segment-export asset was available to verify legacy `formattedProperties`; nested shapes are
covered by fixtures only. This is not live metadata-shape or pixel verification.

Combined browser recheck (no repeat of accepted S1–S4 cases):
1. Create Change Alerts over a CCDC and advance REF. Verify the proposed monitoring defaults; edit masking/data
   choices, finish creation, reopen and Refresh. Those consumer edits must remain.
2. Keep PRC open with an editable mask change. Change the producer's SR/BRDF or radar processing, then return.
   Read-only values must follow it, the editable draft must remain, and Apply must save only consumer choices.
3. Replace the reference (also try going back in the wizard). Monitoring choices must not be reset. Cancel must
   leave the applied reference and availability unchanged.
4. Use a recorded segments asset and, separately, one missing processing metadata. Check read-only recorded fields,
   labelled editable fallbacks and recorded date precedence. If a disposable asset already has malformed metadata,
   check REF's explanation/holds and recovery after its metadata is repaired/refreshed; no asset rewrite is automatic.
5. Compare a period mosaic, alert preview and observations after a producer processing change. Required settings
   must agree; this does not establish pixel-level scientific equivalence.

S6 remains required before push. Its monitoring-choice validation and remaining chart lifecycle agreement are not
implemented here. The copy-again action and BAYTS audit below remain separate follow-ups.

**S5 implementation: independent review (2026-10-26; correction required before commit).**

The final `recipeFormPanel.jsx` change was reviewed after implementation finished. Its presentation and serialization
hooks are optional and currently used only by Change Alerts. The candidate accessor exposes the existing candidate;
the final submission check updates that candidate before authorizing Apply/Enter/Next. No unrelated caller opts into
the presentation hooks. The review found no defect in those shared-form changes, and mounted ordinary input-panel,
BAYTS, form-submission and Change Alerts controls passed. This does not replace the pending browser checks.

- **[P1] Radar details dialog repeatedly resets its local form.**
  `mosaic/panels/radarMosaicOptions/modalSubformPanel.jsx`, `componentDidUpdate`, calls
  `inputs[name].setInitialValue(source.value)` for every reference-owned field on every update, including when its
  value has not changed. `withForm.setInitialValue` always sets state, which renders the child again and calls the
  same update handler. A mounted probe using the actual subform HOC and actual form reproduced React's
  "Maximum update depth exceeded" error with recorded `kernelSize` and an editable second field; the same dialog
  with no reference-owned fields passed. Activation and panel chrome were substituted in this small probe, while
  the form and the update lifecycle ran unchanged. Partial asset metadata can produce that mixed ownership; a
  radar spatial-details dialog also retains its ordinary `strongScatterers` input, so complete processing ownership
  does not by itself make every details action unavailable.
- **Required correction:** update a local read-only baseline only when necessary, or remove the redundant local
  synchronization where the field already reads its parent. Keep editable drafts and Cancel independent. Do not
  change shared form dirtiness/state semantics to fix this loop. Add a mounted regression for opening the mixed
  dialog, a reference change while an editable detail is being edited, and the ordinary radar control. Verify that
  applying editable fallbacks still preserves recorded saved copies.
- **Independent checks:** 378 existing GUI tests passed across Change Alerts, BAYTS, ordinary process input panels,
  form submission and output requirements; 90 shared tests and 211 gee tests passed. A separate two-case temporary
  probe had one passing ordinary control and one failing reference-owned case. The first attempts at that disposable
  probe required test-store/field setup corrections; the stated failure is the final React update-loop reproduction.
  An initial shared command named one test at the wrong path; the corrected source-adjacent test and the remaining
  shared files passed. No full suite, build, browser or live asset check was run during this review.
- **Handoff evidence:** the removed probe is retained at `/tmp/sepal-s5-review-radar-probe.test.jsx`, with its final
  failure/control and ordinary-panel results in `/tmp/sepal-s5-review-form.log`. No production file was changed or
  swapped by the reviewer. The temporary test was removed from the repository. Nothing staged, committed or pushed.

**S5 corrections: live-reference readiness and radar details (2026-10-26; uncommitted).**

The user reproduced Change Alerts running a CCDC whose selected Classification had two input images. Shared
`MULTIPLE_CLASSIFIER_INPUTS` already refused that CCDC; Change Alerts' image declaration required only reference
resolution. A failing mounted reproduction still offered Retrieve and omitted REF feedback, and server observations
and export probes accepted it. Change Alerts now declares the reference's `IMAGE_OUTPUT` as its shared analysis
prerequisite. This covers its image, period-mosaic map products and both pixel operations; the segment chart already
required the reference image and keeps that behavior. No input-count rule or exception-to-validation translation is
added. Missing training points provide a separate propagation control. Known output descriptions remain separate.

REF uses the existing `referenceFeedback` and output-candidate binding, including the upstream computation's existing
repair wording. Confirmed findings block REF Apply, Next and Done; Enter/direct submission use the same form path,
which updates and rechecks all blocking output candidates against current values and state before publishing. A usable
replacement or upstream repair releases the form. An unchanged editor remains unedited; Back and Cancel retain their
existing behavior. Other sections do not acquire duplicate diagnoses. Selected-source and output-candidate feedback
can share one field without hiding each other; each candidate keeps its own declared submission policy.

The settings observation remains scoped to processing facts. Operation authorization separately uses the ordinary
readiness traversal, which may read the referenced computation's Classification and training evidence. Observations
check that prerequisite before building their projected collection. Shared asset references still read only the asset,
without its producer or Classification. Generic asset exports previously built beside their readiness check; they now construct the requested image only
after the existing resolver passes, as the specialized CCDC export already does. Asset exports and segment/observation
chart routes refuse before product construction. The direct `/image/preview` route still constructs `ImageFactory` without a shared readiness
guard: GUI layers now withdraw correctly, but a direct/stale preview request can still reach an execution error. This
existing server-preview gap remains explicit; no new preview-route guard is part of this correction.

Radar details now synchronize reference-owned modal values only when their value differs. The unconditional
`setInitialValue` call caused a render/update loop. Mounted mixed-ownership cases preserve the editable draft through
incoming reference updates, Apply/Cancel behavior and saved processing copies; an ordinary editable radar control is
included. No additional S6 monitoring-choice validation, copy-again action or BAYTS changes are made.

**Shared reference-editor policy correction (subsequent user decision).** The previous presentation-only exceptions
for shared input references (`inputRecipeFeedback`) and selected Classifications (`classificationReferenceFeedback`)
are removed. A confirmed shared finding that makes the edited selection unusable now blocks committing it through
the existing output candidate, just as REF does. The first audit had treated their explicit presentation-only comments
as intended policy; the user has superseded that policy. Old tests expecting enabled Apply despite confirmed
Classification errors are updated. No new validator, wizard-specific predicate or form framework is introduced.
Phenology keeps its conditional operation scope: a native band still needs no classifier, so an unrelated Classification
finding does not block that valid alternative.

The remaining opt-outs duplicate existing field rules, and their reasons are recorded beside the declarations:
- Masking's missing mask selection: the active recipe/asset selector's `.notBlank()` already blocks submission.
- Class Change's missing source legend: `legendEntries.notEmpty()` already blocks submission.
- PyEO's empty FROM/TO classes: `changeFromClasses.notEmpty()` and `changeToClasses.notEmpty()` already block submission.

Mounted checks exercise their existing form rules, plus Classification selectors, actual creation wizards and the
shared input editors for Stack, Band Math, Classification, Regression and Unsupervised Classification. Confirmed
failures hold Apply/Next/Done and Enter/direct submission without changing the applied model or advancing; repair or
replacement releases them. Unchanged Close, Cancel, Back, input removal and valid alternatives retain their normal
behavior. The shared finding determines feedback and blocking; translated message text is never parsed for validity.

Compatibility: existing saved recipes are not rewritten. Editing a confirmed unusable recipe selection now requires
repair, replacement or removal before committing; leaving an unchanged editor with Close is still possible. Pending
or temporarily failed evidence adds no confirmed selection error. Existing source/form acquisition holds remain in
force. Shared findings determine the decision independently of their translated wording.

Correction verification: 969 focused tests passed: 422 GUI tests across 19 files, 301 shared tests across 6 files and
246 gee tests across 6 files. At most two test workers ran concurrently; services were substituted. The regressions
include the actual Change Alerts and CCDC creation wizards (Next/Done, Enter/direct submission, repair/replacement and
last-moment state changes), open chart/Retrieve withdrawal, alert and period-mosaic layers, missing training points,
asset independence, refused export construction, all five input-editor families, Phenology native alternatives,
remaining field-rule exceptions and radar mixed ownership/ordinary controls. ESLint passed for all 57 changed JS/JSX
files in the uncommitted packet and `git diff --check` passed. No full suite, build, browser check or new live Earth
Engine verification was run for these corrections. The earlier read-only asset-metadata verification limit remains.

Browser recheck: start from a usable CCDC/Classification and Change Alerts, open an alert or period-mosaic layer and a
chart/Retrieve. Add a second Classification input, and separately remove its training points: REF must explain the
reference, layers withdraw, actions disable and open operation panels close. Repair and reopen them. During creation,
select the broken CCDC: Next/Done must stay disabled and Enter must neither apply nor seed; Back/Cancel retain their
normal exit paths. Finally open mixed recorded/fallback radar details, edit a fallback and refresh the reference;
verify no loop, preserved draft, Cancel and saved copies. Automated coverage is recorded in the handoff; no browser
check is claimed.

**Full `blocksApply: false` audit: independent review (2026-10-26).**

The user reproduced CCDC Sources explaining a two-input Classification while still allowing Apply, and requested
an audit of every exception. A repository-wide search found six declarations in five production files at the audit's
start. The two consumers of this flag are the editor's invalid-form wrapper and its current-state submission guard
in `recipeFormPanel.jsx`; both deliberately ignore a candidate refusal when the declaration sets the flag false.
Next and Done use the same form validity and Apply path, so there is no separate wizard validator missing here.

The earlier S5 corrections paragraph accepted collection/input-reference feedback merely because its declared
policy said "presentation only". That conclusion is superseded: the user requires a confirmed finding against the
selection being committed to block that commit. Existing Classification-feedback tests explicitly asserted enabled
Apply despite the finding, so a passing suite did not establish the desired interaction.

| Exception at audit start | Callers and other guards | Audit result |
| --- | --- | --- |
| `collectionClassifierRequirements.js`: Classification reference feedback | CCDC, Time Series, Phenology and PyEO; generic reference failures have no corresponding local field predicate | Inappropriate exception. Its own findings must block the candidate through the existing form binding, retaining each type's operation scope and valid native controls. |
| `panels/inputImagery/inputImageryRequirements.js`: input recipe feedback | Stack, Band Math, Remapping, Classification, Regression and Unsupervised Classification; presence, band and duplicate-source rules do not establish upstream executability | Same inappropriate exception. Scope the candidate to the edited input and block its confirmed upstream findings. A healthy item must remain editable independently of a different broken input. |
| `masking/maskRequirements.js`: missing mask | Masking's `imageMask` editor; the active recipe/asset selector has a non-skipped `notBlank` rule, while the inactive selector is skipped | Justified duplicate explanation. Empty selection already invalidates the form; actual wizard Next/Done refusal and selection repair are covered by the mounted mask-editor tests. |
| `classChange/legendRequirements.js`: missing legend | Both From and To use the same exported `fields`; `legendEntries.notEmpty()` checks the list independently of whether its error has been displayed | Justified duplicate explanation. Actual field definitions mounted in `FormPanel` refuse Apply, Next, Done and direct submission, then permit submission after a legend is supplied. |
| `pyeoAlerts/sourcesRequirements.js`: empty FROM classes | Sources uses `changeFromClasses.notEmpty(...)`, with no skip; clearing the list cannot pass the form | Justified duplicate explanation. The actual mounted Sources panel holds Apply and direct submit, preserves the applied model, and accepts the repaired list. |
| `pyeoAlerts/sourcesRequirements.js`: empty TO classes | Sources uses `changeToClasses.notEmpty(...)`, with no skip, plus its separate overlap rule | Same result as FROM; independently exercised in the mounted panel. |

During this audit the implementor removed the two inappropriate flags; those production edits are the implementor's.
A final repository search leaves only the four duplicate-explanation exceptions above. Change Alerts REF's flag was
already removed before this audit started. Reused training-data editors already use the default blocking policy.
This completes the exception inventory; it does not claim that every unrelated form or validation policy was audited.
Review the implementor's full correction and its affected-caller regressions separately when they finish.

Independent verification used one worker: 53 unique focused cases passed across the existing Masking editor and form
submission tests, the PyEO Sources fixture, and five temporary audit cases. The new cases were two mounted PyEO
empty-list/refusal/repair checks and three Class Change field-guard checks for Apply/Next/Done. The Class Change checks
used the actual exported fields and real form/panel, with panel contents and wizard context reduced to the guard
under audit; they were not browser or complete Class Change editor tests. An initial PyEO probe assertion forgot
the extra class deliberately selected to make the repaired form dirty; correcting that expectation left both
empty-list cases passing. The 21 existing PyEO cases were not repeated in that targeted rerun.

No production code was changed by the reviewer. Both temporary files were removed from the repository and retained
as `/tmp/sepal-blocks-apply-class-change.review.test.jsx` and `/tmp/sepal-blocks-apply-pyeo.review.test.jsx`.
Logs: `/tmp/sepal-blocks-apply-audit.log` and `/tmp/sepal-blocks-apply-audit-pyeo.log`. No full suite or browser run.
The behavior contract now requires each nonblocking explanation to identify the actual guard enforcing the same
invalidity, with button and direct-submission evidence; a comment declaring intent alone is insufficient.

**Creation/AOI browser feedback corrections (2026-10-27; uncommitted).**

The user found Stack IMG's Done inert and CCDC unavailable as another recipe's AOI source. Both were reproduced
through mounted real controls before editing production code: six IMG Done/Enter cases failed with
`valuesToModel is not a function`, and the AOI picker omitted CCDC.

- `recipeFormPanel` now preserves a deliberate `valuesToModel: null`. List panels apply their entries separately;
  the S5 serialization hook had wrapped null as a function and attempted to serialize when finishing the list's
  wizard step. Done/Enter now close the step and call the wizard's completion without rewriting its applied model.
  Mounted controls cover shared Stack/Remapping, Classification-family and Band Math input lists. The existing
  processing serialization hook and confirmed-reference submission guards remain covered.
- The AOI source picker now uses separate geometry eligibility in the existing GUI type registry. Optional
  `geometrySource` defaults to `imageSource`; CCDC opts in explicitly, since its `getGeometry$` reads its configured
  AOI. Image-input eligibility remains false for CCDC. The selector keeps self-reference and project filtering and
  reads bounds without requesting bands or the selected recipe's image. Other excluded types receive no implicit opt-in.

Verification: 262 focused GUI tests passed across nine files, at most two workers, including the failing witnesses,
ordinary image-picker controls, AOI serialization, existing reference blocking/creation wizards and processing
ownership, removal and form submission. ESLint passed for the six changed JS/JSX files and `git diff --check` passed.
No full suite, build, live Earth Engine geometry check or browser check was run. Recheck by finishing a new Stack's
IMG step with Done (also Enter), then selecting a CCDC in another recipe's AOI → Asset/Recipe → Recipe selector.

**S5 PRC presentation correction (2026-10-27; uncommitted).** Restore the original optical, radar and Planet
processing labels. Ownership, including genuinely unrecorded editable asset fallbacks, uses the standard label
help tooltip instead of appended label text. Existing explanatory help is retained. An explicit shared choice-widget
`readOnly` option preserves the highlighted selection while preventing changes; ordinary disabled groups keep
their previous behavior. This adds no custom CSS.

Spatial and multitemporal speckle summaries open details only if a displayed parameter is editable. A known
reference's parameters therefore remain visible without a redundant disabled editor. An unrelated unrecorded
parameter that the current filter does not use cannot make the summary actionable. Partially recorded asset
settings still allow their actual fallback fields to be edited beside read-only parameters. Change Alerts hides the
legacy `strongScatterers` toggle: the time-series collection does not consume it and continues to use its existing
retention default. Its thresholds follow the existing ownership derivation. The hidden saved toggle, other
reference-owned copies, editable drafts and Cancel are preserved. Other radar consumers retain their toggle.

Mounted regressions cover unchanged labels, selected read-only choices, non-actionable spatial/multitemporal
summaries, relevant fallback fields, nested Apply/Cancel and preservation of saved reference copies. The existing
mixed-ownership update-loop regression and ordinary editable control remain included. Before-correction probes
reproduced the missing highlight and changed label. Focused GUI verification passed 166 tests in four files with
at most two workers; ESLint on the 12 affected JS/JSX files and `git diff --check` passed. No full suite or build was
run. Browser appearance still needs a recheck; mounted DOM tests do not establish visual spacing.

Browser recheck: in radar Change Alerts, open both simple and advanced PRC. Confirm the familiar labels, highlighted
read-only filter/correction choices and help tooltip explaining ownership. Known-reference speckle summaries must
not open a dialog. Check that consumer orbit/masking controls still work, and that a genuinely unrecorded asset
fallback can be edited and cancelled without changing the saved reference-owned copies. In ordinary Radar Mosaic,
speckle details and its strong-scatterer toggle must remain editable. Optical/Planet PRC should retain their original
labels and selected read-only values too.

**PRC user recheck and separate error-wording correction (2026-10-27).** The user reports that labels,
disabled controls and selected highlights look correct, and that an open PRC form follows producer changes only
for the disabled/reference-owned properties. This confirms those browser cases, not the remaining S5/S6 cases.
The remaining short ownership recheck is an editable orbit/masking change through Apply/reopen and Cancel,
plus reference replacement preserving the consumer's monitoring choices.

A separate reported layer failure displayed only "User memory limit exceeded." The shared English
`gee.error.earthEngineException` translation was discarding the backend's Earth Engine attribution. It now renders
"Google Earth Engine: {earthEngineMessage}", so all consumers of that descriptor, including layers and task status,
retain the origin. French and Spanish already identify Earth Engine; direct tile failures already name it too.
This changes wording only, without relabeling ordinary SEPAL errors or changing validation, holds or retry behavior.
Real-translation mounted probes reproduced the layer/task omission before the correction; 47 focused tests in
seven files then passed with at most two workers, along with ESLint and `git diff --check`. No full suite, build or
live Earth Engine error request was used. The new error wording has not been browser-checked.

**S5 acceptance before commit (2026-10-27).** The user subsequently reported "All good" after the remaining
short PRC ownership checklist, and authorised committing S5 and the bounded follow-up corrections. Preserve the
verification limits recorded above; this acceptance does not complete S6 or the final integrated verification before
push. The copy-again action, BAYTS audit and broader preview-server follow-ups remain deferred as documented.

**Origin integration after S5 (2026-10-27).** Merge `origin/sepal-server` at `16c306941` before S6.
The one conflict was in the specialised CCDC asset export: keep upstream's top-level formatted properties and
S5's server-derived canonical `processing` record, written after caller properties so they cannot override it.
Older nested metadata remains readable; existing assets are not rewritten. Upstream's Band Math expression-name
hardening, account/usage changes and other fixes are retained. One incoming trailing-whitespace line was removed.
Focused integration checks passed 366 cases: 222 GUI, 133 gee export and 11 shared processing tests, with at most
two workers. Export metadata round-trip and provenance protection, Band Math calculation/recovery and expression
analysis, translations/error attribution, and incoming account/usage tests are included. ESLint on the resolved
export files and whitespace-cleaned account panel, plus `git diff --check`, passed. No full suite, build, browser or
live Earth Engine check was run for this merge. S6 and final integrated verification remain before push.

**S6 implementation: Change Alerts monitoring validation and chart agreement (2026-10-27; uncommitted).**

The failing mounted witnesses reproduced both reported defects: a saved native `nbr` disappeared from Sources on
opening, and changing a usable optical CCDC producer to radar marked Sources but left its open analysis chart alive.
The applied consumer model was not repaired by opening the editor; the choice widget was normalising an unoffered
native value out of the draft. Only missing classified choices had previously been retained.

- Sources now offers the union of valid choices and the selected draft band, native or classified. The selected
  missing band stays highlighted with the existing translated field error. Opening remains unedited, explicit
  changes follow the draft, and Cancel preserves the applied choice and operation holds. Type/data-set defaults
  resulting from an explicit user family change keep their existing behavior; no upstream edit silently chooses
  another family or band.
- The existing `MONITORED_MEASURE` Sources declaration holds `IMAGE_OUTPUT`, `PIXEL_SEGMENTS` and
  `PIXEL_OBSERVATIONS`. The existing classified-monitored-band configuration finding applies to those same
  operations. No second compatibility predicate or stored validity flag is introduced. REF retains originating
  reference/upstream failures; Sources names only its own repairable settings. Processing facts remain S5's.
- Native monitoring scopes live in shared `changeAlerts/monitoringMeasures.js`, reusing CCDC's native optical
  catalogue, the radar measures and the established temporal Planet choices. The old family memoization moves
  with it; there is no new selector cache. Parity tests compare all offered datasets for TOA/SR and a multi-dataset
  intersection against the previous GUI catalogue. Planet's choice constant moves to its existing shared band
  module; neither its execution schema nor its offered choices is expanded.
- The chart watches both actual operations. A confirmed capability/Sources refusal takes precedence over a pending
  execution read. Chartable bands are read specifically from `CHARTABLE_SEGMENTS`, instead of whichever requirement
  happens to precede it. An exploratory chart-band choice cannot bypass an invalid configured monitoring band.
- Change Alerts consumes the common `pixelChartUpdate` lifecycle. Confirmed invalidity disables the action, closes
  the panel and cancels both streams; late answers cannot redraw. Repair offers the action without reopening the
  panel automatically. Initial chart selection uses the configured band where available; later deliberate chart-band
  exploration and chartability-based replacement remain possible for a valid analysis. Pending/unavailable states
  hold requests without inventing a configuration error. CCDC Slice's operation policy remains unchanged.
- Removed coordination: Change Alerts' `segmentsHeld` flag, bespoke model/reference-build comparisons and band
  replacement method, the independent observation request that could run while segment prerequisites were held,
  and the blue withheld explanation inside the chart. A combined gate and common lifecycle replace these. Required
  form fields, source/capability evidence checks, requested-band guards, Retrieve's current-state submission check,
  stream cancellation and server execution guards remain necessary; they are not duplicate compatibility rules.

Server boundary: two failing observation witnesses established that a request for a healthy exploratory band could
bypass an invalid configured monitoring band. After effective processing and ordinary shared execution readiness,
the existing source catalogue is read and judged by `MONITORED_MEASURE` with the same native scope. A failed
catalogue read is passed on as unavailable, not manufactured into a missing-band finding. Settings-only acquisition
is unchanged: `segmentSourceFacts$` still builds no segments and loads no unrelated training dependencies. The
native monitoring collection omits the legacy copied Classification; segment assets need no private producer.

The alert-image path applies the same rule to its already-resolved source before building segmentation or monitoring
observations, covering the actual image construction used by previews and exports. Its fixed output description
stays available without those reads. A real image-factory witness, with only external EE/collection boundaries
substituted, proves refusal before either collection or alert algebra and a working result after producer repair.
Existing export-route readiness/refusal controls remain passing. Period mosaics do not acquire a monitoring-band
requirement they do not read, and an image-only requirement does not hold an otherwise valid chart.

Limits: `/ccdc/loadSegments` still receives the selected source alone, not the Change Alerts consumer, and therefore
can authorize that producer but cannot assess a consumer monitoring choice. The GUI cancels/holds both streams and
the sibling Change Alerts observations route enforces that consumer choice. No request-schema expansion is made.
The previously recorded broader `/image/preview` server-readiness gap remains; this packet's image-construction
monitoring guard is not evidence of full upstream readiness coverage on that route. Legacy malformed monitoring
periods and broader date-policy cleanup remain separate as recorded in the recipe notes.

Verification: 862 focused cases passed with at most two test workers total: 315 GUI in 11 files, 298 shared in six
files, and 249 gee in six files. Coverage includes S5 ownership and REF submission, pending/failed/superseded source
reads, asset refresh recovery without editing, invalid-draft Enter/direct submission and Cancel, applied repair,
late-answer cancellation, unrelated image-only holds, CCDC Slice and Time Series/CCDC chart controls, the native
catalogue parity, server pre-computation refusal and existing asset exports. ESLint on changed JS/JSX and
`git diff --check` pass. No full suite, build, browser or live Earth Engine verification was run. The scoped mocked
proofs establish wiring and cancellation, not live numerical results or performance. Final integrated verification
and the short browser recheck remain before push.

S6 browser recheck (normal UI; no repeat of accepted S1-S5 checks):
1. Start with a usable optical CCDC and Change Alerts monitoring `nbr`. Open its chart and obtain a real response.
2. In CCDC, explicitly select radar imagery and a valid radar breakpoint band, then Apply. Keep the producer otherwise
   valid (no broken Classification). Return to Change Alerts: SRC should be marked, Retrieve/chart disabled and the
   old chart closed. Opening SRC must keep `nbr` visible and explain the affected family/band setting.
3. Choose radar and `VV` in SRC. Before Apply the applied holds remain; Cancel leaves the error. Reopen, make the
   same repair and Apply: SRC clears and Retrieve/chart become available. Open the chart and select a pixel; verify
   actual segments and monitoring observations, not just enabled buttons.
4. Alternatively restore the producer's original optical settings while the saved consumer still monitors optical
   `nbr`. Without editing the consumer, its warning should clear; reopening the chart should work. Neither recovery
   should rewrite independently editable monitoring choices or PRC copies.

**S6 independent review (2026-10-27; chart fixture correction required).**

Reviewed the production diff against the F3 and S5 contracts. Retaining the selected native/classified monitoring band
does not relax the shared rule or rewrite the applied model. Sources' existing `MONITORED_MEASURE` declaration now
applies to both pixel operations, and confirmed refusal wins over an unanswered execution read. The chart consumes
the common lifecycle, cancelling both streams together; the added computation inputs retain external-description
and pixel-generation changes. The server uses the same monitoring rule before building observations or the alert
image. Its catalogue read does not evaluate segments. Asset references remain independent, CCDC Slice keeps its
scope, and the known direct-segment/preview-server limitations remain explicit. No production defect was identified.

- **[P2] Update the existing chart fixture to S5 processing evidence.**
  `changeAlerts/panels/chartPixel.test.jsx` publishes `ui.sourceEvidence` with segments but no processing facts.
  `loadCCDCSegments$` has required those facts since committed S5 and consequently refuses those fixtures with
  "Reference processing settings are not available". Five of the file's six tests fail; their error notification
  path also reports six unhandled `window.gtag` errors. A read-only container overlay of the committed chart produced
  the same five failures, so replacing the chart lifecycle is not their cause.
- A temporary copy supplying `assetProcessing({dateFormat})` for asset evidence and
  `processingOfProducer({options: {}})` for recipe evidence passed all six existing assertions, with no unhandled
  errors. Keep those assertions for description changes, cancellation, unchanged evidence, asset-token changes,
  request payloads and applied monitoring edits. Correct the fixture rather than weakening the production guard
  or deleting those controls. No production change is requested by this finding.
- **Independent verification:** 73 shared cases and 83 gee cases passed. The GUI review ran eight files: seven
  files passed (210 cases), while the unchanged chart file had one passing and five failing cases. The temporary
  evidence-only fixture correction then passed all six. The mounted Optical-to-Radar, draft repair/Cancel,
  late-answer cancellation, asset refresh, unrelated image-only requirement and other chart controls passed.
  This is not a clean passing GUI campaign for the current tree until the original fixture is corrected.
- **Evidence:** `/tmp/sepal-s6-review-gui.log`, `/tmp/sepal-s6-review-head-chart.log`,
  `/tmp/sepal-s6-review-fixture.log`, `/tmp/sepal-s6-review-shared.log` and `/tmp/sepal-s6-review-gee.log`.
  The removed temporary test is retained at `/tmp/sepal-s6-review-chart-fixture.test.jsx`. The committed chart was
  overlaid read-only inside the comparison container; the working tree's production files were never swapped.
  No full suite, build, browser or live Earth Engine check was run. Reviewer changes are this review record only;
  nothing staged, committed or pushed. The normal-UI S6 browser recheck above remains pending.

**S6 chart-fixture review correction (2026-10-27; uncommitted).** The existing chart lifecycle fixture now
supplies S5 processing facts: `assetProcessing({dateFormat})` for asset evidence and
`processingOfProducer({options: {}})` for recipe evidence. No production code or lifecycle assertions changed.
All six tests in `changeAlerts/panels/chartPixel.test.jsx` pass in the GUI container with at most two workers and
no unhandled errors. ESLint on the corrected test and `git diff --check` pass. Evidence:
`/tmp/sepal-s6-chart-fixture-final.log`. This resolves the independent review's fixture finding. The four-step S6
browser recheck above remains sufficient; final integrated verification remains before push. No full suite, build,
browser or live Earth Engine check was run for this correction. Nothing staged, committed or pushed.

Independent recheck (2026-10-27): the original test file now differs only by its processing-helper import and the
processing facts in `sourceEvidence`; all lifecycle assertions are unchanged. All six cases passed again, with no
unhandled errors, in `/tmp/sepal-s6-review-fixture-final.log`. `git diff --check` passed. The S6 code review is closed
with no remaining findings; browser acceptance and final integrated verification remain outstanding.

**S6 browser failure: false observations self-cycle (2026-10-27; correction required).**

The first browser baseline failed while opening a working optical Change Alerts chart: "Failed to load observations.
Bad request", with `Recipe dependencies form a cycle: 016c106c-e7ba-4ae4-90ca-61ebec12819b ->
016c106c-e7ba-4ae4-90ca-61ebec12819b`. The user supplied `.vscode/ccdc.json` and `.vscode/change_alerts.json`, then
the CCDC AOI provider and its input in `.vscode/classification_provider.json` and `.vscode/stack_radar.json`.
Those records form an acyclic chain: Change Alerts -> CCDC -> Classification (AOI) -> Stack -> radar asset.
The CCDC has no selected Classification. No saved configuration change is indicated by this failure.

- **[P1] Shared cached record completion leaks the first reader's execution ancestry.** An asynchronous CCDC
  record read starts during segment-facts acquisition. Its value lets Change Alerts start readiness while that
  retained read is still completing. The closure loader subscribes to the same retained record. Its completion
  notification arrives in the original CCDC reader's context, so readiness emits under `[ccdcId]` rather than the
  calling operation's path. The subsequent, legitimate catalogue read is rejected as `ccdcId -> ccdcId`.
- The trace establishes readiness entry at `[]` and its asynchronous answer at `[ccdcId]`. Synchronous record reads
  pass. The real factory, recipe-reference ancestry, recipe scope and direct readiness path reproduce the error both
  with a minimal valid model and with all four supplied records, without Earth Engine or external service calls.
- The existing observations test's readiness-recording wrapper used `from(import(...)).pipe(switchMap(...))`.
  That extra asynchronous boundary hides the problematic timing. Its image-factory substitution also removes
  ancestry wrappers. "Real readiness" inside those substitutions was insufficient coverage of this integration.
  Retain an end-to-end wiring regression with actual factory, scope and readiness boundaries and delayed recipe
  reads. Any operation-recording spy must return the real observable directly, without introducing a Promise hop.
- **Bounded proposed correction, proved but not applied:** preserve the subscribing caller's execution path when
  delivering retained recipe records, including `next`, `error` and `complete`. The existing `inCurrentPath` helper
  already implements that policy. A temporary replacement identical to `recipe.js`'s `loadRecipe$` except for
  wrapping `scope.read$(id)` in `inCurrentPath(...)` made all six probe cases pass. They cover synchronous and delayed
  valid reads for minimal/supplied records, plus genuine self and two-recipe cycles, which remain refused with their
  full paths. Do not clear ancestry, suppress a repeated id or special-case Change Alerts to make this pass.
- The running GEE service's relevant source-file checksums match the workspace. The failure and correction proof
  were run in its Node 26 runtime in isolated mocked test processes, without changing the service's configuration
  or production files. The earlier host-only probes used Node 24; both versions reproduce after removing the
  Promise-wrapped readiness spy. An initial isolated-container attempt lacked package links and was not evidence
  for the correction; the successful proof used the service container's existing dependency installation.
- **Handoff:** `/tmp/sepal-s6-observations-cycle.review.test.js`, baseline
  `/tmp/sepal-s6-cycle-baseline-final.log` (four controls pass, two valid asynchronous cases fail), and
  `/tmp/sepal-s6-cycle-context-proof.log` (six pass with the temporary boundary correction). Earlier path trace:
  `/tmp/sepal-s6-cycle-path-trace.log`. The temporary test was removed from the repository. Production code and saved
  recipes remain unchanged; nothing staged, committed or pushed. After implementation, rerun the actual browser
  baseline before the remaining S6 steps and final integrated verification.

**S6 shared recipe-read context correction (2026-10-27; uncommitted).** `loadRecipe$` now wraps the scoped
retained read in the existing `inCurrentPath` helper. Each subscriber receives `next`, `error` and `complete`
under its own execution ancestry. The scope still reads each record once per operation; no ancestry is cleared,
no Change Alerts exception is introduced, and the existing recipe-reference cycle checks are unchanged.

- Added `loadObservationsContext.test.js`, using the actual factory, recipe scope and direct readiness path with
  external services mocked. Its minimal CCDC and reduced supplied AOI-chain fixtures pass with synchronous reads
  and reproduce the false self-cycle with delayed reads before the fix. Genuine self/two-recipe cycles remain
  refused with their full paths. Two additional controls verify separate subscribers' next/complete and error
  paths on one retained read. Before the correction four of eight cases failed; afterwards all eight pass.
- The existing observations readiness-recording spy now returns the real observable directly; it no longer adds
  a Promise/import hop that could mask the notification timing. Existing assertions are retained.
- Focused verification in the running GEE container's Node 26 runtime: **154 tests pass across seven files**
  (8 new context cases, 45 observations, 23 alert/reference, 33 segment-readiness, 26 recipe-cycle, 12 operation
  and 7 identity cases), with at most two test processes concurrently. ESLint on the three changed JS files and
  `git diff --check` pass. Evidence: `/tmp/sepal-s6-context-before.log`,
  `/tmp/sepal-s6-context-computation-tests.log` and `/tmp/sepal-s6-context-scope-tests.log`.
- No full suite, build, browser or live Earth Engine check was run for this correction. The supplied JSON records
  are unchanged. Retry opening the baseline optical chart first, then continue the four-step S6 browser recheck
  above; final integrated verification remains before push. Nothing staged, committed or pushed.

Independent correction review (2026-10-27): the shared loader uses the existing context helper without changing
scope ownership or cycle detection, and the observations spy now preserves the real observable's timing. The exact
six-case reproduction passed against the actual fixed loader with no substitute loader/readiness wrapper; all eight
permanent context regressions passed separately in GEE's Node 26 runtime. Logs:
`/tmp/sepal-s6-cycle-fix-independent.log` and `/tmp/sepal-s6-context-independent.log`. Temporary probe removed;
`git diff --check` passed. No remaining code-review finding; actual browser recovery remains unverified.

**S6 browser acceptance (2026-10-27; user-reported pass).** After the recipe-read correction, the user completed
the four-step recheck and reported "All good": the optical CCDC without a Classification and its Change Alerts
consumer monitoring `nbr` loaded real segments and observations without the previous error; changing the producer
to valid radar closed the chart, held Retrieve/charting and retained the consumer's optical/`nbr` choice with SRC
feedback; cancelling a Radar/VV draft kept the applied error; applying that repair cleared it, and a reopened chart
loaded real VV segments and observations. This accepts the current S6 slice and cycle correction. It does not claim
the optional producer-restoration variant, a full automated campaign or the separate shared-read redesign below.
The agreed sequence is to commit this slice, implement the bounded shared-read API correction separately, then
integrate origin changes and complete final integrated verification before push.

**Adjacent shared-context audit (2026-10-27; GeoID correction outstanding).** The user asked whether the false-cycle
class could occur elsewhere. Inspected both consumers of `RecipeScope` retained reads, recipe/factory ancestry
wrappers, service response delivery, shared EE initialization, the two image delegates using `shareReplay`, and the
observations readiness-recording spy. This is a bounded execution-context audit, not a guarantee about every shared
observable in the repository.

| Path | Result |
| --- | --- |
| `recipe.js` / `recipeRef.js` | The corrected recipe loader and reference/factory wrappers preserve each subscriber's execution path across next, error and completion. The exact browser reproduction and genuine-cycle controls passed the earlier independent recheck. |
| `geoIdFeature.js` | **Confirmed sibling gap:** `loadGeoIdFeature$` returns `scope.geoIdFeature$(geoId)` without restoring the subscriber path. It shares the same `RecipeScope.#retain` mechanism as recipe records. Two branches waiting on one delayed GeoID lookup receive notifications under the first branch's ancestry. |
| Shared service response bridge | `service.js` snapshots caller context inside the subscription and restores it for all three notification kinds. Existing operation/round-trip tests cover the bridge; no new defect established in this audit. |
| EE initialization | `restRuntime.js` shares a Promise and creates each waiting caller's `from(...)` subscription inside `defer`, explicitly preserving independent waiting contexts. No equivalent replay-subject gap identified. |
| Change Alerts / BAYTS image delegates | Their shared delegates are inside image-factory accessors whose existing `inAncestry` / `inPath` boundary restores the receiving caller's path. No additional defect established by inspection; these paths were not newly exercised end to end in this audit. |
| Readiness-recording spy | The removed `from(import(...))` boundary is no longer present; the spy returns the preloaded real observable directly. A timing-changing spy can hide this class, whereas a shared Promise intentionally used to resume independent callers is not itself an error. |

GeoID proof: two temporary tests used the actual GeoID loader, recipe scope and ancestry helpers with a delayed
in-memory GeoID reader. Both failed: the second subscriber's next/complete or error callback saw `[first]` instead
of `[second]`, while only one lookup was performed. Wrapping the delivered observable in existing `inCurrentPath`
made both pass. No GeoID service, Earth Engine or browser call was made. This establishes the notification-context
defect, not a particular GeoID browser failure. It can contaminate downstream recipe ancestry for branches sharing a
lookup; do not claim every GeoID lookup is currently failing.

Recommended before push: give the GeoID read boundary the same subscriber-context guarantee, using the existing
helper and retaining one lookup per operation, retry-after-failure and cancellation. Add next/complete/error and
shared delayed-read controls; preserve real cycle detection. No new cache, scheduling delay or feature-specific
exception is needed. The reviewer has not applied that production correction.

Evidence: `/tmp/sepal-geoid-context-audit.log` (two failures), `/tmp/sepal-geoid-context-proof.log` (two pass with
the temporary wrapper) and `/tmp/sepal-geoid-context.review.test.js`. The temporary repository test was removed;
reviewer edits are documentation only. No full suite or live verification was run for this audit.

**Shared-read API design assessment (2026-10-27; recommendation, not implemented).** The user asked to prevent this
class structurally instead of adding another loader fix and remembering more checks. This supersedes the preceding
recommendation to add an individual GeoID wrapper. The common owner already exists: `RecipeScope.#retain` creates
both kinds of retained read, and its private subjects need never escape.

Recommended boundary:

- Always return an observable that restores each subscriber's context from the private retaining mechanism. Store
  that safe observable in the retained map; keep the raw subject private. Recipe reads, GeoID reads and further
  read methods using this primitive then have the guarantee without any caller opting in.
- Capture context **inside each subscription**, never when constructing the observable, starting the first read or
  filling the cache. Restore it for next, error and completion, including synchronous replay of completed reads.
- Use a small Node-only observable helper backed by `AsyncLocalStorage.snapshot()`, capturing the whole current
  context rather than enumerating ancestry, recipe scope and EE context separately. The service response bridge
  already uses this mechanism; extract its notification forwarding into the same helper, with capture moved inside
  the subscription. Do not put a Node import in a browser-shared RxJS entry point.
- Remove redundant `inCurrentPath` wrappers from `loadRecipe$` and `recipeRef`, and remove that helper if no caller
  remains. Keep `inPath`, factory ancestry entry/exit and cycle detection: entering a child dependency and returning
  to the parent remain separate from delivering a shared external answer to its subscriber.
- Keep one underlying read per operation, failure eviction/retry, subscriber independence and operation-owned
  teardown. Do not add a Promise/scheduler hop, clear ancestry, change reader authority or create another cache.

Alternatives assessed:

| Approach | Assessment |
| --- | --- |
| Add a wrapper to each loader | Corrects today's paths but leaves raw scope methods unsafe and requires each new caller to remember the rule. Not recommended. |
| Make the private retained-read primitive safe | Protects both read kinds and direct scope callers, with one mandatory owner. Recommended. |
| Extract a helper but let each caller choose whether to use it | Reduces duplicated code without preventing omission. Insufficient on its own. |
| Pass explicit context through every recipe/factory/accessor | A much broader API migration; sharing would still need to separate producer context from each continuation. Not justified for this defect. |
| Change RxJS subjects/operators globally | Changes unrelated stream semantics and increases risk. Not recommended. |

Prototype evidence, with production files unchanged:

- A temporary variant of the actual `RecipeScope` replaced `value$.asObservable()` with per-subscription snapshot
  delivery. Ten low-level cases covered both read kinds, next/complete/error, retry, replay, construction versus
  subscription, a second independent async-local store, one reader shared by two callers, subscriber cancellation
  and scope close. The unprotected scope failed eight cases; the protected variant passed all ten. Replay controls
  passed before as well, so their pass alone does not establish the concurrency guarantee.
- The existing eight context integration regressions were run with the prototype scope and **both** local
  `inCurrentPath` wrappers disabled. All eight passed: synchronous/delayed baseline and supplied dependency chain,
  next/complete/error delivery, and genuine self/two-recipe cycles with complete ancestry. Child-path entry/exit and
  the real readiness implementation were retained.
- Evidence: `/tmp/sepal-context-boundary-analysis.test.mjs`, `/tmp/sepal-context-boundary-baseline.log`,
  `/tmp/sepal-context-boundary-central.log`, `/tmp/sepal-context-boundary-scope.review.js`,
  `/tmp/sepal-context-boundary-integration.review.test.js` and `/tmp/sepal-context-boundary-integration.log`.
  Temporary repository modules were removed. These are bounded design probes, not a production implementation or
  final regression campaign; no browser, full suite or live Earth Engine check was run.

Implementation acceptance should live primarily at this owner, parameterized over both read methods, plus the
existing false-cycle reproduction, genuine-cycle controls and service round-trip/context controls. Verify no
upstream subscription/teardown or operation isolation changes when extracting the service helper. A few production
modules should suffice; do not expand this into a recipe-wide context rewrite.

The enforceable claim is that **callers of these shared-read APIs cannot omit context restoration**. A new independent
cache or transport can still bypass the architecture; do not claim all arbitrary observables in JavaScript become
safe. The general contract is recorded in `behavior-contracts.md`. Node's
[snapshot documentation](https://nodejs.org/api/async_context.html#static-method-asynclocalstoragesnapshot) supports
the mechanism, which the repository already uses at its service boundary. This remains a recommended small
correction before push, with no new recipe format or user-facing policy.

**Shared-read context ownership implementation (2026-10-27; uncommitted).** Implements the assessment above from
`3fd364ce7`. Backend only: no GUI, recipe settings, request payloads or user-facing policy change.

- **The guarantee.** Every read `RecipeScope` retains is stored and returned only as an observable that delivers
  next, error and complete in the context its subscriber subscribed in, captured whole when it subscribes.
  `read$`, `geoIdFeature$` and any later method using `#retain` inherit this; callers have nothing to opt into, and
  the `ReplaySubject` never leaves the scope. This applies to these APIs. An independent cache or transport
  elsewhere still needs its own boundary.
- **The helper.** `inSubscriberContext` (`lib/js/shared/src/rxjs/subscriberContext.js`, Node only, imported by no
  browser entry point) snapshots `AsyncLocalStorage` inside each subscription and forwards all three notification
  kinds synchronously: no Promise, scheduler or reordering, and unsubscription reaches the source unchanged. The
  service response bridge's private `inCallerContext` is replaced by it; its capture was already inside the
  `defer` subscription and stays there.
- **Removed machinery.** The `inCurrentPath` wrappers in `loadRecipe$` and `recipeRef`, and `inCurrentPath` itself,
  which had no other caller. GeoID loading received no individual fix. `inPath`, `withPath`, image-factory ancestry
  entry and exit, and cycle detection are unchanged.
- **Sharing and teardown, unchanged:** one underlying read per key per operation; the same retained record for
  every reader; eviction and a fresh read after a failure; one subscriber leaving does not cancel another's read;
  closing the operation tears in-flight reads down; reads still start when they did, with the reader the scope
  captured.
- **Owner regressions.** `modules/gee/test/ee/recipeScope.test.js`, 14 cases parameterised over recipe and GeoID
  reads. The reader answers from a context of its own, as a transport handler does. The cases cover:
  - two branches sharing one delayed read, for next/complete and for error followed by a fresh read;
  - completion-driven continuation (`toArray` then work);
  - a read obtained in one branch and subscribed in another;
  - replay of a completed read to a later branch;
  - one branch leaving;
  - scope close.

  Each delivery asserts the branch's path, a second unrelated `AsyncLocalStorage` store and the operation.
- **Witnesses** (two test processes at most):
  - The unprotected scope at `HEAD` fails 10 of the 14; the replay and teardown controls pass.
  - With the caller wrappers removed and `asObservable()` restored, 15 of 48 fail across the owner, observations
    context and recipe-cycle files: the 10 owner cases, the 4 delayed and two-subscriber observation-context cases,
    and "is resolved under the ancestry of the branch receiving it". Genuine self and two-recipe cycles keep their
    full paths either way.
  - Capturing at construction instead of subscription fails 16 of 34, the replay cases included.
  - Removing the helper from the service bridge fails both service round-trip cases of `recipeOperation`. (Without
    a test timeout the same mutation hangs `eeIsolation`; that run was stopped.)
- **Verification** in the GEE container's Node runtime:
  - **Baseline:** 111 of 111 named focused tests at `HEAD`.
  - **Implementation:** 125 of 125 - those plus the 14 owner cases, the 8 observation-context cases among them with
    both caller wrappers removed.
  - **Every gee test file constructing a `RecipeScope`**, with `recipeOperation`, `eeIsolation` and the GeoID
    operation integration test (a local HTTP stand-in): 259 of 259.
  - **Shared service tests:** 6 of 6.
  - ESLint on the changed JS and `git diff --check` pass. No full suite, GUI, browser or live Earth Engine check was
    run; final integrated verification remains before push. The readiness-recording spy is untouched and still
    returns the real observable.
- **Remaining limits.** Notification context is restored for these shared reads and the service bridge only. The
  helper is Node-only and must not reach a browser-shared module. The GeoID gap found by the adjacent audit is
  closed by the owner, verified by the owner regressions and the GeoID integration controls, not by a GeoID browser
  reproduction.

Independent implementation review (2026-10-27): no remaining code-review finding. The snapshot is captured inside
each subscription; the private retained-read owner is the mandatory return boundary for both read methods. The
service bridge uses the same helper without a new scheduling hop. The two loader/reference wrappers and unused
`inCurrentPath` implementation are removed; `inPath`, factory ancestry entry/exit and cycle detection are unchanged.
Only the already-Node-only scope and service modules import the new helper.

The reviewer independently passed **73 tests** in six GEE files: the 14 owner cases, eight observations-context
regressions, 26 recipe-cycle cases, 12 operation cases, request-identity isolation and 12 local-HTTP GeoID controls.
This run used at most two workers in the GEE container's Node runtime after verifying that all six production
modules and the new owner-test file matched workspace SHA-256 hashes. The shared service limiter's six tests passed
separately on the host. ESLint on all seven changed/new JS files and `git diff --check` passed. Logs:
`/tmp/sepal-shared-context-gee-independent-review.log` and
`/tmp/sepal-shared-context-service-independent-review.log`. An earlier generic GUI-image attempt could not resolve
the EE package links and was a setup failure, not test evidence for those files; it was superseded by the
checksum-verified GEE run. No production files were changed by the review, and nothing is staged or committed.

**Shared-read refactor browser acceptance (2026-10-27; user-reported pass).** The user reported "Chart worked fine"
after the requested Change Alerts smoke check for actual segments and observation points. This accepts the focused
browser check for the refactor; the earlier S6 transition checklist remains accepted without repetition. No separate
GeoID browser reproduction or new live Earth Engine probe is claimed. Final integrated verification remains before
push.

**Final integrated verification (2026-10-27; blocked by stale GUI tests).** Tested `12129ad9b` (`sepal-server`,
clean working tree, origin integrated at `3fd364ce7`, unpushed range `88dee11a3..12129ad9b`, 53 commits). Each
service ran through `docker compose run` from the `sepal-dev` dev-env, with sources mounted from the workspace;
SHA-256 of `recipeScope.js` and `service.js` inside the containers matched the workspace. Runtimes: Node 26.12.0
(dev-env, gee, gui), Node 26.12.1 (task), npm 11.20.0, ESLint 10.0.3. At most two test workers throughout; groups
ran one after another. Logs are under `/tmp/claude-1000/-home-ec2-user-sepal/104518d4-761f-48f9-83df-9fef860fa264/scratchpad/final-verification/`.

| Group | Command | Result | Duration | Log |
|---|---|---|---|---|
| 1. Full GUI suite | `sepal npm-test gui -- --run --maxWorkers=2` | **Exit 1.** 329 files, 7 failed; 4771 tests, **36 failed**, 4735 passed, none skipped, no unhandled errors | 371.6 s | `1-gui-full.log`, `1-gui-full.plain.log` |
| 1b. Reproduction | The seven failing files alone, two workers | Same 36 failures (deterministic) | - | `1b-gui-failing-files.log` |
| 2. Shared library | `node --experimental-test-module-mocks --test-concurrency=2 --test` over 87 files in the dev-env: all recipe tests, beside-source tests, service limiter, worker scheduler/pool, HTTP server and stream lifecycle, message queue (mocked), GeoID, GDAL | 1890 / 1890, none skipped | 17 s | `2-shared.log` |
| 3. GEE | `node --experimental-test-module-mocks --test-concurrency=2 --test "**/*.test.js"` in the gee container (115 files) | 1556 / 1556, none skipped | 42 s | `3-gee.log` |
| 4. Task | Same command in the task container (16 files) | 100 / 100, none skipped | 3 s | `4-task.log` |
| 5. GUI build | `npm run build -- --outDir /tmp/gui-build-verification --emptyOutDir` in the gui container | Exit 0, 3058 modules, only Vite's generic chunk-size notice | 7 s | `5-gui-build.log` |
| 6. Static | ESLint over the 236 existing JS/JSX/MJS files changed in the range (139 under the GUI config, 97 under the root config); `git diff --check` for the range and the tree | Clean | - | `6-lint.log` |

- **Coverage confirmed by test name in the GEE log:** the shared-read owner cases (recipe and GeoID), the
  observations-context reproduction, genuine self and two-recipe cycles, operation identity, EE request isolation,
  service round trips, both local-protocol operation controls (`geoIdOperation`, `recipeOperationLifecycle`, local
  HTTP stand-ins only) and the `test/verify` helper tests.
- **Browser-graph check:** the production bundle contains no `async_hooks`, `AsyncLocalStorage` or
  `subscriberContext`, and Vite externalised no Node built-in, so the Node-only helper has not leaked. The build
  wrote to a container path, leaving the workspace `dist` untouched.
- **Exclusions:** only the shared library's two MySQL integration files (`src/db/mysql.db.integration.test.js`,
  `src/testSupport/db/testDb.integration.test.js`). They need `MYSQL_*` credentials able to create databases and
  accounts; the dev-env configures none. The range changes nothing under `src/db`, `src/testSupport/db` or GDAL, so
  this does not affect this release. The other database tests use fake pools and ran.
- **No live Earth Engine request, export, service restart or image build.**

*Finding (blocks push): 36 GUI tests in seven files encode contracts that S5 deliberately changed.*

- **Failing files and counts:**
  - `modelDerivedOutput.test.js` (16, Change Alerts);
  - `changeAlerts/changeAlertsImageLayer.test.js` (7);
  - `recipeImageLayer.test.js` (6, Change Alerts collection mosaic);
  - `masking/panels/retrieve/retrieveBandChoice.test.jsx` (3, Masking over Change Alerts);
  - `selfManagedLayerSelection.test.js` (2, Change Alerts layer form);
  - `changeAlerts/visualizations.test.js` (1);
  - `pyeoAlerts/panels/sources/sourcesCompatibility.test.jsx` (1).
- **Not run since the change.** None of these files changed in the range's S5/S6 commits. The S5 record states that
  no full GUI suite ran, and later runs were focused. The S4 row's last full-suite pass was at `8d04b160b`.
- **Classified as stale test fixtures for 14 cases, by direct evidence:**
  - Since S5, a Change Alerts operation needs the reference's processing facts (`changeAlerts/processing.js`:
    `effectiveSettings` treats absent facts as `PENDING`) and the reference's `IMAGE_OUTPUT` as an analysis
    prerequisite. The failing Change Alerts fixtures supply the pre-S5 evidence shape: none of the six files
    mentions `processing`, while the S5-updated observation, chart and REF tests do and pass. A temporary copy of
    `modelDerivedOutput.test.js` that added only `processing: assetProcessing({})` to its asset evidence made 13 of
    its 16 cases pass, including all mosaic descriptions and the period refusals. The copy was removed.
  - The PyEO case selects an untrainable Classification (no training data or classifier) as the "feedable" draft.
    The `blocksApply` audit made confirmed Classification reference findings hold Apply at the user's request, and
    the panel now shows `recipeNeedsAttention` there. The fixture predates that policy.
- **Probable, not proven, for the other 22:** the three Change Alerts Retrieve cases in `modelDerivedOutput`
  (the read supplies no runtime answers, so the new reference prerequisite stays pending), collection-mosaic
  acquisition stages and preview requests in `recipeImageLayer`, layer style selection and visualization options,
  and Masking over Change Alerts Retrieve. They share the same mechanism and no production regression was shown. But
  these flows - asset-reference Retrieve, period-mosaic layers in another recipe's map, Masking over Change Alerts -
  were not part of the accepted S5/S6 browser checks, so each needs to be confirmed while updating.
- **Required correction (not made here; this packet authorises verification only):**
  - Update each failing test to the current contract, with S5-shaped processing evidence and the held reference
    the operation now needs, or a trainable Classification for PyEO, without weakening the behaviour asserted.
  - Confirm per case that production meets the test's intent once complete evidence is present.
  - Decide deliberately whether a Change Alerts configuration refusal (missing period, Planet source without a
    collection) should be reported while reference processing is still pending. Today it appears only once
    processing is known; the failing tests assumed it independently.
- **After that correction:** rerun the seven files and then the full GUI suite once. If only GUI tests change, the
  shared, GEE, Task, build and static results above stay valid; a production change also requires the build, lint
  and the groups for the changed module.

*Accepted browser and live evidence (not repeated):*
- S1-S6 targeted browser checks as recorded, including S5's PRC ownership checklist and S6's four-step chart and
  Retrieve recheck.
- The shared-read refactor's chart smoke check ("Chart worked fine").
- Live Earth Engine evidence keeps its earlier scope: the normalisation witnesses and the S4 checks at their
  recorded baselines, and S5's legacy-metadata verification limit.

*Recommendation:* **not ready for push.** Blocked by the 36 failing GUI tests above. The backend, shared, Task,
build and static groups are green on this tree. No other unresolved release requirement was found. The deferred
items (the "Use reference settings" action, the BAYTS audit, preview-server gating and request propagation,
dependency loading, Drive/SEPAL CCDC array compatibility, and the layout and visualization-copy features) remain
deferred and are not blockers.

**Final verification corrections (2026-10-27; uncommitted on `12129ad9b`).** All 36 failures are resolved without
weakening their behaviour: 33 were test fixtures or harnesses predating S5 or the Classification-blocking policy, and
3 came from harnesses that could not represent S5's acquisition. Adding pending controls exposed one production
defect, now corrected. Logs are in the same directory as above.

| Failing group | Outcome | What now makes the valid case runnable | Behaviour still asserted |
|---|---|---|---|
| `modelDerivedOutput` - 13 mosaic, period and presentation cases | Fixture correction | The asset evidence carries `processing` from `assetProcessing` over the same metadata properties its segments come from, as `referenceObservation.js` derives them | Optical/radar/Planet mosaic bands, encodings, presentation and styles; period and Planet-source refusals as `INVALID` over otherwise complete evidence |
| `modelDerivedOutput` - 3 Retrieve cases | Harness/acquisition correction | The Retrieve read is given the runtime's `DESCRIBE` answer: the real image-output observer over the held closure, Earth Engine answering only for the segments asset the evidence describes, and the closure's `dependencyValidity`. Nothing else is answered | Change band order and `sample` pyramiding to Earth Engine; Drive without a pyramiding policy; Retrieve reads the canonical output, not a map product |
| `changeAlerts/changeAlertsImageLayer` (7) and `selfManagedLayerSelection` (2) | Fixture and harness correction | The same observed-asset evidence and `DESCRIBE` answer (`changeAlerts/observedReference.test.fixtures.js`, shared). An unresolved recipe reference stays unobserved | Mosaic styles refused for impossible dates or a Planet source without a collection; first-style selection per mode; preview; in another recipe's map. "Selects nothing while unresolved" remains a real pending control |
| `recipeImageLayer` - 6 collection-mosaic cases | Harness/acquisition correction, moved to `changeAlerts/collectionMosaicLayer.test.jsx` (8 cases) | The real Change Alerts and CCDC registrations, a real store, the runtime `SourceRuntimeProvider` builds, and the layer's own `mapStateToProps` (captured from `connect`). Only storage, Earth Engine and the drawn preview are substituted | Storage is asked only for the CCDC record and Earth Engine for nothing before the preview is requested with the editor's arguments; the same preview in another recipe's map; view changes and restyles redraw without reading again; the pending read is not torn down by a view change; an edit draws the changed record, never the previous drawing; replacing the reference with an unread CCDC draws nothing until it is read; an unreadable CCDC is withheld |
| `masking/.../retrieveBandChoice` (3) | Fixture and assertion correction | Earth Engine describes the reference segments asset; the two Change Alerts rows moved from the shared table into their own block | Band selection, `sample` policies to Earth Engine, Drive without a policy. "Reading nothing" became "the only read is that asset's band description" (no producer or Classification). A new control: an undescribable asset submits nothing |
| `changeAlerts/visualizations` (1) | Fixture correction | A typed Change Alerts recipe with an observed asset reference | Optical monitoring-mosaic options include `ndvi`; a new control offers none while processing is pending |
| `pyeoAlerts/.../sourcesCompatibility` (1) | Fixture correction | The feedable draft is a genuinely trained Classification: a Random Forest, collected points, and input bands Earth Engine describes as its band set selects | Apply enabled and the draft applied; the radar draft still refused with its explanation |

- **Production defect, confirmed and corrected.**
  - **Defect:** while the reference's processing was pending, a collection mosaic read `NEEDS_EVIDENCE` with no
    diagnostics, even for an impossible period or a Planet source without a collection - refusals that do not depend
    on processing. This contradicts "a confirmed configuration finding remains visible while unrelated evidence is
    pending".
  - **Correction, at the owner:** the shared declaration exports `collectionMosaicRefusals`, its period and source
    refusals, and uses it itself. Change Alerts' GUI projection (`changeAlerts/bands.js`) reports them while
    processing is pending, from the recipe without its saved processing copies; otherwise the mosaic still waits.
  - **Witness:** the new pending controls in `modelDerivedOutput` - the period refusal, the Planet-source refusal,
    and the wait for a valid mosaic - failed 2 of 3 before the change (the wait already held) and pass after it.
- **Observation, not changed:** the real runtime reads the CCDC record twice concurrently, once for the reference
  observation and once for the dependency closure. This predates S5 (`watchOutput$` always watches evidence) and costs
  a duplicate read, not correctness. The new tests assert reads by meaning, not by count.
- **Verification on the corrected tree:**
  - The eight changed and new test files: 310 of 310 (`7-corrected-files.log`).
  - **Full GUI suite, once:** 330 files, 4778 of 4778, no skips or unhandled errors, 348 s, exit 0
    (`8-gui-full-corrected.log`). The count is the earlier 4771 less 6 moved, plus 8 moved-and-extended, 1
    visualization control, 1 Masking control and 3 pending controls.
  - **Refreshed because the shared declaration changed:** shared 1890 of 1890 (`9-shared-refresh.log`), GEE 1556 of
    1556 (`10-gee-refresh.log`), Task 100 of 100 (`11-task-refresh.log`) and the GUI build with no Node built-in in
    the bundle (`12-gui-build-refresh.log`).
  - ESLint on the 11 changed or new JS/JSX files and `git diff --check` pass. Two workers at most throughout.
- **Remaining release gate:** the focused CCDC asset compatibility browser check (checkpoint above) is still pending.
  No live Earth Engine request, export or service restart was made.

**Final verification corrections: independent review (2026-10-27; one small guard correction required).** The shared
period/source-refusal extraction and the pending-processing behavior follow the agreed contract. Valid mosaics still
wait without saved processing fallbacks. The moved layer tests use the real runtime, source-evidence acquisition,
store and layer selector; the fixture helpers derive evidence and description answers through production code.
The reviewer independently passed all **310 tests in the eight affected GUI files**, the **60 shared Change Alerts
declaration cases**, ESLint on all 11 changed/new JS/JSX files and `git diff --check`. No full suite or live/browser
check was repeated during this review.

- **[P2] The new refusal projection throws for a missing/null model.** `changeAlerts/bands.js`, `mapProducts.project`,
  calls `withoutProcessing(recipe.model)` when the shared rule establishes missing period/source settings. The
  helper destructures its argument without normalizing it. With `model: undefined` or `model: null`, the actual
  `readRecipeOutput` path now throws a TypeError instead of returning a configuration diagnosis; the projection
  runs outside the description's try/catch. The empty-object model control correctly returns `INVALID`.
- **Required bounded correction:** normalize the missing/null model before stripping processing, preserving the
  shared refusal and valid-mosaic wait. A default parameter alone handles undefined but not null; cover both. Keep
  saved processing copies unavailable and do not change the general resolver to swallow exceptions.
- **Independent witness:** a temporary three-case test of the actual output read failed for undefined and null and
  passed for `{}`. Substituting only the previous projection form avoided all three exceptions (returning the former
  pending result); normalizing the missing model in the temporary projection made all three return `INVALID`.
  No production file was changed. The temporary repository test was removed and retained at
  `/tmp/sepal-final-corrections-missing-model.review.test.js`.
- **Evidence:** `/tmp/sepal-final-corrections-review-gui.log`,
  `/tmp/sepal-final-corrections-review-shared.log`, `/tmp/sepal-final-corrections-missing-model-review.log`,
  `/tmp/sepal-final-corrections-missing-model-previous.log` and
  `/tmp/sepal-final-corrections-missing-model-guard.log`. Refresh the focused tests, GUI build/lint and final GUI
  checkpoint after the guard fix; unchanged shared/GEE/Task verification need not be repeated for a GUI-only guard.
  The CCDC asset compatibility gate also remains pending. Nothing staged or committed.

**Projection guard correction (2026-10-27; uncommitted on `12129ad9b`).** Resolves the independent review's finding.
`withoutProcessing` (`changeAlerts/bands.js`) now normalises the model with `model ?? {}` before removing the
processing copies.

- **Regressions:** two cases in `modelDerivedOutput`'s pending-processing block read a collection mosaic for a Change
  Alerts recipe with no model and with a `null` model. Each must be refused as `INVALID` with its incomplete period
  (`monitoringEnd`) and sources (`dataSetType`), not throw. Before the guard both failed with the reviewer's
  `TypeError`; after it both pass.
- **Verification:**
  - `modelDerivedOutput` and the Change Alerts directory: 341 of 341.
  - **Full GUI suite, once:** 330 files, 4780 of 4780 (the earlier 4778 plus the two cases), no skips or unhandled
    errors, 351 s, exit 0 (`14-gui-full-guard.log`).
  - GUI production build passes with no Node built-in in the bundle (`15-gui-build-guard.log`).
  - ESLint on the two changed files and `git diff --check` pass. Logs are in `/tmp/claude-1000/-home-ec2-user-sepal/104518d4-761f-48f9-83df-9fef860fa264/scratchpad/final-verification/`.
  - No shared, GEE or Task code changed since their last green run, so those groups stand.
- **Remaining release gate:** the focused CCDC asset compatibility browser check.

Independent guard recheck (2026-10-27): the nullish normalization is at the processing-removal helper, preserving
the shared diagnostics and valid-mosaic wait. Both new regressions assert `INVALID` with missing period/source
fields. All **142 `modelDerivedOutput` tests** passed independently, with ESLint on the two changed files and
`git diff --check` clean. The reviewer also inspected the recorded full GUI log: 330 files, 4780 tests, exit 0.
No remaining code-review finding. Evidence: `/tmp/sepal-projection-guard-final-review.log`. This is a checkpoint
commit of the reviewed correction tree; the asset compatibility browser gate still prevents release.

**Existing CCDC asset compatibility (2026-10-27; user browser result and independent live metadata read).** The user
reports that chart and preview work for `users/wiell/ayeyarwadi_ccdc_radar`, but no PRC controls are disabled. After
the user made that asset public, the reviewer fetched its metadata through Earth Engine's `getAsset`, authenticated
with the existing service account. No image computation, export or asset mutation was performed.

- The image carries segment timing bands and coefficient/RMSE/magnitude arrays for `VV`, `VH` and `ratio_VV_VH`.
  Recorded properties include `dateFormat: 1`, `scale: 30`, coverage dates and visualizations.
- It has no `processing`, `recipe_options`, `recipe_sources`, `formattedProperties` or `recipe_type` property.
  The actual workspace `assetProcessing` parser agrees with the container's result: date format is `RECORDED`
  with value 1; all radar-processing fields are `NOT_RECORDED`.
- PRC remaining editable is therefore the intended older-asset fallback, not a confirmed lock/presentation defect.
  Date representation belongs to REF. Absence of recorded radar settings does not establish what processing made
  the original pixels; the consumer's labelled editable fallback remains explicit.
- Evidence: `/tmp/sepal-ayeyarwadi-ccdc-radar-inspection.parsed.json`. The first inspection attempt failed before
  authentication because the SDK was sought in the service package rather than its EE library; the corrected
  read-only attempt succeeded. This real asset verifies the missing-processing-metadata case. It does not verify
  the nested legacy metadata form, which this asset lacks, or a new canonical `processing` record.

**Existing optical collection follow-up (2026-10-27).** The user also reports working chart and preview, with Retrieve
enabled and PRC editable, for `projects/wiell-testing/assets/costa-rica/ccdc`. Independent read-only metadata inspection
finds an ImageCollection whose version timestamp is 2025-06-10, predating this work. Its collection metadata and the
three inspected tiles (`0`, `1`, `10`; not the entire collection) contain no `processing`, `recipe_options`,
`recipe_sources`, `formattedProperties` or `surfaceReflectance` setting. The workspace parser returns `NOT_RECORDED`
for SR, BRDF and the multiplier, and `RECORDED` for `dateFormat: 1`. Editable optical PRC is the intended fallback,
not evidence of a lock defect. This extends the existing-asset acceptance to an optical tiled collection; it does
not exercise the new metadata writer. Evidence: `/tmp/sepal-costa-rica-ccdc-inspection.parsed.json` and
`/tmp/sepal-costa-rica-ccdc-tiles.parsed.json`. No image computation, export or asset mutation was performed.

The existing-asset check is accepted on this combined evidence. The only remaining release check is a completed
small CCDC export under the current build, used as a Change Alerts reference with matching read-only recorded
processing and working preview/chart. Nothing has been pushed; no broader manual batch is reopened.

**Origin integration after asset checks (2026-10-27).** At the user's request, fetched origin and merged its one
incoming commit, `15dd7f07e` ("let users pick instances below an app's requirements", PR #463), as `8c0976ff9`.
The merge was clean, including the English translations. The pre-existing uncommitted roadmap notes were verified
byte-for-byte unchanged by the merge. The incoming code lists lower-specification app instances with a warning
instead of disabling them and makes Label's warning tooltip tappable; recipe/export/readiness code is unchanged.

- Post-merge workspace verification: the app directory, related widgets and translations passed **114 tests in
  16 files**, with at most two workers. ESLint on the six changed JS/JSX files and `git diff --check` pass.
- The merged GUI production build passes (only the existing chunk-size notice); output went to a temporary
  directory in the disposable container, leaving the workspace `dist` untouched.
- Evidence: `/tmp/sepal-origin-15dd7f07e-gui.log` and `/tmp/sepal-origin-15dd7f07e-build.log`. No full-suite,
  backend or browser rerun is claimed for this app-only merge. The preceding integrated results keep their
  recorded scope. No push was performed; the fresh CCDC export metadata/browser check remains pending.

**Fresh export browser acceptance (2026-10-27; final release gate passed).** The user completed a new radar CCDC
Segments asset export using the current implementation and used it as the Change Alerts reference. They report
that the recorded properties are applied correctly and the corresponding PRC controls are disabled. Asked
specifically whether execution also works using that same newly exported asset, they confirmed: "Yes, preview
and chart works fine". This is acceptance of the real new-export writer/reader round trip and actual preview/chart,
not merely enabled actions or an export still running.

The fresh asset ID was not supplied, so no independent metadata read of this new asset is claimed. The earlier
independent reads cover the existing radar and optical assets only. This user-reported browser result closes the
last agreed release gate for the reviewed code at `8c0976ff9`; the final updates are verification notes only.
The automated evidence retains its recorded scope: full integrated results for the recipe tree and the focused
tests/lint/build after origin's app-picker merge. No additional implementation slice or manual batch is required
before committing these notes and pushing.

**Post-push CI test-setup correction (2026-10-27).** Run `40557889954` at `07ef14641` passed every job except GEE.
The user supplied its failing observations-test log: the first cases found uninitialized fixture state, and later
operation assertions bypassed the recording spy. `loadObservations.test.js` registered its root `beforeEach` and
readiness spy after a top-level awaited import, letting Node start the already-declared suites before setup finished.

The asynchronous imports and spy installation now run in a root `before` hook; the synchronous `beforeEach` resets
the fixture. Production code, assertions and the spy's direct observable return are unchanged. An isolated copy
with a 25 ms import delay reproduces the failure (45 of 45 fail before; all 45 pass after); the delay is not added
to repository tests. The ordinary focused campaign passes **112 tests**, and the established GEE environment passes
the full **1556 tests**, with at most two workers. ESLint and `git diff --check` pass. Logs:
`/tmp/sepal-ci-observations-delayed-before.log`, `/tmp/sepal-ci-observations-delayed-after.log`,
`/tmp/sepal-ci-observations-fixed-focused.log` and `/tmp/sepal-ci-gee-fixed-full.log`. GitHub CI after this correction
is checked separately; the preceding local results do not claim a green remote rerun.

**S5 follow-up: "Use reference settings" action (dropped 2026-10-27; not implemented).**

The user chose to skip this action after reconsidering its value and potential confusion. This supersedes the
earlier agreement to defer it. Creation already seeds editable monitoring defaults, required processing stays
reference-owned, and later editable choices deliberately belong to Change Alerts. Copying them again offers limited
convenience, with no general accuracy or sensitivity benefit established by matching imagery/filtering choices.
No copy-again button or replacement-reference confirmation is planned. Existing seeding, ownership and preservation
behavior stays as implemented. Reconsider only if a concrete recurring user need emerges.

**Withdrawn proposal (recorded 2026-10-26):** Add a deliberate
action for an existing Change Alerts recipe to copy the current reference's consumer-owned editable monitoring
defaults again. This is not part of required S5/S6 and does not block push.

- Propose the editable values in the normal form and show what will change; Apply commits and Cancel preserves
  the applied model. Reference-owned values remain derived rather than copied.
- Use current recipe/asset evidence; unavailable optional metadata makes copying unavailable, never a guess or a
  lookup of a private producer. A stale answer or changed selection cannot overwrite edits.
- No automatic copying on replacement, reopen, Refresh or producer edits. Exclude Classification, breakpoint bands,
  CCDC fitting settings, monitoring dates and Change Alerts' detection thresholds.
- Acceptance: explicit copy changes only the proposed editable monitoring fields; Cancel changes nothing; unrelated
  settings survive; missing metadata and a last-moment reference change have clear, non-destructive outcomes.

**F7. Copy/paste layer visualization parameters.**

Selected on 2026-10-27 after the BAYTS consistency work and before recipe-scoped modals. Establish the small
implementation proposal below when this item starts; no implementation is claimed by the prioritization.

- Add discoverable Copy/Paste actions for rendering parameters in the existing layer/visualization UI. Transfer the
  visualization only; do not replace the destination layer's identity, recipe/source, AOI or processing settings.
- Reuse the visualization model and existing validation. Show incompatible destination bands or invalid parameters
  clearly; do not silently change data sources or paste an entire recipe. Keep this a separate feature, without
  expanding the readiness follow-ups into a general layer-template framework.
- **Acceptance:** compatible layers can share a style, destination identity/source remain unchanged, incompatible
  bands have an understandable outcome, and existing visualization save/reopen behaviour is preserved. Define exact
  transferable fields and clipboard behaviour in the small implementation proposal before adding controls.

**F7 implementation proposal (2026-10-28; amended for panel-only draft copying; implemented the same day, see the
implementation record below).**
The user clarified that Copy and Paste belong only inside the visualization panel. Copy captures what is currently
in that panel, including unfinished or invalid entries. Paste fills the destination panel's draft. Applying a style
remains a separate, validated action. This replaces the earlier applied-style/selector-button proposal.

- **Current owners.**
  - `VisualizationSelector.editorContext()` supplies the destination recipe, source id, scalar band choices and
    product arguments when opening `VisParamsPanel` through the existing Add/Edit/Clone actions.
  - `VisParamsPanel` owns the editable channel fields, palette and categorical legend rows. Its existing Apply
    path normalizes, saves and selects a locally owned visualization; it asks before replacing another style over
    the same bands. `showsEditedLayer` closes without saving if the area changes layer or product.
- **Controls and interaction.**
  - Put both Copy and Paste in the shared visualization panel. The layer selector gets no new controls.
  - Copy takes a snapshot of the panel's current editable draft, including blanks, invalid numeric or color text,
    missing bands, and unfinished or duplicate legend rows. It does not require Apply to be enabled, apply the draft,
    change the preview, or substitute the previously applied style.
  - Copy is acknowledged locally. Cancel after Copy discards the source panel's edits but leaves the copied snapshot
    available for another panel.
  - Paste replaces the destination panel's rendering draft with that snapshot. It does not apply, save or select a
    visualization. An empty clipboard disables Paste with its explanation; a copied empty draft is distinct from
    having copied nothing.
  - Apply and Cancel retain their ordinary meanings: Apply saves only an acceptable destination draft, while Cancel,
    Escape and the backdrop leave applied styles and layer configuration unchanged.
- **Transferable draft.** Reuse the editor's actual draft owners, keeping raw field values and row associations rather
  than running a renderer-oriented serializer over incomplete input.

  | Type | Draft content |
  | --- | --- |
  | Continuous | Type, one channel's band/min/max/inversion, and palette entries |
  | RGB, HSV | Type, three channels in order, each band's min/max/inversion/gamma |
  | Categorical | Type, band, and legend rows containing value, label and color together |

  - Preserve incomplete slots, raw text, duplicate entries and row order. Copy/Paste must not parse partially typed
    numbers, fill blanks, discard invalid colors, sort rows or lose the association between a category and its label
    and color. The existing successful Apply path may canonicalize, including sorting categorical rows by value.
  - Band names remain raw identifiers, with no automatic remapping by position or label. Form-only row ids are
    regenerated for the destination and are not visualization identity.
  - Exclude source visualization id, ownership, layer/source ids, recipe, AOI, product arguments, processing,
    histograms, request state and validation messages. Destination errors are recomputed, not copied.
  - `dataType` remains recommended for exclusion: it is a source value-format hint, not a color/range choice. No
    date semantics are inferred for a destination from a copied style. The legacy server-only `stretch` is excluded.
- **Clipboard: application-local (recommended).**
  - Hold one independent draft snapshot in session state outside `process.loadedRecipes`; never persist it with a
    recipe or write it to the system clipboard. It spans recipe panels and map areas until the next Copy or reload.
  - This needs no browser permission or external interchange format. It does not transfer between browser windows
    or people. The earlier system-clipboard helper defect is outside this scope.
  - Reuse the local acknowledgement of `CopyButton` through a small writer extension if suitable; preserve its
    default behavior for existing callers. A later Copy never changes an already-pasted draft.
- **Validity and repair.**
  - Copy and Paste do not require a renderable or valid style. `normalize` is not a draft serializer: use it at the
    existing Apply boundary after acceptance, rather than letting it coerce or refuse a draft during transfer.
  - Reuse existing field and legend validation, adding destination band applicability at that same editor boundary.
    One acceptance decision governs the Apply button and submission before confirmation or saving.
  - An unavailable band stays selected, visibly explained and repairable, in continuous, RGB/HSV and categorical
    controls. Preserve the other draft values. No histogram, Stretch or distinct-value request may name an absent
    or undrawable band. A blank slot remains unfinished setup under ordinary field interaction/submission policy.
  - Pending evidence does not prove incompatibility. Opening the panel still uses the existing destination-context
    guard; this feature introduces no evidence loader, cache or readiness rule.
  - Separate a malformed clipboard envelope from an invalid editor draft. Reject only a payload the panel cannot
    safely read as its draft shape; missing fields and invalid field values are ordinary editable content.
  - Category meaning is not established by pasting a legend. The user reviews it against the destination.
- **Identity and lifecycle.**
  - Paste preserves the destination panel's context and existing Add/Edit/Clone mode. A new destination visualization
    receives its own id through the normal save path; an edited destination visualization retains its own identity.
    The source's identity is never transferred.
  - Reuse the panel's existing destination-change closure. Copy/Paste adds no navigation or modal-scoping behavior.
- **Affected components.**
  - A small `visParams/visualizationClipboard.js` owns the allowlisted draft snapshot and app-local clipboard access.
  - `visParamsPanel.jsx` owns the buttons, draft capture/restore, unavailable-band presentation and acceptance guard.
  - Existing channel, palette or legend draft ownership may need a bounded adjustment if their displayed input is
    not yet represented by the panel's draft. Trace this before claiming every visible edit is copied.
  - `widget/copyButton.jsx` only if a writer extension is needed; English translations for the controls and feedback.
  - Keep rendering, layer ownership, band labels and recipe-scoped modals outside this slice.
- **Focused acceptance.** Use the real shared editor and store, substituting external image requests only:
  - Copy unsaved edits rather than the previously applied style, then Cancel the source and paste into another panel.
  - Copy/Paste an incomplete RGB channel, invalid range/color and unfinished categorical row without data loss.
    Apply stays held until repair, including keyboard submission; transfer itself remains available.
  - Preserve categorical value/label/color associations and raw row order in the draft, with normal sorting on Apply.
  - Preserve destination identity, recipe/source, AOI, product, processing and applied selection until Apply; Cancel
    after Paste changes no applied state. Cover both Add and Edit modes.
  - A missing destination band stays visible and produces no image request; choosing a usable replacement repairs it.
  - Copy/Paste are snapshots; a later Copy cannot alter a pasted draft. Layer/product changes close without saving.
  - The applied destination style still saves and reopens normally. Keep existing selector/editor, legend-builder
    and copy-button checks; reserve the full GUI suite for final readiness.
- **Remaining recommendations:** app-local clipboard and exclusion of source `dataType`, as above. The user has
  decided the draft semantics and panel-only placement. No production code or tests changed in this proposal.

**F7 proposal: independent review (2026-10-28).** The proposed shared-selector/editor boundary is appropriate.
Application-local copying is a reasonable first scope for transfer between recipe tabs; excluding the source's
`dataType` keeps value semantics out of a style transfer. The date-formatting limitation is explicit, and future
destination-derived formatting belongs to the broader visualization/band metadata work rather than a recipe-specific
F7 exception. These remain recommendations for the user's product decision.

Implementation clarifications from the code trace:

- `normalize` canonicalizes a definition; it does not enforce the expected channel count or aligned categorical
  arrays. The clipboard's small transfer rule must explicitly check the structural promises above, without claiming
  the normalizer already validates them. Respect representations the existing normalizer supports; keep repairable
  form-value errors in the editor as proposed.
- One editor acceptance decision must cover ordinary form/legend validity and band applicability, and govern both
  the Apply button and `check()` before confirmation or saving. Keep unavailable bands selected for repair in both
  continuous/RGB/HSV controls and the categorical band's control. All histogram and distinct-value entry points must
  avoid requesting an unavailable band, including explicit Stretch and Load from image values actions.
- Categorical value/label/color associations must survive transfer. The existing save path sorts entries by value;
  acceptance should preserve that canonical behavior rather than require an unsorted source legend to retain its
  input order after Apply. Include an unsorted-legend control.

No production change or test run was needed for this bounded proposal review.

**F7 user clarification (2026-10-28).** The user rejected restricting Copy to an applied, valid visualization and
explicitly limited both Copy and Paste to the visualization panel. The current proposal above now follows the
visible editable draft, including incomplete input. Its draft-transfer rules supersede the earlier recommendations
to normalize/refuse a style at Copy/Paste or to add controls to the layer selector. Structural safety of the local
payload remains distinct from field validity, which belongs to Apply.

**F7 implementation (2026-10-28; independent review and browser acceptance pending).** It follows the draft-transfer
contract above.

- **Controls.**
  - Copy and Paste are two round icon buttons in `VisParamsPanel`'s footer, after Stretch or the legend's Add menu.
    The layer selector is unchanged.
  - Copy is always enabled, an empty or invalid draft included. It is acknowledged on the button, through
    `CopyButton`'s new optional `write`; the default system-clipboard write is unchanged for its existing callers.
  - Paste is disabled, with a tooltip saying why, only while no readable draft is held.
  - Neither saves, applies, selects or changes the map. Cancel, Escape and the backdrop keep their meaning, and
    closing a panel leaves the clipboard as it is.
- **Clipboard.** `visParams/visualizationClipboard.js` holds one draft at `visualizationClipboard` in the session
  store, outside `process.loadedRecipes`. It is shared by every recipe panel and map area, replaced by the next Copy
  and gone on reload. It is never persisted with a recipe or written to the system clipboard.
- **Draft content.** The draft has an allowlisted shape per type. It holds values only, built fresh at Copy and again
  at Paste, so a copied draft and a pasted one never share objects.

  | Type | Content |
  | --- | --- |
  | Continuous | One channel's band, min, max and inversion; the palette colors; the HEX text while it is open |
  | RGB, HSV | Three channels in order, each with band, min, max, inversion and gamma |
  | Categorical | The band, and the legend rows' value, label and color, in row order |

  - Raw form values are kept: blanks, an inverted range, invalid HEX colors, unfinished or duplicate rows. `normalize`
    still runs only at a successful Apply, which also sorts categorical rows by value.
  - Paste regenerates palette and row ids. Fields the pasted type does not use start as in a new style.
  - Excluded: the visualization id and ownership, `dataType`, recipe and layer identity, product arguments,
    histograms, request state and validation messages.
  - A held value that is not that shape (a wrong channel count, objects where values belong) makes Paste
    unavailable. Invalid field values are ordinary editable content.
- **Draft ownership adjustment.** The palette's HEX text was local to `Palette`, which kept only the colors it could
  parse. It is now the panel's `paletteText` form field, so Copy carries what the HEX input shows. Legend rows were
  already the panel's state.
- **Identity.**
  - Paste leaves the editor's Add, Edit or Clone mode and its captured context alone. A new style gets a
    destination id at Apply; an edited style keeps its id and its own `dataType`.
  - The existing replacement confirmation and save/reopen paths are unchanged.
- **Validation and requests.**
  - The panel's form now holds the bands it was opened with (`bands`). A band choice it cannot draw fails that field,
    with its error. The choice stays selected, shown as an unavailable option, in every channel and in the
    categorical band.
  - A single `acceptable()` governs the Apply button, the Enter binding, `check()` and the save after a replacement
    confirmation.
  - Histograms are asked only for drawable, non-blank bands, and Load from image values is disabled and refused for
    the others. Paste abandons the replaced draft's pending histogram and distinct-value requests, and reads the
    pasted bands without stretching them.
  - A cached histogram no longer forces a stretch. Every existing caller already asked for one, so their behaviour is
    unchanged.
- **Shared legend correction.** `LegendBuilder` used `_.pickBy` with an id array, which never keeps an entry, so it
  remembered only the most recent row's validity. Fixing one invalid row could then enable Apply while another row
  was still invalid, including in Classification, Remapping, Index Change and Class Change legends. It now uses
  `_.pick`.
- **Verification.**
  - New mounted `visParams/visualizationDraftTransfer.test.jsx`: 16 tests over the real panel, form, palette, legend
    builder, Combo, copy button and store, with two recipes' layers and only activation, map bounds and Earth Engine
    substituted. It covers:
    - unsaved edits copied instead of the applied style, then the source cancelled and the draft pasted elsewhere;
    - a range that is not one, an inversion and invalid HEX colors transferred, then repaired and applied;
    - an empty copied draft versus an empty clipboard, and an unreadable held value;
    - Cancel after Paste keeping the applied style and the clipboard;
    - Add and Edit identity, without the source's `dataType`, and save then reopen;
    - the replacement confirmation;
    - categorical associations and row order, sorted on Apply, and unfinished or duplicate rows holding Apply until
      each is repaired;
    - missing bands in RGB and categorical, holding Apply and Enter with no image request until replaced;
    - snapshot independence;
    - obsolete histogram and distinct-value responses, and a cached histogram not stretching pasted ranges.
  - `copyButton.test.jsx`: a caller's own write is acknowledged, or not, without the system clipboard.
  - Witnesses, each failing at least one case:
    - no request abandonment;
    - a cached histogram forcing a stretch;
    - no band predicate;
    - histograms for any band;
    - the legend's `_.pickBy`;
    - palette text kept local;
    - no shape check;
    - distinct values for any band;
    - unavailable bands not shown.

    Two candidate guards were removed after surviving: a histogram stretch reset and defensive deep clones.
  - Focused runs with two workers: 45 files, 673 tests (map, copy button, form, clipboard, locale, the legend users
    above, visualization matching, recipe image layer). ESLint on the changed files and `git diff --check` pass.
  - Pending: independent review, browser acceptance and the final full GUI suite.
- **Remaining limits.**
  - The clipboard does not reach other browser windows or people. A pasted date style shows numbers unless its
    destination owns a date `dataType`.
  - The HEX text's invalid colors are kept in the draft. As before, Apply saves only the colors that parse.
  - A replacement band still re-stretches from its histogram, as any band change does.
  - Category meaning is not checked against the destination's values.

**F7 implementation: independent review and button-placement feedback (2026-10-28; corrections required).** The
panel-local clipboard, destination identity and cancellation approach fit the agreed boundary. The user reports
that the feature appears to work but the footer placement is poor. Copy/Paste are actions on the whole draft;
the review recommends grouping them together in the panel header, with a narrow-window visual check rather than
mixing them with Stretch or the legend's Add menu. Final placement acceptance is still pending.

Two functional findings remain:

- **[P2] Invalid palette text is silently discarded on Apply.** `paletteText` has no validation, and
  `Palette.updateText` keeps only tokens it can parse in the palette used by `save()`. With valid band/range values,
  copying and pasting `#ff0000, banana, #0000ff` leaves Apply enabled. The new transfer test explicitly expects the
  `banana` token to disappear from the saved palette after only the range is repaired. Copying incomplete/invalid
  input is agreed; silently applying a filtered subset is not. Keep the text copyable and repairable, report its
  field error and hold Apply and Enter until the whole active palette is valid. Remove the test expectation that
  endorses dropping the invalid token. This older editor behavior cannot remain a limitation of the new contract.
- **[P2] Categorical numeric edits are parsed before the draft is copied, and blank values can be saved as NaN.**
  `LegendBuilder.Entry.notifyChange` immediately uses `parseInt`: entering `1e3` becomes `1` before Copy, and clearing
  a value becomes NaN in the row state. The value field has only `notBlank`, which does not reject that NaN. A pasted
  row displays an empty value, yet Apply is enabled; an independent Enter case actually saved a categorical style
  containing `[1, NaN]`. Preserve the raw numeric draft and validate it at the legend owner, converting only at an
  appropriate successful-commit boundary. Audit the existing shared legend callers so that preserving raw edits does
  not silently change their persisted numeric representation. Keep the existing multi-row validity correction.

Four temporary mounted assertions reproduce these findings: invalid HEX text does not hold Apply; a cleared category
does not hold Apply; `1e3` is changed before Copy; and Enter saves the blank category as NaN. The temporary file is
removed from the repository and archived at `/tmp/sepal-f7-review/visualizationDraftTransfer.review.test.jsx`;
the run is `/tmp/sepal-f7-review-probes.log`. Production code and the implementor's tests were not changed by the
review. The existing visualization/editor and CopyButton suites passed 54 tests in five files, with two workers
(`/tmp/sepal-f7-review-existing-tests.log`). The full GUI suite and final browser acceptance remain pending.

**F7 review corrections (2026-10-28; re-review and browser acceptance pending).** These are bounded corrections to
the implementation above. The draft-transfer contract, the application-local clipboard, snapshots, destination
identity, missing-band repair and request abandonment are unchanged.

- **Placement.**
  - Copy and Paste are now one button group in the panel header, beside the type selector, as actions on the whole
    draft. The footer keeps Stretch or the legend's Add menu, and Cancel and Apply.
  - The header uses `Panel.Header`'s existing `children` slot. Its default `label` slot shrinks alongside the title
    and would clip the group in a narrow panel. Local `visParamsPanel.module.css` rules keep the type and the group
    at full width (`flex: 0 0 auto`) while the title gives way (`min-width: 0`, no wrapping). Shared header styles
    are unchanged.
  - Both buttons now have accessible names ("Copy settings", "Paste settings"). Their tooltips, the disabled Paste's
    explanation and Copy's acknowledgement on the button are unchanged.
- **Invalid palette text.**
  - The `paletteText` field now refuses a HEX text naming anything that is not a color. Its error lists the
    offending tokens ("Not a color: banana"), shown on the palette.
  - Through the form, that refusal holds Apply, Enter and the save after confirmation, all through the editor's
    `acceptable()`.
  - It is skipped for every type but continuous. The check and `Palette.updateText` share one parse rule
    (`invalidPaletteColors`), so every color input the palette already read stays valid, and empty tokens name
    nothing.
  - The HEX view cannot be closed while it holds an invalid color. Closing would otherwise keep only the colors
    that parse.
  - The transfer test that expected `banana` to disappear now expects Apply and Enter to be held after the range is
    repaired. It then repairs the text and checks that all three intended colors are saved.
- **Raw categorical values.**
  - `LegendBuilder.Entry` keeps a row's value as entered while it is edited and transferred: `1e3` stays `1e3`, and a
    cleared value stays blank, not NaN.
  - The legend owner's value field adds a whole-number rule (`Enter a whole number`) to `notBlank`. A blank,
    non-numeric or fractional value is refused, where parsing had truncated or ignored it before.
  - Duplicate values are compared by the number each states, so `1` and `1.0` are duplicates. Global form blankness
    is unchanged, and the `_.pick` multi-row validity correction stays.
- **Commit boundary.** `legendBuilder.jsx` now exports two rules.
  - `legendEntriesToModel` converts each row to the number it states and sorts by it.
  - `nextLegendValue` gives an added row one above the highest stated value. It replaces `max.value + 1`, which would
    concatenate a raw string.
  - Every caller uses them:
    - Classification, Remapping and Index Change for both rules;
    - Class Change, which adds no rows, for the commit;
    - the visualization panel's categorical save and Add.
  - Persisted legends remain numeric and sorted by value. Computed numeric rows are unchanged; an imported row's
    textual value is now committed as its number too.
- **Verification.**
  - Transfer test, now 20 cases:
    - the header group, its accessible names and the disabled Paste's explanation;
    - invalid HEX text that stays copyable, holds Apply and Enter, then saves every intended color once repaired;
    - a HEX view that cannot close on an invalid color;
    - `1e3` carried as entered and saved as 1000;
    - a cleared value carried blank that saves nothing on Enter, with `1.0` refused as a duplicate of `1` before a
      repair releases Apply.
  - Shared caller boundary, in the Remapping legend's mounted `panelActivation.test.jsx`: an entered `1e1` is saved
    as 10, ordered numerically after 2, and `1.0` beside `1` holds Apply.
  - Each new case fails against the pre-correction files, and the header case against the footer placement.
  - The reviewer's archived probes are covered by these permanent cases. No temporary copy was added to the
    repository.
  - Focused runs, with two workers: 52 files, 772 tests (map, form, panel, copy button, clipboard, locale,
    Classification, Remapping, Class Change, Index Change, visualization matching, recipe image layer). ESLint on the
    changed files and `git diff --check` pass.
  - Pending: re-review, the narrow-width browser check, and the final full GUI suite.
- **Remaining limits.**
  - Legend CSV export writes values as entered. A raw `1e3` is exported as such, and the existing importer reads only
    its leading integer.
  - A legend saved with fractional values, which only the distinct image values of a non-integer band could produce,
    now shows those rows as needing a whole number before Apply.
  - The limits recorded above otherwise stand. The HEX-text limitation is superseded: invalid text now holds Apply
    instead of being dropped.

**F7 corrections: independent re-review (2026-10-28; two bounded corrections remain).** All four original review
assertions now pass: invalid HEX text holds Apply, a cleared categorical value stays unfinished and held, raw `1e3`
survives transfer, and Enter saves nothing for the blank category. Header grouping and accessible naming are in
place; the narrow-width running-browser check is still pending.

- **[P2] The shared whole-number restriction is stronger than the requested fix.** Rejecting blank, non-numeric
  and non-finite values is required; rejecting every finite fraction is a new compatibility policy. A saved
  visualization with category values `[3.5, 1.5]` now cannot be applied. The existing categorical renderer indexes
  its padded palette by `value - minimum` (`gee/jobs/ee/image/preview.js` and GUI `cursorValue.jsx`), so that example
  has integer positions 2 and 0; a blanket integer rule is not established by the indexing alone. Keep shared
  validation at finite numeric values and preserve raw edits. Any actual caller-specific whole-number constraint
  belongs to that caller, rather than being introduced globally by Copy/Paste. Numeric duplicate checks, deferred
  conversion and numeric sorting remain appropriate.
- **[P2] CSV column discovery rejects distinct supported exponent values.** The reported limitation is not exactly
  a value being truncated by import: `LegendImport.save` retains the raw cell, and the new commit rule reads its
  full number. The remaining prefix parser is in `legendImportDefaults.getValidMappings`. A value column containing
  `1e1` and `1e2` is rejected as though both were `1`; the equivalent `10` and `100` column is accepted. Thus the
  editor can export a valid draft that its import UI cannot map. Use compatible full-value numeric rules for column
  discovery and numeric uniqueness, and add an export/import boundary control. No broader CSV redesign is needed.

Independent checks: 82 existing tests in seven files pass, including transfer, CopyButton, CSV defaults and the
Remapping legend. Of six targeted review assertions, the four original cases and the ordinary-decimal CSV control
pass, while the exponent CSV case fails; the separate existing-fractional-legend control fails too. Temporary files
were removed and archived under `/tmp/sepal-f7-review/corrections/`. Logs are
`/tmp/sepal-f7-correction-review-probes.log`, `/tmp/sepal-f7-fractional-review.log` and
`/tmp/sepal-f7-correction-review-existing-tests.log`. At most two workers were used. No production file changed in
this review; full GUI verification and final browser acceptance remain pending.

**F7 header browser feedback (2026-10-28).** The user reports the implemented header is misaligned and rejects
placing Copy/Paste at the far right, which belongs to the type switch. The requested order is: layer icon, grouped
Copy and Paste, title, then the type switch anchored at the far right. At narrow widths, shorten the title before
shrinking or clipping the action buttons or type switch. Keep this a local visualization-panel layout correction
and check the actual alignment in a browser at normal, 360px and 320px widths; mounted placement assertions alone
did not establish a usable layout. This supersedes the earlier recommendation to group Copy/Paste beside the type
selector. The footer keeps Stretch/Add and Cancel/Apply.

**F7 re-review corrections and header order (2026-10-28; re-review and user browser acceptance pending).**

- **Legend values are finite numbers, not whole numbers.**
  - The shared rule now lives in a pure `app/home/map/legendValue.js` (`legendValue`). It reads a value whole
    (`1e3` is 1000, blank is NaN), and the legend row's value field accepts any finite number it states.
  - Existing fractional legends such as `[3.5, 1.5]` apply again. A fraction entered while editing is saved as
    entered, never truncated.
  - Blank, non-numeric and non-finite values are still refused. The message is now "Enter a number".
  - Numeric duplicates (`1`, `1.0`), deferred conversion (`legendEntriesToModel`), numeric ordering and
    `nextLegendValue` are unchanged.
  - No caller is known to require whole numbers: legend import already accepted fractional cells. None adds that
    constraint here; one that does should add it in its own validation.
- **CSV value-column detection.**
  - `legendImportDefaults.getValidMappings` offers a value column only when every row states a finite number by the
    same `legendValue` rule, all of them numerically distinct. `1e1` and `1e2` are offered as 10 and 100, and `1.5`
    beside `1.7` is no longer rejected as two 1s.
  - Blanks, text that is no number, and one number written twice are not offered. Color-channel detection keeps its
    integer rule.
  - Exported legend CSVs already reach detection typed by Papa (`dynamicTyping`), so an unquoted `1e1` arrived as 10.
    The fractional and textual cases were the real round-trip gaps.
- **Header order (user browser feedback above).**
  - The header now reads: layer icon, the Copy/Paste group, the title, then the type switch anchored at the far
    right. The title shrinks and ellipsizes first (`min-width: 0`); the icon, buttons and type switch do not shrink.
  - This is a local `visParamsPanel.module.css` layout through `Panel.Header`'s children.
- **Verification.**
  - New cases:
    - a fractional legend applies, and an entered `2.25` saves as 2.25;
    - pasted values `seven` and `Infinity` hold Apply and Enter;
    - CSV detection offers exponent, numeric-fraction and textual-fraction columns, and rejects a duplicate written
      differently, non-numeric text and a blank;
    - a boundary control parses an exported-format CSV through the real `parseCsvFile$` and confirms its value
      column is offered with values `[10, 1.5, 1.7]`;
    - the header placement assertion checks the new child order.
  - The fractional, CSV and boundary cases fail against this round's starting files.
  - Focused runs, with two workers: 52 files, 783 tests. ESLint and `git diff --check` pass.
  - **Chromium harness:** a Vite build of the real panel in a real recipe, store and activation context, measured with
    Playwright. All four types at 1280, 360 and 320px pass:
    - the order icon, Copy, Paste, title, type;
    - no clipped button or type label;
    - vertical centres within 1px;
    - the panel inside the viewport;
    - the title truncated only at 320px for Continuous and Categorical;
    - the disabled Paste's tooltip at 1280px;
    - Copy's check-mark acknowledgement, after which Paste is enabled.

    Below 500px the app disables hover tooltips everywhere (`isMobile`), so none shows there. Evidence is in the
    implementor's session scratchpad (`f7harness/browser.log` and its header screenshots).
  - Pending: re-review, the user's running-app check and the final full GUI suite.
- **Remaining limits.** The earlier whole-number limit is withdrawn. Legend CSV export still writes values as entered.
  Detection and commit now read them whole, so a round trip keeps their numbers. Other limits recorded above stand.

**F7 final correction re-review (2026-10-28).** The remaining review findings are resolved. Legend editing,
duplicate checks, numeric commit and CSV value-column discovery now use the same finite-number interpretation.
The CSV boundary test clarifies the earlier report: ordinary unquoted exponent cells were already converted by
the CSV parser; fractional and textual inputs exposed the remaining discovery gap. Existing fractional legends
are accepted again, without losing raw edits or allowing blank/non-finite values to save.

The reviewer inspected the supplied 1280px and 320px header screenshots: the icon and Copy/Paste lead, the title
follows and shortens at narrow width, and the type switch stays at the right. This is inspection of the implementor's
Chromium-harness evidence, not another running-app browser check.

Independent focused verification passed 92 tests in seven files: visualization transfer/editor/normalization and
palette presets, CSV defaults and parsing, the Remapping legend boundary and CopyButton. At most two workers;
`git diff --check` is clean. Log: `/tmp/sepal-f7-final-review-focused.log`. No new finding and no production change
from this re-review. Remaining acceptance can be brief: the user checks the header in the running app at normal and
narrow widths, and an unsaved Copy / source Cancel / destination Paste smoke check. Numeric and CSV edge cases
have automated coverage and need no repeated manual batch. The full GUI suite remains for final readiness.
Nothing staged, committed or pushed.

**F7 visual acceptance remains open (2026-10-28).** After the functional re-review, the user reiterated that the
Copy/Paste icons still need fixing. The functional result and the harness screenshots do not close that visual
issue. Establish whether the remaining problem is placement/alignment, icon appearance or both, and correct it
before treating the running-app header as accepted or committing the slice.

**F7 header icon correction (2026-10-28; the user's running-app visual acceptance is pending).**

- **Not a stale build.**
  - The running `gui` container serves the mounted working tree through Vite's dev server (`npm start`). Its
    served `visParamsPanel.jsx` and `.module.css` held the current header (`renderHeader`, `headerStart`,
    `headerTitle`, `headerType`), and serve the corrected file now.
  - A browser tab opened before the latest update may still need a reload.
- **Cause.** The header order was right, but the spacing around Copy and Paste was not. They were grouped in a
  `ButtonGroup` with `spacing='tight'`, whose horizontal Layout rule gives every child but the last a 3px right
  margin and a 3px bottom margin. Copy got that margin and Paste did not. With the round buttons' own padding, the
  icons were unevenly spaced:

  | Measured in Chromium | Layer icon to Copy | Copy to Paste | Paste to title |
  | --- | --- | --- | --- |
  | Glyph-centre pitch | 27.1px | 30.8px | |
  | Visible gap between glyphs | 15.3px | 19.0px | 14.5px |

  Copy sat closer to the layer icon than to Paste. Vertical centres were already within 0.3px. Copy's acknowledgement
  shifted nothing, since its button keeps its 27.7px circle.
- **Fix.** `visParamsPanel.jsx` only.
  - Copy and Paste now sit edge to edge in a `Layout` with `spacing='none'`. ButtonGroup's own `none` would join
    the buttons and change their shape.
  - The existing `.5rem` gap after the layer icon and the round buttons' padding now space all three icons alike:
    pitch 27.1px and 27.8px; visible gaps 15.3px, 16.0px and 14.5px to the title. Both buttons have identical
    zero margins.
  - Icons, sizes, colors, order, the narrow-width rule, the footer and all behavior are unchanged. The unused
    ButtonGroup import is gone.
- **Verification.** The running app sits behind sign-in, and no browser session or credentials were available to
  this check, so the evidence comes from a Chromium harness.
  - **Harness.** A Vite production build of the same working tree, with the app's global, theme and look styles.
    The real `VisParamsPanel` sits in a real store, recipe, activation and portal context, opened as the layer
    selector opens it, and Playwright measured it.
  - At 1280, 360 and 320px, for Continuous, Categorical (the longer label), RGB and HSV:
    - the order icon, Copy, Paste, title, type, with the type switch flush right;
    - nothing clipped or overlapping;
    - vertical centres within 1px;
    - an unchanged 42.7px header height;
    - the title shortening only at 320px for the two longer labels.
  - Copy's check-mark acknowledgement moves neither button. Paste is disabled with its tooltip at 1280px (below
    500px the app disables hover tooltips everywhere), then enabled after Copy.
  - The type selector opens at every width, and choosing RGB updates the header and the form.
  - The visualization editor and CopyButton tests pass (61 in five files, two workers). ESLint and
    `git diff --check` pass.
  - Before and after evidence is in `/tmp/claude-1000/-home-ec2-user-sepal/104518d4-761f-48f9-83df-9fef860fa264/scratchpad/f7harness/`:
    - `geometry-before.log` and `geometry-after.log`;
    - the `before-*.png` and `after-*.png` screenshots (complete header with the panel body, 2x), including
      Paste-enabled and open-type-menu captures;
    - `browser-after.log`.
- **Remaining.** The user's own running-app check. Visual acceptance is not claimed here.

**F7 header placement accepted (2026-10-28).**

- **Final header.** The user iterated the header in the running app and accepted:

  `[layer icon] Visualization … [Copy][Paste] [type switch]`

  - Copy and Paste sit edge to edge, immediately left of the type switch. Each is a small chromeless round button
    (`size='small'`, `air='less'`, 19.7px).
  - The title shrinks first at narrow widths.
  - This supersedes the placements before and after the title recorded above.
- **Change.** Local to `visParamsPanel.jsx` and `visParamsPanel.module.css`. The pair's group takes the free space
  (`margin-left: auto`), and the type switch keeps its place at the far right.
- **Tests.** The mounted header-order assertion was removed. Layout is checked visually, not by tests.
- **Remaining.** The unsaved Copy, source Cancel, destination Paste smoke check in the running app, and the final
  full GUI suite before commit.

**F7 browser acceptance and final verification (2026-10-28).** The user accepted the final header layout above and
explicitly confirmed that Copy of an unsaved visualization edit survives cancelling its source panel and pastes
into another panel. Browser acceptance is complete within that scope. Numeric, invalid-input and CSV edge cases
retain their automated evidence rather than requiring another manual batch. The final full GUI result is recorded
below. Fingerprints of the 17 changed code/data/style files were captured before the run and confirmed unchanged
afterwards. No backend or shared-library code changed in this slice.

**F7 final verification passed (2026-10-28).** The full GUI suite completed with exit 0: 4860 tests in 335 files,
370.30 seconds, at most two workers (`/tmp/sepal-f7-final-gui.log`). Browser acceptance and independent review are
complete within their recorded scopes. ESLint passed for all 15 changed JS/JSX files
(`/tmp/sepal-f7-final-lint.log`), and `git diff --check` is clean. No backend/shared-library rerun is required for
this GUI-only slice. The final staged whitespace check removed one extra blank EOF line in the new transfer test;
no executable text changed after verification. The verified tree is ready for commit; no push is included in this step.

**Band Math empty-output setup feedback (implemented, independently reviewed and browser-accepted 2026-10-28).**

- **Report:** selecting input imagery in a new recipe marks OUT as an error before the user has started calculating
  or choosing outputs. This conflicts with the existing setup-versus-invalidity contract.
- **Confirmed code path:** `bandMathRequirements.js` declares `OUTPUT_IMAGES_REQUIREMENT` over `OUTPUT_PRESENCE`
  without a toolbar-mark exception. `chainRequirements.js` reports `NO_OUTPUT_IMAGES` for the empty output list;
  `sectionMarks.test.jsx` explicitly expects the red mark. Classification already uses `toolbarMark: false` for
  its equivalent total absence of training data. This is a deliberate presentation-policy correction, not removal
  of an execution prerequisite.
- **Direction:** leave OUT unmarked for an empty overall output selection and provide neutral guidance in the
  output panel, reusing its existing empty-state presentation where possible. Suggest choosing output bands;
  calculations are optional because input bands can pass through directly. Apply the rule from current configuration,
  without a persisted "started" flag or different behavior merely because the recipe was saved/reopened.
- **Preserve:** preview/Retrieve holds and readiness; errors for invalid calculations, missing referenced images or
  bands, invalid/duplicate output names and configured output items left without bands. Required-field validation
  inside the form follows normal interaction/submission policy. Do not suppress all OUT findings or weaken Apply.
- **Scope/acceptance:** prefer the existing declaration-level presentation control, not a toolbar-specific validator
  or a new readiness state. Add a mounted empty-setup control proving neutral OUT with operations still held, then
  show that choosing a direct input band or calculation output releases the hold and genuine configured errors still
  mark the appropriate section/item. No browser reproduction or production change is claimed by this code trace.
- **Implemented.**
  - `OUTPUT_IMAGES_REQUIREMENT` (`bandMathRequirements.js`) takes `toolbarMark: false`, the declaration-level
    control Classification uses for `NO_TRAINING_DATA`. `NO_OUTPUT_IMAGES` still refuses the image output, so preview
    and Retrieve stay held; only OUT's button no longer reports it.
  - The rule follows the current configuration: there is no flag, and a reopened recipe behaves the same.
  - The panel's existing empty-list message (`outputBands.noImages`, English) now says: "Choose the bands to output:
    press Add to pick an input image or a calculation, then its bands. Input bands can be output directly; a
    calculation is optional." No paragraph was added.
  - The form's `notEmpty` validation, Apply policy and every other OUT finding are unchanged: missing or invalid
    bands, duplicate or invalid names, and an output image without bands. Other locales keep their translations of the
    older text, which remains true.
- **Regressions** (`sectionMarks.test.jsx`, the real toolbar, Output bands panel, store and source runtime):
  - Imagery with nothing output leaves OUT unmarked, with the guidance shown, the configuration gate refusing and the
    image output withdrawn, also after reopening.
  - Applying a direct input band output, with no calculation, clears the configuration refusal and the guidance.
  - The "nothing output" case of the description-refused table now expects OUT unmarked while the input is still
    marked once read.
  - The unreadable-source case asserts the hold instead of the OUT mark.
  - Existing genuine-error cases still mark their sections and rows: an output image without bands, duplicate and
    invalid names, an unmet calculation, and an input lacking a band.
  - **Witness:** without the flag, the two empty-output cases fail and the rest pass.
- **Verification:** all Band Math tests and the locale checks, 23 files and 280 tests (two workers). ESLint on the
  changed files, the translations JSON and `git diff --check` are clean.
- **Gate attribution corrected (2026-10-28, shared).** A held preview or Retrieve used to name Calculations whenever
  the output read refused. That was the generic output state of the first output declaration, Calculations, which
  found nothing of its own. It happened with nothing output and also for configured output errors such as duplicate
  names.
  - **Rule:** `requestGateOf` (`sourceRequirements.js`) now gives that generic fallback only where no stated refusal
    holds the same operation. A stated refusal is a local requirement, a located finding or a selected source's
    requirement.
  - Pending generic reads still wait. A generic refusal still holds any operation no stated refusal covers, and is
    the reason beside a met requirement or one stated for another operation. The read list is unchanged, and so are
    `locatedRefusals`, the toolbar marks and the declaration order.
  - **Result:** an empty output and configured output errors hold naming OUT; calculation errors still name CALC.
- **Regressions for the gate:**
  - `outputRequirements.test.js`: a generic output refusal declared and read before a stated local refusal. The
    stated one is the reason for its operation. The generic one still holds another operation only it holds, and is
    the reason where the requirement covers another operation or is met.
  - `sectionMarks.test.jsx`: the empty output, the description-refused table, the unreadable source, an output image
    without bands and duplicate or invalid names all hold naming OUT; the unmet calculation still names CALC.
  - **Witness:** the previous gate fails the two "stated refusal is the reason" bridge cases and 5 of 11 mounted cases.
    The controls pass both ways.
- **Missed by the first verification:** the bridge test "of type BAND_MATH keeps its Output bands marked for having
  none" (`outputRequirements.test.js`) still pinned the old OUT mark. The first run covered only the Band Math
  directory and locales. It now expects only Input imagery marked.
- **Verification (gate correction):** the affected callers' directories (Classification, Regression, Time Series,
  CCDC, CCDC Slice, Phenology, PyEO, Stack, Band Math, Remapping, Unsupervised Classification, Change Alerts, BAYTS
  Alerts, Masking), the process recipe top-level tests, process panels, map layer source and locale: 143 files and
  2266 tests (two workers). ESLint on the changed files and `git diff --check` are clean.
- **Independent review (2026-10-28; correction required before acceptance):** the declaration-level toolbar change
  is appropriately scoped, but the incorrect repair target should be corrected within this setup-feedback slice.
  A temporary copy of the mounted empty-output test expecting the full image-output gate to name OUT fails:
  it returns `SOURCE_UNSUITABLE` at Calculations instead of the explicit `CONFIGURATION_UNMET` at Output bands.
  The local configuration gate already has the correct owner. Evidence:
  `/tmp/sepal-bandmath-empty-attribution-review.log`; the probe was removed and production code was not changed.
  The generic output-state fallback currently wins over a concrete section-level local refusal. This does not by
  itself establish that all shared reasons should be reordered: inspect the existing generic-versus-located
  suppression and operation scopes, then correct the owning mechanism without Band Math-specific gate logic or
  declaration-order workarounds. Retain generic holds where no explicit requirement explains them or where they
  cover another operation, and preserve real calculation errors. Include configured OUT errors as ownership
  controls. Cover the complete gate/consumer-facing target, not only the local configuration gate. The earlier
  suggestion to defer this target mismatch is not accepted. Independently, the submitted Band Math and translation
  tests pass: 276 tests in 22 files with two workers; changed-file ESLint and `git diff --check` pass. This passing
  campaign does not include the additional failing attribution assertion above.
- **Correction independently verified (2026-10-28):** no remaining review finding. `requestGateOf` selects explicit
  unsupported requirement reasons for the requested operation over confirmed generic `outputState` fallbacks.
  It changes neither declaration order nor the read list, and retains generic reasons for operations without an
  explicit refusal; pending/unavailable handling and withdrawal stay intact. The mounted empty-output and genuine
  OUT-error cases now assert the full gate names OUT, and the genuine calculation case still names CALC. An
  independent run of all Band Math tests, source/output requirement tests, operation availability, section status,
  both Time Series/CCDC Retrieve lifecycle files and translations passed 390 tests in 28 files with two workers.
  Changed-file ESLint and `git diff --check` pass. Evidence:
  `/tmp/sepal-bandmath-gate-correction-review-tests.log` and
  `/tmp/sepal-bandmath-gate-correction-review-lint.log`.
- **Browser acceptance (2026-10-28):** the user confirmed the manual checks are good and accepted the setup/gate
  change. The map-area menu visibility observation below is pre-existing and will be addressed in a separate commit.
- **Related map-area menu visibility observation (2026-10-28; implemented, independently reviewed and browser-accepted):** the user sees
  no map-area settings button before Band Math has outputs and asks that hiding versus disabling be consistent and
  centrally owned. `bandMathImageLayer.jsx` returns no `MapAreaLayout` when `outputImages` is empty, so its menu and
  feature overlays are absent; this is a recipe-specific condition, not the shared request gate. Stack, Remapping
  and Masking render that layout even without a drawable layer. The shared `MapAreaMenu` itself renders its button;
  Retrieve likewise retains its button and uses shared availability to disable it. This predates the current
  toolbar/gate correction. Review other layer wrappers when implementing the shared capability-versus-readiness policy.
  The menu also controls overlays, so an unusable recipe image does not necessarily make the whole menu useless:
  the user agreed the direction of retaining applicable controls and centrally gating only operations whose
  prerequisites are missing, preserving independent overlay functions. Implement the correction separately from
  the accepted setup/gate fix, using the shared map-area boundary rather than additional recipe-specific checks.
  Check empty/invalid output, repair and unaffected overlay access across representative recipes. No map-area
  production change is included in this setup/gate commit.
  - **Shared ownership, as found.** `recipeImageLayer.jsx` already decides drawability. It passes `layer = null`
    while the source gate (`requestGate`) or the map-product gate withdraws, or while the output cannot be previewed,
    and keeps a drawing only while evidence is pending. `LayerSourceStatus` and `visualizationSelector` say what is
    held. `MapAreaLayout` always renders `MapAreaMenu` and the feature overlays, and takes a withheld layer off the
    map. No shared capability was missing.
  - **Change.** `bandMathImageLayer.jsx` no longer returns null when nothing is output: it always renders the shared
    `MapAreaLayout`, as Stack, Remapping and Masking do. Holding the image stays with the shared gates. The form
    renders from the default model (`outputImages: []`, `availableBands` defaulting to `{}`).
  - **Audit of the other `MapAreaLayout` wrappers.**
    - None other drops the layout for a configuration fact.
    - Classification (`canRender`), Optical Mosaic (`hasScenes`) and LandTrendr (`layerConfigChanges`) withhold only
      the layer and keep the menu.
    - BAYTS Alerts, Change Alerts and LandTrendr render no layout until `ui.initialized`, that is during their
      creation wizard. That is a lifecycle boundary independent of configuration validity, so it is left as found.
  - **Regression.** `recipe/recipeMapArea.test.jsx` mounts the recipe's own center area as `map.jsx` renders it: the
    real layer source, recipe layer component, `MapAreaLayout`, `MapAreaMenu`, activation, store and source runtime,
    with Earth Engine and the map faked.
    - Band Math with imagery and nothing output keeps an enabled menu, its Labels overlay toggles, and no preview is
      constructed.
    - A configured duplicate output keeps the menu and the selected visualization, with no new preview; repair
      draws again with the same selection.
    - Stack with nothing stacked behaves the same.
    - **Witness:** with `bandMathImageLayer.jsx` from `HEAD`, the empty-output case fails. The invalid/repair case is
      a control: the old code kept the layout while any output existed.
  - **Verification:** Band Math, the shared layer and its source, Stack, map layout, and `app/home/map` (including the
    visualization selector): 64 files and 859 tests (two workers). ESLint on the changed files and `git diff --check`
    are clean. a8061176b's behaviour is unchanged: OUT unmarked, the hold naming OUT, genuine errors marked.
  - **Independent review (2026-10-28):** no remaining finding. Removing the Band Math exception reuses the existing
    shared menu/overlay behavior without altering readiness or drawing gates. The wizard-only guards in BAYTS
    Alerts, Change Alerts and LandTrendr are lifecycle boundaries, not configuration-validity checks; leave them
    unchanged in this slice. The new mounted map-area file, Band Math's layer and section marks, and both shared
    visualization-selector files pass independently: 64 tests in 5 files with two workers. Changed-file ESLint and
    `git diff --check` pass. Evidence: `/tmp/sepal-map-area-menu-review-tests.log` and
    `/tmp/sepal-map-area-menu-review-lint.log`.
  - **Browser acceptance (2026-10-28):** after the brief running-app menu/overlay/output checklist and clarification
    of the shared image-withholding behavior, the user confirmed "All works well". Browser acceptance is complete;
    this correction is committed separately from the setup/gate change.

**F8. Fix the concrete chart-layout and Retrieve-message regressions.**

- Reproduce starting a chart, changing recipe tabs before it finishes, allowing data to arrive while hidden, and
  returning. Cover Time Series and CCDC and shared graph users where the reproduction applies. Inspect actual panel
  and graph dimensions while hidden and on reactivation. Resize/re-layout only when visible dimensions are valid;
  do not fix this by refetching identical Earth Engine data or discarding every inactive chart. Preserve normal
  tab switches, cancellation and multiple recipe maps. A real-browser check is needed for actual layout; a DOM-only
  mounted test cannot by itself establish the rendered dimensions.
- Reproduce the Time Series Retrieve warning in a fully working configuration, with no Classification and with a
  working Classification, before/after selecting native and classified indicators. Trace which render/gate path emits
  the message and whether its missing-band list is actually non-empty. Show an unavailable-selection warning only for
  a real unavailable selected band, naming it. An empty selection uses the existing selection rule, not a fabricated
  missing-band message. A valid settled selection shows no error and submits successfully.
- Keep these fixes independent of F9: hiding the warning by disabling the entire recipe would not correct its
  appearance on valid configurations. Record the actual root causes and regression witnesses before marking complete.

**F9. Assess and consolidate selected-Classification validity for Time Series and CCDC.**

- **User's proposed contract:** selecting a Classification makes it part of the configured analysis. If it cannot
  supply a usable classifier, Time Series and CCDC are invalid for their chart/retrieval operations even when the
  requested measures and CCDC breakpoints are native. Explain the problem in SRC beside Classification, mark SRC,
  disable actions, close an open chart and cancel obsolete work. Repair releases them. Keep supported classified
  choices selected/offered through a training failure so the analysis resumes as configured after repair; do not
  silently remove the Classification, change the chosen bands or add per-band error highlighting instead.
- This deliberately revisits the former rule that native requests bypass training readiness. Native output may still
  be computationally possible, but under this policy the user must repair or explicitly deselect the configured
  Classification to proceed. Record that distinction rather than presenting the change as an execution dependency
  discovered by tracing code. Readiness may acquire training-input evidence for a native request; native execution
  must still not actually sample/train merely to enforce a configuration policy.
- Assess a static shared `CLASSIFIER` need for selected Classifications on the affected base operations, preserving
  missing-selection and decision-tree applicability. Use the existing Classification requirements, not its full
  rendered `IMAGE_OUTPUT` and not a panel-specific "SRC is red" validator. Apply the same policy to server and GUI;
  an open Retrieve panel still checks current state on submission. Do not implicitly extend this policy to every
  recipe family, map product or previously unguarded route without naming the effect.
- **Required simplification:** inventory `CLASSIFIED_COLLECTION`, `requestStages`, the additional server settling,
  `BandOperationWatch`, requested-band holds and classified-band messages. Remove what becomes redundant when the
  base operations already require the selected classifier. Keep request-output capability checks, useful band/measure
  derivations, current-state offer/submission guards, save agreement, evidence handling and chart lifecycle. Shared
  rules keep one owner; replacing every old hold with a new parallel SRC hold is not the intended outcome.
- Explicitly review count images, native chunks/exports, classified/native breakpoints, request error precedence and
  downstream CCDC consumers. A training failure promoted into the base configured checks can now precede a requested
  capability refusal; do not claim the old capability-before-additional-training order is unchanged. Preserve the
  coded capability contract when the configured source is otherwise valid. Do not install a full image-output gate
  on pixel charts or remove the consumer-versus-reference AOI distinction.
- **Acceptance:** for both Time Series and CCDC, native and classified requests over a broken selected Classification
  are consistently held before product work; SRC and its editor identify the same problem; repair and explicit
  deselection recover; choices survive repair; controls with no Classification and a valid one work. Replace the old
  native-bypass assertions intentionally, record the behavioural cost, and verify the new shared declarations allow
  deletion of the extra training-only paths without losing capability errors or submission-race protection.
- **Status:** implemented as S3, with focused browser acceptance recorded through 2026-10-25. No outstanding S3 browser check; see its record.

**F10. PyEO feedback must lead to a useful repair.**

- Reproduce Optical-to-Radar Classification input changes with the index gate off and on, and record the actual SRC
  and OPT findings separately. `UNSUPPLIED_CLASSIFIER_INPUTS` and `UNAVAILABLE_GATE_INDEX` are different rules; the
  latter can concern baseline or monitoring imagery. The user report alone does not establish which OPT code fired.
- A Classification whose required features optical monitoring cannot provide invalidates PyEO regardless of index
  gate settings. Explain and repair that prerequisite at SRC/Classification; do not offer a second red index error
  inside OPT or imply switching the gate off fixes the source. The 2026-10-23 browser report confirms S2 fixed the
  toolbar attribution but left the panel-level cascade (`Options.explainGateIndex`). Address both presentations using
  the same shared compatibility state, not another local test for radar versus optical imagery or simply "SRC is red".
- Distinguish a *compatible* classifier whose imagery cannot provide the chosen gate index. That is genuinely a gate
  configuration problem: another supported index or turning the gate off can repair it. If no supported gate index
  exists but classification itself is usable, explain gate availability in OPT and allow the meaningful gate-off
  repair; do not label the selected Classification generally incompatible merely because this optional gate cannot
  run. Reassess S2's blanket rule moving every no-baseline-index finding into SRC against this distinction.
- **Agreed form behaviour (2026-10-23):** while source compatibility is invalid/pending, retain the chosen gate,
  index and threshold, disable only the dependent gate group, and show neutral SRC-repair/checking guidance rather
  than a field error; independent alert controls stay editable. When the source becomes compatible, restore local
  gate interaction and any real gate finding. Do not clear selections or switch off the gate as a side effect of
  opening OPT or refreshing evidence. A temporarily unknown input is not proof that no index is available.
- Use the existing findings and presentation bindings; remove or consolidate the independent OPT validation that
  creates contradictory feedback rather than layering another validator over it. **Acceptance:** incompatible radar
  features with optical monitoring are held with the gate both off and on, with one source explanation and no OPT
  cascade; opening OPT preserves its choices; repair restores the group; a compatible source with an unsupported
  index has a meaningful OPT repair; pending/unavailable is not a field error; a gate off acquires no gate requirement.
  **Status:** message/terminology and shared single-input corrections are implemented; the user confirmed the
  two-input selection refusal. The separate Stack index-derivation correction now has shared, execution and GUI
  coverage of the recipe-input chain and passed independent review on 2026-10-24. The user confirmed its actual
  preview and Stack remove/restore browser check passed that day; see S2's "Require drop over a Stack input" entry.

**Later usability/performance features from the 2026-10-23 feedback (not prerequisites for F8-F10).**

- **Stack Band names layout:** four short band names do not appear in the expected two-by-two layout; the user reports
  unexpected wrapping on the first line. Code uses a wrapping horizontal `Layout`, with ordinary form-input sizing
  and margins, inside a panel capped at 29rem; short text does not itself determine field width. Prefer a local two-column
  grid for these fields, falling back to one column in a narrow viewport, over changes to shared `Layout` or global
  input widths. Confirm the rendered cause and check 1/2/3/4/many fields, long names, errors and scrolling. Recorded
  as an independent small UI fix, not reproduced in a browser or implemented with S2. **Implemented and browser-accepted (2026-10-27);** see the
  optional-improvements table.
- **CCDC Sources height:** the user reports an excessively tall panel after choosing Radar and asks about stable
  sizing versus content-based sizing. `ccdc/panels/sources/sources.module.css` explicitly sets `height: 46rem`, unlike
  Time Series Sources, which only caps width. Blame dates the 46rem rule to `b166296a1` (2022-03-17); it is not caused
  by S1's Panel visibility change or a new resize-stabilization mechanism. The old rule before that commit fixed a
  content height at 40rem, so history does not establish that every older CCDC panel was content-sized.
  Further code tracing confirms dynamic content: Classification loading replaces native-only breakpoint choices with
  regression/probability options, one probability per class, so both their count and label wrapping can change. In
  simple mode a Classification field can also appear for an error. Therefore content-based sizing alone (the initial
  recommendation) would not fully address background-loading jumps.
  **Agreed decision (2026-10-23): family/view heights.** Give Optical/Radar/Planet suitably sized, stable panel heights,
  also accounting for More/Less. Allow resizing on those deliberate view changes, while late Classification options and explanations
  use the existing scrollable body without changing the shell height. Keep header/footer stable, the shared viewport
  cap, and readable content at small sizes. Choose heights with actual browser fixtures; do not add per-class-count
  sizing, fit-then-freeze measurement state or another shared Panel mechanism. Content-based sizing with a reserved
  band area was considered but not selected. This decision is not implemented yet. Check Optical/Radar/Planet,
  More/Less, short/long legends, slow Classification loading, validation messages and
  small-viewport scrolling before choosing final dimensions. **Implemented and browser-accepted (2026-10-27);** see the optional-improvements
  table.
- **Keyboard band addition:** in a Classification input image's Add bands popup, pressing Enter should add the
  highlighted band and move the keyboard highlight to the next available band in the displayed order. The next Enter
  adds that band; it must not add the next one immediately or jump back to the "All bands" entry after each addition.
  Code tracing: `inputImageryWithDerived/imageForm.jsx` uses a `Combo` with `stayOpenOnSelect` and removes added options;
  `ListContent.componentDidUpdate` currently resets highlighting on options/selection changes. Fix the relevant shared
  picker behaviour narrowly; do not make every single-select list advance or treat arbitrary evidence/filter refreshes
  as a band-add action. Keep filtering, mouse selection and arrow navigation, skip nonselectable rows, and define a
  safe end-of-list state that cannot accidentally activate "All bands". Cover repeated Enter over the real band-add
  flow, preserved filter text, the last available band and an unaffected ordinary selector. No persisted recipe-format
  change is needed. This is recorded, not implemented in S2. **Implemented (2026-10-27);** see the optional-improvements
  table.
  **Independent review (2026-10-27):** no remaining finding for the audited callers. The shared choice/removal path
  preserves identifiers and ordinary-selector behavior; the six current stay-open callers remove their choices
  through their form updates. A focused independent run of Combo, List, windowed List, both shared input-imagery
  paths, Classification and Band Math passed 469 tests in 37 files with two workers; changed-file ESLint and
  `git diff --check` pass. Evidence: `/tmp/sepal-keyboard-picker-review-tests.log` and
  `/tmp/sepal-keyboard-picker-review-lint.log`. Choice tracking is consumed by the next parent options update;
  future delayed or choice-retaining callers are not covered by the current synchronous-removal contract.
  **Browser-accepted (2026-10-28):** the user reported "Looks good" after the brief running-app keyboard checklist
  and authorised committing. No additional recipe regression checklist is requested.
- CCDC Slice chart labels should use human-readable band names when available, including recipe references. Keep raw
  names for request identity and a fallback for asset measures without labels; test that labels do not alter requests.
  **Implemented (2026-10-27);** see the optional-improvements table.
  **Independent review correction required (2026-10-27):** `bandLabels[name] || name` also reads inherited object
  properties. In a temporary copy of the mounted asset case, replacing `probability_1` with `constructor` produces
  a blank choice instead of the raw name. Use an own-property lookup for label fallback and cover the custom band
  in the existing mounted regression. The submitted 234 tests, lint and whitespace checks pass independently;
  this additional case fails. Evidence: `/tmp/sepal-slice-label-prototype-review.log`. The probe was removed and
  production files were not changed during review. This is an automated correction, not another manual test request.
  **Corrected (2026-10-27):** a choice takes its label only where the labels hold one of its own, otherwise its raw
  name. The mounted asset regression now runs for `probability_1` and `constructor`, each offered, chosen, shown,
  requested and plotted by its raw name with no recipe read; the `constructor` case failed with a blank choice before
  the correction. All 37 tests in `sourceRequirement.test.jsx`, lint and `git diff --check` pass.
  **Browser-accepted (2026-10-27):** the user confirmed Classification band labels appear in the chart and accepted
  this bounded consistency improvement. The broader review below remains deferred.
- Investigate AOI-layer redraws on unrelated recipe edits. Base updates on effective geometry/source changes; preserve
  real geometry changes and pending-read cancellation. Measure which updates trigger work before adding caching.
- Mark the charted pixel on the corresponding map. Follow the actual recipe/pixel, update when it changes, and avoid
  stale markers on another tab or after chart closure. Define the marker interaction separately from chart validity.
- Upstream recipe-update notification over WebSockets remains a separate future feature. The reported stale-copy
  tests passed; it is not a prerequisite for this correction round and does not replace existing revision currency.

#### Future: consistent band presentation across recipes

**Deferred by the user (2026-10-27), for a substantially later round.** This is a coordinated review and design task,
not another small fix or a requirement for the current release. The current CCDC Slice chart-label change remains
bounded; no wider audit, implementation or manual campaign is requested now.

**Review all affected places first.** Inventory where bands are displayed, chosen, renamed or referenced across
recipes and shared controls. Include Classification/Regression input imagery; Remapping and Masking; Stack source
captions and output-name fields; Band Math inputs, pass-through bands, expressions and output names; Sources,
charts and legends, layer/visualization controls, and Retrieve. Record current label sources, fallbacks, shared
builders and exceptions. Native and classified bands, derived features, custom/renamed bands, recipe references
and assets must be considered together. The review covers all recipes; it must establish which actually need changes.

**Agreed presentation direction:**

- When viewing or choosing a band, show its reliable display label, falling back to its raw name. Native labels may
  remain familiar short names such as NDVI; labels need not expand every name into a long description.
- When editing or referencing the identifier, show the actual name. This includes expressions and editable output-name
  fields, not just Band Math expressions. A Stack source caption can show its display label while the output-name
  input contains the actual output name. Show the raw source name alongside its label where understanding a mapping
  or constructing an expression requires it.
- Preserve raw identifiers in saved selections, option values/keys, requests, expressions and exported data. Duplicate
  labels must remain distinct and be disambiguated when necessary. Relabelling must not change a selection or computation.

**Make the shared path do the right thing by default.** Review the existing band-description, presentation and picker
APIs before choosing the implementation. Aim for one reusable way to obtain and carry presentation by stable band
identity, with consistent label/raw-name fallback in shared controls and an explicit mode for identifier editing.
Recipe code should provide domain metadata; each caller should not have to reconstruct labels, remember a fallback
or special-case producer types. Establish ownership and propagation through transformations in the review, including
which labels remain meaningful after a rename. Prefer extending existing contracts over parallel label registries,
copied producer snapshots or per-panel lookup code. Label acquisition must respect reference access boundaries;
an independent exported asset must not require access to its producer merely to display a band choice.

**Acceptance and delivery:** label absence or pending/unavailable label metadata must never remove a valid band,
hold operations or add a readiness requirement. Cover raw-name fallback (including custom names), duplicate labels,
renames and current class labels, localization, filtering/keyboard behavior and accessibility; review casing/styles
that obscure the difference between names and labels. Verify unchanged identities and exports. Plan coherent slices
after the inventory: shared ownership/API and defaults first, then affected consumer groups, with shared regressions
and representative recipe checks rather than a separate presentation implementation or exhaustive manual campaign
for every recipe. No persisted recipe-format change is assumed by this roadmap entry.

**Verification and boundaries:** use focused regressions for each changed contract and combine browser rechecks over
the existing fixtures. Update old manual expectations when F4/F6 change the behaviour they describe; do not silently
relabel the earlier results as evidence of the new contract. Continue recording the user's remaining browser results.
The initial request-dependent readiness packet below is historical. S1-S6 implement the required corrections;
S3 replaced its request-dependent training stages, and S4 completed the named-feature sampling contract. Earlier
verification remains evidence of the contract tested then, not of every later tree. Broader preview gating,
propagated request contexts, executed-edge closure work and the independent UI improvements remain deferred.
The current release checkpoint owns the remaining verification gates.

#### Current delivery plan (updated 2026-10-23)

**Historical initial packet.** The table below records the 2026-10-21 classifier/readiness rollout. Its stage names
and native-band policy describe that checkpoint; S3 and S4 superseded parts of them. The F1-F10 and S1-S6 tables
above show subsequent completion, and the [current release checkpoint](#current-release-checkpoint) owns the remaining
gates. These histories are reference material, not additional slices to implement. A shared backend helper accepting
a Classification is not, by itself, a reason to expand a recipe's validation or GUI.

| Order | Remaining work | Status and next step | Estimated implementation slices |
| --- | --- | --- | --- |
| 1 | Phenology's configured classified band needs the Classification's training readiness. | Complete (2026-10-21): the `CLASSIFIER` operation and a conditional need, reusing the existing training rules without describing the Classification's output; see "Phenology's configured classified band". | 0 |
| 2 | CCDC's classified breakpoint bands need the same training readiness. | Complete (2026-10-21): `classifiedOutputNeed('breakpointBands')` for `IMAGE_OUTPUT` and `PIXEL_SEGMENTS`, native breakpoint controls unchanged; see "CCDC's breakpoint bands". | 0 |
| 3 | Training readiness for classified bands requested by Time Series charts/downloads and CCDC charts/exports. | Complete (2026-10-21): Time Series pixel observations ("Time Series' classified chart band"); CCDC's chart, with the stage generalised as `CLASSIFIED_COLLECTION` and the server sequence and band hold shared ("CCDC's requested chart bands"); Time Series Retrieve ("Time Series Retrieve's classified indicators"); CCDC export bands, to assets ("CCDC's requested export bands") and to Drive and SEPAL ("CCDC's Drive and SEPAL image exports"); CCDC Retrieve's preflight ("CCDC Retrieve's classified measures"). Remaining, deferred: direct previews (which could use the same root stage) and wrappers asking a CCDC source for classified measures (which need a propagated context). | 0 |
| 4 | Change Alerts' observation request needs an explicit server-side operation boundary. | Complete (2026-10-21): the chart sends the applied recipe; the job derives the observed collection (`observedCollection`) and holds it to Time Series' `PIXEL_OBSERVATIONS`; untyped requests are refused. See "Pixel observations". | 0 |

**Initial packet:** no implementation slice remains in its original rollout. Its browser feedback was addressed by
the later S1-S6 corrections and supporting shared-read fix. Their remaining release verification is distinct from
the initial packet's completion; optional follow-ups are not extra required slices.

**Finish this round when:** final integrated verification is clean after its findings are resolved, and the focused
CCDC asset compatibility check passes. The S3 selected-Classification policy is implemented, including native
Time Series/CCDC operations; the former native training bypass is not an outstanding policy choice. Broader coverage
listed under "Deferred beyond this round" is not required to finish.

**Verification checkpoint before push:**

- **Current status (2026-10-27).** S5 (`6fc9e5874`), S6 (`eaba8f54f`) and the shared-read correction (`12129ad9b`)
  are committed and browser-accepted. The final-verification failures and follow-up defects are corrected in
  `d075ce7ec`, with 4780 full GUI tests and the recorded shared/GEE/Task/build/static groups green. Origin is
  integrated through `8c0976ff9`, with 114 focused tests, lint and build passing after the app-picker merge.
  Existing-asset compatibility and the fresh radar export's PRC/preview/chart check are now accepted. Both agreed
  release gates pass; commit the verification notes and push. The bullets below retain the earlier scope/history.
- **Asset gate added and completed (2026-10-27).** Recipe-reference checks were supplemented with existing radar
  and optical assets, plus a completed fresh radar CCDC Segments export used in Change Alerts. See "Fresh export
  browser acceptance" and the current release checkpoint. No optional polish or additional implementation slice
  is required before push.
- **Release scope reaffirmed 2026-10-26.** S4 can be committed as a separate reviewed checkpoint before starting
  S5. S5 (Change Alerts settings ownership and unwanted overwrites) and S6 (validation/editor/chart agreement)
  remain required before pushing this robustness round. A passing final GUI run alone does not complete that work;
  neither item has been scoped out. S5's ownership audit is complete and the user agreed its four product choices
  on 2026-10-26; implement the revised proposal. Only the explicit "Use reference settings" button is deferred.
- Integrate origin safely and run the final full GUI campaign on the resulting tree after the remaining slices.
  Keep the focused S5/S6 browser rechecks bounded to the changed paths; do not repeat already accepted S1-S4 cases
  without a change that affects them. Committing S4 does not authorise a push.
- The Classification outline regression recorded under "Verification status" is corrected. The full GUI suite at
  `8d04b160b` passed all 316 files and 4547 tests with two workers (2026-10-21, 310 s, exit 0). The earlier
  `remapping/panelActivation.test.jsx` timeout did not recur; its historical result is preserved above.
- The full GUI run includes the later deselection, requested-band, legacy-indicator and submission-offer fixes.
  Live numerical normalisation checks passed at the earlier baseline recorded under "Verification status of the
  readiness and normalisation changes"; keep that evidence separate from the later GUI and route verification.
- The user reports the manual batch complete on 2026-10-23 and all issues reported; unmentioned tests pass under their
  explicit reporting convention. Results and subsequent decisions are recorded under "Browser feedback" and S2.
  Resolve the reported issues or make an explicit scope decision before treating the batch as clean. After fixes,
  run targeted browser rechecks of changed paths and nearby controls, rather than repeating the complete batch.
- Check actual preview tiles or chart responses, as appropriate, after repair. Enabled buttons alone are not an
  execution check. Complete this browser checkpoint before pushing the accumulated changes.

**Already completed:**

- shared classifier-input and configured output-capability checks;
- readiness for recipe image exports, Time Series downloads, direct observation/segment charts and referenced
  segment charts, with the documented route boundaries;
- chart cancellation, recovery, compatible upstream reloads and band choices from the resolved Classification;
- Time Series Retrieve's current capability options, pending/save holds and submission guard;
- reused training-data imagery, band sets, recursive absence and sampled-feature checks;
- PyEO's Classification image dependency and its training checks;
- consistent normalisation for prediction imagery and reused Classification samples, with live numerical witnesses;
- removal of incidental Change Alerts Classification dependencies, stale deselected capabilities, and the bounded
  operation/lifecycle/field-binding consolidations;
- the S3 selected-Classification policy for native and classified Time Series/CCDC operations and count products;
- S4 Consumer-owned named-feature sampling, ambiguity handling and collection-classifier input-count validation;
- S5 Change Alerts settings ownership, S6 monitoring-choice/chart agreement and their recorded targeted browser checks;
- subscriber-context restoration in shared recipe/GeoID reads and the service bridge.

**Deferred beyond this round:**

- further sampling-scale, raw value encoding and legend/value compatibility checks, and training-sample sufficiency
  after masking; the implemented mask/footprint controls do not prove adequacy for every classifier;
- extending or changing S3's selected-source policy for other recipe families;
- readiness for still-uncovered geometry/map-product/server routes, broader asset-layout work and the cost assessment
  before server-side Preview checks; CCDC count prerequisites are already implemented and LandTrendr remains outside
  the classifier rollout;
- conservative `REFERENCE` closure over-reading, executed-edge acquisition and runtime refresh-policy changes;
- server gating of direct map previews through the existing operation/product readiness declarations, without
  reintroducing the retired request-dependent training stage;
- destination compatibility at the Drive and SEPAL execution boundaries: they judge a CCDC's readiness for the bands
  requested, but neither refuse array bands nor establish that a raster file can hold them (see "CCDC's Drive and
  SEPAL image exports");
- a propagated request context for additional requested-output checks through wrappers (CCDC Slice base bands,
  Masking, Stack, Band Math); this is distinct from the shared training prerequisites S3 already propagates;
- shared form defaults, duplicated input editors, generic reference-feedback navigation beyond F1's targeted training
  item repair path, and tab-indicator experiments.

These are recorded boundaries or future decisions, not automatically scheduled fixes. Promote one into a new round
only for an agreed need or a confirmed failure. The detailed follow-ups below retain their context.

#### Completed follow-up packets (2026-10-21)

**Delivery approach: iterate between focused fixes and bounded consolidation (2026-10-21).** Do not wait for the
whole roadmap to be implemented before improving the structure, and do not start a broad redesign ahead of confirmed
behaviour. Finish a small set of fixes, use their regressions to consolidate repeated contracts or lifecycle code,
then implement the next set on that structure. The packet history below records coverage; it is not the remaining
execution order.

The sequence below records completed delivery, with remaining boundaries stated explicitly:

1. **Change Alerts inherited-settings correction: implemented.** Monitoring uses native imagery,
   incidental copied settings do not create dependencies, and the referenced producer retains its genuine dependencies.
2. **Operation wiring and chart lifecycle: consolidated.** Delivered as separate slices:
   - **Operation wiring (consolidated 2026-10-21).** Each direct pixel chart declares its operations once, as its
     panel's `CHART_OPERATIONS`: `PIXEL_OBSERVATIONS` for Time Series, plus `PIXEL_SEGMENTS` for CCDC. Its action
     and open chart gate on that list through `pixelOperationsAvailability`, and both watch it through
     `watchOperations`. `recipeForOperation` remains the one pixel/AOI projection, shared by readiness reads,
     acquisition and the runtime's asset interest. Referenced images keep their own AOIs. CCDC Slice and Change
     Alerts adopted the wiring in the next packet; LandTrendr remains unchanged.
   - **Chart lifecycle (consolidated 2026-10-21).** One pure decision, `pixelChartUpdate`
     (`recipe/pixelChartUpdate.js`), says what an open Time Series or CCDC chart does on each update: close, let go,
     replace the band, or read a band. Each panel applies the answer through its own `close`, `clearData` and
     `loadData`. The precedence is explicit: a withdrawing gate closes the chart before its band is reconciled, so the
     chosen band is kept (CCDC used to replace it first, and stayed open when no band remained). A band no longer
     offered is replaced before anything is read. A changed computation, pixel or band reads once the gate allows. A
     gate appearing lets go, and its clearing reads again; whether to resume is derived from the previous gate, which
     replaces the panels' `held` flags. Time Series now also decides on mount, as CCDC did.
     Remaining duplication, deliberately per panel: request construction (CCDC's paired segment and observation
     streams), `clearData` over each chart's own state, `close`, the five-line application of the decision, mounting and
     unmounting, band settings and rendering.
   - Prefer extracting the existing shared behaviour to introducing another resolver, cache, subscription system or
     general-purpose framework. Success means the next operation needs fewer independently coordinated changes,
     not merely fewer lines.
3. **Align referenced segment-chart GUI availability with backend readiness** for CCDC Slice and Change Alerts,
   using the consolidated operation wiring; retain their segment-structure checks. **Implemented (2026-10-21).**
   - **Declaration.** Both consumers declare `PIXEL_SEGMENTS` with `{PRIMARY_IMAGE: IMAGE_OUTPUT}`. Change Alerts
     also has `SOURCE_IMAGERY: REFERENCE`, which matters only for Planet assets, and has no configuration
     requirement for the operation. In readiness-only mode, the shared resolver judges a selected recipe by its own
     `IMAGE_OUTPUT` requirements and by those of every image it builds, without describing any of them. This is
     the same judgement `/ccdc/loadSegments` makes of a `RECIPE_REF` through `requireExecutable$`. An asset
     reference asks for nothing.
   - **Guarantee.** For an applied recipe reference, the chart action and the open chart are both held by
     `pixelOperationsAvailability` over the consumer's `CHART_OPERATIONS` (`[PIXEL_SEGMENTS]`), which the toolbar
     passes to the action and the panel watches through `watchOperations`. This sits beside the
     `ccdcSegments.chartable` source requirement, which is unchanged.
     - A finding of the selected recipe, or of anything it builds (such as a Masking's missing mask), disables the
       action. It also closes an open chart before its band is reconciled, cancelling its request.
     - Pending or unavailable readiness holds the request. Losing readiness lets go of an in-flight request, and
       recovery requests once. A draft dependency waits for its save, as for direct charts.
     - The consumer's own configuration never gates the chart; for example, a classified monitored band holds back
       only Retrieve.
     - The referenced recipe keeps its own AOI. Only the consumer is projected, and neither consumer has an AOI.
     - An asset reference still follows only its segment-structure checks.
   - **Limitations.**
     - The backend still judges the reference record directly, not the consumer's declaration. The two agree by
       construction, and shared tests pin the GUI side (`referencedSegments.test.js`).
     - Reloading on compatible upstream changes followed in item 4.
     - Losing readiness also re-reads the Change Alerts observations, which share the chart's cancellation.
4. **Reload referenced segment charts on compatible upstream changes.** **Implemented (2026-10-21).**
   - **Comparison.** Each panel's change comparison gains one entry: the `PIXEL_SEGMENTS` computation of the
     consumer, less its own first entry (`sourceBuild`, `referenceBuild`). That entry is the `recipeContent` of every
     record the reference's closure holds, its AOI included. The consumer's model, selected band, pixels and
     description stay compared as before.
   - **Guarantee.** A change to what the applied reference executes reloads an open chart through the existing
     change path, even when it leaves the band description and asset identities unchanged (such as a CCDC
     segmentation parameter). That path cancels the obsolete request, so its late answer draws nothing, and makes
     one request when no gate holds. Change Alerts re-requests its observations with the segments, as on any change.
     - An edit whose save is pending or unsaved holds the chart through the draft gate; it requests once storage
       agrees.
     - Titles, layout, `ui`, unrelated recipes, and a draft selection in SRC/REF that is then cancelled reload nothing.
     - An asset reference adds no records, so its freshness (`pixels`) is unchanged.
     - A source re-check alone still keeps drawn segments.
   - **Limitations.**
     - A build change clears drawn segments at once, as a pixel or model change does. It does not wait for a
       re-check that happens at the same time. For a CCDC that re-check is synchronous; for an asset-backed
       source the same edit already changes `pixels`.
     - A refreshed record whose content is unchanged does not reload the chart. Asset contents are followed only
       through `pixels`, as before.

5. **Classified-output choices in charts and Retrieve: implemented (2026-10-21).** The resolved-record view fixed
   the stale-option defects without a band-aware request contract. Request-dependent readiness is in the current
   delivery plan (Time Series' chart band complete); the native-band policy decision stays separate.
   - **Gap fixed.** A Time Series' or CCDC's chart offered bands from the Classification record when the session
     held it, and otherwise from the copy Sources took (`ui.classification`). The source runtime read the stored
     record for readiness but kept it private, and readiness judges no band. So a stale copy could offer
     `regression` of a Classification storage holds as an SVM, and the chart requested it; execution refused it
     (`UNSUPPORTED_CLASSIFIED_OUTPUT`).
   - **Read boundary.** `readOperationReadiness` answers `recordOf(id)`, scoped to that operation read. It
     returns the session graph's record where the session holds it, otherwise the record in the `basis` of the
     `COMPLETE` answer `heldFor` returns, otherwise null. An unavailable answer, or one `heldFor` no longer returns,
     supplies nothing.
     - `pixelOperationsAvailability` passes `recordOf` on.
     - `selectedClassificationOfState(state, recipe, recordOf)` gives both charts a legend and classifier: the
       session's, then the resolved one, then the copy.
     - Components never read `basis`. Nothing is installed into the session, loaded, cached or watched for it.
   - **Guarantee.** While the runtime holds a current answer for the chart's operations, the band options follow
     the stored Classification. The existing band reconciliation (`pixelChartUpdate`) replaces a band it does not
     provide before any request, so that output is never requested and stays unoffered while that Classification
     is current.
     - A record the session holds wins, so its edits are seen at once.
     - A newer listed revision supersedes the answer. The runtime reads the record again and the options follow
       what it now holds.
     - Retention is the runtime's own (`outputRegistry.js`). An answer reopened within the grace period after
       its question is released still resolves, and one past its deadline does not.
   - **Limitations.**
     - While the first read is pending, and during a re-read after supersession, the options are the copy's.
       Requests are held meanwhile, and the band is reconciled before the first request.
     - Unchanged: execution's refusal (the backstop), the native-band classifier-input policy, and bare `{model}`
       observation requests.
   - **Time Series Retrieve (implemented 2026-10-21).**
     - **Source of the record.** Retrieve offers its indicators from the same `selectedClassificationOfState`. Its
       `recordOf` comes from the recipe's `IMAGE_OUTPUT` readiness (`readOperationReadiness`), the readiness of what
       it downloads, over its configured AOI, and Retrieve watches that question through `watchOperations` while
       open. That readiness reads records only; nothing of the Classification is built, trained or observed.
     - **Not checked against the count image.** The indicator is still a measure of the collection.
     - **Shared-panel contract.** `MosaicRetrievePanel` gains `pendingRequestOptions` on its `requestOptions` path:
       the options not yet established. They are given while the Classification is known only by its copy, or by a
       session draft storage does not yet agree with (`draftDisagreementsOfState`), since the download runs from
       storage's copy.
       - Meanwhile the band control keeps what is selected, even a selection its options do not carry, and does
         not drop it.
       - A selection naming a pending option or an unoffered one is held, both at Apply and in the submission
         itself, however the form is submitted. A selection of the images' own bands is submitted as before.
       - No validation error is shown while pending.
       - Once settled, the existing control lets go of an unsupported selection. The required-band rule then holds
         Apply until the user chooses another; nothing is substituted.
     - **Unchanged:** destination, scale, tiling and submission.
   - **Deferred.** Band-aware operation readiness (`request: {bands}`, with request-distinct questions and keys) is
     kept for an operation that genuinely needs request parameters.

**Field-binding consolidation: completed (2026-10-21).** `recipe/fieldRequirement.js` replaced repeated path
matching, diagnostic selection, candidate construction and editor binding in the classifier-input and classified-output
declarations. Field controls keep their explicit error presentation. Broader shared-control defaults and duplicated
input-image editors remain under "Later: shared form validation consistency" below.

- **`fieldRequirement({id, section, code, path, message, editor})`** provides:
  - the requirement's `describe` and the section `summary`, from the first diagnostic;
  - `outputDiagnostics` for one code at an exact path, its item identified by the declaration id;
  - the editor binding: the panel, the message beside the input, and the recipe's own editor policy (`blocksApply`,
    `quietWhileEdited`) merged in;
  - the image output's operations.
- **`sourcesFieldRequirement({field, ...})`** adds the Sources path, input and candidate, the candidate being
  `model.sources` replaced by the panel's values.
- **`listed(items, andMore)`** is the shared truncation.
- **What each recipe keeps:** CCDC, Time Series and Phenology (`collectionClassifierRequirements.js`) and PyEO Alerts
  (`pyeoAlerts/sourcesRequirements.js`) declare only their ids, codes, paths, messages, `andMore` keys and policies
  (`wizardStepMark`, `blocksApply`, `quietWhileEdited`).
- **The one identity change:** collection declarations' item id is now their declaration id, as PyEO's already was.
  Nothing reads those items by id.
- **What remains:** field controls keep their explicit error wiring (`form.getErrorMessage(input)` in each Sources
  panel). That is presentation and is unchanged here. Other declaration families keep their own builders, since
  their item enumeration and editors differ: segment requirements, Band Math, input imagery and Change Alerts'
  reference.

Further delivery follows the current plan; geometry and named map-product coverage need a separate scope decision.
Preview validation remains conditional on measured cost. Refactoring slices preserve behaviour and use the relevant
existing regressions plus focused static checks; add tests for new contracts or uncovered behaviour, not for an
extraction alone. The focused verification and two-worker limit below still apply.

**Packet history and coverage:**

1. **PyEO compatibility: done.** Shared classifier-feature and conditional index-gate requirements decide
   readiness, and OPT's index choices, explanation and draft Apply validation follow the same execution-based rules. A
   direct asset baseline calculates the index from spectral bands; a recipe baseline supplies the index by name.
   Pending evidence is not judged against bands cached for a previous Classification. Explicitly saved indexes and
   unchanged reopening are preserved; a new configuration prefers NDVI, then a supported alternative. With no
   supported gate index, OPT explains why On is unavailable and stays usable; an incompatible saved gate stays visible
   with Off available as a repair. A radar classifier over Landsat is refused before execution.
2. **Classifier compatibility for the GUI-supported consumers: implemented.** The common rule is
   `lib/js/shared/src/recipe/classifierInputs.js`: the features the selected Classification's single input's band sets
   include, against what each image carries where `lib/js/ee/src/timeSeries/collection.js` classifies it - an optical
   scene's common bands, tasseled cap and indexes (`sceneBands`), a radar scene's `VV`, `VH` and `orbit` (the ratio is
   derived afterwards), a Planet image's renamed bands with the brightness and date bands
   `lib/js/ee/src/planet/collection.js` adds to every image (`PLANET_GENERATED_BANDS`; indexes are added afterwards; a
   band only eight-band Daily imagery carries is not refused) - plus the indexes the classifier computes itself. It reads the Classification record
   (`recordsOf`), not its image output. CCDC, Time Series and Phenology declare `collectionClassifierRequirement`
   (`source/collectionSources.js`): `UNSUPPLIED_CLASSIFIER_INPUTS` at the data sets where an optical data set or the
   radar collection would carry the features, otherwise at the classification; no selection requires nothing. PyEO
   reuses the rule, keeping its optical-only monitoring and its separate drop-index requirement. In the GUI
   (`recipe/collectionClassifierRequirements.js`) SRC is marked, the field says why, the classification shows outside
   More while it carries the problem, and a refused draft cannot be applied. Enforced by map previews and the Retrieve
   button (GUI readiness gates), by the server's recipe image exports - the generic image-to-asset export
   (`imageAssetExport.js`), CCDC's Segments asset export (`ccdcAssetSource$` in `ccdcAssetExport.js`, shared by its
   task and `assetSources.js`) and the Drive and SEPAL image exports (`imageDriveExport.js`,
   `imageWorkspaceExport.js`), the last three building the image only for a ready recipe - and by Time Series
   downloads (`export/timeSeries.js`: tile ids, a tile's date ranges and each chunk's export, each checked before its
   own work), and by Time Series' and CCDC's pixel observations (`/timeSeries/loadObservations`, `PIXEL_OBSERVATIONS`,
   judged at the clicked point before the pixel or collection is built), and by a CCDC's own segment chart
   (`/ccdc/loadSegments`, `PIXEL_SEGMENTS`) and a segment source's image (`IMAGE_OUTPUT`, readiness alone). Change
   Alerts' observations are now judged as the Time Series collection they observe (see "Pixel observations"). A
   Classification with several inputs is
   not judged, though `classifyImage` refuses it.
3. **Diagnostic-code ownership: done.** `lib/js/shared/src/recipe/output/diagnostic.js` keeps the output and
   resolution contract (`INCOMPLETE_IMAGE_OUTPUT` to `CONFLICTING_OBSERVATION`), `MISSING_ROLE`, and the band codes
   several rules share: `MISSING_INPUT_BAND` and `NO_OUTPUT_BANDS`. Each other code is declared beside the rule
   emitting it: `NO_TRAINING_DATA` in `trainingData.js`; `UNDERIVABLE_INPUT_INDEX` and `INSUFFICIENT_INPUT_BANDS` in
   `bandSets.js`; `INVALID_CALCULATION` in `bandMath/calculationReferences.js`; `UNMAPPED_INPUT` in `type/stack.js`;
   `MISSING_CONSTRAINT_INPUT` and `CONSTRAINT_BAND_NOT_INCLUDED` in `type/remapping.js`; `MISSING_LEGEND` in
   `type/classChange.js`; `NO_CHANGE_CLASSES` and `UNAVAILABLE_GATE_INDEX` in `type/pyeoAlerts.js`; and
   `UNSUPPLIED_CLASSIFIER_INPUTS` in `classifierInputs.js`. Strings and behaviour are unchanged; importers name the
   owning module, with no registry, barrel or re-export.
4. **Chart readiness: audited (2026-10-20); pixel observations implemented on the backend and in the GUI; pixel
   segments implemented on the backend.**

   Findings at audit time (the implemented slices below supersede the shipped-guard defects):
   - **The readiness pass is bound to describing `IMAGE_OUTPUT`.** In `resolveImageOutput.js` the root is described
     first; for each `IMAGE_OUTPUT` need, the target is described too. A CCDC root is therefore described from its
     catalogue (`ImageFactory(...).getBands$()`), which reads the Classification's bands and, for Planet Daily, runs an
     Earth Engine evaluation over the configured AOI. A pixel chart needs neither.
   - **The closure is transitive, and every edge counts.** It follows every direct source of every record, including
     edges an operation calls `REFERENCE`. Any unsound edge makes `dependencyValidity` refuse.
   - **The shipped Time Series chart guard over-requires.** A probe confirmed it: the chart uses the clicked point,
     yet it is refused for an AOI recipe that cannot be read, or an AOI that is incomplete or cyclic. A readable AOI
     recipe is read with its own dependencies.
   - **Change Alerts' observation request carries no recipe.** It sends a bare `{model}`: its own sources and
     options, with dates from the shared `monitoringDates`. Change Alerts declares no classifier requirement: it
     monitors native imagery bands and uses no Classification (`docs/recipes/change-alerts.md`).
   - **`/ccdc/loadSegments` builds one of three things:**
     - a direct CCDC is segmented at the point, with its AOI replaced;
     - an asset is read as stored;
     - a recipe reference is resolved through `withSegmentSource$` to its producer. For example, Masking stands for
       its CCDC, and an Asset Mosaic's segments asset is read for its date format. The referenced recipe's image is
       then built with its own AOI, so it is that recipe's `IMAGE_OUTPUT`.
   - **`PIXEL_SEGMENTS` was GUI-only.** It named a consumer's request over its source's segment structure
     (`ccdcSegments.chartable`), not a configuration requirement. It is now shared (`output/readiness.js`), and the
     GUI re-exports it unchanged.

   Implemented (first slice):
   - **A readiness-only read.** `resolveReadiness`, `readReadiness` and `settledReadiness$` read the same
     declarations, closure, attribution and evidence acquisition for one `operation`. They describe nothing of the
     root. What a requirement asks of its inputs is acquired and fails as any read's is. A source the operation builds
     the image of is judged by its own `IMAGE_OUTPUT` requirements without being described (since the segments
     slice). A root whose type declares nothing for the operation is refused (`UNDECLARED_OPERATION`).
   - **`PIXEL_OBSERVATIONS`.** Time Series and CCDC declare it, needing only that their Classification and source
     imagery resolve, and the classifier requirement lists it.
   - **A gate of its own.** `requireExecutable$` (`modules/gee/src/jobs/executionReadiness.js`) shares the closure,
     acquisition and errors with exports. Exports keep `resolveImageOutput$` and its description-plus-readiness
     contract and messages.
   - **The point stands in for the AOI.** `/timeSeries/loadObservations` judges a typed recipe at the clicked point,
     with its AOI replaced immutably. This fixes the over-requirement above, and CCDC's observations are now guarded.

   GUI (Time Series and CCDC charts):
   - **Availability.** Each chart declares the operations it runs at its pixel once, as its panel's `CHART_OPERATIONS`.
     Its action (`ChartPixelButton` with `operations`) and the open chart are both judged on them by
     `pixelOperationsAvailability` (`operationAvailability.js`), over `readOperationReadiness`
     (`recipe/operationReadiness.js`), which wraps `readReadiness`. Both watch them through `watchOperations`. They are
     never judged by the image output's answer.
   - **Gate outcomes:**
     - a finding, or dependencies known unsound, withdraws, naming the section that the type's declarations say it in
       (Sources, for the classifier inputs);
     - a record still to be read waits;
     - a read that failed is unavailable.
   - **The AOI is left out.** The recipe is judged without its AOI, since any clicked point stands in for it; no point
     is assumed.
   - **Acquisition.** Records the session does not hold are read by the source runtime under a `READINESS` key naming
     the operation. `assessReadiness$` completes the closure and then settles `settledReadiness$`, asking Earth
     Engine only for what a requirement observes, so the classifier check asks for nothing. The question is a watch
     naming its `operation`, so an image-output answer never answers it. The assets it keeps current are those of the
     recipe the operation runs, so the ignored AOI is not read.
   - **Lifecycle.**
     - A pixel being chosen is no longer chosen once the action is withdrawn.
     - An open chart requests nothing while waiting. Once readiness stops being known - a Classification no longer
       held, the chart's recipe unchanged - it lets go of what it was reading, ignoring a late answer, and reads again
       once the gate clears.
     - Once withdrawn, the chart closes, cancelling its requests, so a late answer draws nothing.
     - **Reloading.** An open chart reads again - observations, and CCDC's segments with them - whenever what it is
       computed from changes. That is the `recipeContent` of every record in the operation's graph (`computation`,
       `operationReadiness.js`), the same comparison a map layer draws by. An earlier read is cancelled.
     - **What does not reload it.** Titles, layout, `ui`, unrelated recipes and the AOI the observations ignore.
     - **Saved dependencies only.** A dependency the session edits is executed from storage's copy. The chart waits
       while that copy is not the session's (`draftDisagreementsOfState`, shared with Retrieve), and reads once it is.
     - **Band options.** The legend and classifier the band options offer come from the Classification record while
       the session holds it (`selectedClassification.js`), and otherwise from the copy taken when it was selected.
     - **CCDC's segments.** CCDC's chart is also held to `PIXEL_SEGMENTS`, judged at the clicked point as its
       observations are (the AOI projection, and the runtime's asset interest, cover both). A breakpoint band its
       Classification stops providing closes an open chart, cancelling its requests, and withdraws the action until
       repaired. Both operations wait on the same records, so no state holds the segments alone.
   - **Unchanged:** CCDC Slice, Change Alerts and LandTrendr charts, `/ccdc/loadSegments`, Retrieve, previews and
     section marks.
   - **Limitation.** The runtime's `READINESS` work does not refresh records the listing has moved past (the image
     output's `REFRESH`); the backend check stays authoritative.

   Implemented (segments, backend):
   - **Direct CCDC.** CCDC declares `PIXEL_SEGMENTS`, needing only that its Classification and source imagery
     resolve, and the classifier requirement lists it. The request is judged and segmented as the submitted record
     with its AOI replaced by the clicked point, immutably; the old in-place `_.merge` is gone.
   - **Recipe reference.** The selected record is read (`loadRecipe$`, shared with the operation's reads) and held to
     its `IMAGE_OUTPUT` readiness through `requireExecutable$`, before `withSegmentSource$`.
   - **Readiness alone describes nothing it builds.** `readinessOf` describes built sources only for the image
     output read (`describesBuilt`); `resolveImageOutput` and exports are unchanged.
   - **Asset.** Unchanged.
   - **The pixel** is built only once segments are available.

   GUI segment coverage (implemented):

   - CCDC's own chart action and open chart are held by both `PIXEL_OBSERVATIONS` and
     `PIXEL_SEGMENTS` (`pixelOperationsAvailability`, the panel's `CHART_OPERATIONS`), each judged at the clicked
     point and watched through the runtime. CCDC Slice's and Change Alerts' charts are held by their
     `ccdcSegments.chartable` source requirement and by their own `PIXEL_SEGMENTS`. That judges a recipe reference
     as its `IMAGE_OUTPUT`, over its own AOI (completed follow-up packet 3).

   Remaining boundaries:

   - **Asset segments.** An asset's segment layout is checked only by the GUI's source requirement.
   - **Change Alerts' observation route is guarded (2026-10-21).** Its chart sends the applied recipe, and the job
     judges the collection it monitors (see "Pixel observations"). Requests naming no recipe type are refused.
   - **Limitation.** The transitive reads behind `REFERENCE` remain an acknowledged limitation.

5. **Classification output compatibility: implemented for the outputs a configuration chooses (2026-10-20).**
   The collection compatibility rule checks input
   features, not whether the selected Classification can provide the outputs an analysis needs. Validate the required
   outputs through one shared capability declaration, rather than a consumer-specific classifier blacklist:
   - per-class probabilities require `MULTIPROBABILITY`; confidence in the predicted class (`PROBABILITY`) is not a
     substitute;
   - regression requires regression output support;
   - judge the outputs actually required by the analysis, without rejecting a Classification everywhere because one
     consumer cannot use it. Account for classifier configuration, including SVM subtype, where support differs.
   Use the same declaration for offered outputs, GUI candidate feedback, operation readiness and execution. Read
   capabilities from the Classification record without constructing or observing its image. Establish each GUI-supported
   consumer's needs from execution before extending validation; Change Alerts' inherited-settings policy stays separate.
   **Execution: fixed (2026-10-20).** `timeSeries/collection.js` no longer requests regression and probabilities
   unconditionally; that request had been exposed by SVM `C_SVC` refusing `REGRESSION`.
   - It classifies each image only for the outputs a request names, among those the Classification declares
     (`classificationBands`, which reuses `supportRegression` and `supportProbability`).
   - It refuses one the Classification does not declare with `UNSUPPORTED_CLASSIFIED_OUTPUT`, before evaluation.
   - A request naming only native bands reads nothing of the Classification.

   **What each consumer requires, from execution:**
   - **Time Series** requires no classified output. Its chart and download offer regression and probabilities as
     optional choices (`ui`), which the collection builds or refuses per request.
   - **CCDC** fits its breakpoint bands (`model.sources.breakpointBands`) in every segmentation, so a classified one
     is required; measures an export or chart adds are optional choices.
   - **Phenology** reads one band (`model.sources.band`), so a classified one is required.
   - **PyEO** reads only the categorical `class`, which every classifier provides, so it has no output requirement.
     Its baseline still builds the Classification's default outputs (`getImage$()` without a selection).

   **Capabilities: shared, by configuration.** `supportRegression` and `supportProbability`
   (`type/classification.js`) take the classifier's configuration (`model.classifier`); a type alone stays accepted,
   with that type's defaults. They follow Earth Engine's table of output modes
   (https://developers.google.com/earth-engine/guides/classification, "Classifier output modes"):
   - REGRESSION: Random Forest, Gradient Tree Boost and CART. Minimum distance's REGRESSION is a distance, not offered.
   - MULTIPROBABILITY: those three, Naive Bayes, and SVM `C_SVC` and `NU_SVC`. SVM `ONE_CLASS` offers only
     CLASSIFICATION; an SVM without a type is Earth Engine's default `C_SVC`.
   - A supplied decision tree is not in the table and offers only `class`. PROBABILITY is not used.
   `classificationBands` derives from them, so Classification's declared outputs, its preset visualizations, the GUI
   band choices (`sources.js`, given `classifier`) and execution's per-request refusal all follow the configuration.

   **Validation.** `classifiedOutputRequirement` (`recipe/classifiedOutputs.js`) is declared by CCDC
   (`breakpointBands`, for `IMAGE_OUTPUT` and `PIXEL_SEGMENTS`) and Phenology (`band`, for `IMAGE_OUTPUT`):
   - a classified output the selected Classification's record does not declare is `UNSUPPORTED_CLASSIFIED_OUTPUT`, at
     that field, naming `unsupported`;
   - so is one chosen with no Classification selected;
   - a record not yet held finds nothing, and its waiting is the closure's;
   - in the GUI (`classifiedOutputRequirements`), SRC is marked, the field says why (`form.getErrorMessage` on CCDC's
     breakpoint bands and Phenology's band), and a draft choosing one cannot be applied;
   - a saved choice the Classification does not provide stays shown as made (`withChosenClassifiedOutputs`,
     `sources.js`). Otherwise the form would drop it on its next render, unseen and as an edit. It can be taken back
     there, and opening the panel leaves it unedited. A native band no longer offered is still dropped as before.

   **Copied metadata.** `ui.classification` and the Sources panels now copy `model.classifier` beside its type, and
   open charts read it from the held record.

   Remaining boundaries:

   - **Old copies.** `ui.classification` copies taken before this change carry the type alone, interpreted as that
     type's defaults. Charts and Time Series Retrieve now prefer the held or resolved record; copied metadata is a
     fallback while unresolved, with classified requests held. Clearing the applied selection offers no capabilities
     from an old copy. Other metadata readers retain their documented copy policy.
   - **Optional choices.** Charts, downloads and exports offer only supported outputs, but a requested unsupported one
     is refused by execution alone. Training readiness for requested bands is in the current delivery plan: Time
     Series and CCDC chart bands, Time Series Retrieve indicators and CCDC export bands add
     `CLASSIFIED_COLLECTION`, and CCDC Retrieve holds the measures chosen (see "CCDC Retrieve's classified
     measures"). Map previews remain.
   - **PyEO's baseline** builds outputs it does not read.
   - **Uncertain types.** SVR types are not offered by the GUI. A supplied decision tree's output modes are not
     documented.
   - **Native-band readiness.** Readiness still judges the classifier inputs of a native-band request that no longer
     classifies anything. Making it band-sensitive would change the agreed policy, so it is a separate decision. A
     request-chosen operation, as for Time Series' chart band, could express it.

**Change Alerts inherited settings: implemented (2026-10-21).** Change Alerts monitors only bands its imagery observes
natively, and uses no Classification.

The audit found:
- **The incidental copy.** `referenceObservation.js` merged the producer's whole `sources`, so `classification` and
  `breakpointBands` were copied as well as the monitoring settings.
- **No reachable classified output.** No reachable configuration monitors one: Sources offers native bands, and
  `MONITORED_MEASURE` judges against native observed measures.
- **It still blocked.** The copied Classification was still a dependency, so one the user could not read - a shared
  segments asset's `recipe_sources` naming another user's - refused the export
  (`Recipe could not be read: <id>`) and held previews and Retrieve.

Implemented:
- **Dependencies.** CHANGE_ALERTS' `directSources` are its reference and, for Planet, its source assets;
  `executionNeeds` drop `CLASSIFICATION_SOURCE`. A referenced recipe's own dependencies still count through the
  reference's closure, so a referenced CCDC's unreadable Classification still refuses it. A segments asset needs none
  of its producer's.
- **Prefill.** It no longer proposes `classification` or `breakpointBands`. The other monitoring settings, and the
  rule that unchanged producer settings observed again leave user edits alone, are as before. Whether they changed is
  judged on the same monitoring-only projection, so a producer changing only its Classification or breakpoint bands
  leaves user edits alone. Saved copies are kept,
  inert; no migration or cleanup.
- **A Change Alerts-owned rule.** `CLASSIFIED_MONITORED_BAND` (`type/changeAlerts.js`, using `isClassifiedOutput`) is
  found at `['model', 'sources', 'band']` for a monitored band a Classification computes. Execution
  (`timeSeries/changeAlerts.js`) refuses it with the same code, and builds the monitoring collection without
  `classification`.
- **GUI.** The saved band stays shown as chosen (`withChosenClassifiedOutputs`). `MONITORED_MEASURE`'s refusal at the
  band says that Change Alerts cannot monitor a classified band (`process.source.segments.measureClassified`), and
  choosing a band of the imagery repairs it. No output declaration was added for the code: Change Alerts' editor drafts
  are judged without the runtime's answers (`sourceCandidate.js`), which such a declaration would require.

Observation requests (resolved 2026-10-21):
- **Observation requests.** The copied Classification is now set aside on the server (`observedCollection`), not
  trusted to the GUI. `/timeSeries/loadObservations` refuses a request naming no recipe type.

**LandTrendr is excluded** from
the classifier-validation rollout: its current Sources GUI does not offer a Classification, despite the shared
backend accepting that field. Do not add work solely for hypothetical or legacy configurations.

Use failing witnesses and nearby tests while editing, then one focused verification campaign and static checks,
with at most two workers. Do not broaden into repeated suite sweeps without a concrete unresolved concern.

The following detailed decisions and limitations are deferred beyond the current delivery round. They are not a
second execution queue:

- **Remapping unused selections: source-type policy.** The new check covers bands constraints read. Live sampling in
  `remappingSourceBands.mjs` shows an unused missing asset selection executes, as does one through Stack (requested
  names filter its mappings). An Asset recipe explicitly selects all requested names and fails for the same unused
  selection. Decide that compatibility policy before adding broader validation or changing execution. Do not revive
  the rejected editor-assessment framework merely to mark unused selections.
- **Reference-feedback navigation.** Both the directly selected recipe name and each originating recipe name should
  eventually be links, each with a small open icon as part of the link. Put those actions in persistent error details
  or a suitable interactive popover, not an ordinary tooltip. IDs and display names are already retained separately.
  Links, popovers and modal changes are deferred; do not infer additional routes through diamond graphs.
- **Recipe-tab readiness indicator experiment (2026-10-19).** Try a small standard indicator on open recipe tabs for
  confirmed execution problems, including upstream blockers, and evaluate how it feels with several recipes open
  before deciding to keep it. Reuse current readiness answers; tab decoration must not start extra acquisitions.
  Pending or temporarily unavailable evidence is not an invalid-recipe mark. Suppress error marks during initial
  setup, and distinguish normal unfinished work such as Classification awaiting collected training data from errors,
  preserving the existing presentation policy. Describe readiness as the result of implemented checks, not a complete
  validity or Earth Engine success guarantee. Keep this as a deferred UI experiment; no implementation is scheduled.
- **Refresh scope.** An explicit source-asset refresh restores all dependent questions even when the asset token is
  unchanged. Refreshing only a downstream output refreshes its question, not independently held upstream output
  questions. That existing refresh policy was observed during this packet and was not broadened.
- **Stack aliases and Band Math deleted outputs: policy decision, not reference repair.** The audit found Stack
  excludes removed inputs from output immediately and discards their unreachable mappings on the next input Apply;
  re-adding a source can replace `custom_red` with `red`, leaving downstream consumers of the alias blocked.
  Band Math deletes direct output selections and custom names when their input, band or calculation is removed,
  while dependent calculations survive. Restoring discarded configuration requires an explicit retention policy.
  Neither behaviour is covered by reconnecting preserved references, and no restoration policy is agreed yet.
- **Other constraint editors: no reconnection work identified.** Inspection found Index Change targets fixed
  comparison bands, Asset Mask targets the current image, and Asset Filter targets its properties. They do not
  reference removable input UUIDs. Missing-band/property compatibility is a separate question; no mounted audit
  was performed for these callers.

- **Source-editor consistency audit (2026-10-19): no confirmed defect; the date-format policy is aligned.** The
  shared input editors (`panels/inputImagery` for Stack and Remapping, its Band Math copy,
  `panels/inputImageryWithDerived` for Classification, Regression and Unsupervised Classification), Change Alerts REF,
  BAYTS REF and CCDC Slice Source open
  an unchanged source unedited, keep a saved band its source lost, marked, keep saved configuration through pending
  and failed reads, and keep separate Asset/Recipe drafts or start the other kind over as each documents. Their kind
  switches show no premature required error: cleared fields are either not shown or skipped for the kind now shown.
  - *Date representation of a newly chosen asset.* Decided: an asset chosen that declares one, `0` included, sets it;
    one declaring none keeps what is configured, which is no claim that it matches; with neither, it stays unset and
    Apply held. Change Alerts REF (`changeAlerts/panels/reference/assetSection.jsx`, `referenceRequirement.test.jsx`)
    now does as CCDC Slice's source already did (`ccdcSlice/panels/source/assetSection.test.jsx`).
  - *Section switching from the derived input imagery list.* Fixed: `panels/inputImageryWithDerived/inputImagery.jsx`
    now permits only its image editor (`{inputImage: 'allow'}`), as `panels/inputImagery` does. It no longer
    overrides the fallback with `{_: 'allow'}`. Over a clean list another section opens and closes it, and the wizard
    keeps other sections closed (`inputImageryPolicy.test.js`). The composed policy is `recipeFormPanelPolicy`.
  Open items:
  - *Duplication to fold into the form consistency work below:* Band Math's input editor copies
    `panels/inputImagery` with `name` for `band`; Class and Index Change each keep their own cleared-selection flags;
    `panels/inputImageryWithDerived/imageForm.jsx` relies on picker cancellation for late answers rather than the
    explicit selected-source check the other editors make (covered by `inputImageLifecycle.test.jsx`).

Remapping's source-identity recovery and shared constraint-reference validation are complete, including manual
verification of blocking and recovery through a second Remapping. Already-broken constraints with no retained
identity still need one explicit repair; this is an accepted limitation, not a request for historical reconstruction.

**Broader coverage, deferred beyond this round:**

- geometry operations and readiness for named map products;
- other GUI-only and Earth Engine-only rules, subject to a separate audit and scope decision;
- whether Preview and the LandTrendr chart route adopt the check, with Preview's cost measured first.

`TRAINING_DATA` and CCDC's pixel-observation operation are already implemented. Remaining classifier-training
coverage and Change Alerts' observation boundary are in the current delivery plan, not additional follow-ups here.

**Later: shared form validation consistency.** Defer the broader review and refactoring until after the current
validation/readiness work and nearer-term UI fixes. The immediate Masking correction can establish the intended
behaviour without migrating other forms. Review shared controls and panel workarounds to separate validity from error
visibility: new required fields remain neutral through first focus, show errors after leaving them, retain errors on
refocus and clear them promptly when corrected. Distinguish user edits from initialization and programmatic resets;
verify autofocus and treat interaction with a picker's options as staying within that field. Preserve immediate
explanations for broken saved configurations and keep invalid actions blocked independently of visible errors.
Simplify the shared defaults so callers inherit consistent behaviour, with explicit exceptions only where needed.
Inputs to that work: the per-editor cleared-selection flags (Class and Index Change), candidate feedback's
`quietWhileEdited` opt-in (`recipeFormPanel.jsx`), and the duplicated input editors listed above.

## Source description

Names remain open, but the contract needs these separations:

```js
{
    reference: {type: 'ASSET', id: 'projects/project/assets/image'},
    executionReference: {type: 'ASSET', id: 'projects/project/assets/image'},
    observedAt: 1780000000000,
    fingerprint: 'canonical-whole-source-fingerprint',
    output: {kind: 'IMAGE', bands: [/* ordered schema and export requirements */]},
    presentation: {
        productPresets: [],
        transformationTemplates: []
    },
    capabilities: {},
    evidence: [],
    status: 'READY'
}
```

Use one conservative fingerprint of the whole resolved description and recipe graph to invalidate that description
initially. A forgotten field must over-invalidate rather than leave stale pixels or schema silently valid. A
consumer with an explicitly named product derives its narrower operation-input fingerprint at that product boundary;
it does not use the whole-description fingerprint as proof that an expensive result changed. Fine-grained
data/schema/presentation revisions require measured evidence before introduction.

Stable diagnoses include a code and dependency path. At minimum distinguish pending, transiently unverifiable,
missing, forbidden, incomplete, cyclic and incompatible.

## Coherent execution bundles

Execution bundles are a later milestone, not a prerequisite for Masking dependency safety, Apply-mask
stabilization, constant Fill or direct asset Fill. Caller-authorized loading and recipe revisions returned
atomically with content already exist. Bundles additionally require coherent graph acquisition and a trusted
task-acceptance boundary.

The current recipe `update_time` is a plain second-resolution SQL `TIMESTAMP`. Two saves in one second are therefore
indistinguishable, so it must not be used as a coherent-build revision or cache key, and equal timestamps never
establish unchanged content. The Recipe service persists a server-owned monotonic `revision` atomically with
recipe content and enforces optimistic concurrency on save. That revision also provides ordering evidence for
future websocket events and cache invalidation. It is distinct from `typeVersion`, the recipe schema-migration
version.

Recipe list, load and save expose the committed revision, and the same revision always returns the same
execution-relevant content. Future batch or closure operations must preserve that contract. Coherent construction
uses the ordinary load, which returns content and revision from one committed row, plus the graph-wide snapshot
protocol. A save carries an expected revision and returns the committed one. `update_time` remains useful for
display and audit only.

Websocket revision events and semantic no-op saves are future work. An event must be published only after commit
and carry at least recipe ID and revision, allowing clients to ignore duplicate or out-of-order events before
fetching changed content. A no-op save should return the existing revision and publish no event.

Semantic no-op detection compares normalized content, which requires defined normalization — transient UI state
excluded, key order irrelevant, meaningful array order preserved, value types preserved, migration and default
semantics versioned. Raw gzip or JSON byte equality is not authoritative. Where no-op detection is phased in after
the initial revision implementation, spurious increments only over-invalidate: consumers re-resolve, and an
unchanged product fingerprint still preserves their results. The complete storage contract is owned by
[source-freshness.md](source-freshness.md).

A content digest is not required for this protocol. It may be added later for a concrete provenance, integrity,
cross-record deduplication or immutable-content requirement. If introduced, its bytes and canonicalization belong
to the trusted persistence or bundle boundary; browser freshness must not serialize large recipe models to
manufacture storage identity.

An execution bundle is a resolved recipe graph, not a cache entry:

```js
{
    bundleSchemaVersion: 1,
    rootRecipe: {/* submitted outer recipe without UI state */},
    recipesById: {/* transitive referenced recipes, deduplicated */},
    assetObservationsById: {/* authorization-scoped metadata evidence */},
    fingerprint: 'canonical-resolved-graph-fingerprint',
    verification: {
        state: 'VERIFIED',
        observedAt: 1780000000000
    }
}
```

Bundle construction happens server-side under the caller's authorization. Missing and forbidden targets are
reported without disclosing details the caller is not allowed to learn.

The trusted boundary discovers and binds source-adapter and temporal-composer commands from the authorized bundle,
or revalidates a server-built frozen command under the exact supported contract version. A browser-built plan is
preflight evidence only and is never accepted as task authority: a client must not be able to alter entries,
references, adapter parameters, planner-owned encoding or named operations after validation. Direct dependencies
come from the command skeleton consumed by both graph construction and execution.

Loading the graph sequentially is not itself atomic. The builder records each recipe revision, resolves the full
closure, then rechecks those revisions. If any changed during construction, it retries the complete build a
bounded number of times or reports a changing-source error. The accepted bundle contains complete recipe models,
not references that the task worker later reloads.

Bundle construction is the coherent form of the request-scoped snapshot cache that
[source-freshness.md](source-freshness.md) requires at every execution boundary: one snapshot and revision per
recipe ID per operation, so a single build can never mix two revisions of the same recipe. The snapshot cache is
useful before bundles exist and remains correct alongside them.

### Preview

Each Preview request builds a fresh ephemeral bundle and evaluates that bundle. It is coherent for that request
but is not pinned for later use. A subsequent source edit should update the preview; it should not mutate a preview
already in flight.

### Retrieve

Retrieve builds a new bundle when the task is accepted and stores it with the task payload. Task execution resolves
recipe references only from that bundle. The UI records which preview fingerprint was last shown and can indicate
when the submitted bundle differs; it must not imply that an old preview and a later export are identical.

SEPAL recipe authorization is checked when the bundle is constructed. A later recipe deletion or loss of SEPAL
access does not revoke an accepted task. Earth Engine assets are not pinned: their permissions and availability
remain live and may still fail or drift during execution.

### Bundle compatibility and limits

Execution accepts only `bundleSchemaVersion` values the worker explicitly supports. An unsupported schema fails with
a controlled resubmission error; it is never interpreted using the current schema and does not fall back to live
resolution. Supporting an older bundle schema requires an explicit parser. Adapter, composer and measurement
contract versions are validated separately and do not preserve known algorithm defects; corrected behavior is the
only supported behavior for those cases.

Depth, node count and serialized bytes are independent safeguards:

- depth bounds traversal and diagnostic paths;
- node count bounds graph complexity and repeated work;
- serialized bytes bound database, HTTP, worker-transfer, latency and memory cost, including a single unusually
  large recipe model.

Initial values are derived from the complete storage and transport path plus measured serialization, transfer
latency and peak worker memory. Declared database and HTTP maxima alone are not practical limits. Oversized bundles
fail during submission with a controlled graph-too-large diagnosis. External manifest storage is considered only
if valid measured graphs cannot fit a conservative task-payload limit.

## Earth Engine assets

Assets remain `ASSET` sources even when produced by SEPAL. A `recipe_id` property is provenance, not a dependency
edge.

Earth Engine does not report the pyramiding policy used to create an asset. Asset observation therefore obtains
ordered band names and array dimensionality from the current image's band-type metadata. Array-valued bands receive
the physical-schema `sample` requirement above; scalar bands do not acquire a policy from `recipe_type`, naming
conventions or visualization properties. An asset containing any still-unresolved required band remains unavailable
rather than returning a partial executable description.

Earth Engine image assets expose `system:version`, which is useful as a change token when normalized as an opaque
string. It is invalidation evidence, not a promise that later execution is pinned to those pixels; bundle
construction therefore still stores observations rather than claiming to pin the asset. `updateTime` remains
weaker display and fallback evidence. ImageCollection observations follow each consumer's explicit policy: first
member, homogeneous collection, union, intersection or another bounded rule. Until verified against the live API,
do not assume every membership change relevant to such a policy advances the collection's `system:version`.

For execution:

1. Observe and validate required asset metadata while constructing the graph.
2. Record the observations in the execution bundle and task audit data.
3. Observe them again after execution where practical.
4. If they changed, report drift and apply an explicit output policy; do not claim which version Earth Engine
   evaluated.

Possible policies for a drifted completed export are fail-and-delete, retain-but-mark-suspect, or require user
acceptance. The policy must account for GEE, Drive and SEPAL destinations and is an open product decision.

## Provenance evidence

Use three evidence tiers:

1. **Verified physical schema**: authoritative for bands, types and grids Earth Engine reports.
2. **Versioned SEPAL provenance**: interpretation evidence for verified bands.
3. **Legacy provenance and naming conventions**: contract-specific compatibility evidence only where an explicit
   adapter defines and validates that legacy format; never generic compatibility authority.

Record authority with the individual fact or evidence item. A resolved description can combine observed physical
schema, producer-declared semantics and unresolved fields, so one source-wide confidence enum would hide important
differences.

Provenance may interpret only a band verified to exist. This still does not make mutable properties authoritative:
incorrect date formats or categorical meanings can change calculations even when the named bands exist. Semantics
that cannot be verified physically require trustworthy declared or versioned evidence. Otherwise they remain
insufficient for semantic and relational requirements.

New exports should write a minimal provenance schema version, execution-bundle fingerprint, source-observation
summary and relevant adapter, composer, algorithm or capability contract versions. These versions describe
deliberate supported contracts; they are not a history of implementation defects. Do not generalize the current
practice of exporting the entire recipe model. Detailed manifests belong in task audit storage unless an explicit
sharing policy allows them on the output asset.

Mutable asset properties cannot establish trusted provenance by themselves. The eventual verification record lives
at a trusted boundary and binds at least:

- the Earth Engine asset ID;
- asset revision or replacement evidence;
- the accepted task or execution-bundle fingerprint;
- a digest of the observed exported physical schema;
- a digest of the bounded, canonically serialized presentation envelope;
- relevant capability, transformation, adapter, composer and algorithm contract versions.

Verification reads current asset evidence and requires every bound value to agree. An asset replacement or metadata
edit cannot retain authority merely because the ID is unchanged. `system:version` is useful revision evidence but
is not scientific provenance and does not replace schema and envelope verification. The exact trusted storage,
canonicalization, digest algorithm and post-export verification protocol remain implementation decisions.

A structured presentation envelope can be parsed without trusted provenance, but its transformation templates
remain presentation data and cannot establish or activate a capability. An unsupported declared envelope version is
invalid; it never silently acquires authority through the legacy parser.

CCDC Segments assets have an established pre-envelope format that must remain readable. The CCDC capability owner
may recognize that format from the observed segment-band structure and required CCDC metadata, including its date
representation. Once that structural asset contract is admitted, legacy `visualization_*` records with logical
`baseBands` are interpreted as `CCDC_SEGMENT_SLICE` templates. They configure a known transformation; they are not
the evidence that admitted the capability. No generic asset adapter infers CCDC semantics from visualization names.

Known defects are corrected before the affected contract is declared. Resolution does not branch on asset creation
date, invent a legacy algorithm version or reinterpret an old asset to work around a historical bug. Physical asset
observation can verify bands, dimensions and other reported structure, but cannot recover the formula or
preprocessing that produced existing pixels. Affected historical assets remain the user's data and may need to be
recreated when correctness matters.

The operational disposition is explicit:

- physical-schema-only operations may use verified bands, dimensions and types;
- semantic or relational operations without sufficient provenance are unsupported with
  `INSUFFICIENT_PROVENANCE`;
- known-bad provenance blocks the affected semantic operation;
- recreating the asset under the current corrected contract is the normal remediation.

These provenance restrictions apply to facts the operation actually requires. CCDC Slice can operate from the
validated structural CCDC asset contract and does not require proof of the original recipe or execution bundle.
Relational consumers such as Change Alerts may require stronger measurement and observation-protocol provenance;
acceptance by CCDC Slice does not automatically satisfy those requirements.

Do not introduce `USER_ASSERTED` or another generic provenance override until a separate design establishes its
trust boundary, audit record and user experience. An unverified assertion never becomes verified evidence merely
because a user supplied it.

Sampling Design's focused algorithm version and reproduction metadata are useful precedent, but its Earth
Engine-specific module is not the common source-contract owner.

## Legacy policy

Saved source snapshots and unversioned asset provenance may populate an initial display while current evidence is
loading. They never prove compatibility and are never silently rewritten.

- A successful refresh replaces runtime evidence, not the user's selections.
- A removed requirement remains visible and invalid.
- Known-bad state blocks Preview and Retrieve.
- Transient runtime failure remains `UNAVAILABLE`; it does not become compatibility evidence or satisfy a semantic
  requirement.
- Newly edited recipes migrate to the current model schema deliberately; opening a recipe does not rewrite it.

Tightening validation will expose recipes that only partly work today. Each activated recipe path must measure this
before strict enforcement expands to another family.

CCDC Slice migration must preserve existing working Earth Engine assets. Legacy assets do not carry an adapter ID,
so the CCDC capability owner provides a narrow structural recognizer rather than a generic metadata guess. It
validates the required segment bands, dimensionality, date representation and other inputs Slice actually consumes.
Compatible `visualization_*` and `baseBands` fields then supply transformation-template configuration.

The same admitted capability and templates pass through Masking when its explicit transformation effects preserve
the CCDC structure. This supports both a direct asset and a CCDC asset behind a Masking recipe without teaching
Masking about CCDC. A subset or value-changing transformation can reduce or drop them. New structured provenance
may strengthen later consumers, but it is not a prerequisite for CCDC Slice and does not replace the legacy reader.

## Implementation boundary

Extend the existing generic `IMAGE_OUTPUT`, producer-step and observation contracts one consumer at a time. Keep
an explicit coexistence boundary for unmigrated Retrieve paths. Adding a capability must not introduce another
resolver or type checks in Masking. Constant Fill needs no dependency; direct asset Fill uses the linked Earth
Engine identity. Recipe Fill must define its acquisition and execution requirements over caller-authorized loading,
without presenting browser preflight as trusted execution evidence.

The current segment consumer contract above does not yet provide coherent bundles or structural admission of all
legacy assets. Use CCDC Slice as a witness for those extensions, covering:

- direct CCDC recipes;
- existing and new CCDC assets satisfying the validated structural CCDC asset contract;
- CCDC assets behind Masking and other transformations that preserve that contract;
- the optional Classification dependency of a CCDC recipe;
- Asset wrappers and explicitly supported decorators;
- exact physical-to-semantic-to-Slice-output band derivation;
- Preview and Retrieve through live and bundled resolution contexts.

The `CCDC_SEGMENTS` capability will advertise only measures supported by verified stored bands. For example, break
confidence requires both magnitude and RMSE. CCDC Slice derives its own `IMAGE_OUTPUT` product from this capability
and its local date mode and options. `CCDC_SEGMENT_SLICE` also owns transformation-template validation, derivation of
required physical timing and measure evidence, and materialization into concrete Slice output visualizations.

## Observability

Emit low-cardinality Prometheus metrics and access-controlled structured logs for:

- resolution duration, graph depth, node count and serialized bundle size;
- bundle retries caused by changing recipe revisions;
- missing, forbidden, cyclic, incomplete and incompatible outcomes;
- live versus bundled resolution;
- verified execution and fail-closed handling of insufficient evidence;
- asset drift detected after task execution;
- provenance tier used and capability version.

Do not use recipe IDs, asset IDs or usernames as metric labels. They may appear in access-controlled structured
logs where operationally necessary.

Once the corresponding paths are activated, the following counters represent contract violations and should
remain zero: resolution without an explicit principal, unauthorized cross-owner resolution, missing recipe
definitions, invalid or undeclared edges in inventoried recipe types, bundled execution attempting a live load,
and unsupported bundles being interpreted. Any non-zero value requires investigation. Latency, retry, graph-size
and user-diagnosis alert thresholds are set by the first production consumer of each mechanism rather than guessed
globally.

## Verification

Pure shared tests own traversal, diamonds, role handling, cycle paths, capability preservation, canonical
fingerprints, explicit band mappings, capability reduction, bundle limits, coherent-revision retry decisions,
legacy evidence and expectation validation.

GUI, GEE and Task each need one environment-level import/execution witness for the shared contract. Masking adds
focused boundary tests for its activated traversal and execution behavior. The later bundle slice proves that
Preview uses an ephemeral bundle, Task uses only its stored bundle, and missing bundle members cannot fall back to
live loading.

Temporary browser closure-loading tests prove frontier deduplication, diamond reuse, direct and indirect cycle
termination through the shared graph builder, exact-root and session-record precedence, rejection of extra or
duplicate returned records, controlled graph limits, cancellation of outstanding reads, and fail-closed handling of
missing or forbidden dependencies. A second operation after the session catalogue changes takes a new snapshot;
an operation already in flight never mixes catalogue versions.

Live verification covers representative recipe and asset graphs, actual CCDC bands, asset replacement during
execution and every supported export destination. A permanent two-user authorization test proves that an owner can
resolve a fixture recipe, another user cannot resolve the same ID, and neither a cache nor administrator service
credentials bypass the requested principal.

## Open decisions

- Exact initial capability shapes and versioning after the provisional generic categorical fields are exercised.
- Measured bundle depth, node and serialized-byte limits across the complete task path.
- Coherent-build retry count and the optional integrity/provenance requirements, if any, that would justify a
  persisted content digest.
- Normalization rules behind semantic no-op detection, websocket event ordering and dirty-draft conflict behavior.
- Batch recipe endpoint transport details in the Recipe service.
- Whether and where detailed task manifests are retained.
- Output handling when asset drift is detected after completion.
- ImageCollection membership behavior of `system:version` and the fallback evidence required when it is
  insufficient.
- Trusted provenance storage, canonical serialization, digest algorithm, size limits and post-export verification
  protocol for semantics that physical asset schema cannot verify.
- User-facing distinction between a preview fingerprint and a later submitted bundle.
