#!/bin/bash
# The real registry and recovery checks run only against a private Docker daemon.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
daemon=ops-check-registry-cleanup-$$
trap 'docker rm --force --volumes "$daemon" > /dev/null; docker volume rm "$daemon" > /dev/null' EXIT
docker volume create "$daemon" > /dev/null
docker run --detach --privileged --name "$daemon" --volume "$daemon:/var/run" \
    docker:25.0-dind dockerd --host=unix:///var/run/docker.sock > /dev/null
docker run --rm --network "container:$daemon" --volume "$daemon:/var/run" --volume "$REPO:$REPO:ro" \
    --env OPS_REGISTRY_FIXTURE=1 --user root --entrypoint python3 "${1:-jenkins}" \
    "$REPO/modules/ops/test/registry_cleanup_integration.py"
