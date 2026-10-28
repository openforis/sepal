# Phenology

Derives the seasonality of one band of an image collection over an area and a range of years: its seasonal
metrics, and a composite for each month.

## Inputs

The collection is the shared collection submodel (`sources`, `options`) over `dates.fromYear` to `dates.toYear`, and
`sources.band` names the band analysed. The area of interest clips the result.

A selected Classification (under More in Sources) must be one the collection's images can feed, by the rule Time
Series follows ([Time Series](time-series.md#inputs); `collectionClassifierRequirement`,
`lib/js/shared/src/recipe/source/collectionSources.js`): what its classifier reads must be carried by each optical,
radar or Planet image where it is classified, or computed by the classifier from it. Otherwise
`UNSUPPLIED_CLASSIFIER_INPUTS` refuses it at the data sets where an optical data set or the radar collection would,
or at the classification; SRC says why beside that field, the classification showing outside More while it cannot be
used, and a refused draft cannot be applied. Selecting none requires nothing. Map previews, the Retrieve button and
image-to-asset, Drive and SEPAL exports follow the finding.

A band the Classification computes - its regression or a class's probability - must be one its classifier's
configuration provides (`classifiedOutputRequirement`, `lib/js/shared/src/recipe/classifiedOutputs.js`). An SVM
offers no regression, and an SVM of one class offers no class probabilities. Otherwise `UNSUPPORTED_CLASSIFIED_OUTPUT`
refuses it at the band; SRC says why beside it, and a refused draft cannot be applied. A band saved so stays shown as
chosen, and opening the panel leaves it unedited, until another band is chosen
(`modules/gui/src/app/home/body/process/recipe/classifiedOutputSources.test.jsx`).

## Output

Phenology declares 35 scalar bands, whatever its configuration (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)), all exported with
`mean` pyramiding and no encoding:

- the metrics `background`, `amplitude` and `median`, then `dayOfYear`, `days`, `median`, `slope` and `offset` for
  each of four segments, `_1` to `_4`;
- the month composites `january` to `december`.

Asked for no bands, or an empty selection, Earth Engine returns all 35 in that order; a selection returns exactly
the bands selected, in the order selected. The per-segment arrays the metrics are computed from (`segment_1` to
`segment_4`) are excluded from the default output and the declared catalogue; an explicit producer selection can
still request them.

A month without observations is its band with no valid pixels, not a missing band
(`lib/js/ee/src/timeSeries/compositeOrMasked.js`), so the schema does not depend on the imagery. Phenology still
needs observations over the analysis period to compute its metrics; that is a requirement of running it, separate
from its schema.

The GUI groups the bands by segment and by month and sets their cursor precision. That is presentation only.

## Open issues

- **Month windows span two months.** Each month composite filters with
  `ee.Filter.calendarRange(month, month + 1, 'month')`, whose end is inclusive: `january` composites January and
  February, and so on; `december` asks for months 12 to 13. Whether a month band should cover its own month only is a
  calculation decision that has not been made.

## Verification

- `modules/gee/verify/phenologyPyeoOutputBands.mjs` - on live Earth Engine, over an area with months without scenes
  and one with scenes every month: unselected and empty selections return the declared bands, a subset returns in
  the order asked, a month without scenes has no valid pixels, and a month with scenes keeps its median's values,
  mask, pixel type, CRS and affine transform.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js` - the declaration, presentation and
  export policy through the real registration.
