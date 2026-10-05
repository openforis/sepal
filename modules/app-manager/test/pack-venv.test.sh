#!/bin/bash
# Tests for update-app.sh's artifact reconciliation (pack_venv, sync_launcher). Sources the real
# script with dummy arguments, then points its path variables at a fixture tree.
# shellcheck disable=SC2034  # cache_venv is read by pack_venv, from the sourced update-app.sh
set -u
HERE=$(cd "$(dirname "$0")/.." && pwd)
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

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
