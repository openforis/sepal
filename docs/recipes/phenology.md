# Phenology

Derives the seasonality of one band of an image collection over an area and a range of years: its seasonal
metrics, and a composite for each month.

## Inputs

The collection is the shared collection submodel (`sources`, `options`) over `dates.fromYear` to `dates.toYear`, and
`sources.band` names the band analysed. The area of interest clips the result.

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
