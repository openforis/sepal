# LandTrendr

Segments a yearly index series over an area with Earth Engine's LandTrendr (`lib/js/ee/src/timeSeries/landTrendr.js`) and
maps the greatest change: its year, magnitude and duration, the fitted values before and after it, the fit's error and
its significance (`LANDTRENDR_BANDS`, `lib/js/shared/src/recipe/type/landTrendr.js`). A layer can show an annual mosaic
instead: an Optical Mosaic of one year over the same data sets and options. Its pixel chart plots a pixel's yearly series
and fit.

## Inputs

`aoi` bounds the series, and `dates` its years (`startYear`, `endYear`). `sources` hold the optical `dataSets`, the
`cloudPercentageThreshold` and the `index` segmented. `options` (PRC) process the collection: their corrections decide
TOA or SR. `landTrendrOptions` configure the fit.

New recipes start with Landsat 9, 8, 7 and TM, NBR and SR (`defaultModel`, `landTrendr/landTrendrRecipe.js`). A saved
recipe is never migrated on opening.

### Sources

Execution builds the series from the shared collection (`getCollection$`, with `bands: [index]`). It intersects the bands
of every chosen data set, whatever the dates, then filters scenes to the years.

Four configuration requirements, declared in `type/landTrendr.js`, refuse the change map (IMAGE_OUTPUT):

- **`MISSING_DATA_SETS`**, at `sources.dataSets`: no data set is chosen, whether saved as an empty object, as empty
  lists, as null or not at all.
- **`NO_PERIOD_OVERLAP`**, at `sources.dataSets`: no chosen data set's catalogue years overlap `startYear` to `endYear`,
  as the shared [data-set availability](../design/recipes/data-sources.md#data-set-availability) judges them. Landsat
  TM, in Tier 1 and Tier 2, covers 1982 to 2012.
- **`MISSING_INDEX`**, at `sources.index`: no index is chosen, a blank one included.
- **`UNSUPPORTED_COLLECTION_BANDS`**, at `sources.index` (`collectionBandRequirement`): the collection the data sets and
  PRC configure cannot compute a chosen index; a blank one is missing, not judged. This is judged over every chosen
  data set, as execution intersects them. A Sentinel-2 kept in a 1985 to 1995 series contributes no scenes but removes
  `thermal`, so EBBI is refused until Sentinel-2 is removed or another index chosen.
  - **Why.** Where the index table (`REQUIRED_BANDS_BY_INDEX`, `optical/opticalBands.js`) declares inputs some chosen
    data sets lack, as the corrections leave them, the finding names those inputs and data sets (`missingInputs`,
    `missingIndexInputs`). A native band saved as the index has no such explanation.
  - **Repair by removal.** Those data sets are `removable` only where the Sources left would meet the requirements above:
    a data set remains, one may cover the years, and the index is carried. Sentinel-2 alone, or beside only Landsat TM in
    a 2016 to 2020 series, is not repaired by removing it.

Preview and Retrieve are held for these, and Retrieve's server export refuses them before building anything. The annual
mosaic reads no index and is asked for a year of its own, so it is not held. The pixel chart is not gated, and neither
preview nor the chart is checked on the server ([server preview readiness](../design/workplan.md#server-preview-readiness)).

The Sources panel binds the same rules (`landTrendr/sourcesRequirements.js`):

- **Drafts.** A draft is judged against the dates and PRC applied, and one refused cannot be applied, by Apply or
  Enter. A Dates or PRC Apply that leaves the Sources unsound is allowed. It marks the Sources toolbar button until
  Sources are repaired.
- **Messages.** A missing value is said in the words of the form's own required rule, once (`inputFeedback.js`). A value
  saved missing is said as the panel opens. An index the data sets cannot compute names its missing inputs and the data
  sets lacking them: "EBBI requires the Thermal band, which Sentinel-2 does not provide." It then suggests removing those
  data sets where they are `removable`, and otherwise another index or data sets that provide the inputs. Anything else
  they cannot provide, such as a native band, is said without a cause, suggesting another index: processing might
  repair one native band, and data sets another.
- **Index choices.** The panel offers the indexes the configured collection computes (`collectionIndexes`), in the
  index table's order and named in capitals, never a native or tasseled-cap band. The chosen index stays shown as
  chosen and is never replaced; while no data set is chosen, it stays chosen. A native band saved programmatically as
  the index is shown the same way, and runs where the data sets carry it, as execution reads it by name.
- **Data-set choices.** As for every date-filtered Sources
  ([data-set availability](../design/recipes/data-sources.md#data-set-availability)): one the years exclude cannot be
  chosen anew, and one chosen stays chosen until removed, its tooltip giving the years it holds imagery for.
- **Opening.** An untouched opening, and the panel rendering again, change neither the draft nor the model. Data sets
  saved null or not at all open as none chosen, and a blank index as none chosen, until the user chooses.


## Verification

- `lib/js/shared/test/recipe/output/type/landTrendr.test.js` and `test/recipe/collectionBands.test.js`: each
  requirement and its location, overlap at the catalogue years' edges, the index judged over a data set the dates
  exclude, the annual mosaic not held, and the index projection. Also the missing inputs and when removal repairs them,
  including an index declared for the test alone, a data-set group saved as a single identifier, and native bands,
  with no inputs named.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js`: the export refused for each requirement before
  anything is built, and exported once the Sources can be built.
- `modules/gui/src/app/home/body/process/recipe/landTrendr/sourcesRequirements.test.jsx`, through the root, toolbar and
  Sources panel:
  - untouched opening of valid, incompatible, date-excluded, index-less, blank-index and empty, null or absent
    data-set configurations;
  - temporarily emptied data sets;
  - data-set changes, with Apply and Enter refused;
  - repair through Sources, Dates and another index, and Cancel;
  - the index choices for each data-set family;
  - native bands saved as the index;
  - the missing-input messages in English, with and without removal, and the native-band message;
  - the held operations.
