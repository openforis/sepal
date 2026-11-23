#!/bin/bash
# Tests of ci/test-images.sh and modules/ops/script/build-and-push-images.sh with fixture modules, against a
# disposable Docker daemon and registry. Runs in the Jenkins image, with the tools builds use:
#   ci/test/test-images.test.sh [image]    (default: jenkins)
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)

if [[ -z ${IN_FIXTURE_DAEMON:-} ]]; then
    daemon=sepal-ci-test-$$
    trap 'docker rm --force --volumes "$daemon" > /dev/null; docker volume rm "$daemon" > /dev/null' EXIT
    docker volume create "$daemon" > /dev/null
    docker run --detach --privileged --name "$daemon" --volume "$daemon:/var/run" \
        docker:25.0-dind dockerd --host=unix:///var/run/docker.sock > /dev/null
    docker run --rm --network "container:$daemon" --volume "$daemon:/var/run" --volume "$REPO:$REPO:ro" \
        --env IN_FIXTURE_DAEMON=1 --user root --entrypoint bash "${1:-jenkins}" "$REPO/ci/test/test-images.test.sh"
    exit
fi

pass=0; fail=0
ok()  { echo "ok   - $1"; pass=$((pass+1)); }
bad() { echo "FAIL - $1"; echo "        $2"; fail=$((fail+1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1" "${3:-$2}"; fi; }

BUILD_SCRIPT=modules/ops/script/build-and-push-images.sh
WORK=$(mktemp -d)
for _ in $(seq 100); do docker version > /dev/null 2>&1 && break; sleep 0.2; done
docker pull --quiet alpine:3 > /dev/null
docker pull --quiet registry:3 > /dev/null
docker run --detach --publish 127.0.0.1:5000:5000 registry:3 > /dev/null

# A workspace with a fixture module for each module the build script names, and fixture checks; email, budget
# (which needs mysql) and the shell check are the suites of its test configuration
function workspace {
    WORKSPACES=$((${WORKSPACES:-0} + 1))
    WORKSPACE=$WORK/workspace-$WORKSPACES; export WORKSPACE
    mkdir -p "$WORKSPACE/ci" "$WORKSPACE/modules/ops/script"
    cp "$REPO/ci/test-images.sh" "$WORKSPACE/ci/"
    cp "$REPO/$BUILD_SCRIPT" "$WORKSPACE/$BUILD_SCRIPT"
    for module in $(awk '$1 ~ /^(build|push|start|restart)$/ && NF == 2 {print $2}' "$REPO/$BUILD_SCRIPT" | sort -u); do
        mkdir -p "$WORKSPACE/modules/$module"
        echo "$module" > "$WORKSPACE/modules/$module/content"
        suite "$module" 'exit 0'
        printf '%s\n' 'FROM alpine:3 AS production' "COPY modules/$module/content /content" \
            'FROM production AS test' "COPY modules/$module/test /test" 'CMD ["sh", "/test"]' \
            'FROM production' 'ARG BUILD_NUMBER' 'ENV BUILD_NUMBER=$BUILD_NUMBER' > "$WORKSPACE/modules/$module/Dockerfile"
        cat > "$WORKSPACE/modules/$module/docker-compose.yml" <<EOF
services:
  $module:
    build:
      context: ../..
      dockerfile: ./modules/$module/Dockerfile
      args: {BUILD_NUMBER: "\${BUILD_NUMBER:-}"}
    image: "\${DOCKER_REGISTRY_HOST:-localhost}/openforis/$module:\${SEPAL_VERSION:-latest}"
    command: ["sleep", "3600"]
EOF
    done
    sed -i 's|image: .*|image: "openforis/sandbox-base:latest"|' "$WORKSPACE/modules/sandbox-base/docker-compose.yml"
    # Like SEPAL's MySQL image: no release metadata, and it marks itself initialized
    printf '%s\n' 'FROM alpine:3' 'COPY modules/mysql/content /content' \
        'CMD ["sh", "-c", "mkdir -p /data && touch /data/module_initialized && exec sleep 3600"]' \
        > "$WORKSPACE/modules/mysql/Dockerfile"
    printf '%s\n' 'FROM alpine:3 AS check' 'COPY ci/check-test /test' 'CMD ["sh", "/test"]' \
        'FROM check AS lib-js-shared' 'FROM check AS lib-python-shared' 'FROM check AS deploy-scripts' 'FROM check AS shell' \
        > "$WORKSPACE/ci/checks.dockerfile"
    echo 'echo "check ran"' > "$WORKSPACE/ci/check-test"
    cat > "$WORKSPACE/ci/tests.yml" <<'EOF'
x-suite: &suite
  profiles: [suite]
  pull_policy: never
services:
  mysql:
    image: "${DOCKER_REGISTRY_HOST:-localhost}/openforis/mysql:${SEPAL_VERSION:-latest}"
    pull_policy: never
    healthcheck: {test: ["CMD", "true"], interval: 1s}
  email:
    <<: *suite
    image: "${COMPOSE_PROJECT_NAME}/email"
  budget:
    <<: *suite
    image: "${COMPOSE_PROJECT_NAME}/budget"
    depends_on: {mysql: {condition: service_healthy}}
  shell:
    <<: *suite
    image: "${COMPOSE_PROJECT_NAME}/shell"
    build: {context: .., dockerfile: ci/checks.dockerfile, target: shell}
EOF
    export TEST_PROJECT=project-$WORKSPACES TEST_RECORD=$WORKSPACE/record SEPAL_VERSION=1 \
        DOCKER_REGISTRY_HOST=localhost:5000 BUILD_NUMBER=1
}

function suite { echo "echo '$1 suite ran'; $2" > "$WORKSPACE/modules/$1/test"; }

function build_mysql { docker compose --file "$WORKSPACE/modules/mysql/docker-compose.yml" build --quiet; }

function helper { "$WORKSPACE/ci/test-images.sh" "$@"; }

# The tests of a build of the fixture workspace: those needing no MySQL, then budget, then the record
function run_tests {
    { helper begin && helper run shell email && helper run budget && helper complete && helper record; } > "$WORK/out" 2>&1
}

# The suites the last run ran, by their results
function ran { awk '/^[a-z-]+: (passed|FAILED) in [0-9]+ s$/ {sub(":", "", $1); print $1}' "$WORK/out" | sort | xargs; }

function recorded { cut -d' ' -f1 "$1" | sort | xargs; }

function project_resources {
    docker ps --all --quiet --filter "label=com.docker.compose.project=$1"
    docker network ls --quiet --filter "label=com.docker.compose.project=$1"
    docker volume ls --quiet --filter "label=com.docker.compose.project=$1"
    docker image ls --quiet "$1/*"
}

workspace
status=0; { helper begin && helper run shell email; } > "$WORK/out" 2>&1 || status=$?
check "suites without services run before MySQL is built" '[[ $status == 0 && $(ran) == "email shell" ]]' \
    "status $status, ran: $(ran): $(tail -3 "$WORK/out")"
status=0; helper run budget > "$WORK/out" 2>&1 || status=$?
check "a suite whose service image is missing fails without running" '[[ $status != 0 && -z $(ran) ]]' \
    "status $status, ran: $(ran)"

build_mysql
status=0; run_tests || status=$?
check "without a record, every suite runs and passing records them all" \
    '[[ $status == 0 && $(ran) == "budget email shell" && $(recorded "$TEST_RECORD") == "budget email shell" ]]' \
    "status $status, ran: $(ran), recorded: $(recorded "$TEST_RECORD"): $(tail -3 "$WORK/out")"

status=0; run_tests || status=$?
check "unchanged suites do not run again, and the record keeps them all" \
    '[[ $status == 0 && -z $(ran) && $(recorded "$TEST_RECORD") == "budget email shell" ]]' \
    "status $status, ran: $(ran), recorded: $(recorded "$TEST_RECORD")"

status=0; BUILD_NUMBER=2 run_tests || status=$?
check "release metadata leaves test images unchanged" '[[ $status == 0 && -z $(ran) ]]' "status $status, ran: $(ran)"

suite email 'echo changed'
status=0; run_tests || status=$?
check "a changed test input runs only its suite" '[[ $status == 0 && $(ran) == email ]]' "status $status, ran: $(ran)"

echo changed > "$WORKSPACE/modules/mysql/content"; build_mysql
status=0; run_tests || status=$?
check "a changed service image runs the suites that use it" '[[ $status == 0 && $(ran) == budget ]]' \
    "status $status, ran: $(ran)"

echo '# changed' >> "$WORKSPACE/ci/tests.yml"
status=0; run_tests || status=$?
check "changed test configuration runs every suite" '[[ $status == 0 && $(ran) == "budget email shell" ]]' \
    "status $status, ran: $(ran)"

cp "$TEST_RECORD" "$WORK/record-before"
echo 'exit 1' > "$WORKSPACE/ci/check-test"; suite email 'echo changed again'; suite budget 'echo changed'
status=0; run_tests || status=$?
check "a failing suite stops the tests: no later suite runs" '[[ $status != 0 && $(ran) == shell ]]' \
    "status $status, ran: $(ran)"
check "a failed run leaves the record alone" 'cmp -s "$TEST_RECORD" "$WORK/record-before"'

echo 'echo "check ran"' > "$WORKSPACE/ci/check-test"
status=0; { helper begin && helper run shell email && helper complete; } > "$WORK/out" 2>&1 || status=$?
check "tests that leave a suite untested do not complete" \
    '[[ $status != 0 ]] && grep -q "Not tested in this build: budget" "$WORK/out"' "status $status: $(tail -3 "$WORK/out")"
status=0; { helper begin && helper run shell email budget email && helper complete; } > "$WORK/out" 2>&1 || status=$?
check "tests that test a suite twice do not complete" \
    '[[ $status != 0 ]] && grep -q "Tested more than once in this build: email" "$WORK/out"' \
    "status $status: $(tail -3 "$WORK/out")"

rm "$TEST_RECORD"; mkdir "$TEST_RECORD"
status=0; { helper begin && helper run shell email budget; } > "$WORK/out" 2>&1 || status=$?
check "an unreadable record runs every suite" '[[ $status == 0 && $(ran) == "budget email shell" ]]' \
    "status $status, ran: $(ran)"

docker tag alpine:3 fixture-ci/unused:1; docker tag alpine:3 fixture-ci/also-unused:1
printf '%s\n' 'FROM alpine:3' 'LABEL used=yes' | docker build --quiet --tag fixture-ci/used:1 - > /dev/null
docker tag fixture-ci/used:1 fixture-ci/used:2
docker tag alpine:3 fixture-other/kept:1
docker run --detach --label com.docker.compose.project=other fixture-ci/used:1 sleep 3600 > /dev/null
docker volume create --label com.docker.compose.project=other other-volume > /dev/null
status=0; helper clean 'fixture-ci/*' > "$WORK/out" 2>&1 || status=$?
check "cleanup removes the project's containers, networks, volumes and test images" \
    '[[ $status == 0 && -z $(project_resources "$TEST_PROJECT") ]]' \
    "status $status, left: $(project_resources "$TEST_PROJECT" | xargs): $(tail -3 "$WORK/out")"
check "cleanup removes the matching images no container uses" \
    '! docker image inspect fixture-ci/unused:1 fixture-ci/also-unused:1 > /dev/null 2>&1'
check "cleanup keeps images in use, other images and other projects" \
    'docker image inspect fixture-ci/used:1 fixture-ci/used:2 fixture-other/kept:1 > /dev/null && [[ $(project_resources other | wc -l) == 2 ]]'

workspace
printf '%s\n' 'services:' '  mysql: {image: alpine:3}' > "$WORKSPACE/ci/tests.yml"
status=0; helper begin > "$WORK/out" 2>&1 || status=$?
check "a configuration without suites fails" \
    '[[ $status != 0 ]] && grep -q "Cannot find the test suites" "$WORK/out"' "status $status: $(tail -3 "$WORK/out")"

# The build script, as Jenkins runs it, with the suites and services of the real test configuration
JENKINS=(JENKINS_HOME="$WORK/jenkins" JOB_NAME=Sepal-test REGISTRY_API_URL=http://localhost:5000
    DOCKER_REGISTRY_USERNAME=user DOCKER_REGISTRY_PASSWORD=password GIT_COMMIT=0123abc)
function jenkins_build { env "${JENKINS[@]}" "$WORKSPACE/$BUILD_SCRIPT" "$1" > "$WORK/out" 2>&1; }

function build_images {
    docker image ls --format '{{.Repository}}' --filter 'reference=localhost:5000/openforis/*' \
        --filter reference=openforis/sandbox-base | sort | xargs
}

function pushed {  # version → the pushed modules the registry serves under it
    local module
    for module in $(awk '$1 == "push" {print $2}' "$WORKSPACE/$BUILD_SCRIPT"); do
        curl --fail --silent --head --output /dev/null \
            --header "Accept: application/vnd.docker.distribution.manifest.v2+json" \
            "http://localhost:5000/v2/openforis/$module/manifests/$1" && echo "$module"
    done
}

function built { grep -qF "******* Building $1 *******" "$WORK/out"; }

workspace; unset TEST_PROJECT TEST_RECORD
cp "$REPO/ci/tests.yml" "$WORKSPACE/ci/tests.yml"
# The services that merge the suite anchor
# shellcheck disable=SC2034  # read by the conditions check evaluates
SUITES=$(awk '/^  [a-z-]+:$/ {name = $1} /<<: .*\*suite/ {sub(":", "", name); print name}' "$WORKSPACE/ci/tests.yml" | sort | xargs)
RECORD=$WORK/jenkins/sepal-tests/Sepal-test
PUSH_COUNT=$(awk '$1 == "push"' "$WORKSPACE/$BUILD_SCRIPT" | wc -l)

status=0; jenkins_build 1-test || status=$?
check "a build tests every suite once, then pushes and verifies every image" \
    '[[ -n $SUITES && $status == 0 && $(ran) == "$SUITES" && $(pushed 1-test | wc -l) == "$PUSH_COUNT" ]]' \
    "status $status, ran: $(ran), pushed $(pushed 1-test | wc -l) of $PUSH_COUNT: $(tail -5 "$WORK/out")"
check "a build records every suite once" '[[ $(recorded "$RECORD") == "$SUITES" ]]' "recorded: $(recorded "$RECORD")"
check "a build leaves no test resources and only the images its services use" \
    '[[ -z $(project_resources sepal-jenkins-tests) && $(build_images) == "localhost:5000/openforis/logger localhost:5000/openforis/r-proxy" ]]' \
    "left: $(project_resources sepal-jenkins-tests | xargs) $(build_images)"

status=0; jenkins_build 2-test || status=$?
check "a build with unchanged images runs no suite, pushes every image and records every suite" \
    '[[ $status == 0 && -z $(ran) && $(pushed 2-test | wc -l) == "$PUSH_COUNT" && $(recorded "$RECORD") == "$SUITES" ]]' \
    "status $status, ran: $(ran), recorded: $(recorded "$RECORD"): $(tail -3 "$WORK/out")"

cp "$RECORD" "$WORK/record-before"
suite email 'exit 1'
status=0; jenkins_build 3-test || status=$?
check "an early failing suite stops the build: no later module is built and nothing is pushed" \
    '[[ $status != 0 && $(ran) == email && -z $(pushed 3-test) ]] && built email && ! built gateway' \
    "status $status, ran: $(ran), pushed: $(pushed 3-test | xargs)"
check "a failed build leaves the record alone and cleans up" \
    'cmp -s "$RECORD" "$WORK/record-before" && [[ -z $(project_resources sepal-jenkins-tests) ]]'

status=0; SKIP_TESTS=true jenkins_build 4-test || status=$?
check "SKIP_TESTS runs no suite and pushes every image" \
    '[[ $status == 0 && -z $(ran) && $(pushed 4-test | wc -l) == "$PUSH_COUNT" ]]' "status $status, ran: $(ran)"
check "SKIP_TESTS leaves the record alone" 'cmp -s "$RECORD" "$WORK/record-before"'

suite email 'exit 0'
docker run --detach --publish 127.0.0.1:5001:5000 registry:3 > /dev/null
docker tag alpine:3 localhost:5001/openforis/logger:5-test
docker push --quiet localhost:5001/openforis/logger:5-test > /dev/null
status=0; env "${JENKINS[@]}" REGISTRY_API_URL=http://localhost:5001 "$WORKSPACE/$BUILD_SCRIPT" 5-test > "$WORK/out" 2>&1 \
    || status=$?
check "a build fails when the registry serves another image under a pushed tag, and keeps the record" \
    '[[ $status != 0 ]] && grep -q "does not serve localhost:5000/openforis/logger:5-test" "$WORK/out" && cmp -s "$RECORD" "$WORK/record-before"' \
    "status $status: $(tail -3 "$WORK/out")"

# A docker whose Compose cannot list the services of a configuration
mkdir "$WORK/bin"
printf '%s\n' '#!/bin/sh' 'case " $* " in *" config --services "*) exit 1 ;; esac' "exec $(command -v docker) \"\$@\"" \
    > "$WORK/bin/docker"
chmod +x "$WORK/bin/docker"
status=0; PATH=$WORK/bin:$PATH jenkins_build 6-test || status=$?
check "a build whose suites cannot be listed builds and pushes nothing and keeps the record" \
    '[[ $status != 0 && -z $(pushed 6-test) ]] && grep -q "Cannot find the test suites" "$WORK/out" && ! built sandbox-base && cmp -s "$RECORD" "$WORK/record-before"' \
    "status $status, pushed: $(pushed 6-test | xargs): $(tail -3 "$WORK/out")"

suite email 'sleep 300'
# In a process group of its own, which Jenkins signals as a whole when it aborts a build
env "${JENKINS[@]}" setsid "$WORKSPACE/$BUILD_SCRIPT" 7-test > "$WORK/out" 2>&1 & build=$!
for _ in $(seq 900); do
    [[ -n $(docker ps --quiet --filter label=com.docker.compose.service=email) ]] && break; sleep 0.2
done
kill -TERM -- "-$build"; status=0; wait "$build" || status=$?
check "a cancelled build stops and pushes nothing" '[[ $status == 143 && -z $(pushed 7-test) ]]' \
    "status $status, pushed: $(pushed 7-test | xargs)"
check "a cancelled build cleans up and leaves the record alone" \
    'cmp -s "$RECORD" "$WORK/record-before" && [[ -z $(project_resources sepal-jenkins-tests) ]]' \
    "left: $(project_resources sepal-jenkins-tests | xargs)"

echo "$pass passed, $fail failed"
(( fail == 0 ))
