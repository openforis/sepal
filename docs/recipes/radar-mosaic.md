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
[output contract](../design/recipes/output-products.md#declaration-and-description)), all scalar and
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

The GUI sets cursor precision and ranges and groups the bands for Retrieve. That is presentation only. BAYTS' radar
observation and Change Alerts' radar collection mosaics are declared products delegating to this declaration. A
Sentinel-1 collection's measures for temporal consumers - CCDC, time series, charts - are a separate contract
(`lib/js/shared/src/recipe/radar/collectionMeasures.js`).

Known limitations and follow-ups are tracked in the [workplan](../design/workplan.md#radar-mosaic).

## Verification

- `modules/gee/test/jobs/ee/radar/mosaicBands.test.js`: configuration-dependent catalogue.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js`: declaration, presentation,
  Retrieve and delegated BAYTS/Change Alerts views.
- [Radar live probe](../../modules/gee/verify/README.md): both schemas/defaults, selection order, harmonic
  subsets, missing-date refusal and native-grid value/mask equivalence with/without harmonic construction.
