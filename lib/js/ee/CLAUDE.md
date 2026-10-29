# CLAUDE.md - lib/js/ee

Google Earth Engine JavaScript wrapper used by `gee`, including its task endpoints. Task containers call those endpoints through the gateway; they do not load this library.

## Import Pattern

Consuming modules use two import maps:
- `#sepal/ee/*` maps to this library's `src/*.js`
- `#sepal/*` maps to the shared library

## Key Architecture

- **`ee.js`**: Singleton loader for `@google/earthengine`. Uses `requireOnce()` to ensure single initialization, then applies custom extensions.
- **`extensions/`**: Patches the EE API with custom methods on `ee.Image`, `ee.ImageCollection`, `ee.Number`. These are applied when `ee.js` calls the imported `extensions(ee)` initializer.

## Processing Pipelines

| Directory | Purpose |
|-----------|---------|
| `optical/` | Optical satellite processing: compositing (MEDIAN/MEDOID), cloud/shadow/haze masking, BRDF correction, pan-sharpening, spectral indexes (NDVI, NDMI, EVI, NBR, etc.) |
| `optical/imageProcess/` | Individual processors: `addIndexes`, `addCloud`, `addShadowScore`, `applySentinel2CloudScorePlus`, `applyLandsatCFMask`, `applyBRDFCorrection`, etc. |
| `radar/` | SAR (Sentinel-1) processing |
| `planet/` | Planet basemap/daily/collection integration |
| `timeSeries/` | Multi-temporal analysis |
| `classification/` | Machine learning classification |
| `bayts/` | BAYTS change detection algorithm |
| `classChange/`, `indexChange/` | Change detection methods |
| `regression/` | Time series regression |
| `remapping/` | Class remapping |
| `unsupervisedClassification/` | Clustering |
| `asset/` | Asset-based image/collection handling with masking and filtering |

## Non-Obvious Conventions

- **`imageFactory.js`**: Central factory that creates EE images from various sources (recipes, assets, collections). Interactive and task jobs in `gee` use this entry point.
- **Optical data sets**: band mappings, native encodings and band availability live in the shared library
  (`#sepal/recipe/optical/dataSetSpecs`, `#sepal/recipe/optical/opticalBands`), because the output declaration and
  the GUI answer the same questions execution does. `OPTICAL_STORED_PER_UNIT` (`#sepal/recipe/optical/encoding`)
  is the storage multiplier the optical pipeline applies.
- **`aoi.js`**: Area of Interest geometry handling - converts various AOI formats to EE geometries.
- **`tile.js`**: Splits AOI into tiles for parallel processing during exports.
- **`eeLimiterService.js`**: Rate limiting for EE API calls to avoid quota issues.
- **`recipeRef.js`**: Handles references between recipes (one recipe can reference another as input).
- **ESM**: Native ESM (`"type": "module"`). Most processing modules `export default` a single function; import them with a default import (`import mosaic from './optical/mosaic.js'`). Relative imports include the `.js` extension. `imageFactory.js` keeps lazy, synchronous module loading via `createRequire` (a `load()` helper unwraps `.default`) to defer loading and break circular dependencies.
- **Tests**: this library's tests live in `modules/gee/test/ee/`.

## Transports and request context

Earth Engine requests through `extensions/utils.js` are handed to the installed transport.
The default `LibraryTransport` uses the client library's global credentials and requires one identity per process.
`gee` installs `EERestClient` (`rest/`) through
`EERestRuntime`: the library, initialized once as the service account, only builds requests, and each request is
sent as the `EEContext` (`eeContext.js`) it is subscribed in.

- Under the REST transport an Earth Engine call made outside `inEEContext` fails; it never falls back to the
  service account.
- Asset reads that need the Cloud API record (including `updateTime` and band ranks) use
  `ee.getAssetRecord$`; `ee.getAsset$` returns the legacy shape. Both use the installed transport.
  GEE jobs must not use `ee.$` around client-library calls: it bypasses the installed REST transport and uses the library limiter.
- Never share an observable between requests. A value shared across requests is a plain value or a Promise, so
  each subscriber resumes in its own async context. Work started on unsubscription (cleanup) captures the context
  when the work it cleans up starts, and runs inside it.
- Serialize expressions only with `ee.Serializer.encodeCloudApi`: a `null` constant is a value.
