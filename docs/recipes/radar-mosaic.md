# Radar Mosaic

Composites Sentinel-1 ground-range imagery over an area of interest, either as the observation closest to a target
date or as statistics and a harmonic fit over a period.

## Inputs

The area of interest (`aoi`) is the one external reference. `dates` chooses the configuration: a stated `targetDate`
makes a point in time, whatever period is also stated, and anything else is a time scan over `fromDate` to
`toDate`. The dates panel writes one shape or the other. No date is validated: a recipe stating none is described as
a time scan and refused when run. `options` configures the collection: orbits, geometric correction, speckle
filtering, outlier removal, border masking and the minimum number of observations.

## Output

Each configuration declares its bands in `lib/js/shared/src/recipe/type/radarMosaic.js` (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)), all scalar and
without encoding:

| Configuration | Bands, in order | Pyramiding |
| --- | --- | --- |
| Point in time | `VV`, `VH`, `ratio_VV_VH`, `orbit`, `dayOfYear`, `daysFromTarget` | `orbit` mode; `dayOfYear`, `daysFromTarget` sample; the rest mean |
| Time scan | `VV_min`, `VV_max`, `VV_mean`, `VV_std`, `VV_med`, the same for VH, `ratio_VV_med_VH_med`, `VV_cv`, `VH_cv`, `NDCV`, `orbit`, then `_phase`, `_amp`, `_res`, `_const` and `_t` for VV and then VH | `orbit` mode; both `_phase` bands sample; the rest mean |

`_const` and `_t` are the harmonic fit's intercept and its slope per year. A point in time holds the orbit and date of
the observation it took, as whole numbers; a time scan's `orbit` is the most common orbit, stored as a float.

The catalogue is the configuration's declared list whatever a request selects. Asked for no bands, or an empty
selection, Earth Engine returns the declared bands in that order; a selection returns exactly the bands selected, in
the order selected. Execution computes harmonics only for the polarisations a selection needs, so a point in time
asked for nothing computes none. Bands used to construct the output - `angle`, `quality`, `unixTimeDays` and the
per-image harmonic terms - are not declared, and an explicit producer request for one still builds.

The GUI sets cursor precision and ranges and groups the bands for Retrieve. That is presentation only. BAYTS' first
and last radar observations and Change Alerts' radar mosaics take their names from this declaration while their own
products are undeclared. A Sentinel-1 collection's measures for temporal consumers - CCDC, time series, charts - are
a separate contract (`lib/js/shared/src/recipe/radar/collectionMeasures.js`).

## Open issues

- **Outlier removal never shortens the window.** `getDates` in `lib/js/ee/src/radar/mosaic.js` compares
  `outlierRemoval === 'NONE   '`, with trailing spaces, so a point in time always composites ±183 days around its
  target date and never the ±30 days intended without outlier removal. Correcting it changes pixels.
- **BAYTS Historical composites both orbits for each orbit.** `lib/js/ee/src/bayts/baytsHistorical.js` builds each
  single-orbit Radar Mosaic with its orbit under a top-level `options`, but the mosaic reads `model.options`, so
  every run uses the recipe's orbits; only the speckle statistics are filtered by orbit.
- **A time scan reduces work it discards.** `toTimeScan` selects `VV.*` and `VH.*`, which sweeps the per-image
  harmonic terms into the reduction whenever harmonics are computed; the final selection drops them.
- **A recipe stating no dates fails with Earth Engine's own error**
  (`Required argument (start) missing to function: DateRange`) rather than a stated reason.
- **An unused style entry.** `constant` in `lib/js/ee/src/radar/visParams.js` matches no band.
- Whether a point in time should offer `unixTimeDays` is an open product decision.

## Verification

- `modules/gee/verify/radarMosaicOutputBands.mjs` - on live Earth Engine, for both configurations under minimal and
  saved-default options: the catalogue, unselected, empty and full requests, subsets out of order, harmonic subsets,
  a target date beside a period, the refusal without dates and valid harmonic pixels. A point in time asked for
  nothing is compared pixel by pixel, values and masks, with the same bands of an image computing harmonics.
- `modules/gee/test/jobs/ee/radar/mosaicBands.test.js` - the catalogue per configuration, whatever is selected.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js` - the declaration, presentation,
  presets, Retrieve groups and export policies through the real registration, and the BAYTS and Change Alerts views
  that show a radar mosaic.
