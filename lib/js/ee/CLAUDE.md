# CLAUDE.md - lib/js/ee

Google Earth Engine JavaScript wrapper library used by `gee` and `task` modules.

## Import Pattern

Consuming modules use two import maps:
- `#sepal/ee/*` maps to this library's `src/*.js`
- `#sepal/*` maps to the shared library

## Key Architecture

- **`ee.js`**: Singleton loader for `@google/earthengine`. Uses `requireOnce()` to ensure single initialization, then applies custom extensions.
- **`extensions/`**: Patches the EE API with custom methods on `ee.Image`, `ee.ImageCollection`, `ee.Number`. These are applied at load time via `require('#sepal/ee/extensions')(ee)`.

## Processing Pipelines

| Directory | Purpose |
|-----------|---------|
| `optical/` | Optical satellite processing: compositing (MEDIAN/MEDOID), cloud/shadow/haze masking, BRDF correction, pan-sharpening, spectral indexes (NDVI, NDMI, EVI, NBR, etc.) |
| `optical/imageProcess/` | Individual processors: `addIndexes`, `addCloud`, `addShadowScore`, `applySentinel2CloudScorePlus`, `applyLandsatCFMask`, `applyBRDFCorrection`, etc. |
| `optical/dataSetSpecs.json` | Band name mappings and specs for Landsat/Sentinel-2 datasets |
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

- **`imageFactory.js`**: Central factory that creates EE images from various sources (recipes, assets, collections). This is the main entry point for image creation in both `gee` and `task` modules.
- **`aoi.js`**: Area of Interest geometry handling - converts various AOI formats to EE geometries.
- **`tile.js`**: Splits AOI into tiles for parallel processing during exports.
- **`eeLimiterService.js`**: Rate limiting for EE API calls to avoid quota issues.
- **`recipeRef.js`**: Handles references between recipes (one recipe can reference another as input).
- **CommonJS**: Uses `require()` / `module.exports`.
- **No tests**: This library does not have its own test suite.
