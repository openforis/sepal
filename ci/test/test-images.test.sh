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
    buildkit_env=()
    while IFS= read -r setting; do buildkit_env+=(--env "$setting"); done \
        < <(sed -n 's/^Environment="\(.*\)"$/\1/p' "$REPO/hosting-services/aws/operations/docker/buildkit-logs.conf")
    docker run --detach --privileged --name "$daemon" --volume "$daemon:/var/run" \
        "${buildkit_env[@]}" docker:25.0-dind dockerd --host=unix:///var/run/docker.sock > /dev/null
    docker run --rm --network "container:$daemon" --volume "$daemon:/var/run" --volume "$REPO:$REPO:ro" \
        --env IN_FIXTURE_DAEMON=1 --user root --entrypoint bash "${1:-jenkins}" "$REPO/ci/test/test-images.test.sh"
    exit
fi

pass=0; fail=0
# Plain results, to match; one check turns colours on
export NO_COLOR=1
# shellcheck disable=SC2034  # read by the conditions check evaluates
ESC=$'\e'
ok()  { echo "ok   - $1"; pass=$((pass+1)); }
bad() { echo "FAIL - $1"; echo "        $2"; fail=$((fail+1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1" "${3:-$2}"; fi; }

BUILD_SCRIPT=modules/ops/script/build-and-push-images.sh
WORK=$(mktemp -d)

# An operation's log, from output meant for terminals
printf '\e[1;31mred\e[0m \e]8;;https://example.org\e\\link\e]8;;\e\\ \e[2m✓\e[22m\r\nstep 1\rstep 2\nplain\n' \
    > "$WORK/terminal-output"
printf '%s\n' 'red link ✓' 'step 1' 'step 2' 'plain' > "$WORK/plain-output"
status=0
(WORKSPACE=$WORK BUILD_LOGS=$WORK/logs; source "$REPO/ci/console.sh"
    logged sample output sh -c 'cat "$1"; exit 3' - "$WORK/terminal-output") > "$WORK/out" 2>&1 || status=$?
check "an operation's log is the plain text of its output, and the operation fails as its command does" \
    '[[ $status == 3 ]] && cmp -s "$WORK/logs/sample.output.log" "$WORK/plain-output"' \
    "status $status: $(cat -v "$WORK/logs/sample.output.log")"

# A cancelled operation, in a process group of its own as in a build, after progress lines that end with carriage returns
cat > "$WORK/progress.sh" <<'EOF'
BUILD_LOGS=$WORK/logs
source "$REPO/ci/console.sh"
logged sample progress sh -c 'printf "step 1\rstep 2\r"; sleep 30'
EOF
env WORK="$WORK" REPO="$REPO" setsid bash "$WORK/progress.sh" > "$WORK/out" 2>&1 & operation=$!
for _ in $(seq 25); do grep -q "step 2" "$WORK/logs/sample.progress.log" 2> /dev/null && break; sleep 0.2; done
kill -TERM -- "-$operation"; status=0; wait "$operation" || status=$?
printf '%s\n' 'step 1' 'step 2' > "$WORK/progress-output"
check "a cancelled operation's log keeps the lines it had written" \
    'cmp -s "$WORK/logs/sample.progress.log" "$WORK/progress-output"' "$(cat -v "$WORK/logs/sample.progress.log")"
check "cancelling the whole operation group prints its stopped status, diagnostic excerpt and full log path" \
    '[[ $status == 143 ]] && grep -q "^sample: progress STOPPED by signal 15" "$WORK/out" \
        && grep -qx "The last 100 lines of its log:" "$WORK/out" && grep -qx "step 2" "$WORK/out" \
        && grep -q "^Full log: " "$WORK/out"' "status $status: $(cat "$WORK/out")"

# A log that cannot take all of an operation's output: a file size limit cuts a write short, as a full disk does. The
# console goes through cat, outside the limit.
status=0
(ulimit -f 4; export WORKSPACE=$WORK BUILD_LOGS=$WORK/logs; source "$REPO/ci/console.sh"
    logged sample large sh -c 'head -c 8192 /dev/zero | tr "\0" x; echo') 2>&1 | cat > "$WORK/out" || status=$?
check "an operation fails when its log cannot take all its output" \
    '[[ $status != 0 ]] && grep -q "^Cannot write the log" "$WORK/out" && grep -q "^sample: large FAILED" "$WORK/out" \
        && grep -q "^Full log: " "$WORK/out"' "status $status: $(grep -v "^x" "$WORK/out")"
for _ in $(seq 100); do docker version > /dev/null 2>&1 && break; sleep 0.2; done
docker pull --quiet alpine:3 > /dev/null
docker pull --quiet registry:3 > /dev/null
docker run --detach --publish 127.0.0.1:5000:5000 registry:3 > /dev/null
for _ in $(seq 50); do curl --fail --silent http://localhost:5000/v2/ > /dev/null && break; sleep 0.2; done
# The base image of the fixtures, which clean builds pull from the disposable registry
BASE=localhost:5000/fixture/alpine:3
docker tag alpine:3 "$BASE"
docker push --quiet "$BASE" > /dev/null

# A failed RUN must retain diagnostics after more than BuildKit's default 2 MiB of output.
mkdir "$WORK/buildkit-output"
printf '%s\n' 'FROM alpine:3' 'COPY init_r_packages.sh /script/init_r_packages.sh' \
    'RUN sh /script/init_r_packages.sh' > "$WORK/buildkit-output/Dockerfile"
cat > "$WORK/buildkit-output/init_r_packages.sh" <<'EOF'
awk 'BEGIN {for (i = 1; i <= 50000; i++) printf "R_COMPILE_%05d routine compiler output for the disposable package fixture\n", i}'
echo 'SEPAL_PROGRESS Checking R package loads (1/1)'
echo 'R_FAILURE: compiler diagnostic after the noisy output' >&2
exit 23
EOF
status=0
(WORKSPACE=$WORK BUILD_LOGS=$WORK/logs; source "$REPO/ci/console.sh"
    logged sandbox build docker build --progress=plain "$WORK/buildkit-output") > "$WORK/out" 2>&1 || status=$?
check "a noisy failed build keeps every compiler line, later progress and the failure diagnostic without clipping" \
    '[[ $status != 0 && $(grep -c "R_COMPILE_[0-9]" "$WORK/logs/sandbox.build.log") -ge 50000 ]] \
        && ! grep -q "output clipped" "$WORK/logs/sandbox.build.log" \
        && grep -q "R_FAILURE: compiler diagnostic" "$WORK/logs/sandbox.build.log" \
        && grep -q "R packages — Checking R package loads (1/1)" "$WORK/out" \
        && grep -q "^sandbox: build FAILED" "$WORK/out"' "status $status: $(tail -5 "$WORK/out")"

# A workspace with a fixture module for each module the build script names, and fixture checks; email, budget
# (which needs mysql) and the shell check are the suites of its test configuration
function workspace {
    WORKSPACES=$((${WORKSPACES:-0} + 1))
    WORKSPACE=$WORK/workspace-$WORKSPACES; export WORKSPACE
    mkdir -p "$WORKSPACE/ci" "$WORKSPACE/modules/ops/script"
    cp "$REPO/ci/test-images.sh" "$REPO/ci/console.sh" "$REPO/ci/console.py" "$WORKSPACE/ci/"
    cp "$REPO/$BUILD_SCRIPT" "$WORKSPACE/$BUILD_SCRIPT"
    for module in $(awk '$1 ~ /^(build|push|start|restart)$/ && NF == 2 {print $2}' "$REPO/$BUILD_SCRIPT" | sort -u); do
        mkdir -p "$WORKSPACE/modules/$module"
        echo "$module" > "$WORKSPACE/modules/$module/content"
        suite "$module" 'exit 0'
        printf '%s\n' "FROM $BASE AS production" "COPY modules/$module/content /content" \
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
    # Like SEPAL's sandbox-base: no release metadata, and only this host has it
    printf '%s\n' "FROM $BASE" 'COPY modules/sandbox-base/content /content' > "$WORKSPACE/modules/sandbox-base/Dockerfile"
    for module in r-proxy app-manager sandbox; do
        sed -i "s|^FROM .* AS production|FROM openforis/sandbox-base AS production|" "$WORKSPACE/modules/$module/Dockerfile"
    done
    # A production layer that differs each time it is built, which the email suite shows
    printf '%s\n' "FROM $BASE AS production" 'COPY modules/email/content /content' \
        'RUN cat /proc/sys/kernel/random/uuid > /built' 'FROM production AS test' 'COPY modules/email/test /test' \
        'CMD ["sh", "-c", "cat /built; sh /test"]' 'FROM production' > "$WORKSPACE/modules/email/Dockerfile"
    # Like r-proxy and r-proxy-redis, with caches in the host's SEPAL_DATA_DIR. Stopping, r-proxy finishes the package it
    # builds and Redis saves its queue.
    cat > "$WORKSPACE/modules/r-proxy/docker-compose.yml" <<EOF
services:
  r-proxy-redis:
    image: "$BASE"
    container_name: r-proxy-redis
    command: ["sh", "-c", "trap 'echo queue > /data/dump.rdb; exit' TERM; while :; do sleep 1 & wait \$\$!; done"]
    volumes:
      - "\${SEPAL_DATA_DIR}/r-proxy-redis:/data"
    healthcheck: {test: ["CMD", "true"], interval: 1s}
  r-proxy:
    build:
      context: ../..
      dockerfile: ./modules/r-proxy/Dockerfile
    image: "\${DOCKER_REGISTRY_HOST:-localhost}/openforis/r-proxy:\${SEPAL_VERSION:-latest}"
    container_name: r-proxy
    command: ["sh", "-c", "trap 'touch /R/unfinished.tar.gz; exit' TERM; while :; do sleep 1 & wait \$\$!; done"]
    volumes:
      - "\${SEPAL_DATA_DIR}/r-proxy/site-library:/usr/local/lib/R/site-library"
      - "\${SEPAL_DATA_DIR}/r-proxy/repo:/R"
    healthcheck: {test: ["CMD", "sh", "-c", "\${FIXTURE_R_PROXY_HEALTH:-true}"], interval: 1s, retries: 2}
EOF
    # Like SEPAL's MySQL image: no release metadata, and it marks itself initialized
    printf '%s\n' "FROM $BASE" 'COPY modules/mysql/content /content' \
        'CMD ["sh", "-c", "mkdir -p /data && touch /data/module_initialized && echo mysql fixture ready && exec sleep 3600"]' \
        > "$WORKSPACE/modules/mysql/Dockerfile"
    printf '%s\n' "FROM $BASE AS check" 'COPY ci/check-test /test' 'CMD ["sh", "/test"]' \
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

# A suite that writes to stdout and stderr, with an exception it expects, then runs the commands
function suite {
    printf '%s\n' "echo '$1 suite ran'" "echo 'Error: expected by a passing $1 test' >&2" \
        "for i in \$(seq 100); do echo \"$1 passing test \$i\"; done" "$2" > "$WORKSPACE/modules/$1/test"
}

function build_mysql { docker compose --file "$WORKSPACE/modules/mysql/docker-compose.yml" build --quiet; }

function helper { "$WORKSPACE/ci/test-images.sh" "$@"; }

# The tests of a build of the fixture workspace: those needing no MySQL, then budget, then the record
function run_tests {
    { helper begin && helper run shell email && helper run budget && helper complete && helper record; } > "$WORK/out" 2>&1
}

# The suites the last run ran, by their results
function ran { awk '/^[a-z-]+: tests (passed|FAILED) / {sub(":", "", $1); print $1}' "$WORK/out" | sort | xargs; }

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

cp "$TEST_RECORD" "$WORK/record-before"
status=0; CLEAN=true run_tests || status=$?
check "a clean build runs every suite, also one whose images are those of its last successful test" \
    '[[ $status == 0 && $(ran) == "budget email shell" ]] && grep -qxF "$(grep "^email " "$WORK/record-before")" "$TEST_RECORD"' \
    "status $status, ran: $(ran): $(diff "$WORK/record-before" "$TEST_RECORD")"

status=0; BUILD_NUMBER=2 run_tests || status=$?
check "release metadata leaves test images unchanged" '[[ $status == 0 && -z $(ran) ]]' "status $status, ran: $(ran)"

suite email 'echo changed'
status=0; run_tests || status=$?
check "a changed test input runs only its suite" '[[ $status == 0 && $(ran) == email ]]' "status $status, ran: $(ran)"

suite email 'if [ -z "$NO_COLOR" ]; then printf "\033[31mcoloured\033[0m\n"; fi'
status=0; NO_COLOR='' run_tests || status=$?
check "results are coloured, while suites run without colours" \
    '[[ $status == 0 ]] && grep -qF "email: tests ${ESC}[30;42mpassed" "$WORK/out" && ! grep -qF "$ESC" "$WORKSPACE/build-logs/email.tests.log"' \
    "status $status: $(tail -3 "$WORK/out")"

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
export SKIP_TESTS=false
JENKINS=(JENKINS_HOME="$WORK/jenkins" JOB_NAME=Sepal-test JOB_URL=https://jenkins.example/job/Sepal-test/ REGISTRY_API_URL=http://localhost:5000
    DOCKER_REGISTRY_USERNAME=user DOCKER_REGISTRY_PASSWORD=password GIT_COMMIT=0123abc)
# In a process group of its own, as Jenkins runs a build; $build is its ID
function jenkins_build {
    env "${JENKINS[@]}" setsid "$WORKSPACE/$BUILD_SCRIPT" "$@" > "$WORK/out" 2>&1 & build=$!
    wait "$build"
}

# Whether a process of the last build is left, a moment after it ended
function processes_left {
    for _ in $(seq 20); do kill -0 -- "-$build" 2> /dev/null || return 1; sleep 0.2; done
}

SECTIONS=$REPO/modules/ops/config/org.jvnet.hudson.plugins.collapsingconsolesections.CollapsingSectionNote.xml
SECTION_START=$(sed -n 's|.*<sectionStartPattern>\(.*\)</sectionStartPattern>|\1|p' "$SECTIONS")
SECTION_END=$(sed -n 's|.*<sectionEndPattern>\(.*\)</sectionEndPattern>|\1|p' "$SECTIONS")
# Whether the console has sections, by the patterns Jenkins finds them with, and each ends before the next starts and
# before the console ends
function sections_closed {
    awk -v start="^($SECTION_START)\$" -v end="^($SECTION_END)\$" '
        $0 ~ start { sections++; if (open) broken = 1; open = 1; next }
        $0 ~ end { open = 0 }
        END { exit !sections || broken || open }' "$WORK/out"
}

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

function built { grep -qx "$1: build\.\.\." "$WORK/out"; }

# A docker that keeps the arguments of image builds in $WORK/builds
mkdir "$WORK/spy"
cat > "$WORK/spy/docker" <<EOF
#!/bin/sh
case " \$* " in *" build "*) echo "\$*" >> "$WORK/builds" ;; esac
exec $(command -v docker) "\$@"
EOF
chmod +x "$WORK/spy/docker"

# The image builds of the last build with that docker, as "kind name options": the images of modules, the test images
# of modules and the images of checks, with the options that make builds clean
function image_builds {
    awk '{
        kind = /ci\/tests\.yml/ ? "check" : / --file - / ? "test-image" : "image"; name = $NF
        if (kind == "image") { match($0, /modules\/[a-z-]+\//); name = substr($0, RSTART + 8, RLENGTH - 9) }
        options = ""; for (i = 1; i <= NF; i++) if ($i ~ /^--(no-cache|pull)$/) options = options " " $i
        if (kind == "test-image" && name ~ /-test$/) {
            print "image " $(NF - 1) options
            sub(/-test$/, "", name)
        }
        print kind " " name options
    }' "$WORK/builds"
}

# Whether every image build had the options of a clean build, except pulling openforis/sandbox-base.
function clean_build_options {
    image_builds | awk '
        { no_cache = / --no-cache( |$)/; pull = / --pull( |$)/; local_base = $2 ~ /^(r-proxy|app-manager|sandbox)$/ }
        !no_cache || pull == local_base { print "wrong options: " $0; wrong = 1 }
        END { exit wrong }'
}

# Runs the shell command on the fixture host, whose /data is SEPAL_DATA_DIR in builds
function on_host { docker run --rm --volume /data:/data "$BASE" sh -c "$1"; }

# R package caches with nested and hidden files, and files beside them
function seed_data {
    on_host 'mkdir -p /data/r-proxy/repo/src/contrib /data/r-proxy/repo/.partial /data/r-proxy/site-library/pkg/R \
            /data/r-proxy-redis /data/r-proxy-redis-old
        echo index > /data/r-proxy/repo/src/contrib/PACKAGES; touch /data/r-proxy/repo/.partial/pkg.tar.gz
        touch /data/r-proxy/site-library/pkg/DESCRIPTION /data/r-proxy/site-library/pkg/R/pkg /data/r-proxy/site-library/.lock
        echo queue > /data/r-proxy-redis/dump.rdb; touch /data/r-proxy-redis/.hidden
        for kept in /data/kept /data/r-proxy/kept /data/r-proxy-redis-old/kept; do echo kept > "$kept"; done
        chmod 2775 /data/r-proxy/repo; chown 999:999 /data/r-proxy-redis; chmod 750 /data/r-proxy-redis'
}

function data_files { on_host 'find /data | sort'; }

function cache_dirs { on_host 'stat -c "%n %u:%g %a" /data/r-proxy/repo /data/r-proxy/site-library /data/r-proxy-redis'; }

workspace; unset TEST_PROJECT TEST_RECORD
cp "$REPO/ci/tests.yml" "$WORKSPACE/ci/tests.yml"
# The services that merge the suite anchor
# shellcheck disable=SC2034  # read by the conditions check evaluates
SUITES=$(awk '/^  [a-z-]+:$/ {name = $1} /<<: .*\*suite/ {sub(":", "", name); print name}' "$WORKSPACE/ci/tests.yml" | sort | xargs)
RECORD=$WORK/jenkins/sepal-tests/Sepal-test
# shellcheck disable=SC2034  # read by the conditions check evaluates
LOGS=$WORKSPACE/build-logs/1
PUSH_COUNT=$(awk '$1 == "push"' "$WORKSPACE/$BUILD_SCRIPT" | wc -l)
# An image for each module the build script builds, and a test image for each suite
# shellcheck disable=SC2034  # read by the conditions check evaluates
IMAGE_BUILDS=$(( $(awk '$1 == "build"' "$WORKSPACE/$BUILD_SCRIPT" | wc -l) + $(wc -w <<< "$SUITES") ))

mkdir -p "$LOGS"; echo kept > "$LOGS/kept"
docker tag "$BASE" localhost:5000/openforis/leftover:1
exits=''
for arguments in '' '--clean' '1-test --clena' '1-test --clean more' 'not/a/tag'; do
    read -ra args <<< "$arguments"
    status=0; jenkins_build "${args[@]}" || status=$?; exits+=" $status"
done
check "a build with wrong arguments changes nothing" \
    '[[ $exits == " 2 2 2 2 2" ]] && grep -q "^Usage: " "$WORK/out" && [[ -f $LOGS/kept ]] \
        && docker image inspect localhost:5000/openforis/leftover:1 > /dev/null' "exits:$exits: $(tail -3 "$WORK/out")"

seed_data
SEEDED=$(data_files)
status=0; PATH=$WORK/spy:$PATH jenkins_build 1-test || status=$?
check "a build tests every suite once, then pushes and verifies every image" \
    '[[ -n $SUITES && $status == 0 && $(ran) == "$SUITES" && $(pushed 1-test | wc -l) == "$PUSH_COUNT" ]]' \
    "status $status, ran: $(ran), pushed $(pushed 1-test | wc -l) of $PUSH_COUNT: $(tail -5 "$WORK/out")"
check "a build records every suite once" '[[ $(recorded "$RECORD") == "$SUITES" ]]' "recorded: $(recorded "$RECORD")"
check "a build leaves no test resources and only the images its services use" \
    '[[ -z $(project_resources sepal-jenkins-tests) && $(build_images) == "localhost:5000/openforis/logger localhost:5000/openforis/r-proxy" ]]' \
    "left: $(project_resources sepal-jenkins-tests | xargs) $(build_images)"
check "a build's console has the results and the end of each log, while the logs keep all output" \
    'grep -q "^email: tests passed in" "$WORK/out" && ! grep -qx "email passing test 50" "$WORK/out" \
        && ! grep -qx "Error: expected by a passing email test" "$WORK/out" \
        && grep -qx "email passing test 50" "$LOGS/email.tests.log" && grep -qx "Error: expected by a passing email test" "$LOGS/email.tests.log" \
        && grep -q "naming to" "$LOGS/email.build.log"'
check "a build provides a live log directory that identifies its build" \
    'grep -qx "Live logs (archived at build end): https://jenkins.example/job/Sepal-test/ws/build-logs/1/" "$WORK/out" \
        && [[ -f $LOGS/email.build.log ]]'
check "a build ends its console sections and leaves no processes" 'sections_closed && ! processes_left'
check "an ordinary build builds every image with the cache and the base images this host has" \
    '[[ $(image_builds | wc -l) == "$IMAGE_BUILDS" ]] && ! image_builds | grep -q -- " --"' "$(image_builds | grep -- " --")"
check "an ordinary build keeps the R package caches" '[[ -z $(comm -23 <(echo "$SEEDED") <(data_files)) ]]' \
    "lost: $(comm -23 <(echo "$SEEDED") <(data_files) | xargs)"

status=0; BUILD_NUMBER=2 jenkins_build 2-test || status=$?
check "a build with unchanged images runs no suite, pushes every image and records every suite" \
    '[[ $status == 0 && -z $(ran) && $(pushed 2-test | wc -l) == "$PUSH_COUNT" && $(recorded "$RECORD") == "$SUITES" ]]' \
    "status $status, ran: $(ran), recorded: $(recorded "$RECORD"): $(tail -3 "$WORK/out")"
check "the next build has a new live log path and removes the old path instead of reusing it" \
    'grep -q "ws/build-logs/2/" "$WORK/out" && [[ ! -e $WORKSPACE/build-logs/1 && -f $WORKSPACE/build-logs/2/email.build.log ]]'

cp "$RECORD" "$WORK/record-before"
suite email 'echo "email assertion failed"; exit 1'
status=0; jenkins_build 3-test || status=$?
check "an early failing suite stops the build: no later module is built and nothing is pushed" \
    '[[ $status != 0 && $(ran) == email && -z $(pushed 3-test) ]] && built email && ! built gateway' \
    "status $status, ran: $(ran), pushed: $(pushed 3-test | xargs)"
check "a failed build leaves the record alone and cleans up" \
    'cmp -s "$RECORD" "$WORK/record-before" && [[ -z $(project_resources sepal-jenkins-tests) ]]'
check "a failed suite shows the end of its log, after the sections, and where its log is" \
    'grep -q "^email: tests FAILED" "$WORK/out" && grep -qx "email assertion failed" "$WORK/out" \
        && grep -qx "Full log: https://jenkins.example/job/Sepal-test/ws/build-logs/1/email.tests.log" "$WORK/out" && sections_closed' "$(grep -A3 -B1 "email: tests" "$WORK/out")"

status=0; (unset SKIP_TESTS; jenkins_build 4-test) || status=$?
check "a build skips tests by default and pushes every image" \
    '[[ $status == 0 && -z $(ran) && $(pushed 4-test | wc -l) == "$PUSH_COUNT" ]]' "status $status, ran: $(ran)"
check "skipping tests by default leaves the record alone" 'cmp -s "$RECORD" "$WORK/record-before"'

suite email 'exit 0'
docker run --detach --publish 127.0.0.1:5001:5000 registry:3 > /dev/null
for _ in $(seq 50); do curl --fail --silent http://localhost:5001/v2/ > /dev/null && break; sleep 0.2; done
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

# Once the services are up, and with progress every second
suite budget 'sleep 300'
# Jenkins signals the process group of a build as a whole when it aborts it
env "${JENKINS[@]}" PROGRESS_SECONDS=1 setsid "$WORKSPACE/$BUILD_SCRIPT" 7-test > "$WORK/out" 2>&1 & build=$!
for _ in $(seq 1500); do
    [[ -n $(docker ps --quiet --filter label=com.docker.compose.service=budget) ]] && break; sleep 0.2
done
sleep 2
kill -TERM -- "-$build"; status=0; wait "$build" || status=$?
check "a cancelled build stops and pushes nothing" '[[ $status == 143 && -z $(pushed 7-test) ]]' \
    "status $status, pushed: $(pushed 7-test | xargs)"
check "a cancelled build cleans up and leaves the record alone" \
    'cmp -s "$RECORD" "$WORK/record-before" && [[ -z $(project_resources sepal-jenkins-tests) ]]' \
    "left: $(project_resources sepal-jenkins-tests | xargs)"
check "a cancelled build keeps the log of its test service before cleanup removes it" \
    'grep -q " mysql fixture ready$" "$LOGS/mysql.service.log"' "$(ls "$LOGS")"
check "a cancelled build reported progress, ends its sections and leaves no processes" \
    'grep -q "^budget: tests running (" "$WORK/out" && grep -q "^budget: tests STOPPED by signal 15" "$WORK/out" \
        && grep -q "Full log: .*budget.tests.log" "$WORK/out" && sections_closed && ! processes_left' "$(tail -8 "$WORK/out")"

suite budget 'exit 0'
cp "$RECORD" "$WORK/record-before"
# shellcheck disable=SC2034  # read by the conditions check evaluates
DIRS=$(cache_dirs)
EMPTIED=$(grep -vE '^/data/(r-proxy/repo|r-proxy/site-library|r-proxy-redis)/' <<< "$SEEDED")
rm -f "$WORK/builds"
status=0; PATH=$WORK/spy:$PATH jenkins_build 8-weekly --clean || status=$?
check "a clean build runs every suite, then pushes every image and records every suite" \
    '[[ $status == 0 && $(ran) == "$SUITES" && $(pushed 8-weekly | wc -l) == "$PUSH_COUNT" && $(recorded "$RECORD") == "$SUITES" ]]' \
    "status $status, ran: $(ran), pushed $(pushed 8-weekly | wc -l) of $PUSH_COUNT: $(tail -5 "$WORK/out")"
check "a clean build builds images without cache, on the latest base images but openforis/sandbox-base" \
    '[[ $(image_builds | wc -l) == "$IMAGE_BUILDS" ]] && clean_build_options' "$(clean_build_options)"
BUILT=$(docker run --rm localhost:5000/openforis/email:8-weekly cat /built)
check "a clean build tests the layers it pushes" 'grep -qxF "$BUILT" "$LOGS/email.tests.log"' \
    "pushed: $BUILT, tested: $(head -5 "$LOGS/email.tests.log" | xargs)"
check "a clean build empties the R package caches, also of what r-proxy and Redis save as they stop, and nothing else" \
    '[[ $(data_files) == "$EMPTIED" && $(cache_dirs) == "$DIRS" ]]' "$(diff <(echo "$EMPTIED") <(data_files)) $(cache_dirs)"
check "a clean build leaves r-proxy and r-proxy-redis running, ready" \
    '[[ $(docker inspect --format "{{.State.Health.Status}}" r-proxy r-proxy-redis | xargs) == "healthy healthy" ]]'

cp "$RECORD" "$WORK/record-before"
seed_data
SEEDED=$(data_files)
sed -i 's|"${SEPAL_DATA_DIR}/r-proxy/repo:/R"|"${SEPAL_DATA_DIR}:/R"|' "$WORKSPACE/modules/r-proxy/docker-compose.yml"
status=0; jenkins_build 9-weekly --clean || status=$?
check "a clean build whose r-proxy mounts more than its caches deletes nothing and pushes nothing" \
    '[[ $status != 0 && -z $(pushed 9-weekly) && -z $(comm -23 <(echo "$SEEDED") <(data_files)) ]] \
        && grep -q "^Not emptying the R package caches" "$WORK/out" && cmp -s "$RECORD" "$WORK/record-before"' \
    "status $status, pushed: $(pushed 9-weekly | xargs), lost: $(comm -23 <(echo "$SEEDED") <(data_files) | xargs)"
sed -i 's|"${SEPAL_DATA_DIR}:/R"|"${SEPAL_DATA_DIR}/r-proxy/repo:/R"|' "$WORKSPACE/modules/r-proxy/docker-compose.yml"

status=0; FIXTURE_R_PROXY_HEALTH=false jenkins_build 10-weekly --clean || status=$?
check "a clean build whose r-proxy does not get ready stops and pushes nothing" \
    '[[ $status != 0 && -z $(pushed 10-weekly) ]] && grep -q "^r-proxy: cache reset FAILED" "$WORK/out" \
        && cmp -s "$RECORD" "$WORK/record-before"' "status $status, pushed: $(pushed 10-weekly | xargs): $(tail -3 "$WORK/out")"

# Cancelled while r-proxy gets ready
env "${JENKINS[@]}" FIXTURE_R_PROXY_HEALTH='sleep 60' setsid "$WORKSPACE/$BUILD_SCRIPT" 11-weekly --clean > "$WORK/out" 2>&1 &
build=$!
for _ in $(seq 1500); do
    [[ $(docker inspect --format '{{.State.Health.Status}}' r-proxy 2> /dev/null) == starting ]] && break; sleep 0.2
done
kill -TERM -- "-$build"; status=0; wait "$build" || status=$?
check "a cancelled clean build stops, pushes nothing, leaves the record alone and leaves no processes" \
    '[[ $status == 143 && -z $(pushed 11-weekly) ]] && cmp -s "$RECORD" "$WORK/record-before" && ! processes_left' \
    "status $status, pushed: $(pushed 11-weekly | xargs): $(tail -3 "$WORK/out")"

status=0; SKIP_TESTS=true jenkins_build 12-weekly --clean || status=$?
check "after a cancelled clean build, a clean build that skips tests warns, pushes every image and keeps the record" \
    '[[ $status == 0 && -z $(ran) && $(pushed 12-weekly | wc -l) == "$PUSH_COUNT" ]] && grep -q "^WARNING: SKIP_TESTS" "$WORK/out" \
        && cmp -s "$RECORD" "$WORK/record-before"' "status $status, ran: $(ran): $(tail -3 "$WORK/out")"
check "after a cancelled clean build, a clean build leaves r-proxy and r-proxy-redis running, ready, with empty caches" \
    '[[ $(docker inspect --format "{{.State.Health.Status}}" r-proxy r-proxy-redis | xargs) == "healthy healthy" \
        && $(data_files) == "$EMPTIED" ]]' "$(diff <(echo "$EMPTIED") <(data_files))"

echo "$pass passed, $fail failed"
(( fail == 0 ))
