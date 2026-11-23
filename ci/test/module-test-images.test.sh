#!/bin/bash
# Tests of the modules' test images as Jenkins builds them: release metadata leaves the GUI and gateway test images
# unchanged while code, library and test changes do not, and test files and tools stay out of production. Builds
# real images from a copy of the build context, with the Docker daemon at hand, in the Jenkins image:
#   ci/test/module-test-images.test.sh [image]    (default: jenkins)
# shellcheck disable=SC2034  # the images are read by the conditions check evaluates
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)

if [[ -z ${IN_JENKINS_IMAGE:-} ]]; then
    exec docker run --rm --volume /var/run/docker.sock:/var/run/docker.sock --volume "$REPO:$REPO:ro" \
        --env IN_JENKINS_IMAGE=1 --user root --entrypoint bash "${1:-jenkins}" "$REPO/ci/test/module-test-images.test.sh"
fi

pass=0; fail=0
ok()  { echo "ok   - $1"; pass=$((pass+1)); }
bad() { echo "FAIL - $1"; echo "        $2"; fail=$((fail+1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1" "${3:-$2}"; fi; }

WORK=$(mktemp -d)
export WORKSPACE=$WORK/workspace TEST_PROJECT=module-test-images-$$ DOCKER_REGISTRY_HOST=module-test-images \
    SEPAL_VERSION=$$ BUILD_NUMBER=1 GIT_COMMIT=aaaaaaa
mkdir "$WORKSPACE"
tar -C "$REPO" --exclude=node_modules -c .dockerignore ci lib/js modules/docker-compose.logger.yml \
    modules/gateway modules/gui modules/worker modules/gee | tar -C "$WORKSPACE" -x
trap '"$WORKSPACE/ci/test-images.sh" clean "$DOCKER_REGISTRY_HOST/openforis/*" > /dev/null' EXIT

function test_image {  # suite → the ID of its test image, built as Jenkins builds it
    "$WORKSPACE/ci/test-images.sh" build "$1" > "$WORK/out" 2>&1 || { tail -20 "$WORK/out" >&2; return 1; }
    docker image inspect --format '{{.Id}}' "$TEST_PROJECT/$1"
    # Nothing is left dangling by the next build
    docker image rm "$TEST_PROJECT/$1" > /dev/null
}

function changes_test_image {  # suite file → whether changing the file changes the suite's test image
    local before after
    before=$(test_image "$1")
    cp "$WORKSPACE/$2" "$WORK/original"
    echo '// changed' >> "$WORKSPACE/$2"
    after=$(test_image "$1")
    cp "$WORK/original" "$WORKSPACE/$2"
    [[ $before != "$after" ]]
}

function production {  # module → its production image, built as Jenkins builds it
    docker compose --file "$WORKSPACE/modules/$1/docker-compose.yml" build --quiet "$1" > "$WORK/out" 2>&1 \
        || { tail -20 "$WORK/out" >&2; return 1; }
    echo "$DOCKER_REGISTRY_HOST/openforis/$1:$SEPAL_VERSION"
}

function has { docker run --rm --entrypoint sh "$1" -c "$2"; }

function env_of { docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1"; }

for suite in gateway gui; do
    first=$(test_image $suite)
    second=$(BUILD_NUMBER=2 GIT_COMMIT=bbbbbbb test_image $suite)
    check "release metadata leaves the $suite test image unchanged" '[[ $first == "$second" ]]'
done
check "a code change changes the gateway test image" 'changes_test_image gateway modules/gateway/src/config.js'
check "a library change changes the gateway test image" 'changes_test_image gateway lib/js/shared/src/log.js'
check "a test change changes the gateway test image" 'changes_test_image gateway modules/gateway/src/authMiddleware.test.js'
check "a code change changes the GUI test image" 'changes_test_image gui modules/gui/src/apps.js'
check "a library change changes the GUI test image" 'changes_test_image gui lib/js/shared/src/log.js'
check "a test change changes the GUI test image" 'changes_test_image gui modules/gui/src/apps.test.js'

gateway=$(BUILD_NUMBER=7 production gateway)
gui=$(BUILD_NUMBER=7 GIT_COMMIT=ccccccc production gui)
check "release metadata still reaches the production images" \
    'env_of "$gateway" | grep -qx BUILD_NUMBER=7 && env_of "$gui" | grep -qx GIT_COMMIT=ccccccc'

"$WORKSPACE/ci/test-images.sh" build worker gee gui > "$WORK/out" 2>&1 || { tail -20 "$WORK/out"; exit 1; }
worker=$(production worker)
gee=$(production gee)
check "development dependencies stay out of production" \
    '! has "$worker" "test -e node_modules/aws-sdk-client-mock" && has "$TEST_PROJECT/worker" "test -e node_modules/aws-sdk-client-mock"'
check "test files stay out of production" \
    '! has "$gee" "test -e test -o -e verify" && has "$TEST_PROJECT/gee" "test -d test -a -d verify"'
check "the GUI's production image serves the build without its sources and tools" \
    'has "$gui" "test -d \$MODULE/dist -a ! -e \$MODULE/node_modules -a ! -e \$MODULE/src" && has "$TEST_PROJECT/gui" "test -e node_modules/vitest"'

# The production image is the default build output: no module's last stage is its test stage
for dockerfile in "$REPO"/modules/*/Dockerfile; do
    if grep -q '^FROM .* AS test$' "$dockerfile"; then
        check "$(basename "$(dirname "$dockerfile")"): the test stage is not the last" \
            '[[ $(grep "^FROM " "$dockerfile" | tail -1) != *" AS test" ]]'
    fi
done

echo "$pass passed, $fail failed"
(( fail == 0 ))
