# CLAUDE.md - modules/task

One-shot task runner. task-manager starts one detached container from this image per task; the container runs
that task and exits. It is not a service: nothing listens, and nothing runs inside sandbox sessions.

## Commands

```bash
sepal npm-test task                         # Node test runner
```

To filter tests, put runner options before the test paths: from `modules/task` in dev-env, run
`node --experimental-test-module-mocks --test --test-name-pattern '<regex>' <test-file>`.

## Contract

- Input: `/task/task.json` (`{id, operation, params}`), written by task-manager. Env: `TASK_ID`, `TASK_API_KEY`
  (`task_...`), `SEPAL_ENDPOINT` (`http://gateway`), `USERNAME`, `DEPLOY_ENVIRONMENT`. The user's home is
  bound at `/home/$USERNAME`, the task directory at `/task`.
- Output: `/task/result.json` (`{state, statusDescription}`, state `COMPLETED`, `FAILED` or `CANCELED`),
  written atomically just before exit. The file, not progress, is the authority on how the task ended.
- Network: the container joins only `sepal-task` and talks to the gateway, authenticating with `TASK_API_KEY`
  as Basic auth (empty username). The gateway injects the user; Earth Engine work goes to gee under
  `/api/gee/...`, never directly to Earth Engine.
- Progress: `POST /api/tasks/task/<id>/progress` with `{statusDescription, releasedSlot}`, best-effort, repeated
  every 60 s as a heartbeat. A lost report never fails the task.
- Local processing: downloads into the workspace and time-series stacking run through `LocalProcessing`, which
  holds one of task-manager's slots for the container (`POST /api/tasks/task/<id>/local-processing`, polled
  every 10 s while refused, released with `.../local-processing/release {slot}` after the last step in
  progress). Each grant carries a `slot` naming it; the release names the grant it gives back, and every
  progress report repeats it as `releasedSlot`, so a release that never arrived is made up for within 60 s.
  Steps do not wait for a release.
- Cancel: SIGTERM aborts the `AbortSignal` given to the operation; the operation returns, and the result is
  `CANCELED`.
- Export starts are never retried (`retry: {maxRetries: 0}`).

## Structure

- `src/run.js` - entry point: read task, run it, write result, exit.
- `src/runner/` - `runTask` (outcome mapping), `operations` (operation name to
  `async (params, {sepal, report, signal, localProcessing})`), `SepalClient`, `ProgressReporter`, `failureStatus`, `taskFiles`,
  `exportToWorkspace` (follow an export, `downloadFiles` it into the workspace, clean up), `forEachInParallel`.
- `src/runner/operations/` - task operations: `image.GEE` (image and ImageCollection exports to Earth Engine
  assets), `ccdc.GEE` (CCDC export to Earth Engine assets), `image.DRIVE` (image exports to Google Drive),
  `image.SEPAL` (image exports to the SEPAL workspace), `timeseries.download` (time series downloads to
  the SEPAL workspace), `samplingDesign.GEE` / `samplingDesign.SEPAL` (sampling design exports: gee runs the
  workflow as steps through `task/samplingDesign/step`; the runner follows each export and has gee clean up
  the temporary assets).
- `start.sh` - runs `node src/run.js` as the uid and gid that own the mounted home (`su-exec`).
- Image: `node:26-alpine` with GDAL's tools and Python bindings (`gdalbuildvrt`, band names,
  `sepal-stack-time-series`); nothing from the sandbox images. `NODE_OPTIONS=--max-semi-space-size=1` keeps
  the heap small: without it V8 sizes the young generation from the container's limit and peaks near twice
  the memory.

## Release compatibility

A running task container keeps the image of the release that started it while gee is redeployed, so gee's
`/task/...` endpoints must accept the previous release's requests: add fields, never rename or remove them
within one release.
