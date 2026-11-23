# shellcheck shell=bash
# The console of Jenkins builds, sourced by their scripts. An operation's output goes to a log of its own in
# BUILD_LOGS, which Jenkins archives with the build. The console gets a line when the operation starts, one every
# PROGRESS_SECONDS while it runs, and its result. A passed operation's result follows a section with the end of its
# log, which Jenkins collapses (the patterns of modules/ops/config/org.jvnet.hudson.plugins.collapsingconsolesections.
# CollapsingSectionNote.xml); a failure shows the end of its log in full view. NO_COLOR turns off the colours of the
# results.

BUILD_LOGS=${BUILD_LOGS:-$WORKSPACE/build-logs}
PROGRESS_SECONDS=${PROGRESS_SECONDS:-60}
if [[ -z ${NO_COLOR:-} ]]; then
    # Black on green and yellow, since green and yellow text is hard to read on white
    PASSED=$'\e[30;42m' FAILED=$'\e[1;31m' WARNING=$'\e[1;30;43m' PLAIN=$'\e[0m'
else
    PASSED='' FAILED='' WARNING='' PLAIN=''
fi
trap stop_progress EXIT

# name operation command... → runs the command, without colours, with its output in the operation's log; fails as
# the command fails
function logged {
    local name=$1 operation=$2 log started=$SECONDS status statuses details
    shift 2
    log=$BUILD_LOGS/$name.${operation// /-}.log
    mkdir -p "$BUILD_LOGS"
    echo "$name: $operation..."
    report_progress "$name: $operation" &
    PROGRESS=$!
    # Some tools, such as the backends' log4js, colour their output whatever NO_COLOR says
    { NO_COLOR=1 COMPOSE_ANSI=never "$@" 2>&1 | plain >> "$log"; statuses=("${PIPESTATUS[@]}"); } || true
    status=${statuses[0]}
    (( status )) || status=${statuses[1]}
    stop_progress
    if (( status > 128 )); then
        echo "${FAILED}$name: $operation STOPPED${PLAIN} by signal $((status - 128)) after $(duration $((SECONDS - started)))"
    elif (( status )); then
        echo "${FAILED}$name: $operation FAILED${PLAIN} after $(duration $((SECONDS - started))) (exit status $status)"
    fi
    if (( status )); then
        echo "The last 100 lines of its log:"
        # Ending its last line, which a log cut short lacks
        printf '%s\n' "$(tail -n 100 "$log")"
        echo "Full log: $(link "$log")"
        return "$status"
    fi
    details=$(tail -n 20 "$log")
    # One write, so a section is never left open
    printf '%s\n' "Details of $name: $operation" ${details:+"$details"} "Full log: $(link "$log")"
    echo "$name: $operation ${PASSED}passed${PLAIN} in $(duration $((SECONDS - started)))"
}

function warn {
    echo "${WARNING}WARNING:${PLAIN} $*"
}

# Terminal output as plain text: without escape sequences, and with a carriage return, a line feed or both as a line
# end. A line is written as soon as it ends, so a cancelled operation's log keeps what it had written. Not with awk:
# Busybox's holds back the last record of its input when records may end with a carriage return.
function plain {
    python3 -c '
import os, re, sys
codes = re.compile(rb"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b")

def write(data):  # A full disk can take part of a write
    while data:
        data = data[os.write(1, data):]

try:
    rest, after_cr = b"", False
    while chunk := os.read(0, 65536):
        if after_cr and chunk.startswith(b"\n"):
            chunk = chunk[1:]
        *lines, rest = re.split(rb"\r\n|\r|\n", rest + chunk)
        after_cr = chunk.endswith(b"\r")
        write(b"".join(codes.sub(b"", line) + b"\n" for line in lines))
    if rest:
        write(codes.sub(b"", rest) + b"\n")
except OSError as error:
    sys.exit(f"Cannot write the log: {error.strerror}")
'
}

# The log's address in the build's artifacts
function link {
    echo "${BUILD_URL:+${BUILD_URL}artifact/}${1#"$WORKSPACE"/}"
}

function duration {
    if (( $1 < 60 )); then
        echo "$1s"
    else
        echo "$(($1 / 60))m $(($1 % 60))s"
    fi
}

# A line every PROGRESS_SECONDS while the shell that started it runs, until stopped
function report_progress {
    local started=$SECONDS shell=$$
    trap 'kill $(jobs -p) 2> /dev/null; exit' TERM
    while kill -0 "$shell" 2> /dev/null; do
        sleep "$PROGRESS_SECONDS" &
        wait $!
        echo "$1 running ($(duration $((SECONDS - started))) elapsed)"
    done
}

function stop_progress {
    if [[ -n ${PROGRESS:-} ]]; then
        kill "$PROGRESS" 2> /dev/null || true
        wait "$PROGRESS" 2> /dev/null || true
        PROGRESS=''
    fi
}
