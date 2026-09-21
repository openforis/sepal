# Earth Engine verification scripts

Runnable checks against live Earth Engine. They build real Earth Engine graphs, so they need Earth Engine
credentials and are **not** part of `npm test`.

## Why these are not Jest tests

Jest cannot construct `ee.Projection` in this module's environment, so anything building a real Earth Engine
graph cannot run under it. These scripts are evidence, not CI protection: nothing runs them automatically.

## The scripts

| Script | Checks |
| --- | --- |
| `samplingDesignGridInvariants.mjs` | Graph shape - two `reduceToVectors`, one `reproject`, and that the reproject's input subtree reaches the categorical source and never the lattice branch. That the Arrangement CRS moves the lattice. That changing the Stratification pixel size changes membership but never translates the lattice. That both raster arrangements exclude a boundary-coincident point. |
| `randomGridExactness.mjs` | Stratified Random candidates against an independently enumerated exact-point oracle, across same-CRS, cross-CRS, shifted, 1:1 and 2:1 grid fixtures, plus batch export, asset validation and cleanup. |
| `systematicLatticeExactness.mjs` | Stratified Systematic lattice candidates against the same style of oracle, including exact source-pixel corners, isolated one-pixel classes and repair density. |
| `assetPropertyLimits.mjs` | What Earth Engine persists as asset metadata, per write path: value size, property count and aggregate size against an Image asset, an ImageCollection asset, an image export, and a one-feature table export. Runs the raw API and SEPAL's own `replaceAssetProperties$` over the same payloads, so application filtering and server limits can be told apart. Every case is read back through a fresh request and compared key by key. `cleanup` deletes only assets this run created (`EE_PROPS_RUN`), pages through the listing, and reports what it could not establish rather than reporting nothing left. A task that has to be cancelled is reported cancelled only once a terminal state is confirmed; otherwise it is reported unresolved and its destination is left in place. Nothing is deleted - by `cleanup`, or by a case clearing its own destination for a rerun - while Earth Engine reports a task of this run outside a terminal state, or while the task states cannot be established. |
| `bandEncodingPersistence.mjs` | Whether a band encoding larger than one asset property survives a live export and a live collection write, and reads back as the same facts. Uses production's own representation, property writer and reader: `image` exports one tiny image, `collection` writes a collection's properties through `replaceAssetProperties$` and exports one tile, `read` reports what any asset states as this release reads it, and `cleanup` removes only this run's assets, under the same task-state guard, and reports outstanding tasks. |
| `ccdcOutputBandSelection.mjs` | That a live Masking over CCDC, asked for the physical bands of a measure it does not break on, returns exactly those bands in the order named and keeps the mask. Both sample points lie INSIDE the AOI and the unmasked segments are checked valid at both, so clipping cannot be what separates them and only the added mask can. The recipes are held in memory and read through a RecipeScope of the run's own, so nothing is saved and no asset is written; segmentation is evaluated at two points. Read-only, so it does not establish that Earth Engine would accept an export of those bands. |
| `proportionsAreaWeighting.mjs` | The anticipated-proportions `reduceRegion` on real Earth Engine: that every group carries `stratum`, `weighted` and `area`, that both sums match a masked single-sum oracle, that the proportions match integrals of `cos(latitude)` derived independently, and that they are nowhere near the unweighted mean. Runs the production reducer, not a copy. |

## Running

From the bind-mounted `gee` module container:

```
docker exec -w /usr/local/src/sepal/modules/gee gee node verify/samplingDesignGridInvariants.mjs
```

Read-only checks authenticate with the service account. Modes that write an asset read linked-user credentials
from stdin and are selected with an `SD_*`, `EE_PROPS_*` or `EE_ENC_*` environment variable; each script's
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
task of this run is still writing to a destination. Those two are covered by `test/verify/`; the scripts
themselves stay hand-run.

Earth Engine answers a lookup for an asset that is missing and one the caller may not see with the same words,
so a probe carries that answer as `NOT_VISIBLE` and never as absence. A creation attempt may follow it, because
creating cannot overwrite an existing asset; a deletion that ends there is reported as a failure, and the count
of what remains is of what the listing showed, not of what was removed.
