# BAYTS Alerts

Monitors Sentinel-1 observations over a monitoring period against a BAYTS Historical reference, and flags forest
disturbance. Its map shows the alerts, or instead the radar observation at the start or end of the period.

## Inputs

`reference` is the historical statistics, a BAYTS Historical recipe or asset. `date` states the period:
`monitoringEnd` (YYYY-MM-DD) and a `monitoringDuration` in `monitoringDurationUnit` - days, weeks or months - before
it. The form keeps a duration as the digits its number input holds, so a saved duration may be a string.
`options` are the radar options monitoring observations are processed with, and `baytsAlertsOptions` the algorithm's,
including `previousAlertsAsset`, whose alerts a run continues, and `wetlandMaskAsset`.

## Output

The alerts are its canonical output, declared in `lib/js/shared/src/recipe/type/baytsAlerts.js` (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)): six scalar bands,
sampled, with no encoding. Retrieve, Masking and Task read only these. The layer's confidence filters
(`previouslyConfirmed`, `minConfidence`) mask alert pixels and change no band.

### Radar observation

A layer can show the `RADAR_OBSERVATION` map product instead, with `{position: 'first' | 'last'}`. A position is
required; anything else, and any other parameter, is refused. It is a point-in-time Radar Mosaic of the recipe's radar
options with `minObservations: 1`, around a target date: the monitoring end for `last`, the end less the duration for
`first`. It is described by delegating to Radar Mosaic's declaration - `VV`, `VH`, `ratio_VV_VH` averaged, `orbit` by
mode, `dayOfYear` and `daysFromTarget` sampled, all scalar, no encoding - from the recipe alone: its description
resolves no geometry, builds no imagery and runs no BAYTS. It is never an export authority.

Each pixel holds the observation, among those valid there within Radar Mosaic's window around the target, with the
smallest whole number of days from it: its absolute fractional distance in days, cast to an integer. Scores can tie,
and the mosaic does not then necessarily keep the closest timestamp. Pixels can therefore come from different dates,
before or after the monitoring period. `dayOfYear` is zero-based and `daysFromTarget` is that whole number.

A position is described only where its target can be placed. Both need a valid `monitoringEnd`; `first` also needs a
whole-number duration and a unit of days, weeks or months, and a target those place. A missing value is refused as
`INCOMPLETE_IMAGE_OUTPUT` and a supplied invalid one as `MALFORMED_IMAGE_OUTPUT`, at its `model.date` path, so a new
recipe's radar layer is refused until a valid monitoring end is configured. The target is placed on the proleptic
Gregorian calendar, a month back keeping the day or the shorter month's last, and must be a date YYYY-MM-DD can
state, in years 0000 to 9999. This describes the product only: execution computes its dates as before, and the alerts
are described whatever the period.

Execution builds the mosaic over the reference's geometry, from `radarObservationRecipe`, which description shares.
Over a historical asset it is also masked to the asset's valid pixels; over a historical recipe it is only clipped to
that recipe's area. On the wire the layer still sends `visualizationType`, which every image request of the layer -
preview, histogram and distinct values - carries alike.

## Open issues

- **An unknown mode is shown as the first observation.** Execution builds the `first` mosaic for any
  `visualizationType` other than `alerts` and `last`. The GUI never sends one: a layer naming no known mode shows no
  product.
- **The radar observation of a recipe that has chosen no reference is not held back from preview.** The alerts are:
  their reference requirement refuses a missing reference
  ([BAYTS Alerts REF](../design/recipes/source-resolution.md#bayts-alerts-ref)). The radar observation reads the
  reference's geometry, and a direct asset reference's mask, but none of its statistics, so it is not held to that
  requirement, and no dependency is diagnosed when `reference` is absent, as it is in a new recipe, so the read's
  dependency validity is `VALID` and it permits a preview wherever its dates are set. That does not establish that an uninitialized layer actually submits one. Execution asked for the radar
  observation without a reference fails with `TypeError: Cannot read properties of undefined (reading 'type')`. A
  reference selected without an id is diagnosed, `INCOMPLETE_REFERENCE`, and blocks preview.
- **Radar Mosaic's window is always ±183 days** (see [Radar Mosaic](radar-mosaic.md)).

## Verification

- `modules/gee/verify/baytsAlertsRadarObservation.mjs` - on live Earth Engine, for both positions: the shared
  description, the catalogue and the image the layer's arguments build hold the same scalar bands. At a point, each
  sample names an acquisition listed independently from the scene catalogue, by its zero-based day of year and whole
  days from the target, with its orbit, and none lies nearer. Masking over a historical asset is reported as blocked:
  no BAYTS Historical asset is accessible to the service account.
- `modules/gee/verify/baytsAlertsOutputBands.mjs` - the alerts' schema.
- `lib/js/shared/test/recipe/output/type/baytsAlerts.test.js` - the product's description, identity, parameters, the
  target date it is delegated at - month ends, leap years, years below 100 - and the monitoring periods that cannot
  place it.
- `modules/gee/test/jobs/ee/bayts/alertMapProducts.node.test.mjs` - the mosaic built for each mode and an unknown one,
  the asset masking and its absence over a recipe.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js` - described and presented positions,
  styles, refusals without legacy fallback, and the reference states that do and do not block preview.
- `modules/gui/src/app/home/body/process/recipe/recipeImageLayer.test.js` - preview arguments as the editor reads them,
  a mode change and a restyle acquiring nothing again.
