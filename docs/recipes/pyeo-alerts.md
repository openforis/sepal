# PyEO Alerts — developer notes

PyEO Alerts detects class transitions between a classified baseline and a sequence of classified monitoring
images. These notes describe the recipe's current behavior, integration constraints and deferred work. They are
for developers; user-facing documentation belongs in the separate `sepal-doc` repository.

Recipe-specific issues here are not commitments in the shared source-resolution roadmap. Maintain behavior
while migrating to shared approaches, and fix regressions introduced by those migrations. Existing algorithm
limitations and optional features remain deferred unless a shared contract addresses them or they are explicitly
selected for a separate delivery.

## Inputs, configuration and output

The user selects a direct Classification recipe. Its classified image supplies the baseline classes, and its
classifier and training data are reused on monitoring images. The Classification must have exactly one input
image; that input supplies the baseline index when an index drop is required. PyEO does not select a separate
baseline image. Masking the Classification's input and masking the Classification's output are different
compositions; the latter is not supported by the classification selector.

| Configuration | Responsibility |
| --- | --- |
| AOI | Bounds the computation; image and geometry operations require a configured AOI. |
| Sources | Classification, monitoring datasets, cloud threshold and From/To classes. |
| Pre-process | Editable processing options for the monitoring collection. |
| Dates | Baseline window recorded by prefill and monitoring window used to build the collection. |
| Detection options | Repeatability and detection thresholds, and optional index-drop threshold. |

The baseline pixels come from the selected Classification, not from rebuilding imagery using PyEO's baseline
dates. Monitoring images are constructed from PyEO's own datasets, processing options and monitoring dates.
The result is a change-report image containing counts, change dates, repeatability and decision bands. PyEO declares
its 18 scalar report bands in the order the algorithm assembles them, with or without the index-drop gate, all
exported with `sample` pyramiding and no encoding (`PYEO_ALERTS_BANDS`, see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)). Asked for no bands it
returns the whole report; a selection returns exactly the bands selected, in the order selected.

### Readiness of Sources

Execution loads the selected Classification and compares the From classes with the To classes, so it cannot run
without a classification or with either class list empty. Shared readiness says so for `IMAGE_OUTPUT`
(`lib/js/shared/src/recipe/type/pyeoAlerts.js`): `MISSING_ROLE` at `['model', 'sources', 'classification']`, and
`NO_CHANGE_CLASSES` at `['model', 'sources', 'changeFromClasses']` or `['model', 'sources', 'changeToClasses']`. The
report bands stay declared. Through the existing propagation, previews, Retrieve, recipes reading PyEO and asset
exports are held back until Sources is repaired. SRC's toolbar button names the first missing setting
(`pyeoAlerts/sourcesRequirements.js`), and its editor says it beside that field: at once for a configuration saved
without it, and, for the class lists, only once the field says its own required error after the draft emptied it. A
draft choosing no classification cannot be applied.

Execution classifies every monitoring scene with the Classification's classifier, asking the scenes for each feature
its input's band sets include (`toClassifierBands`): indexes and pairwise combinations are computed from scene bands,
latitude, terrain and water imagery by the classifier itself. Readiness requires that the scenes carry them
(`UNSUPPLIED_CLASSIFIER_INPUTS`, the features in `missing`). What a scene carries is `sceneBands`
(`lib/js/shared/src/recipe/optical/opticalBands.js`), as the time series builds each scene: the bands the selected data
sets share at the reflectance the corrections choose, tasseled cap where they hold its inputs, and every index they
can compute - not a mosaic's catalogue. The finding is at `['model', 'sources', 'dataSets']` where another supported
optical data set alone could carry them, otherwise at `['model', 'sources', 'classification']`: a Classification
trained on radar statistics (`VV_mean`, ...) over Landsat monitoring is refused at the classification, whatever the
gate. Monitoring that is not optical, or not chosen yet, is not judged. The features come from the Classification
record the closure holds (`recordsOf`); one not held yet refuses nothing.

