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
#   clean [pattern...] removes the containers, networks, volumes and test images of the Compose project, and the
#                      images matching the reference patterns that no container uses
#
# Environment: WORKSPACE (the repository), TEST_PROJECT (the Compose project of the test resources), and for
# begin, run, complete and record, TEST_RECORD (the file holding this job's record).
set -euo pipefail

TESTS=$WORKSPACE/ci/tests.yml
PENDING=${TEST_RECORD:-}.new
export COMPOSE_PROJECT_NAME=$TEST_PROJECT

function main {
    case ${1:-} in
        begin) begin ;;
        run) shift; run "$@" ;;
        complete) complete ;;
        record) record ;;
        build) shift; build "$@" ;;
        clean) shift; clean "$@" ;;
        *) echo "Usage: $0 begin | run name... | complete | record | build suite... | clean [image-pattern...]" >&2
            exit 2 ;;
    esac
}

function begin {
    suites > /dev/null
    mkdir -p "$(dirname "$TEST_RECORD")"
    : > "$PENDING"
    if [[ ! -e $TEST_RECORD ]]; then
        echo "No suite has passed in this job yet: every suite runs"
    elif ! cat "$TEST_RECORD" > /dev/null; then
        echo "Warning: cannot read $TEST_RECORD: every suite runs"
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
    [[ -z $missing ]] || echo "Not tested in this build: $(xargs <<< "$missing")"
    [[ -z $repeated ]] || echo "Tested more than once in this build: $(xargs <<< "$repeated")"
    [[ -z $missing$repeated ]] || return 1
    echo
    echo "******* Every suite has passed, or is unchanged since it passed *******"
}

function record {
    mv -f "$PENDING" "$TEST_RECORD" || echo "Warning: cannot update $TEST_RECORD: the next build runs these suites again"
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

function clean {
    tests down --volumes --remove-orphans
    remove_unused "$TEST_PROJECT/*" "$@"
}

# Runs the suite unless the images its run uses are those of its last successful test; once it passes, or when it
# is unchanged, it goes to the pending record
function test_suite {
    local suite=$1 previous=$2 images image line started
    build "$suite"
    images=$(tests config --images "$suite" | sort)
    # Its services' images must be here before their IDs are read. Not with compose pull: it pulls :latest tags anyway.
    while read -r image; do
        docker image inspect "$image" > /dev/null 2>&1 || docker pull --quiet "$image" > /dev/null
    done <<< "$images"
    line="$suite $(fingerprint "$images")"
    if grep -qxF "$line" <<< "$previous"; then
        echo "$suite: unchanged since it passed"
    else
        echo
        echo "******* Testing ${suite} *******"
        started=$SECONDS
        if ! tests run --rm "$suite"; then
            echo "$suite: FAILED in $((SECONDS - started)) s"
            return 1
        fi
        echo "$suite: passed in $((SECONDS - started)) s"
    fi
    echo "$line" >> "$PENDING"
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
