# Time Series

Builds an optical, radar or Planet collection over an area and period, optionally with a Classification's
regression or class probabilities added to each image where a request names them. Its chart plots a measure of that collection at a pixel, its
Retrieve downloads one to SEPAL, and its map shows how many observations each pixel has.

## Inputs

`aoi` bounds the collection, `dates` its period, and `sources` - the submodel every collection-backed recipe shares -
its data sets and an optional Classification (`sources.classification`). `options` configure how each image is
processed. The AOI, when taken from a recipe or an asset, and the Classification are its dependencies.

A selected Classification must be one the collection's images can feed. Its classifier reads the features its input's
band sets include, and readiness requires each image to carry them where `lib/js/ee/src/timeSeries/collection.js`
classifies it (`collectionClassifierRequirement` in `lib/js/shared/src/recipe/source/collectionSources.js`, the rule in
`classifierInputs.js`): an optical scene's common bands, tasseled cap and indexes; a radar scene's `VV`, `VH` and
`orbit`, the ratio derived only afterwards; a Planet image's renamed bands, with the `brightness`, `dayOfYear`,
`daysFromTarget`, `targetDayCloseness` and `unixTimeDays` its collection adds to every image (`PLANET_GENERATED_BANDS`)
- and any index the classifier computes from them.
Latitude, terrain and water imagery the classifier generates itself. `UNSUPPLIED_CLASSIFIER_INPUTS` refuses it at the
data sets where an optical data set alone or the radar collection would carry the features, otherwise at the
classification; the output description stays. SRC is marked and its editor says why beside that field - the
classification shows outside More while it cannot be used - and a draft refused for it cannot be applied. Selecting
no classification requires nothing; a Classification record not held, or one with several inputs, is judged for
nothing, and a Planet Daily band only eight-band imagery carries is not refused. Map previews, the Retrieve
button, the download task Retrieve submits and the pixel chart's observation request follow the finding. The chart
action and an open chart follow the chart's own readiness (`PIXEL_OBSERVATIONS`), not the image's: an AOI the chart
does not read never holds it back. A Classification still to be read holds the chart without a finding. Once found
unsuitable, a pixel being chosen is let go and an open chart closes, cancelling its request.

A selected Classification is part of the configured analysis: every Time Series operation - its count image, the
chart's observations, the download - needs its classifier trainable (`CLASSIFIER`), whatever bands are asked for, a
band of the images included. That is a policy rather than an execution need: a native band reads nothing of the
Classification and execution trains nothing for it, but readiness acquires the evidence training would read. While the
Classification cannot be trained (no points, an unusable reused recipe, reused features missing), SRC names it beside
the classification field (`classificationReferenceFeedback`), the chart and Retrieve actions are withdrawn, and an
open chart or Retrieve closes, the chart cancelling its request; SRC alone explains it. While what training needs is
still being read, or cannot be, an open chart reads nothing and an open Retrieve holds its submission, both staying
open, nothing found. Repairing the Classification, or selecting none, offers them again without reopening them; the
band charted and the retrieval settings last submitted are kept. A supplied decision tree needs no training. CCDC applies the same policy.

An open chart reads again whenever what it is computed from changes, such as the Classification's inputs or classifier
settings. It waits while an edit to the Classification is not yet saved, since storage's copy is what is executed. Its
band options follow the Classification record the session holds.

## Output

