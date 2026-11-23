#!/bin/bash
# The tests of Jenkins builds, which test each module right after building it. For a module or check with a suite in
# ci/tests.yml, this builds its test image and runs the suite, unless the images its run uses (its own and its
# services') are those of its last successful test in this job. It stops at the first suite that fails. The suites
# of a build go to a pending record, which becomes this job's record once every suite has passed.
#
#   begin              starts this build's pending record
#   run name...        tests those of the named modules and checks that have a suite
#   complete           checks that this build has tested every suite exactly once
#   record             makes the pending record this job's record
#   build suite...     builds the test images of the suites
#   service-logs       keeps the logs of the test services in BUILD_LOGS
#   clean [pattern...] removes the containers, networks, volumes and test images of the Compose project, and the
#                      images matching the reference patterns that no container uses
#
# Environment: WORKSPACE (the repository), TEST_PROJECT (the Compose project of the test resources), and for
# begin, run, complete and record, TEST_RECORD (the file holding this job's record). The console and BUILD_LOGS are
# those of ci/console.sh.
set -euo pipefail

TESTS=$WORKSPACE/ci/tests.yml
PENDING=${TEST_RECORD:-}.new
export COMPOSE_PROJECT_NAME=$TEST_PROJECT
source "$(dirname "${BASH_SOURCE[0]}")/console.sh"

function main {
    case ${1:-} in
        begin) begin ;;
        run) shift; run "$@" ;;
        complete) complete ;;
        record) record ;;
        build) shift; build "$@" ;;
        service-logs) service_logs ;;
        clean) shift; clean "$@" ;;
        *) echo "Usage: $0 begin | run name... | complete | record | build suite... | service-logs" \
                "| clean [image-pattern...]" >&2
            exit 2 ;;
    esac
}

function begin {
    suites > /dev/null
    mkdir -p "$(dirname "$TEST_RECORD")"
    : > "$PENDING"
    if [[ ! -e $TEST_RECORD ]]; then
        echo "No suite has passed in this job yet: every suite runs"
    elif ! cat "$TEST_RECORD" > /dev/null 2>&1; then
        warn "cannot read $TEST_RECORD: every suite runs"
    fi
}

function run {
    local list name previous
    list=$(suites)
    previous=$(cat "$TEST_RECORD" 2> /dev/null) || previous=''
    for name in "$@"; do
        if grep -qxF "$name" <<< "$list"; then
            test_suite "$name" "$previous"
        fi
    done
}

function complete {
    local list tested missing repeated
    list=$(suites)
    tested=$(cut -d' ' -f1 "$PENDING" | sort)
    missing=$(comm -23 <(sort <<< "$list") <(uniq <<< "$tested"))
    repeated=$(uniq -d <<< "$tested")
    [[ -z $missing ]] || echo "${FAILED}Not tested in this build: $(xargs <<< "$missing")${PLAIN}"
    [[ -z $repeated ]] || echo "${FAILED}Tested more than once in this build: $(xargs <<< "$repeated")${PLAIN}"
    [[ -z $missing$repeated ]] || return 1
    echo "${PASSED}Every suite has passed, or is unchanged since it passed${PLAIN}"
}

function record {
    mv -f "$PENDING" "$TEST_RECORD" || warn "cannot update $TEST_RECORD: the next build runs these suites again"
}

function build {
    local suite
    for suite in "$@"; do
        echo
        echo "******* Building the ${suite} test image *******"
        if [[ -f $WORKSPACE/modules/$suite/docker-compose.yml ]]; then
            # With the module's own build settings, the test image builds on the layers of its production image
            docker compose --file "$WORKSPACE/modules/$suite/docker-compose.yml" --file - build "$suite" <<EOF
services:
  $suite:
    build: {target: test}
    image: $TEST_PROJECT/$suite
EOF
        else
            tests build "$suite"
        fi
    done
}

function service_logs {
    local service log
    for service in $(tests ps --all --services); do
        log=$BUILD_LOGS/$service.service.log
        mkdir -p "$BUILD_LOGS"
        tests logs --no-color --no-log-prefix --timestamps "$service" > "$log" 2>&1 || warn "cannot keep the log of $service"
        echo "$service: service log in $(link "$log")"
    done
}

function clean {
    tests down --volumes --remove-orphans
    remove_unused "$TEST_PROJECT/*" "$@"
}

# Runs the suite unless the images its run uses are those of its last successful test; once it passes, or when it
# is unchanged, it goes to the pending record
function test_suite {
    local suite=$1 previous=$2 images line
    logged "$suite" "test image" prepare "$suite"
    images=$(tests config --images "$suite" | sort)
    line="$suite $(fingerprint "$images")"
    if grep -qxF "$line" <<< "$previous"; then
        echo "$suite: tests unchanged"
    else
        # No terminal, and no colours from tools that colour without one, such as Vitest under CI
        logged "$suite" tests tests run --rm --no-TTY --env NO_COLOR=1 "$suite"
    fi
    echo "$line" >> "$PENDING"
}

# Builds the suite's test image, and fetches the images of its services, whose IDs its fingerprint reads. Not with
# compose pull: it pulls :latest tags anyway.
function prepare {
    local image
    build "$1" && tests config --images "$1" | while read -r image; do
        docker image inspect "$image" > /dev/null 2>&1 || docker pull --quiet "$image" || return
    done
}

# The test configuration, with the IDs of the images
function fingerprint {
    { cat "$0" "$TESTS"; xargs docker image inspect --format '{{.Id}}' <<< "$1"; } | sha256sum | cut -d' ' -f1
}

# The services under the suite profile. Finding none fails, since a build without suites would push untested images.
function suites {
    local all services
    all=$(tests config --services) && services=$(docker compose --file "$TESTS" config --services) \
        && comm -23 <(sort <<< "$all") <(sort <<< "$services") | grep . \
        || { echo "Cannot find the test suites in $TESTS" >&2; return 1; }
}

function remove_unused {
    local pattern filters=() used image id
    for pattern in "$@"; do filters+=(--filter "reference=$pattern"); done
    used=$(docker ps --all --quiet | xargs -r docker inspect --format '{{.Image}}')
    docker image ls --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}' "${filters[@]}" |
        while read -r image id; do
            [[ $image == *:"<none>" ]] && continue
            grep -qxF "$id" <<< "$used" || docker image rm "$image" > /dev/null
        done
}

function tests {
    docker compose --file "$TESTS" --profile suite "$@"
}

main "$@"
