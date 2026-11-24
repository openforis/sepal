# Ops builds and registry cleanup

`Sepal-cleanup` runs on Saturdays around 01:00 UTC and can be started manually. It runs the Python
scripts baked into the Jenkins image, even when its `master` checkout predates them. `DRY_RUN` defaults
to true. Its plan and results are saved as `build-logs/registry-cleanup.log` in the build artifacts.

It protects the two latest **distinct** deployed builds of prod and test and the three latest builds
of each build job, including hotfix and weekly jobs. Expected images come from each build's own commit
(the existing build script's push list, or `deps.json` when it declares `ci: push`). Wholly absent builds
protect nothing; a partly present protected build blocks deletion. Both environments must have two
complete deployed builds before deletion is allowed. Shared manifests and every child of a protected
image index are retained. Only the `openforis/` namespace is cleaned.

Builds, cleanup and startup recovery share a lock in the Jenkins volume. Cleanup publishes the remote
Git tag `maintenance/registry-cleanup` before checking for active image consumers. Updated `bin/deploy`
creates a `deploying/<environment>/<UTC timestamp>/<build>/<nonce>` tag before deployment, rollout, provisioning
or an explicit worker AMI build. Each side writes its marker before checking the other's. Failed Git
reads or writes stop the operation. Marker age never permits deletion.
Each consumer has its own nonce, even when starting at the same instant for the same build. Legacy
markers without a nonce still block cleanup. `bin/deploy --wait` waits for the build's remote tag
before acquiring protection; no image-consuming work starts before the marker handshake succeeds.

Cleanup skips while any `deploying/` marker exists. When applying a valid plan it deletes unprotected
manifests, stops the registry, runs garbage collection in its own `registry-gc` container, then removes
that container and restarts the registry. It never uses `--delete-untagged`. Unprotected children are
deleted before their parent index, so an interrupted deletion can be finished on the next run.
Stale tags of retained shared manifests are removed by tag, without deleting their image.
See [Distribution's garbage-collection guidance](https://distribution.github.io/distribution/about/garbage-collection/).

Pulls and pushes are unavailable during garbage collection; running SEPAL services keep running.
Cancellation restores the registry. A killed job is repaired at Jenkins startup or before the next
build or cleanup. Recovery confirms GC is gone and the registry answers `/v2/` before removing the
cleanup marker. Recovery also runs for older hotfix build scripts.

Deployments are still executed from the selected build's sources. The current checkout wraps the old
script and owns protection until it succeeds and the remote deployment record is confirmed. Failed
or interrupted runs leave their marker for manual review. Successful provisioning/AMI builds remove
their marker without creating a deployment record. Run these operations through `bin/deploy`.

## Build console and logs

Build scripts from the checked-out branch provide the console feedback; changing them needs a push, not an ops
redeploy. The deployed Jenkins image supplies the colour and collapsing-section plugins and artifact archiving.
The console names sandbox installers, cache reuse, completion times and the current substep during GPU and R
setup. Package-load checks report counts periodically. Quiet substeps still report elapsed time, and clipped
BuildKit output produces a warning. Command exit status determines success; compiler and test output stays in
the diagnostic log, with a bounded excerpt shown on failure.

R installation omits R's interpreter banners, echoed R expressions and Make's echoed commands. The installer
section banners remain consistent with other installers for dev-env builds. Package progress, compiler warnings
and errors remain in the diagnostic log; R's blanket `quiet=TRUE` is not used.
The ops Docker daemon disables BuildKit's per-step size and rate limits so output reaches that log intact.
This setting is installed as `/etc/systemd/system/docker.service.d/buildkit-logs.conf` and requires an ops
redeploy and Docker restart, with no build running. Changing the installer itself only requires a push.
After deployment, `systemctl show docker --property=Environment` must include both
`BUILDKIT_STEP_LOG_MAX_SIZE=-1` and `BUILDKIT_STEP_LOG_MAX_SPEED=-1`.
`docker exec jenkins docker buildx inspect` should report `Driver: docker`; a separately configured
`docker-container` builder would need those variables on its own BuildKit daemon instead.

The live-log directory link at the start of a build serves the workspace's `build-logs/<build-number>/` files.
Those paths identify the build: the next build removes them instead of reusing them. The `Full log:` links point
to build artifacts, available once Jenkins archives the logs at build completion, including failure
and cancellation. The latest 20 builds retain their artifacts.

Console checks: `python3 -m unittest discover -s ci/test -p '*_test.py'`. The Docker integration check uses only
its own disposable daemon: `bash ci/test/test-images.test.sh <jenkins-image>`.

## Rollout

1. Review and deploy the ops image. Do not repeat the one-time registry reset.
2. Update **every** checkout used for deployment and AMI builds. An older outer `bin/deploy` cannot
   coordinate, even when the build it selects is newer.
3. Run `Sepal-cleanup` with `DRY_RUN` checked. Check the retained builds and proposed deletions in its
   artifact. Observe scheduled dry runs before enabling deletion.
4. Only then clear `DRY_RUN` for a manual run. Missing deployment history or incomplete protected
   images still forces a dry run. Check retained images still pull and check disk usage afterwards.
   Scheduled runs stay dry until the job's seeded default is explicitly changed and ops redeployed.

An old `deploying/` marker requires checking the corresponding operation before removing its exact
remote tag. Cleanup never expires it. For a stale cleanup marker, run `Sepal-cleanup` in dry-run mode;
its recovery restores the registry before clearing the marker. If recovery fails, leave the marker
and inspect the job log. Never start the registry while GC is running.

Checks: `python3 -m unittest discover -s modules/ops/test -p '*_test.py'` and
`bash modules/ops/test/sepal-build.test.sh`. The Docker integration check uses a private disposable
Docker daemon: `bash modules/ops/test/registry-cleanup.test.sh <jenkins-image>`. No test should target
the ops registry or a shared Git remote. Deployment launchers require Python 3.9 or newer.
