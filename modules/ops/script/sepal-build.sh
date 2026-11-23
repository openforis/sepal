#!/bin/sh
# Every Jenkins build job runs this from the Jenkins image, not from the branch it builds, so it also
# applies to hotfix branches older than ci/build.py.
set -eu

if [ -f "$WORKSPACE/ci/build.py" ]; then
    set -- python3 "$WORKSPACE/ci/build.py" "$@"
else
    set -- "$WORKSPACE/modules/ops/script/build-and-push-images.sh" "$@"
fi
exec python3 "$(dirname "$0")/registry_maintenance.py" build -- "$@"
