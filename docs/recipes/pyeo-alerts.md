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
| Detection options | Required detections and optional index-drop threshold. |

The baseline pixels come from the selected Classification, not from rebuilding imagery using PyEO's baseline
dates. Monitoring images are constructed from PyEO's own datasets, processing options and monitoring dates.
The result is a change-report image containing counts, change dates, repeatability and decision bands.

## Classification selection and panel defaults

Sources owns a one-shot read. It acquires the classification legend, checks the single input and resolves that
input's imagery. Its closure is rooted at the imagery rather than the Classification, so an unrelated training
dependency does not prevent reading panel defaults. Execution still requires the classifier's dependencies.

Band information and proposed configuration are independent answers. `OPTICAL_COLLECTION_DEFAULTS` identifies
where collection defaults can be read, following declared preserving wrappers. A recipe producer supplies its
sources, processing options and date range. An asset supplies band names and, when present, `recipe_sources`,
`recipe_compositeOptions` or `recipe_options`, and `system:time_start`/`system:time_end` properties. One metadata
response supplies both answers. Missing or malformed defaults do not erase available band information and do
not establish that the image is unusable.

Selecting a classification proposes defaults; opening a saved recipe reads presentation metadata without
re-deriving its configuration. Dataset choices already saved or edited by the user are retained. The legend and
input-band information live in runtime UI state, while proposed options and dates stay in the form until Apply.

One acquisition record associates the current classification with its readiness and proposal. Submission checks
that record against the field's actual value, including before the selector's deferred callback runs. Apply
publishes sources and proposed options/dates in one action. A failed selection cannot be applied and can be
retried; unavailable defaults allow manual configuration with a warning. Reselection and Cancel cancel pending
work, and Cancel restores presentation metadata for the committed selection. See the
[shared GUI workflow](../design/recipes/gui-source-runtime.md) for acquisition and form contracts.

## Execution

Execution obtains the baseline classification, its input image and the training data needed to apply the same
classifier to the monitoring collection. The input's selected band specifications determine the classifier
bands requested from that collection. Monitoring scenes are sorted chronologically before the algorithm runs.

The algorithm tests transitions from the selected baseline From classes into monitoring To classes, optionally
requiring a drop from the baseline index. It aggregates detections into the report bands. Empty From/To choices
produce a user-facing validation result. A missing AOI is refused before dependent reads or collection
construction; the shared geometry resolver's absent-AOI meaning, "no restriction", is unsuitable here.

### Current index acquisition

The Options panel offers NDVI, NDMI and NBR. It filters these against the raw bands reported for the
Classification's input and the monitoring datasets. Matching is case-sensitive; unresolved band information
uses the candidate list rather than proving support. This is not yet a general query for supplied index bands.

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

- **Uniform index acquisition.** Use a provided index when its meaning and encoding are known; otherwise
  calculate it from suitable spectral bands, for either a recipe or asset. Preserve the selected image and its
  masks. This would replace the recipe/asset branch and its wrapped-asset limitation. Shared output and encoding
  contracts come first; no PyEO-specific resolver or encoding convention should compete with them.
- **Index choices and names.** Account for supplied indices as well as computable ones on both baseline and
  monitoring inputs. Unique case-insensitive matching is a possible convenience, retaining the actual band
  name for execution. Ambiguous matches need an explicit outcome; sensor aliases and value semantics cannot
  be inferred from case folding.
- **Acquisition with Require drop disabled.** The algorithm skips the index comparison, but its caller still
  constructs the baseline index and requests an index in monitoring images, defaulting to NDVI. Investigate
  avoiding this work if this feature is revisited. Graph construction alone does not establish which unused
  operations Earth Engine evaluates.

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
