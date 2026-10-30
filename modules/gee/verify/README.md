# Earth Engine verification scripts

Runnable checks against live Earth Engine. They build real Earth Engine graphs, so they need Earth Engine
credentials and are **not** part of `npm test`.

These hand-run probes are outside CI; a previous run is not regression protection.

## The scripts

Script assertions own the full fixture matrix; this index states scope and material limits.

| Script | Checks |
| --- | --- |
| [samplingDesignGridInvariants.mjs](samplingDesignGridInvariants.mjs) | Graph shape, one categorical reproject, lattice independence and exclusive raster AOI-edge ties. |
| [randomGridExactness.mjs](randomGridExactness.mjs) | Random candidates versus an exact-point oracle across CRS/alignment fixtures; optional batch export, validation and cleanup. |
| [systematicLatticeExactness.mjs](systematicLatticeExactness.mjs) | Systematic exact points/classes/masks, negative indices, pixel corners, isolated classes and repair density. |
| [assetPropertyLimits.mjs](assetPropertyLimits.mjs) | Per-path metadata size/count limits, fresh readback, application filtering, task cancellation and guarded cleanup. |
| [bandEncodingPersistence.mjs](bandEncodingPersistence.mjs) | Production multipart encoding through image export/collection writes, readback, rewrite and guarded cleanup. |
| [ccdcOutputBandSelection.mjs](ccdcOutputBandSelection.mjs) | Masking over CCDC: physical-band order and mask preservation at valid in-AOI points. No export is submitted. |
| [declaredOutputBands.mjs](declaredOutputBands.mjs) | Catalogue versus explicit/full/subset/default output for CCDC count, Change Alerts and BAYTS map modes. |
| [assetCollectionSchema.mjs](assetCollectionSchema.mjs) | One-contributing-image schema versus full composites, arrays, heterogeneous filtered collections, empty windows and bounds-free discovery. |
| [classificationOutputBands.mjs](classificationOutputBands.mjs) | Classification/Remapping names, order, scalar shape, explicit selection and bounded footprints; missing legends/input bands. |
| [classifierNormalisation.mjs](classifierNormalisation.mjs) | Independent whole-row feature oracle; training reuse, case ambiguity, normalization, masks, footprints and pixel predictions. Empty comparisons fail. |
| [classChangeConfidence.mjs](classChangeConfidence.mjs) | Synthetic transition/confidence values and masks, incomplete probability bands and ordered legend codes. Requires module mocks. |
| [landTrendrOutputBands.mjs](landTrendrOutputBands.mjs) | Change-product schema and explicit/subset/default selection. Schema only. |
| [landTrendrAnnualMosaicBands.mjs](landTrendrAnnualMosaicBands.mjs) | Annual-product delegation, year/default behavior and indexes versus working bands. Schema only. |
| [baytsAlertsOutputBands.mjs](baytsAlertsOutputBands.mjs) | Initial/continued alerts schema, map filters and explicit/subset order. In-memory references; schema only, no alert pixels. |
| [baytsAlertsRadarObservation.mjs](baytsAlertsRadarObservation.mjs) | First/last radar product schema and independently catalogued nearest-date/orbit samples. Historical-asset masking lacks an accessible fixture. |
| [changeAlertsOutputBands.mjs](changeAlertsOutputBands.mjs) | Alert schema through optical/radar/Masking references and period refusals. No Planet/segments-asset coverage; schema only. |
| [changeAlertsCollectionMosaic.mjs](changeAlertsCollectionMosaic.mjs) | Optical/radar map-product schema and nearest-date samples. Planet execution and segments-asset reference are blocked by fixture access. |
| [radarMosaicOutputBands.mjs](radarMosaicOutputBands.mjs) | Both mosaic schemas, order, harmonic subsets, missing dates and native-grid pixel/mask equivalence with/without harmonics. |
| [bandMathGeometry.mjs](bandMathGeometry.mjs) | First-input boundary, full/single outputs, interior pixels/masks/projections and clipping edges. Public SRTM; no writes. |
| [bandMathOutputBands.mjs](bandMathOutputBands.mjs) | Declared/observed schema, selection order, arrays/reducers/casts, missing inputs, duplicate names and one scalar pixel. |
| [stackOutputBands.mjs](stackOutputBands.mjs) | Mapped order, renames, repeated sources, inherited array/scalar facts, invalid mappings and one scalar pixel. |
| [planetMosaicOutputBands.mjs](planetMosaicOutputBands.mjs) | Synthetic basemap/Daily schemas and index encoding; mixed-member failure. Matching is schema-only. Optional real ingestion needs Planet access. |
| [baytsHistoricalOutputBands.mjs](baytsHistoricalOutputBands.mjs) | Per-pass schema/statistics, filtering, absent-pass masking/refusal and downstream alert equivalence on a common grid. |
| [timeSeriesOutputBands.mjs](timeSeriesOutputBands.mjs) | Optical/radar count schema and independently counted valid first-band pixels. No Planet coverage; unknown-band/no-scene results are observations. |
| [phenologyPyeoOutputBands.mjs](phenologyPyeoOutputBands.mjs) | Phenology schema/month masks, median values and grids; synthetic PyEO report schema with/without index gate, not alert correctness. |
| [proportionsAreaWeighting.mjs](proportionsAreaWeighting.mjs) | Production reducer sums and area-weighted proportions versus masked-sum and latitude-integral oracles. |
| [restTransport.mjs](restTransport.mjs) | Request-context transport, tile serving, metadata/listings and refusal messages; optional linked-user computation. |
| [remappingSourceBands.mjs](remappingSourceBands.mjs) | Used/unused missing selections through assets, Stack and Asset recipes, including downstream Remapping. |
| [filteredCollectionEvidence.mjs](filteredCollectionEvidence.mjs) | Diagnostic of filtered versus unfiltered heterogeneous collection reads. Reports observations, not a pass/fail gate; `EE_FILTER_SERVICE_ACCOUNT=1` or stdin credentials. |

