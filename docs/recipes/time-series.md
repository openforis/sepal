# Time Series

Builds an optical, radar or Planet collection over an area and period, optionally with a Classification's
regression or class probabilities added to each image where a request names them. Its chart plots a measure of that collection at a pixel, its
Retrieve downloads one to SEPAL, and its map shows how many observations each pixel has.

## Inputs

`aoi` bounds the collection, `dates` its period, and `sources` - the submodel every collection-backed recipe shares -
its data sets and an optional Classification (`sources.classification`). `options` configure how each image is
processed. The AOI, when taken from a recipe or an asset, and the Classification are its dependencies.

Its data sets, like CCDC's and Phenology's, are judged against the years its dates read, as the shared
[data-set availability](../design/recipes/data-sources.md#data-set-availability) describes: one none of whose years overlap cannot be chosen anew, one chosen stays chosen,
and where none may contribute its image and pixel observations are held.

A selected Classification must be one the collection's images can feed. Its classifier reads the features its input's
band sets include, and readiness requires each image to carry them where `lib/js/ee/src/timeSeries/collection.js`
classifies it (`collectionClassifierRequirement` in `lib/js/shared/src/recipe/source/collectionSources.js`, the rule in
`classifierInputs.js`): an optical scene's common bands, tasseled cap and indexes; a radar scene's `VV`, `VH` and
`orbit`, the ratio derived only afterwards; a Planet image's renamed bands, with the `dayOfYear`, `daysFromTarget`,
`targetDayCloseness` and `unixTimeDays` its collection adds to every image (`PLANET_DATE_BANDS`) - and any index the
classifier computes from them. The RGB `brightness` a Planet collection also adds is an internal working band, not the
tasseled cap's `brightness` a classifier reads, so it never supplies one.
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
Classification cannot be trained (no points, points its classifier cannot train on, an unusable reused recipe, reused
features missing), SRC names it beside the classification field (`classificationReferenceFeedback`), the chart and
Retrieve actions are withdrawn, and an
open chart or Retrieve closes, the chart cancelling its request; SRC alone explains it. While what training needs is
still being read, or cannot be, an open chart reads nothing and an open Retrieve holds its submission, both staying
open, nothing found. Repairing the Classification, or selecting none, offers them again without reopening them; the
band charted and the retrieval settings last submitted are kept. A supplied decision tree needs no training. CCDC applies the same policy.

An open chart reads again whenever what it is computed from changes, such as the Classification's inputs or classifier
settings. It waits while an edit to the Classification is not yet saved, since storage's copy is what is executed. Its
band options follow the Classification record the session holds.

### What is offered of the selected Classification

What Sources, the chart, Retrieve and CCDC's OPT offer of the selected Classification - its outputs and their labels -
reads its record as the session holds it, otherwise as the record the consumer's own runtime read resolved
(`selectedClassificationOfState`, `modules/gui/src/app/home/body/process/recipe/collections/selectedClassification.js`). The
selection is the one the type declares (`CLASSIFICATION_SOURCE`). CCDC and Phenology are read the same way.

- **One UI read.** Each recipe has one reader for the selected Classification, shared by its consumers. The root holds
  the applied selection while its tab is open; Sources hold the one their draft selects. The root and Sources share the
  pending request for the same record. The read lands in the session's recipe cache under its existing acceptance
  rules: an open draft or a newer copy is kept.
- **Releasing.** Letting one consumer go never cancels a read another still holds. A read no consumer holds is
  cancelled, its late answer writing nothing, and its claim released, so a closed tab leaves nothing held.
- **Pending and failed reads.** No further classified outputs are offered, but chosen ones stay chosen and shown.
  Sources' selector is busy while the read is pending. Retrieve keeps a classified selection shown and held until the
  record says what is provided. A failed read is notified once, and read again for a consumer that comes to hold it,
  such as Sources selecting it again. A record the session gains by any other path, such as another tab opening or
  editing it, is offered at once.
- **Names.** A classified output chosen but not offered - CCDC's breakpoint band, Phenology's band, Time Series
  Retrieve's indicator - is named the same way in its choice and in the finding refusing it (`classifiedOutputLabel`).
  The finding keeps only which recipe and Classification it was judged under; both resolve the name each time they
  render.
  1. It takes the label the selected Classification gives it, from its record where the session holds it, so a rename
     shows in the choice and the finding together; otherwise as the recipe's consumers last showed it.
  2. Failing that, it takes the label they last showed the output called, from any Classification: the one applied
     while another is edited, or one selected before. A class removed or renamed since does not undo that history,
     and a rename replaces it.
  3. Otherwise it is named by its class, "Class 1 probability", or as "Regression" (`classifiedOutputFallbackLabel`,
     Classification's `bands.js`).

  An output that is offered keeps its offered label. A band of the images is named by itself (`chosenBandLabel`).
  Remembered labels are presentation alone: they are kept in memory while the recipe's tab is open, never saved, and
  never make an output available or lift a refusal. The shared Retrieve panel names a kept selection only as its owner
  says, otherwise by its value, so a band a user named `probability_1` elsewhere stays as named.
- **Runtime reads.** The source runtime reads what its own work needs independently. Work started before the UI read
  lands may request the record itself; work started after takes it from the session. Nothing promises one request
  across both.

Nothing of the Classification is copied into the recipe: opening a recipe and a read completing leave its model and
drafts as they were.

### Bands of the images CCDC and Phenology choose

CCDC's breakpoint bands and Phenology's band are bands of the collection's images or classified outputs. Classified
outputs follow [their own rule](#classified-outputs).

- **Rule.** A chosen band of the images must be one the configured collection carries (`collectionBandRequirement`,
  `lib/js/shared/src/recipe/collectionBands.js`). Its data sets, optical corrections (`options.corrections`) and
  Planet histogram matching (`options.histogramMatching`) decide that, by the branch `collection.js` takes
  (`collectionMeasures`, which `ccdcMeasures` extends). Dates and cloud thresholds select images, not bands.
  `UNSUPPORTED_COLLECTION_BANDS` is found at the field and names the `unsupported` bands. For CCDC it refuses the
  image (preview, Retrieve), the pixel segments and the count; for Phenology, the image. The server's
  `requireExecutable$` refuses the same configuration before Earth Engine is asked. While no data set is selected,
  nothing is judged, and the required data sets refuse Apply.
- **Planet.** Basemaps and histogram-matched Daily carry the four matched bands, so `green1` is refused there. Without
  matching, Daily's bands depend on its imagery, which this rule does not read. A band or index that eight-band
  imagery carries is not refused; one that no Daily imagery carries is. The RGB `brightness` and the date bands Planet
  processing adds to every image (`PLANET_DATE_BANDS`) are internal working bands, not measures to analyse. That
  `brightness` is not the tasseled cap's, whose SWIR inputs Planet lacks, so a chosen `brightness` is refused over
  every Planet collection.
- **Sources.** Choices come from the draft's data sets and the corrections applied, the catalogue the rule reads.
  Planet offers its established subset. A chosen band that is not offered stays shown as chosen, after the offered
  groups: after a family or data-set change, while no data set is chosen, or as saved. Opening, rendering and reads
  completing leave the model and draft unchanged. The draft is judged against the processing applied, and again at
  submission (`collectionBandRequirements.js`). A draft keeping an uncarried band says so beside the field, with the
  repairs, and its Apply, Enter and wizard Done are refused. Data-set defaulting on a family change is unchanged.
- **PRC.** A PRC Apply that leaves a chosen band uncarried is allowed. SRC is then marked and the held operations
  name it. Choosing a carried band in Sources, or changing the data sets or processing back, repairs it.

### CCDC's TMask bands

TMask screens a pixel's observations with two of the bands CCDC segments. Execution passes it only as exactly two bands
(`enabledTmaskBands`, `lib/js/shared/src/recipe/type/ccdc.js`). Any other selection runs no TMask, and presets save
none.
- **Rule.** An enabled TMask must use breakpoint bands. The CCDC type declares this as a configuration requirement,
  `NON_BREAKPOINT_TMASK_BANDS`, found at `ccdcOptions.tmaskBands` and naming the `missing` bands. It refuses the image
  (preview, Retrieve) and the pixel segments; the count and pixel observations are unaffected. The server's
  `requireExecutable$` refuses the same configuration before Earth Engine is asked.
- **Sources.** A Sources Apply that removes a band TMask uses is allowed. OPT's toolbar button is then marked, and the
  held operations name OPT. Restoring the band as a breakpoint band repairs it.
- **OPT.** TMask's choices are the applied breakpoint bands, in their order, named as Sources name them. A chosen band
  that is no longer one stays shown as chosen, so it can be removed; opening, rendering and reads completing never drop
  it. The control is enabled while anything can be chosen or removed. OPT's draft is judged against the applied
  breakpoint bands (`ccdc/tmaskRequirement.js`). A draft keeping such a band says which bands are missing and the
  repairs beside TMask, and its Apply and Enter are refused. Choosing another pair, clearing TMask or choosing a preset
  repairs it. OPT's existing rule of exactly two bands or none is unchanged.

### Chart drawing

Time Series, CCDC, CCDC Slice and Change Alerts use `CCDCGraph`; LandTrendr uses the same shared `Graph` widget.
For ordinary error bars, `errorBandPlotter` shades each continuous uncertainty band with one outline. All observations,
fitted values and uncertainty bounds remain in the chart, so zooming and hover lookups use the full series.
Null points follow the series' `connectSeparatedPoints` setting; explicit NaN gaps stay gaps. Band colour and opacity
follow the series settings. The library still draws the lines and points, and supplies the renderer for stepped and
custom-bar charts. A caller's own plotter remains authoritative.
Observation-only drawing orders rows by timestamp because observation chunks can finish out of order. All values and
duplicate timestamps are kept; the response itself is unchanged. The zoom strip is shown only when charted rows span
more than one instant, so a one-instant series cannot collapse its date window by dragging a handle.
Hover readouts appear opposite the highlighted point and let pointer events reach the chart beneath them, for both
observations and fitted points. Moving into the zoom strip clears the hovered point and its readout. A model day's
readout shows the value drawn and describes the segment it is fitted to or extrapolated from. For an interpolated day
it describes the segment the gap follows; a masked day shows none.

What a chart draws is prepared once per response, for the band and pixel read: `ccdcChart.js` for the `CCDCGraph`
family, `landTrendrChart.js` for LandTrendr. The CCDC family evaluates the model for each day of the period. Segment
days and the gaps following them use browser local midnight; a gap before the first segment steps from the configured
start instant. Within a segment the value is fitted. Around and between segments the gap strategy fills it:
- interpolation needs a segment on both sides;
- extrapolation uses the closest, previous or next segment within the maximum days;
- before the first segment or after the last, only the segment there is can be used;
- a day without the segment asked for is masked.

### Chart CSV export

Each pixel chart panel has an Export CSV button at the left of its buttons. It downloads one CSV of the selected band
(LandTrendr: the recipe's index) at the charted pixel, over the whole prepared period; zooming does not restrict it.
- **When it is enabled:** once every response the chart needs for the current band and pixel has arrived (segments and
  observations for CCDC and Change Alerts) and something was read. It is disabled while a new band or pixel is read.
- **What it reads and changes:** it serializes the prepared chart the drawing uses (`pixelChartExport.jsx`,
  `pixelChartCsv.js`). It requests nothing more from Earth Engine and leaves the recipe unchanged.
- **Encoding:** the file is UTF-8 without a byte-order mark, written by `papaparse`. Excel may need it imported as UTF-8.
- **Period:** the export includes all prepared model days, including segments before the chart's initial date window.

Every file includes `band`, `latitude`, `longitude` and `value`. Other columns depend on the records exported:

| Chart | Additional columns |
| --- | --- |
| Time Series | `timestamp` |
| CCDC | `timestamp`, `series`, `rmse`, `lower`, `upper`, `model_method` |
| CCDC Slice | `timestamp`, `rmse`, `lower`, `upper`, `model_method` |
| Change Alerts | `timestamp`, `series`, `rmse`, `lower`, `upper`, `model_method` |
| LandTrendr | `year`, `series`, `is_vertex` |

`series` is included only when the file contains both observations and model records. Model-specific columns are
omitted when only observations were returned. Applicable columns stay present when their values are missing, including
an entirely masked model. Columns keep this relative order:
`band,latitude,longitude,timestamp,year,series,value,rmse,lower,upper,model_method,is_vertex`.

- **Order:** rows are in time. At one instant an observation precedes the model; observations sharing an instant keep
  the order they were read in.
- **Observations:** every observation in the response, at its own timestamp, including several on one day, which the
  fitted drawing shows one of. LandTrendr's are annual composites: a `year` and no timestamp.
- **Model, CCDC family:** a row for each day of the period. The timestamp is the actual instant the model is evaluated
  at, written in UTC with the chart's existing timezone handling preserved. `model_method` is `fitted`, `interpolated`,
  `extrapolated` or `masked`; a masked day keeps its row with no numbers.
- **Model, LandTrendr:** a row a year, with `is_vertex` from the flags LandTrendr returned. A missing fitted value is
  blank; no separate method column is needed for this fitted annual series.
- **`rmse`:** the RMSE of the one segment a fitted or extrapolated value comes from. It is blank for an interpolated
  value.
- **`lower` and `upper`:** the band the chart draws around the value, which for an interpolated value is a weighted
  combination of both segments' RMSE. They are not statistical confidence intervals.
- **Where there is no uncertainty:** observations sharing a file with a CCDC model leave its `rmse`, `lower` and
  `upper` cells blank. Observation-only and LandTrendr files omit these columns. The zeros the chart plots there are
  placeholders.
- **Values:** as charted, with no unit conversion and at full precision. Timestamps are ISO 8601 in UTC, with
  milliseconds. Anything unavailable is blank.

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
- **Probabilities.** Names, values, masks and each branch's scaling retain their established representation.
- **Refusal.** A requested output the Classification does not declare, such as an SVM's regression, is refused with
  `UNSUPPORTED_CLASSIFIED_OUTPUT` before anything is evaluated.
- **Native bands.** A request naming only the images' own bands, such as the count's band `0`, reads nothing of the
  Classification. A count with a Classification therefore builds.
- **What is offered.** The chart's and Retrieve's choices are the outputs the classifier's configuration provides:
  an SVM's type decides its class probabilities (`supportProbability`). No Time Series setting requires a classified
  output, so none is validated beyond the request.
- **Readiness.** A selected Classification must be trainable and its inputs must suit the collection for every
  operation, including native bands/counts, under the configured-analysis policy described in Inputs.

### Collection encoding

Classification predicts from each scene's existing features before native storage scaling/casting. Its temporal
`regression` stays floating point: Optical stores the prediction ×1,000; Radar and Planet store target units.
For `r=0.125` the values are `125` and `0.125`; `r=-1.8755` gives approximately `-1875.5` and `-1.8755`.
Optical `r=40.00075` gives approximately `40000.75`, without int16 clipping. Float32 approximation remains.
Native and probability bands keep their existing integer encoding, masks, order and scene properties.

Probability quantization is unchanged: Classification returns integer percentage `q=uint8(100*p)`, Optical stores
`100*q`, and Radar/Planet store `q`. Thus `p=0.376` remains `3700` versus `37`. These are public storage scales;
charts and downloads return the stored numbers. No saved stretches, thresholds or lambda settings are rewritten.
CCDC still fits these collection values directly, with its configured lambda; probability fitting normalization
remains [deferred](../design/workplan.md#collection-output-correctness).

Regression precision also reaches CCDC coefficients/Slice and [Phenology](phenology.md#output), where applicable.
New computed CCDC regression value bands and Phenology value bands describe target units with encoding scale
`0.001` for Optical or `1` for Radar/Planet, offset zero; the training target supplies the unit. Existing assets'
units are never inferred from their names or today's producer configuration. Recomputing recovers fractions/range
and may change fits, breaks, seasonal timing and threshold crossings despite retaining public units. Previously
truncated or clipped pixels in old assets/downloads cannot be recovered without recomputation.

Affected asset exports use the bounded [regression Resume check](../design/recipes/output-products.md#regression-precision-compatibility).
Affected workspace regression downloads reserve a new indicator directory before any chunk export; an existing
directory is refused, including an empty one, so concurrent tasks cannot share it. Native/probability indicators
retain their existing destination behavior. The server identifies affected indicators during planning and refuses
regression chunk exports from runners that have not acknowledged destination reservation; an older running task
must be restarted with the updated runner and a fresh destination. Submitted numeric metadata is not compatibility
evidence. Stacking these regression downloads checks every TIFF band/chip/chunk for one floating type
(`--require-floating-point`); mixed types or integer chunks fail before VRTs are written. Existing files are never
removed by these guards. The VRTs declare 0 as NoData, including a legitimate regression zero, and do not declare the
NaN Earth Engine writes for masked floating pixels; see
[time-series download NoData](../design/workplan.md#time-series-download-nodata).

Known limitations and follow-ups are tracked in the [workplan](../design/workplan.md#time-series).

## Verification

- `lib/js/shared/test/recipe/output/type/timeSeries.test.js` and `test/recipe/classifiedOutputTraining.test.js`:
  count schema, selected-classifier prerequisites and Phenology's distinct native-band policy.
- `modules/gee/test/jobs/task/export/timeSeries.test.js`, `jobs/ee/timeSeries/loadObservations.test.js` and
  `test/ee/timeSeries/classifiedOutputs.test.js`: planning/chunk/observation guards, native versus classified
  construction, unsupported output and repair across collection families.
- `modules/gui/src/app/home/body/process/recipe/timeSeries/` and `recipe/collections/selectedClassificationChart.test.jsx`:
  indicator requests, feedback, submission races, chart/Retrieve withdrawal, pending states and recovery.
- `modules/gui/src/app/home/body/process/recipe/collections/selectedClassification.test.jsx`: the shared UI read through real roots,
  panels and runtime (CCDC and Time Series) - one request for the root and Sources, independent runtime reads, release,
  supersession, teardown, pending and failed reads, recovery, and labels in Sources, OPT and Retrieve.
- `modules/gui/src/app/home/body/process/recipe/collections/classifiedOutputSources.test.jsx`: CCDC's and Phenology's retained
  classified outputs named in their choice and refusal - the label of the Classification selected before, the class
  fallback, the current label winning - with Apply refused, and while the Classification is read and after repair.
  `retrieve/retrieveDestinationCompatibility.test.jsx`: Retrieve's kept selection named only as its
  owner says.
- `lib/js/shared/test/recipe/output/type/ccdc.test.js`, `modules/gee/test/jobs/ee/ccdc/loadSegmentsReadiness.test.js`
  and `modules/gui/src/app/home/body/process/recipe/ccdc/tmaskRequirement.test.jsx`: the TMask rule per operation,
  presets and selections execution does not pass, the server refusal and the pair Earth Engine is given, and through
  CCDC's root, toolbar, Sources and OPT the allowed Sources Apply, OPT's mark, held operations, retained choices,
  refused drafts and each repair.
- `lib/js/shared/test/recipe/collectionBands.test.js`, `modules/gee/test/jobs/ee/ccdc/loadSegmentsReadiness.test.js`,
  `modules/gee/test/jobs/task/export/imageAssetExport.test.js`, `modules/gui/src/sources.test.js` and
  `modules/gui/src/app/home/body/process/recipe/collections/collectionBands.test.jsx`: the collection-band rule per operation and
  family, Planet's boundary, empty data sets, the server refusal, offered bands agreeing with the catalogue, and,
  through CCDC's and Phenology's roots, toolbars, Sources and PRC, retained choices, refused drafts and submissions,
  the allowed PRC Apply, held operations and each repair.
- `modules/gui/src/app/home/body/process/recipe/charts/pixelChartExport.test.jsx`: each pixel chart's Export CSV through its
  panel - when it is enabled, a new band or pixel, zoom, empty results and an unchanged recipe.
  `ccdc/ccdcChart.test.js`, `landTrendr/panels/landTrendrChart.test.js` and `pixelChartCsv.test.js`: the prepared
  model's methods, RMSE and drawn bounds, segment edges, timezones and leap days, annual rows, and CSV order, blanks,
  quoting, Unicode and applicable columns for each chart family.
  `ccdc/ccdcGraph.test.jsx`: readout placement, extrapolated values and their segment details, and masked days.
- `modules/task/src/runner/operations/timeSeriesExport.test.js` and `lib/python/shared/test_stack_time_series.py`:
  band-first download layout, chunk stacking, relative SITS VRTs and relocation.
- `modules/gee/test/ee/timeSeries/regressionPrecision.test.js`: collection values/types/masks, pre-encoding
  prediction features, public units through real file/asset export boundaries, and execution-evidence isolation.
- [Live count probe](../../modules/gee/verify/README.md): optical/radar schema and valid first-band pixel counts;
  Planet is not covered. Unknown-band and no-scene behavior are recorded rather than treated as valid output.
