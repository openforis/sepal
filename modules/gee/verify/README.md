# Sampling Design verification scripts

Runnable checks for the Sampling Design grid contracts. They build real Earth Engine graphs, so they need Earth
Engine credentials and are **not** part of `npm test`.

## Why these are not Jest tests

Jest cannot construct `ee.Projection` in this module's environment, so anything building a real Earth Engine
graph cannot run under it. These scripts are evidence, not CI protection: nothing runs them automatically.

## The scripts

| Script | Checks |
| --- | --- |
| `samplingDesignGridInvariants.mjs` | Graph shape - two `reduceToVectors`, one `reproject`, and that the reproject's input subtree reaches the categorical source and never the lattice branch. That the Arrangement CRS moves the lattice. That changing the Stratification pixel size changes membership but never translates the lattice. That both raster arrangements exclude a boundary-coincident point. |
| `randomGridExactness.mjs` | Stratified Random candidates against an independently enumerated exact-point oracle, across same-CRS, cross-CRS, shifted, 1:1 and 2:1 grid fixtures, plus batch export, asset validation and cleanup. |
| `systematicLatticeExactness.mjs` | Stratified Systematic lattice candidates against the same style of oracle, including exact source-pixel corners, isolated one-pixel classes and repair density. |
| `proportionsAreaWeighting.mjs` | The anticipated-proportions `reduceRegion` on real Earth Engine: that every group carries `stratum`, `weighted` and `area`, that both sums match a masked single-sum oracle, that the proportions match integrals of `cos(latitude)` derived independently, and that they are nowhere near the unweighted mean. Runs the production reducer, not a copy. |

## Running

From the bind-mounted `gee` module container:

```
docker exec -w /usr/local/src/sepal/modules/gee gee node verify/samplingDesignGridInvariants.mjs
```

Read-only checks authenticate with the service account. Modes that write an asset read linked-user credentials
from stdin and are selected with an `SD_*` environment variable; each script's `main()` lists its own modes.

Set Earth Engine automatic retries to zero, start one batch task at a time, and confirm a terminal state plus
asset cleanup or intentional retention before starting another.