## Running

From the bind-mounted `gee` module container:

```
docker exec -w /usr/local/src/sepal/modules/gee gee node verify/samplingDesignGridInvariants.mjs
```

Most read-only gates use the configured service account; diagnostic/probe exceptions are noted above.
Modes that write an asset normally read linked-user credentials from stdin and are selected with an `SD_*`, `EE_PROPS_*` or `EE_ENC_*` environment variable; each script's
`main()` lists its own modes. Credentials arrive on stdin as one line of JSON - never as an argument or an
environment variable.

`bandEncodingPersistence.mjs` is controlled by:

| Variable | Default | Effect |
| --- | --- | --- |
| `EE_ENC_MODE` | `plan` | `plan`, `image`, `collection`, `rewrite`, `read` or `cleanup` |
| `EE_ENC_ASSET` | - | the asset `read` reports on; required by that mode |
| `EE_ENC_RUN` | `run1` | names this run's assets and tasks, and is what cleanup deletes by |
| `EE_ENC_NAMESPACE` | `sepal_band_encoding_persistence` | the scratch folder under the project's assets |
| `EE_ENC_MEASURES` | `24` | Slice measures behind the payload, which sets how many bands are encoded |
| `EE_ENC_SERVICE_ACCOUNT` | - | `1` authenticates with the service account instead of reading stdin |
| `EE_ENC_TASK_TIMEOUT_MS` | `900000` | how long a task may run before cancellation is requested |
| `EE_ENC_CANCEL_CONFIRM_MS` | `120000` | how long a terminal state is awaited after that request |

Set Earth Engine automatic retries to zero, start one batch task at a time, and confirm a terminal state plus
asset cleanup or intentional retention before starting another.

Authentication establishes the client and nothing else. Only a mode that writes fixtures provisions a scratch
folder, so reading, inspecting and cleaning up need no permission to create one.

`probeRun.mjs` and `eeFailures.mjs` hold what the two metadata probes share: how a mode is selected and what it
may create, what an Earth Engine refusal means, and when a run may delete what it created. Cleanup and reruns
are fresh processes, so the operation listing - every page of it - is the only thing that can say whether a
task of this run is still writing to a destination. `pixelComparison.mjs` judges a pixel-by-pixel comparison of
two images read from Earth Engine: identical, different, or - without a finite number for every band and pixels
valid in both - neither. These helpers and the whole-row comparison in `featureRows.mjs` are covered by
`test/verify/`; the scripts themselves stay hand-run.

Earth Engine answers a lookup for an asset that is missing and one the caller may not see with the same words,
so a probe carries that answer as `NOT_VISIBLE` and never as absence. A creation attempt may follow it, because
creating cannot overwrite an existing asset; a deletion that ends there is reported as a failure, and the count
of what remains is of what the listing showed, not of what was removed.
