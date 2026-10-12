# Time Series

Builds an optical, radar or Planet collection over an area and period, optionally with a Classification's
regression and probabilities added to each image. Its chart plots a measure of that collection at a pixel, its
Retrieve downloads one to SEPAL, and its map shows how many observations each pixel has.

## Inputs

`aoi` bounds the collection, `dates` its period, and `sources` - the submodel every collection-backed recipe shares -
its data sets and an optional Classification (`sources.classification`). `options` configure how each image is
processed. The AOI, when taken from a recipe or an asset, and the Classification are its dependencies.

## Output

Declared in `lib/js/shared/src/recipe/type/timeSeries.js` (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)): one scalar band,
`count` - per pixel, how many images of the filtered, masked collection hold a valid value in their first band, not
how many scenes intersect the area. Whatever the sources, that is the schema, so it is described from the
configuration alone, before anything is configured and without reading a dependency. Coarser pyramid levels
average it, as Earth Engine's default always did; no encoding is stated. The map's cursor shows whole counts, and
its preset style shows 0 to 100 observations.

The map shows this image, `IMAGE_OUTPUT`, whatever its layer saved (`visualizationType: 'COUNT'` names no product).
Its Earth Engine catalogue answers `count` from the declaration without building the collection. Execution builds
the count whatever is asked for: neither a selection nor `outputBands` is read, so an unknown band name still
returns `count`.

The collection's measures - what the chart plots and Retrieve downloads - are not bands of this image, and neither
reads its description: the chart asks for the observations of a collection band at a pixel, and Retrieve submits
`timeseries.download`, exporting one indicator of the collection to SEPAL.

The GUI registration states a time series is no image source (`imageSource: false`), which keeps it out of other
recipes' source pickers; declaring the image does not make it an input. Reached through the API or a saved model anyway,
the count is exported with `mean`, directly and through Masking or Stack, and an image export checks the recipe's
dependencies. That check validates no configuration: a model stating no AOI, sources or dates is not refused before
Earth Engine is asked.

## Open issues

- **A count with a Classification source fails.** The count asks the collection for band `0`, and with a
  Classification the optical and Planet branches of `lib/js/ee/src/timeSeries/collection.js` filter the requested
  bands with `band.startsWith('probability_')`, which a number does not have: `TypeError: band.startsWith is not a
  function`, reproduced live over a Landsat 8 series with an in-memory Classification. The chart and Retrieve name
  their bands and are not affected.
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

- `modules/gee/verify/timeSeriesOutputBands.mjs` - on live Earth Engine, with optical and radar sources: the catalogue
  and the image built for nothing and for the declared bands hold exactly `count`, scalar, and a recipe configuring
  nothing is catalogued the same. At a point, the count equals the number of images of the recipe's own collection
  whose first band holds a value there, read from the collection's pixel values. An unknown band name and a period
  without scenes are recorded, not judged; Planet is reported as blocked.
- `lib/js/shared/test/recipe/output/type/timeSeries.test.js` - the declaration over each source family and before
  anything is configured, without reading its AOI, and its policy through Masking and Stack.
- `modules/gee/test/jobs/ee/timeSeries/timeSeriesBands.test.js` - the catalogue, without building the collection.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js` - the read, presentation, preset style,
  the map's product, and a recipe over broken dependencies not previewed.
- `modules/gui/src/app/home/body/process/recipe/timeSeries/timeSeriesWorkflow.test.js` - kept out of Masking's
  pickers, and Retrieve submitting `timeseries.download` for the indicator named.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js` - an image export records no encoding, reads no recipe, and fails
  over an AOI recipe that cannot be read.
