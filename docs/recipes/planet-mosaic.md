# Planet Mosaic

Composites Planet imagery - NICFI basemaps, other basemap collections, or Planet Daily scenes - over an area and a
date range into one image of spectral bands and indexes.

## Inputs

`sources.source` names the collection type. `NICFI`, which a new recipe states until its sources panel is saved,
reads the three fixed NICFI basemap collections whatever `sources.assets` holds. `BASEMAPS` reads the basemaps in
`sources.assets` - the panel saves NICFI as `BASEMAPS` with those three collections, or one custom asset - and `DAILY`
reads the Daily collection there. A recipe with no `sources` reads the fixed NICFI basemaps. `dates.fromDate` and `dates.toDate`
bound the imagery; a `targetDate`, stated only by the mosaics Change Alerts projects, weights imagery by closeness.
`options` holds the cloud and shadow thresholds, the cloud buffer and `histogramMatching`, which only the Daily branch
applies.

## Output

Declared in `lib/js/shared/src/recipe/type/planetMosaic.js` from the configuration alone (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)): `blue`, `green`,
`red`, `nir`, then `ndvi`, `ndwi`, `evi`, `evi2`, `savi` and `kndvi`, the indexes those bands support, in the order
execution adds them. Every band is scalar and averaged at coarser pyramid levels.

| Bands | Encoding |
| --- | --- |
| indexes | `{scale: 0.0001, offset: 0, unit: '1'}`: execution stores each index at ten thousand per unit |
| spectral bands of Daily with histogram matching | the same: matching maps Daily imagery onto a Landsat surface-reflectance reference built at that scale |
| any other spectral band | unknown: basemap and unmatched Daily assets keep their own scaling, which the configuration does not state |

The schema is the same on every branch. Execution composites in three ways (`lib/js/ee/src/planet/mosaic.js`):
basemaps, and Daily with histogram matching, select the four spectral bands from each image before taking the median;
Daily without matching takes the median of everything its processing carries. So asked for no bands or an empty
selection, the first two build exactly the declared bands, while Daily without matching also builds `brightness`, a
duplicate of each spectral band (`blue_1`...), `dayOfYear`, `daysFromTarget`, `targetDayCloseness` and
`unixTimeDays`, and over PSB.SD imagery alone also `aerosol`, `green1`, `yellow` and `redEdge`. None of these is
public, but an explicit request for one still builds where its branch carries it. A selection returns exactly the
bands selected, in the order selected. The Earth Engine catalogue answers the declared bands without building
anything.

Being described is not being executable: a window without imagery, or Daily without matching over four-band and
eight-band imagery together, fails when run and describes the same bands.

Temporal recipes over a Planet collection - CCDC, Time Series, Phenology, Change Alerts' charts - offer their own
choices: the spectral bands and `ndvi`, `ndwi`, `evi`, `evi2` and `savi` (`TEMPORAL_PLANET_BANDS` in
`modules/gui/src/app/home/body/process/recipe/planetMosaic/bands.js`). Change Alerts' Planet collection mosaic is a
declared product delegating to this declaration.

## Open issues

- **Daily without histogram matching duplicates its spectral bands.** `createCollection`
  (`lib/js/ee/src/planet/collection.js`) adds `addDates(image)`, which already holds the image's bands, to the image,
  so each spectral band is carried twice (`blue_1`...), built by an empty request and computed per image.
- **Daily without histogram matching fails over four-band and eight-band imagery together.** Its median needs one
  schema across the collection; the band metadata reads as the four-band schema, but Earth Engine refuses any pixel
  ("Expected a homogeneous image collection"). With matching, each image is narrowed to four bands first and it runs.
- **Temporal choices differ from the collection's measures.** The choices above omit `kndvi`, which the collection
  computes, and the bands PSB.SD-only Daily imagery carries, both of which CCDC declares among its measures
  (`lib/js/shared/src/recipe/type/ccdc.js`).
- **NICFI's encoding is not stated.** Authoritative documentation of that exact product could justify declaring it;
  the migration deferred it.

## Verification

- `modules/gee/verify/planetMosaicOutputBands.mjs` - on live Earth Engine over synthetic collections in each Planet
  schema run through the real processing, which verifies the algorithm and not ingestion: the catalogue, every
  declared band asked for, the empty requests each branch builds, subsets, working bands asked for, the mixed Daily
  refusal once a pixel is computed, histogram matching for schema only, and each index stored per ten thousand. Real
  NICFI and Daily coverage is blocked without Planet access, and a requested real check fails on it.
- `lib/js/shared/test/recipe/output/type/planetMosaic.test.js` - the declaration per branch, and through Masking and
  Stack.
- `modules/gee/test/jobs/ee/planet/mosaicBands.test.js` - the catalogue, whatever is selected.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js` - the common read, presentation, presets,
  Retrieve's groups and policies, broken dependencies, and Change Alerts' Planet mosaics.
- `modules/gui/src/app/home/body/process/recipe/planetMosaic/planetMosaicOutput.test.js` - Masking and Stack over it.
- `modules/gui/src/sources.test.js` and `modules/gui/src/app/home/body/process/recipe/ccdc/planetTemplates.test.js` -
  the temporal choices and CCDC's presets, unchanged.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js` - the encoding an export records, directly and through Masking.
