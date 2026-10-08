#!/bin/bash
# Golden-file tests for create_kernel_json. The committed golden file records the exact spec
# generated for a matrix of awkward labels, so any change to how the JSON is built — formatting,
# key order, escaping — shows up as a diff rather than as a surprise on a user's instance.
# Regenerate deliberately with UPDATE_GOLDEN=1 and review the diff.
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd)
GOLDEN=$HERE/test/kernel-json.golden
GEN=${GEN:-$HERE/update-app.sh}
# update-app.sh looks for the generator where the image installs it; point it at the repo copy.
export KERNEL_SPEC=${KERNEL_SPEC:-$HERE/kernel-spec.py}

# Labels chosen for what they do to a JSON string: nothing, non-ASCII, the two characters that
# must be escaped, two whitespace controls, and a control character json_escape used to pass
# through raw — which JSON forbids and which made the spec unparseable.
declare -A labels=(
    [plain]='Sampling Based Area Estimation'
    [accented]='Área de Muestreo — Diseño'
    [quote]='He said "hello" twice'
    [backslash]='C:\path\to\thing'
    [newline]=$'first line\nsecond line'
    [tab]=$'before\tafter'
    [control]=$'bell\x07and\x0bvertical'
)

render() {
    local W; W=$(mktemp -d)
    local name cache conda
    for name in plain accented quote backslash newline tab control; do
        for cache in false true; do
            for conda in false true; do
                mkdir -p "$W/ck/venv-testapp/venv" "$W/app"
                if [[ $conda == true ]]; then touch "$W/app/sepal_environment.yml"
                else rm -f "$W/app/sepal_environment.yml"; fi
                printf '#!/bin/bash\ntrue\n' > "$W/ck/sepal-app-kernel"
                chmod +x "$W/ck/sepal-app-kernel"
                # a spec left by the previous case would be reused by the cmp guard
                rm -f "$W/ck/venv-testapp/kernel.json"
                echo "=== $name cache=$cache conda=$conda"
                bash -c '
                    set -u
                    # shellcheck disable=SC1090
                    source "$1" /tmp/unused-app unused-label unused-repo HEAD
                    current_kernels=$2; kernel_path=$2/venv-testapp; venv_path=$kernel_path/venv
                    app_path=$3; app_name=testapp; app_label=$4; cache_venv=$5
                    create_kernel_json >/dev/null 2>&1
                    cat "$kernel_path/kernel.json"
                ' _ "$GEN" "$W/ck" "$W/app" "${labels[$name]}" "$cache"
                echo
            done
        done
    done
    rm -rf "$W"
}

# The spec embeds absolute paths, so normalise the throwaway directory out of the comparison.
actual=$(mktemp); trap 'rm -f "$actual"' EXIT
render | sed -E 's#/tmp/tmp\.[A-Za-z0-9]+#@WORK@#g' > "$actual"

if [[ ${UPDATE_GOLDEN:-} == 1 ]]; then
    cp "$actual" "$GOLDEN"; echo "golden updated: $GOLDEN"; exit 0
fi
if [[ ! -f $GOLDEN ]]; then
    echo "FAIL - no golden file at $GOLDEN (create it with UPDATE_GOLDEN=1)"; exit 1
fi
if diff -u "$GOLDEN" "$actual" > /tmp/kj.diff 2>&1; then
    echo "ok   - every generated spec matches the golden file ($(grep -c '^=== ' "$GOLDEN") cases)"
    # Every spec must parse. The hand-rolled escaper this replaced passed control characters
    # through raw, which JSON forbids, so a label containing one produced an unusable spec.
    if python3 -c '
import json, sys
bad = []
for block in open(sys.argv[1]).read().split("=== ")[1:]:
    head, _, body = block.partition("\n")
    try:
        json.loads(body)
    except ValueError as e:
        bad.append(f"{head.strip()}: {e}")
if bad:
    print("\n".join(bad))
    sys.exit(1)' "$GOLDEN"; then
        echo "ok   - every spec in the golden file is valid JSON"
    else
        echo "FAIL - the golden file contains an unparseable spec"; exit 1
    fi
    # A generator that will not run must leave the installed spec alone. Shipping the generator
    # as its own file introduced this failure mode: the image can be built without it.
    G=$(mktemp -d); trap 'rm -rf "$G"' EXIT
    mkdir -p "$G/ck/venv-testapp/venv" "$G/app"
    printf 'previous spec\n' > "$G/ck/venv-testapp/kernel.json"
    log=$(KERNEL_SPEC=$G/absent.py bash -c '
        set -u
        # shellcheck disable=SC1090
        source "$1" /tmp/unused-app unused-label unused-repo HEAD
        current_kernels=$2; kernel_path=$2/venv-testapp; venv_path=$kernel_path/venv
        app_path=$3; app_name=testapp; app_label=label; cache_venv=false
        create_kernel_json
    ' _ "$GEN" "$G/ck" "$G/app" 2>&1)
    if [[ $(cat "$G/ck/venv-testapp/kernel.json") == 'previous spec' ]] \
       && [[ ! -e $G/ck/venv-testapp/kernel.json.tmp ]] \
       && [[ $log == *"Failed to generate kernel spec"* ]]; then
        echo "ok   - a generator that cannot run leaves the installed spec untouched"
    else
        echo "FAIL - a missing generator damaged the installed spec"
        echo "  kernel.json: $(cat "$G/ck/venv-testapp/kernel.json" 2>&1)"
        echo "  log: $log"
        exit 1
    fi
    echo "3 passed, 0 failed"
else
    echo "FAIL - generated specs differ from the golden file:"; head -40 /tmp/kj.diff
    echo "If the change is intended, regenerate with UPDATE_GOLDEN=1 and review the diff."
    exit 1
fi
