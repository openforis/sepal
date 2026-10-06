# CLAUDE.md - modules/task

One-shot task runner. task-manager starts one detached container from this image per task; the container runs
that task and exits. It is not a service: nothing listens, and nothing runs inside sandbox sessions.

## Commands

```bash
sepal npm-test task                         # Jest (needs the Earth Engine library; raw `npm test` fails some suites)
sepal npm-test task -- --testPathPatterns runner
```

## Contract

- Input: `/task/task.json` (`{id, operation, params}`), written by task-manager. Env: `TASK_ID`, `TASK_API_KEY`
  (`task_...`), `SEPAL_ENDPOINT` (`http://gateway`), `USERNAME`, `DEPLOY_ENVIRONMENT`. The user's home is
  bound at `/home/$USERNAME`, the task directory at `/task`.
- Output: `/task/result.json` (`{state, statusDescription}`, state `COMPLETED`, `FAILED` or `CANCELED`),
  written atomically just before exit. The file, not progress, is the authority on how the task ended.
- Network: the container joins only `sepal-task` and talks to the gateway, authenticating with `TASK_API_KEY`
  as Basic auth (empty username). The gateway injects the user; Earth Engine work goes to gee under
  `/api/gee/...`, never directly to Earth Engine.
- Progress: `POST /api/tasks/task/<id>/progress` with `{statusDescription}`, best-effort, repeated every
  60 s as a heartbeat. A lost report never fails the task.
- Cancel: SIGTERM aborts the `AbortSignal` given to the operation; the operation returns, and the result is
  `CANCELED`.
- Export starts are never retried (`retry: {maxRetries: 0}`).

## Structure

- `src/run.js` - entry point: read task, run it, write result, exit.
- `src/runner/` - `runTask` (outcome mapping), `operations` (operation name to
  `async (params, {sepal, report, signal})`), `SepalClient`, `ProgressReporter`, `failureStatus`, `taskFiles`,
  `exportToWorkspace` (follow an export, `downloadFiles` it into the workspace, clean up), `forEachInParallel`.
- `src/runner/operations/` - task operations: `image.GEE` (image and ImageCollection exports to Earth Engine
  assets), `ccdc.GEE` (CCDC export to Earth Engine assets), `image.DRIVE` (image exports to Google Drive),
  `image.SEPAL` (image exports to the SEPAL workspace), `timeseries.download` (time series downloads to
  the SEPAL workspace).
- `start.sh` - creates the user matching the home owner and runs `node src/run.js` as that user.

Remaining old sources under `src/tasks/samplingDesign`, `src/jobs`, `src/ee`, `drive.js`, `cloudStorage*.js`,
`context.js` implement the sampling-design path using the old in-session executor model and are not yet ported
to the runner. `src/sessionAuth.js` remains only for `src/recipeReader.js`.
