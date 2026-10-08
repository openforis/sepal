#!/bin/bash
# Tests for update-app.sh's artifact reconciliation (pack_venv, sync_launcher). Sources the real
# script with dummy arguments, then points its path variables at a fixture tree.
# shellcheck disable=SC2034  # cache_venv is read by pack_venv, from the sourced update-app.sh
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd)
# update-app.sh looks for the generator where the image installs it; point it at the repo copy.
export KERNEL_SPEC=${KERNEL_SPEC:-$HERE/kernel-spec.py}
pass=0; fail=0
ok()   { echo "ok   - $1"; pass=$((pass+1)); }
bad()  { echo "FAIL - $1"; echo "        $2"; fail=$((fail+1)); }

setup() {
    WORK=$(mktemp -d)
    current_kernels="$WORK/current-kernels"
    kernel_path="$current_kernels/venv-testapp"
    current_venv_path="$kernel_path/venv"
    mkdir -p "$current_venv_path/bin"
    head -c 500000 /dev/urandom > "$current_venv_path/bin/blob"
    printf 'x' > "$current_venv_path/bin/python3"
    touch "$current_venv_path/.installed"
    export LAUNCHER_SRC="$WORK/sepal-app-kernel"
    printf '#!/bin/bash\necho v1\n' > "$LAUNCHER_SRC"
}
teardown() { rm -rf "$WORK"; }

# shellcheck disable=SC1090  # path is computed; sourcing the real script is the point
source "$HERE/update-app.sh" /tmp/unused-app unused-label unused-repo HEAD

setup; cache_venv=true; pack_venv
if [[ -f $kernel_path/venv.tar.zst ]]; then ok "an opted-in app gets an archive"
else bad "an opted-in app gets an archive" "no venv.tar.zst"; fi; teardown

setup; cache_venv=true
printf 'interrupted pack' > "$kernel_path/venv.tar.zst.tmp"
pack_venv
if [[ -f $kernel_path/venv.tar.zst && ! -e $kernel_path/venv.tar.zst.failed ]] \
   && zstd -tq "$kernel_path/venv.tar.zst"; then
    ok "an interrupted pack is retried without rebuilding the venv"
else bad "an interrupted pack is retried without rebuilding the venv" "no usable archive or packing backed off"; fi
teardown

setup; cache_venv=false; printf 'stale' > "$kernel_path/venv.tar.zst"; pack_venv
if [[ ! -f $kernel_path/venv.tar.zst ]]; then ok "opting out deletes the archive"
else bad "opting out deletes the archive" "venv.tar.zst survived"; fi; teardown

setup; cache_venv=true; pack_venv
before=$(stat -c %Y "$kernel_path/venv.tar.zst"); sleep 1; pack_venv
after=$(stat -c %Y "$kernel_path/venv.tar.zst")
if [[ $before == "$after" ]]; then ok "an up-to-date archive is not rebuilt"
else bad "an up-to-date archive is not rebuilt" "mtime moved $before -> $after"; fi; teardown

# Without pipefail a failing tar still lets zstd exit 0, publishing an archive that extracts
# cleanly but holds a partial environment. The stale archive must go too, so consumers that
# check only for existence fall back to Lustre rather than run old dependencies.
setup; cache_venv=true; pack_venv
chmod 000 "$current_venv_path/bin/blob"; touch "$current_venv_path/.installed"
pack_venv
chmod 644 "$current_venv_path/bin/blob"
if [[ ! -f $kernel_path/venv.tar.zst ]]; then ok "a failed pack publishes nothing and drops the stale archive"
else bad "a failed pack publishes nothing and drops the stale archive" \
           "venv.tar.zst still present after tar failed"; fi; teardown

setup; sync_launcher
if [[ -x $current_kernels/sepal-app-kernel ]]; then ok "the launcher is installed when missing"
else bad "the launcher is installed when missing" "not installed or not executable"; fi; teardown

setup; sync_launcher
m1=$(stat -c %Y "$current_kernels/sepal-app-kernel"); sleep 1; sync_launcher
m2=$(stat -c %Y "$current_kernels/sepal-app-kernel")
if [[ $m1 == "$m2" ]]; then ok "an unchanged launcher is not rewritten"
else bad "an unchanged launcher is not rewritten" "mtime moved $m1 -> $m2"; fi; teardown

setup; sync_launcher; printf '#!/bin/bash\necho v2\n' > "$LAUNCHER_SRC"; sync_launcher
if grep -q v2 "$current_kernels/sepal-app-kernel"; then ok "a changed launcher is replaced"
else bad "a changed launcher is replaced" "still the old content"; fi
if [[ -z $(find "$current_kernels" -name 'sepal-app-kernel.tmp.*') ]]; then
    ok "no staging file is left behind"
else bad "no staging file is left behind" "found a .tmp.* file"; fi; teardown

# --- create_kernel_json ------------------------------------------------------------------
# Asserts on the parsed document, not on text, so formatting changes do not break the tests.
assert_json() {   # assert_json <name> <python expression over d>
    if python3 -c "
import json, sys
d = json.load(open('$kernel_path/kernel.json'))
sys.exit(0 if ($2) else 1)"; then ok "$1"
    else bad "$1" "$(tr -d '\n' < "$kernel_path/kernel.json")"; fi
}