An enabled index-drop gate also needs its index (`UNAVAILABLE_GATE_INDEX` at `['model', 'pyeoAlertsOptions',
'indexGate', 'index']`): of the scenes (`source: 'MONITORING'`), and of the Classification's input (`source:
'BASELINE'`) as execution obtains it - calculated from a direct asset's spectral bands, asked of a recipe input by
name. The input is read, through the shared resolver (`describedSourceInputs`), only while the gate is on; an asset
input not yet observed is asked for as any observation is, and is pending until it answers, not incompatible.
SRC's toolbar button and fields say the classifier findings, at once, also while the set-up wizard has Sources open,
and a Sources draft refused for them cannot be applied. OPT's toolbar button says the gate's, and OPT's own panel says
what its draft's index cannot be read from, by the same rules. Choosing a classification clears the class lists quietly; at the
wizard's Sources step neither the button nor an untouched field says anything yet. The rule that From and To must not
overlap stays a form rule: execution does not need it.

## Classification selection and panel defaults

Sources owns a one-shot read. It acquires the classification legend, checks the single input and resolves that
input's imagery. Its closure is rooted at the imagery rather than the Classification, so an unrelated training
dependency does not prevent reading panel defaults. Execution still requires the classifier's dependencies.

Band information and proposed configuration are independent answers. `OPTICAL_COLLECTION_DEFAULTS` identifies
where collection defaults can be read, following declared preserving wrappers. A recipe producer supplies its
sources, processing options and date range. An asset supplies band names and, when present, `recipe_sources`,
`recipe_compositeOptions` or `recipe_options`, and `system:time_start`/`system:time_end` properties. One metadata
response supplies both answers. Each default an asset states is proposed on its own - its dates as a pair - so dates
are used even where no sources or processing were exported; one missing or malformed is not proposed, and the setting
keeps what the panel has. Missing or malformed defaults do not erase available band information and do not establish
that the image is unusable.

Selecting a classification proposes defaults; opening a saved recipe reads presentation metadata without
re-deriving its configuration. Dataset choices already saved or edited by the user are retained. The legend and
input-band information live in runtime UI state, while proposed options and dates stay in the form until Apply.

One acquisition record associates the current classification with its readiness and proposal. Submission checks
that record against the field's actual value, including before the selector's deferred callback runs. While the
selection is read, the selector is busy, explained in its tooltip, and Apply is held by that check alone; reading is
no error. Apply publishes sources and proposed options/dates in one action. A failed selection says so on the
selector, cannot be applied and can be retried. Where nothing can be derived, the panel keeps its settings for manual
configuration, without a warning. Reselection and Cancel cancel pending
work, and Cancel restores presentation metadata for the committed selection. See the
[shared GUI workflow](../design/recipes/gui-source-runtime.md) for acquisition and form contracts.

## Execution

Execution obtains the baseline classification, its input image and the training data needed to apply the same
classifier to the monitoring collection. The input's selected band specifications determine the classifier
bands requested from that collection. Monitoring scenes are sorted chronologically before the algorithm runs.

The algorithm tests transitions from the selected baseline From classes into monitoring To classes, optionally
requiring a drop from the baseline index. With the drop gate off, no index is built from the baseline or requested of
monitoring beyond what the classifier itself reads; the gate does not make a classifier the monitoring data cannot
feed valid. It aggregates detections into the report bands. Empty From/To choices
produce a user-facing validation result, and are refused by readiness before execution. A missing AOI is refused
before dependent reads or collection construction; the shared geometry resolver's absent-AOI meaning, "no
restriction", is unsuitable here.

### Detection thresholds

OPT saves the thresholds in `model.pyeoAlertsOptions`; `toUolParams` (`lib/js/ee/src/pyeo/params.js`) passes them to
UoL's parameters. Repeatability and cumulative detections count monitoring images from the first change date on,
that date's image included; the From/To counts span the whole monitoring period.

| OPT setting | UoL parameter | Default, range | Decides |
| --- | --- | --- | --- |
| `minRepeatability` | `percentageProbabilityThreshold` | 50, 10-100 % | `binary_timeseries_decision`, so `fcd_decision_map` |
| `minCumulativeDetections` | `minRequiredValidatedDetectionsThreshold` | 2, 1-10 | `binary_timeseries_decision`, so `fcd_decision_map` |
| `minFromDetections` (under More) | `minRequiredFromDetectionsThreshold` | 2, 1-10 | `binary_decision_from_to_map` only |
| `minToDetections` (under More) | `minRequiredToDetectionsThreshold` | 2, 1-10 | `binary_decision_from_to_map` only |

No range reaches 0: UoL's script reads these thresholds with `|| default`, which would run 0 as the default. OPT
shows the From/To counts at once when either differs from its default. Recipes saved before `minCumulativeDetections` carry
`minConsecutiveDetections`, which `toUolParams` and OPT still read.

### Current index acquisition

The Options panel offers NDVI, NDMI and NBR, filtered by the rules readiness judges the applied gate by
(`monitoringSuppliesIndex`, `baselineSuppliesIndex` in `lib/js/shared/src/recipe/type/pyeoAlerts.js`): the monitoring
scenes must compute the index, and the Classification's input must supply it as execution obtains it - its spectral
bands for an asset, the index itself by name for a recipe. The input's bands are what Sources last read of it, kept
with the classification and input kind they are of (`ui.classificationBands`); bands read for another classification
than the one applied, or not read yet, rule nothing out. Matching is case-sensitive. A new recipe's default model has
the gate on NDVI, which nobody has chosen: while the recipe is being set up, applying Sources with a classification
read gives the gate NDVI where it can read NDVI, otherwise the first index it can (`gateIndexes.js`), in the same
Apply. A recipe already set up keeps its gate, a saved index is never replaced, and where no index can be read the
gate stays as it is, explained in OPT and repaired by turning it off. A gate turned on there with no index saved
takes NDVI, or else the first index the gate can read.

Opening OPT edits nothing. An index gated on that the known bands cannot compute - the default NDVI over radar bands,
or NBR beside a red/nir-only input - stays selected, is said beside the index and holds Apply back; it is never
switched off for the user. Choosing an index the bands support, or turning the gate off (still possible while no index
is available), repairs it, and Cancel leaves the saved gate as it was. With the gate off and no index available, the
gate stays disabled. The check is the panel's alone; index availability is not a readiness requirement.

| Baseline input | How execution obtains the index |
| --- | --- |
| Recipe reference | Requests the named index from that recipe and selects the returned band. |
| Direct asset | Calculates the index from spectral bands, even if the asset already contains that index. |

An optical mosaic can produce a requested index on demand. Band Math and asset-backed recipes supply only the
bands their outputs actually contain. Masking forwards the request to its input and masks the result; it does
not synthesize an index itself. Thus Masking over an optical mosaic can supply NDVI, while Masking over an asset
containing only red/nir takes the recipe path and cannot. The same asset used directly takes the calculation
path. Successful panel prefill through a wrapper does not prove this execution path works.

The calculations require `red`/`nir` for NDVI, `nir`/`swir1` for NDMI and `nir`/`swir2` for NBR. The asset path
expects SEPAL's standardized band names and optical encoding; it does not translate arbitrary sensor names or
discover their scale/offset.

### Numeric interpretation

The monitoring collection supplies index values encoded at ×10000. Calculated asset indices are multiplied by
10000, and the configured drop threshold is multiplied by the same factor. A recipe-supplied index is used
without conversion, so execution assumes its encoding agrees. A floating-point NDVI band in physical units
does not meet that assumption merely because it is named `ndvi`.

The algorithm compares `baselineIndex - monitoringIndex >= threshold`. It needs consistent units, not an
intrinsic range of -1 to 1. Shared per-band encoding should describe `physical = stored * scale + offset` for
recipe outputs and exported assets. A common multiplicative factor cancels in a normalized difference;
additive offsets or unequal band factors do not. Band names alone cannot establish encoding or comparability.

## Deferred issues and possible improvements

These are existing limitations or design ideas, not work required to complete the source-resolution migration.

- **Classification-input ancestry.** `loadClassificationInputs$` in `lib/js/ee/src/pyeo/pyeoAlerts.js` uses
  `loadRecipe$` directly before building the classification's input image, rather than following that read through
  `recipeRef`. Audit cycle detection on this path separately. The main classification read already uses `recipeRef`;
  the concern is limited to the input-loading path and has not been reproduced end to end.
- **Uniform index acquisition.** Use a provided index when its meaning and encoding are known; otherwise
  calculate it from suitable spectral bands, for either a recipe or asset. Preserve the selected image and its
  masks. This would replace the recipe/asset branch and its wrapped-asset limitation. Shared output and encoding
  contracts come first; no PyEO-specific resolver or encoding convention should compete with them.
- **Threshold ranges from the result.** UoL asked for the detection sliders to end at the largest
  `post_fcd_change_count`, `from_class_count` or `to_class_count` in the area. That needs an area-wide reduction of
  the full classification on every change of AOI, dates or classes before OPT can draw its sliders, and a moving
  maximum can cut a saved value. The ranges stay fixed until there is a cheap, stable bound.
- **Index choices and names.** Account for supplied indices as well as computable ones on both baseline and
  monitoring inputs. Unique case-insensitive matching is a possible convenience, retaining the actual band
  name for execution. Ambiguous matches need an explicit outcome; sensor aliases and value semantics cannot
  be inferred from case folding.

The selected-scenes check is a current prefill constraint, not scheduled policy work: selecting a
Classification backed by a recipe with manually selected scenes is refused when deriving defaults. The check
is not applied in bands-only reads on reopening or as an execution rule, and the asset-defaults path has no
equivalent check. Preserve that behavior during shared migrations; do not broaden rejection incidentally.

## Shared work affecting this recipe

- [Band encoding](../design/recipes/data-sources.md#band-encoding) belongs to the shared output contract and asset export/read
  path. PyEO is one consumer exposing the need, not the owner of the contract.
- [Classification results and reusable classifiers](../design/recipes/source-resolution.md#classification-results-and-reusable-classifiers)
  must define baseline, training and monitoring mask semantics before accepting masked Classifications. CCDC,
  Time Series and Phenology share this requirement.
- [Dependency diagnostics](../design/recipes/data-sources.md#9-source-selection-and-further-consumers), including useful cycle
  errors in map layers, belong to shared error presentation. A failure encountered through PyEO is not a
  PyEO-specific error-handling requirement.

## Orientation and verification

The GUI workflow is under `modules/gui/src/app/home/body/process/recipe/pyeoAlerts/`; execution and the report
algorithm are under `lib/js/ee/src/pyeo/`. Execution tests live in consuming modules, including
`modules/gee/test/jobs/ee/pyeo/`. Run focused tests through `sepal npm-test <module>`.

Keep form tests about committed configuration, visible readiness and cancellation. Reader tests can substitute
recipe and asset acquisition while exercising real declarations and resolution. Execution witnesses with
substituted Earth Engine do not establish correct alert pixels. Any future index change needs representative
live checks of provided and calculated indices, value encoding and mask preservation.
