# Change Alerts

Monitors a CCDC reference against newly acquired observations over a monitoring period, calibrated on the period before
it, and flags changes from the fitted segments. Its map shows the changes, or instead the collection mosaic a period
is compared on.

## Inputs

`reference` is the CCDC segments: a CCDC recipe, a recipe that preserves its segments such as a Masking over one, or a
segments asset. `date` states the period: `monitoringEnd` (YYYY-MM-DD), a `monitoringDuration` in
`monitoringDurationUnit` before it, and a `calibrationDuration` in `calibrationDurationUnit` before the monitoring
start. The form offers days, weeks and months, and keeps a duration as the digits its number input holds.
`sources` - `dataSetType` (`OPTICAL`, `RADAR` or `PLANET`), `dataSets`, `assets` and `band` - and `options` are the
collection monitored against. They belong to Change Alerts: observing the reference proposes the producer's sources
and options, following a wrapper to the CCDC under it or reading a segments asset's `recipe_sources` and
`recipe_options`, and a saved value is kept until the producer's settings change
([source evidence](../design/recipes/gui-source-runtime.md)). `changeAlertsOptions` configure the algorithm.

The dates of the period are computed once, by `monitoringDates` (`lib/js/shared/src/recipe/changeAlerts/`), for both
execution and the GUI: the monitoring start is the end less its duration, and the calibration start the monitoring
start less its own. A month back keeps the day, or the last day of a shorter month; a year is twelve months. Dates
are proleptic Gregorian in the year stated, 0000 to 9999; a period reaching a date YYYY-MM-DD cannot state is refused.
`periodDates` answers the same dates, or the field that keeps them from being computed, for a consumer that must
withhold rather than fail; `monitoringDates` fails with that reason.

## Output

The changes are its canonical output, declared in `lib/js/shared/src/recipe/type/changeAlerts.js` (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)): nine scalar bands,
sampled, with no encoding, known before a period or a reference is chosen. Retrieve, Masking and Task read only these.
Their styles span the period, so a recipe whose period cannot be computed is described alike but offered none, and its
layer selects nothing until the period is corrected.

### Collection mosaic

A layer can show the `COLLECTION_MOSAIC` map product instead, with `{period: 'monitoring' | 'calibration', mosaicType:
'latest' | 'median'}`. Both are required, as written; anything else, and any other parameter, is refused. It is
never an export authority.

It is the mosaic `mosaicRecipe` (`lib/js/shared/src/recipe/changeAlerts/mosaicRecipe.js`) builds from Change Alerts'
own `sources`, `options` and period, and it is described by delegating to that mosaic type's declaration: Optical,
Radar or Planet Mosaic, as `sources.dataSetType` says. Execution builds the same recipe, clipped to the geometry of the
selected reference - a wrapper's own, not the CCDC's under it. Describing it reads no reference, resolves no geometry
and builds no imagery.

| Data-set type | Mosaic | Monitoring / calibration | latest / median |
| --- | --- | --- | --- |
| `OPTICAL` | Optical Mosaic of all scenes, `sources` as saved, `options` as composite options, composed by median | target at the end / the monitoring start; season the monitoring / calibration period | day-of-year percentile filter 100 / 0 |
| `RADAR` | Radar Mosaic with `options` | target at the end / the monitoring start, or a scan of the monitoring / calibration period | a point in time / a time scan: a different schema |
| `PLANET` | Planet Mosaic of the first `dataSets.PLANET` source and `assets`, with `options` | the monitoring / calibration period | a target date at the end or the monitoring start / none |

Its bands, their order, shapes, encodings and pyramiding policies are that declaration's. An optical mosaic holds no
date bands, since it is composed by median.

A mosaic is built from the complete period whatever it covers, so all five date fields are required: a missing one is
refused as `INCOMPLETE_IMAGE_OUTPUT` and one the form could not have written - not a calendar date, a fraction or a
word, a unit other than days, weeks or months - as `MALFORMED_IMAGE_OUTPUT`, at its `model.date` path, as is a
duration reaching a date YYYY-MM-DD cannot state. `sources.dataSetType` must be one of the three, at
`model.sources.dataSetType`, and a Planet mosaic needs `dataSets.PLANET` to be a list whose first entry is `NICFI`,
`BASEMAPS` or `DAILY`, at `model.sources.dataSets.PLANET`. Refusals of the period and the sources are reported
together. The changes are described whatever these state.