setup; app_name=testapp; app_label="Test App"; app_path="$WORK/app"; venv_path="$kernel_path/venv"
mkdir -p "$app_path"
cache_venv=false; create_kernel_json
assert_json "without caching, argv runs the venv python directly" \
    "d['argv'][0] == '$venv_path/bin/python3' and d['argv'][1] == '-m'"
assert_json "without caching and without a conda env, env is only PYTHONNOUSERSITE" \
    "d['env'] == {'PYTHONNOUSERSITE': '1'}"
teardown

setup; app_name=testapp; app_label="Test App"; app_path="$WORK/app"; venv_path="$kernel_path/venv"
mkdir -p "$app_path"; touch "$app_path/sepal_environment.yml"
cache_venv=false; create_kernel_json
assert_json "without caching, a conda app still gets the Lustre PROJ/GDAL paths" \
    "d['env']['PROJ_DATA'] == '$venv_path/share/proj' and d['env']['GDAL_DATA'] == '$venv_path/share/gdal'"
teardown

setup; app_name=testapp; app_label="Test App"; app_path="$WORK/app"; venv_path="$kernel_path/venv"
mkdir -p "$app_path"; touch "$app_path/sepal_environment.yml"; sync_launcher
cache_venv=true; create_kernel_json
assert_json "with caching, argv runs the launcher with the app name" \
    "d['argv'] == ['/bin/bash', '/usr/local/share/jupyter/kernels/sepal-app-kernel', 'testapp', '-f', '{connection_file}']"
# The launcher owns the interpreter environment for cached apps, so the spec carries none of it:
# a generated PROJ/GDAL path would pin the kernel to Lustre, and a second PYTHONNOUSERSITE here
# could drift from the one the launcher exports.
assert_json "with caching, the spec delegates the whole environment to the launcher" \
    "d['env'] == {}"
teardown

# I7: a persistently failing pack must not re-read and re-compress a multi-GB tree every pass.
# monitorApps walks apps serially, so a stuck repack stalls every other app too.
setup; cache_venv=true
chmod 000 "$current_venv_path/bin/blob"
pack_venv >/dev/null 2>&1
second=$(pack_venv 2>&1)
chmod 644 "$current_venv_path/bin/blob"
if [[ $second != *"Packing venv"* ]]; then ok "a failed pack backs off instead of retrying every pass"
else bad "a failed pack backs off instead of retrying every pass" "retried: $second"; fi
teardown

setup; cache_venv=true
chmod 000 "$current_venv_path/bin/blob"; pack_venv >/dev/null 2>&1
chmod 644 "$current_venv_path/bin/blob"; sleep 1; touch "$current_venv_path/.installed"
third=$(pack_venv 2>&1)
if [[ $third == *"Packing venv"* && -f $kernel_path/venv.tar.zst ]]; then ok "a rebuilt venv clears the back-off"
else bad "a rebuilt venv clears the back-off" "$third"; fi
teardown

# I5: if the launcher is not installed, kernel.json must not name it. That is the spec's own
# "kernel fails to start / every flagged app" row, and it was the only unguarded one.
setup; app_name=testapp; app_label="Test App"; app_path="$WORK/app"; venv_path="$kernel_path/venv"
mkdir -p "$app_path"; rm -f "$LAUNCHER_SRC"; sync_launcher >/dev/null 2>&1
cache_venv=true; create_kernel_json >/dev/null 2>&1
assert_json "a missing launcher leaves argv on the venv python" \
    "d['argv'][0] == '$venv_path/bin/python3'"
teardown

setup; rm -f "$LAUNCHER_SRC"
msg=$(sync_launcher 2>&1)
if [[ $msg == *launcher* ]]; then ok "a failed launcher install is logged"
else bad "a failed launcher install is logged" "silent: '$msg'"; fi
teardown

# reconcile_artifacts runs create_kernel_json on every monitor pass, and its output is appended
# to a log on Lustre that is only truncated when the venv rebuilds. An idle pass must say nothing.
setup; app_name=testapp; app_label="Test App"; app_path="$WORK/app"; venv_path="$kernel_path/venv"
mkdir -p "$app_path"; cache_venv=false
create_kernel_json >/dev/null 2>&1
idle=$(create_kernel_json 2>&1)
if [[ -z $idle ]]; then ok "an unchanged kernel.json is not announced"
else bad "an unchanged kernel.json is not announced" "logged: '$idle'"; fi
teardown

setup; app_name=testapp; app_label="Test App"; app_path="$WORK/app"; venv_path="$kernel_path/venv"
mkdir -p "$app_path"; cache_venv=false
create_kernel_json >/dev/null 2>&1
m1=$(stat -c %Y "$kernel_path/kernel.json"); sleep 1; create_kernel_json >/dev/null 2>&1
m2=$(stat -c %Y "$kernel_path/kernel.json")
if [[ $m1 == "$m2" ]]; then ok "an unchanged kernel.json is not rewritten"
else bad "an unchanged kernel.json is not rewritten" "mtime moved $m1 -> $m2"; fi
teardown

setup; app_name=testapp; app_label="Test App"; app_path="$WORK/app"; venv_path="$kernel_path/venv"
mkdir -p "$app_path"; cache_venv=false
create_kernel_json >/dev/null 2>&1
app_label="Renamed App"; changed=$(create_kernel_json 2>&1)
if [[ $changed == *"$kernel_path"* ]]; then ok "a changed kernel.json is announced"
else bad "a changed kernel.json is announced" "silent: '$changed'"; fi
teardown

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