Declared in `lib/js/shared/src/recipe/type/timeSeries.js` (see the
[output contract](../design/recipes/output-products.md#declaration-and-description)): one scalar band,
`count` - per pixel, how many images of the filtered, masked collection hold a valid value in their first band, not
how many scenes intersect the area. Whatever the sources, that is the schema, so it is described from the
configuration alone, before anything is configured and without reading a dependency. Coarser pyramid levels
average it, as Earth Engine's default always did; no encoding is stated. The map's cursor shows whole counts, and
its preset style shows 0 to 100 observations.

The map shows this image, `IMAGE_OUTPUT`, whatever its layer saved (`visualizationType: 'COUNT'` names no product).
Its Earth Engine catalogue answers `count` from the declaration without building the collection. Execution builds
the count whatever is asked for: neither a selection nor `outputBands` is read, so an unknown band name still
returns `count`.

The collection's measures - what the chart plots and Retrieve downloads - are not bands of this image: the chart asks
for the observations of a collection band at a pixel, and Retrieve submits `timeseries.download`, exporting the
indicators of the collection it names to SEPAL. The download is still held to this image's readiness, since what it
requires concerns the collection both build - the selected Classification trainable among it; the indicators are not
required to be its bands. Then an indicator the Classification computes must be one it provides (the coded 400,
`requireProvidedOutputs$`). Its three Earth Engine requests
(`modules/gee/src/jobs/task/export/timeSeries.js`) check independently: the tile ids before the AOI is tiled, a tile's
date ranges before any imagery check, and each chunk's export before its collection is built, a destination prepared or
the export submitted. Planning judges every indicator the download names (`indicators`, or the single `indicator` a
task from an earlier release names), and each chunk its own.

Retrieve uses the [shared lifecycle and acceptance boundary](../design/recipes/gui-source-runtime.md#retrieve-integration)
with type-owned indicator choices (`requestGate`). It watches `IMAGE_OUTPUT` for readiness and current listing,
asset and save authority, without validating indicators against `count`. Confirmed source findings close it;
pending evidence and local destination/selection problems keep it open. Refused submission persists nothing.

The chart endpoint (`modules/gee/src/jobs/ee/timeSeries/loadObservations.js`) first judges `PIXEL_OBSERVATIONS`,
including selected-classifier readiness and feature compatibility, then requested classified outputs. The guard
runs before pixel/collection construction and uses the clicked point in place of this recipe's AOI without
mutating the submitted model. Training failure therefore precedes `UNSUPPORTED_CLASSIFIED_OUTPUT`. CCDC follows
the same policy; Change Alerts judges the native Time Series collection it monitors.

The task (`modules/task/src/runner/operations/timeSeriesExport.js`) exports one indicator per Earth Engine chunk
request and lays the download out band first:

```
<export>/<indicator>/<tile>/chunk-<start>_<end>/   chunks as Earth Engine wrote them
<export>/<indicator>/<tile>/stack.vrt, dates.csv   one band per date, from sepal-stack-time-series
<export>/sits/<tile>/SEPAL_<chip>_<INDICATOR>_<date>.vrt
```

Each `<export>/<indicator>/` is laid out as a complete single-indicator download, so a tool that reads time series
downloads is pointed at that folder. The `sits/` folder is written only when the SITS files
additional output is chosen: thin VRTs over each indicator's `stack.vrt`, through relative paths so the export can
move, named for a sits `local_cube` with `parse_info = c("X1", "tile", "band", "date")`. It has a folder per tile
because chip names repeat across tiles; load one tile folder as a cube.

The GUI registration states a time series is no image source (`imageSource: false`), which keeps it out of other
recipes' source pickers; declaring the image does not make it an input. Reached through the API or a saved model anyway,
the count is exported with `mean`, directly and through Masking or Stack, and an image export checks the recipe's
dependencies. The shared guard enforces declared configuration requirements, including the selected Classification;
it does not comprehensively validate absent AOI, sources or dates before Earth Engine is asked.

## Classified outputs

`lib/js/ee/src/timeSeries/collection.js` classifies each image only for the classified outputs a request names:
`regression`, or `probability_<value>`. Each must be one the Classification declares (`classificationBands`,
`lib/js/shared/src/recipe/type/classification.js`).

- **Output modes.** The classifier is asked only for the output modes those outputs need. Class probabilities use
  `MULTIPROBABILITY` and build no regression, so an SVM classifying `C_SVC` charts and downloads its probabilities.
- **Unchanged values.** Probability names, values, masks and each branch's scaling are as before.
- **Refusal.** A requested output the Classification does not declare, such as an SVM's regression, is refused with
  `UNSUPPORTED_CLASSIFIED_OUTPUT` before anything is evaluated.
- **Native bands.** A request naming only the images' own bands, such as the count's band `0`, reads nothing of the
  Classification. A count with a Classification therefore builds.
- **What is offered.** The chart's and Retrieve's choices are the outputs the classifier's configuration provides:
  an SVM's type decides its class probabilities (`supportProbability`). No Time Series setting requires a classified
  output, so none is validated beyond the request.
- **Readiness.** A selected Classification must be trainable and its inputs must suit the collection for every
  operation, including native bands/counts, under the configured-analysis policy described in Inputs.

## Open issues

- **A period without scenes fails with Earth Engine's own error** (`Image.reduce: Unable to reduce an image with 0
  bands`), before the collection's "all images have been filtered out" can be reported; the catalogue no longer
  builds the image, so it answers regardless.
- **Execution ignores requests.** An unknown band name returns `count` rather than being refused, unlike migrated
  types that honour `outputBands`.

## Potential features

- **Scene cloud cover.** Time Series offers no control for `sources.cloudPercentageThreshold`, the percentage of cloud
  an optical scene may have to be included; a recipe that states none includes every scene. Expose it: new recipes save 75%
  explicitly, a recipe that states none keeps including every scene and shows 100%, and a saved value is kept.

## Verification

- `lib/js/shared/test/recipe/output/type/timeSeries.test.js` and `test/recipe/classifiedOutputTraining.test.js`:
  count schema, selected-classifier prerequisites and Phenology's distinct native-band policy.
- `modules/gee/test/jobs/task/export/timeSeries.test.js`, `jobs/ee/timeSeries/loadObservations.test.js` and
  `test/ee/timeSeries/classifiedOutputs.test.js`: planning/chunk/observation guards, native versus classified
  construction, unsupported output and repair across collection families.
- `modules/gui/src/app/home/body/process/recipe/timeSeries/` and `recipe/selectedClassificationChart.test.jsx`:
  indicator requests, feedback, submission races, chart/Retrieve withdrawal, pending states and recovery.
- `modules/task/src/runner/operations/timeSeriesExport.test.js` and `lib/python/shared/test_stack_time_series.py`:
  band-first download layout, chunk stacking, relative SITS VRTs and relocation.
- [Live count probe](../../modules/gee/verify/README.md): optical/radar schema and valid first-band pixel counts;
  Planet is not covered. Unknown-band and no-scene behavior are recorded rather than treated as valid output.