The layer presents each mosaic's bands - cursor precision and ranges - as its own recipe type does. Its styles are
built from the same projection, and a mosaic its read does not describe offers none, so a saved recipe with a broken
period or source leaves the layer form usable, previews nothing, and offers the mosaic again once corrected. On the
wire the layer sends `visualizationType` and `mosaicType`, which every image request of the layer - preview, histogram
and distinct values - carries alike. Changing the view or the style acquires nothing again; a record the layer depends
on changing does.

## Open issues

- **Execution builds a mosaic for a mode the GUI would not name.** Any `visualizationType` other than `changes` and
  `monitoring` is built as the calibration mosaic, and any `mosaicType` other than `latest` as the median.
- **A layer config saving `mosaicType: undefined` names no product**, while execution would build a median. A layer
  whose config lacks `mosaicType` writes that when its period is chosen.
- **The mosaic and the changes can read different collections.** The mosaic is chosen by the saved
  `sources.dataSetType`; the changes' collection is chosen from `sources.dataSets`. A model where the two disagree
  builds a mosaic of one family and changes over another.
- **A recipe that has chosen no reference is not held back from preview.** A new recipe's `reference` is `{}`, which is
  not diagnosed as a dependency, so the read permits a preview wherever the product's own requirements are met; that
  does not establish that an uninitialized layer submits one. Execution fails on it with `MALFORMED_SEGMENT_SOURCE`.
- **Two callers still fail on a period that cannot be computed.** The date range an export submission records
  (`getDateRange` in `changeAlerts.jsx`) and the pixel chart's highlighted periods (`panels/chartPixel.jsx`) call
  `monitoringDates` and throw where `periodDates` would say why.
- **Execution's calendar is more permissive than the product.** `monitoringDates` accepts a day past its month's end,
  fractional durations and a unit of years; the product refuses them.

## Verification

- `modules/gee/verify/changeAlertsCollectionMosaic.mjs` - on live Earth Engine, for every view of optical and radar
  recipes, and over a Masking of an optical CCDC: the shared description, the catalogue and the image built for the
  described bands hold the same scalar bands. A latest radar mosaic's sample, at the monitoring end and the monitoring
  start, names an acquisition listed independently from the scene catalogue by its zero-based day of year and whole
  days from the target, with its orbit, and none lies nearer. Planet is catalogued; building it is reported as
  blocked, as is a segments asset reference: neither is accessible to the service account.
- `modules/gee/verify/changeAlertsOutputBands.mjs` - the changes' schema.
- `lib/js/shared/test/recipe/output/type/changeAlerts.test.js` - the product's description, identity and parameters;
  the recipe each view is delegated as, at both boundaries, in weeks, days and years below 100; following Change
  Alerts' saved model over a CCDC configured otherwise; the refusals; the changes unaffected.
- `lib/js/shared/src/recipe/changeAlerts/monitoringDates.test.js` and `mosaicRecipe.test.js` - the dates of the
  period, the field that keeps one from being computed, and each source type's projection.
- `modules/gee/test/jobs/ee/timeSeries/changeAlertsCollectionMosaic.test.js` - each view executed as described, over the
  selected reference's geometry, a Masking wrapper's and a segments asset's included.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js` - each view described, presented and styled,
  and refused without a period or a Planet collection.
- `modules/gui/src/app/home/body/process/recipe/changeAlerts/changeAlertsImageLayer.test.js` - the layer form over a
  broken period or Planet source, and over a period that cannot be computed - before year 0, a duration that is no
  number, a unit it cannot count - switching modes without failing, and recovering in either mode once corrected.
- `modules/gui/src/app/home/body/process/recipe/recipeImageLayer.test.js` - preview arguments, a view change and a
  restyle acquiring nothing, and a record change acquiring again.
