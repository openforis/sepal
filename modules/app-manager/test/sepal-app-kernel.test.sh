#!/bin/bash
# Tests for sepal-app-kernel. Builds a fake kernels tree in a temp dir, points the launcher at
# it, and asserts which interpreter prefix it chose. The stub python3 records its own path.
set -u
LAUNCHER=$(cd "$(dirname "$0")/.." && pwd)/sepal-app-kernel
pass=0; fail=0

setup() {                      # setup <with-tarball: yes|no>
    WORK=$(mktemp -d)
    export SEPAL_KERNELS_DIR="$WORK/kernels" SEPAL_CACHE_ROOT="$WORK/tmp"
    local v="$SEPAL_KERNELS_DIR/venv-testapp/venv"
    mkdir -p "$v/bin" "$SEPAL_CACHE_ROOT"
    printf '#!/bin/bash\necho "PREFIX=$(cd "$(dirname "$0")/.." && pwd)"\n' > "$v/bin/python3"
    chmod +x "$v/bin/python3"
    touch "$v/.installed"
    if [[ $1 == yes ]]; then
        local s="$WORK/src"; mkdir -p "$s/venv/bin"
        printf '#!/bin/bash\necho "PREFIX=$(cd "$(dirname "$0")/.." && pwd)"\n' > "$s/venv/bin/python3"
        chmod +x "$s/venv/bin/python3"
        tar -C "$s" -cf - venv | zstd -q -3 -o "$SEPAL_KERNELS_DIR/venv-testapp/venv.tar.zst"
        touch "$SEPAL_KERNELS_DIR/venv-testapp/venv.tar.zst"   # newer than .installed
    fi
}
teardown() { rm -rf "$WORK"; }

check() {                      # check <name> <expected: lustre|cache>
    local got; got=$(bash "$LAUNCHER" testapp 2>/dev/null | sed -n 's/^PREFIX=//p')
    local want
    if [[ $2 == lustre ]]; then want="$SEPAL_KERNELS_DIR/venv-testapp/venv"
    else want=$(echo "$SEPAL_CACHE_ROOT"/testapp/*/venv); fi
    if [[ $got == "$want" ]]; then echo "ok   - $1"; pass=$((pass+1))
    else echo "FAIL - $1"; echo "        want $want"; echo "        got  $got"; fail=$((fail+1)); fi
}

setup no;  check "no archive falls back to Lustre" lustre; teardown
setup yes; check "an archive is unpacked and used" cache;  teardown

# An archive older than the live env describes superseded dependencies.
setup yes; touch "$SEPAL_KERNELS_DIR/venv-testapp/venv/.installed"
check "an archive older than .installed is ignored" lustre; teardown

# A missing .installed means the env is mid-build; bash treats `-nt` a missing file as true.
setup yes; rm -f "$SEPAL_KERNELS_DIR/venv-testapp/venv/.installed"
check "a missing .installed falls back" lustre; teardown

# Without pipefail a corrupt tail lets zstd fail while tar exits 0. Verified reproducible.
setup yes; head -c 200 /dev/urandom >> "$SEPAL_KERNELS_DIR/venv-testapp/venv.tar.zst"
check "an archive with a corrupt tail falls back" lustre; teardown

# The catalog is external input; a name with a separator must not escape the cache directory.
setup yes
# Give the traversal name a real archive, so the launcher would act on it if unguarded.
# Its cache would land at $SEPAL_CACHE_ROOT/../escape, i.e. $WORK/escape — outside the root.
mkdir -p "$SEPAL_KERNELS_DIR/venv-../escape"
cp "$SEPAL_KERNELS_DIR/venv-testapp/venv.tar.zst" "$SEPAL_KERNELS_DIR/venv-../escape/venv.tar.zst"
touch "$SEPAL_KERNELS_DIR/venv-../escape/venv" 2>/dev/null
bash "$LAUNCHER" ../escape >/dev/null 2>&1
if [[ ! -e $WORK/escape ]]; then echo "ok   - a name with .. does not escape the cache root"; pass=$((pass+1))
else echo "FAIL - a name with .. created $WORK/escape"; fail=$((fail+1)); fi
teardown

# A dead launcher leaves a staging dir; the next start must not adopt it.
setup yes
mkdir -p "$SEPAL_CACHE_ROOT/testapp/$(stat -c %Y "$SEPAL_KERNELS_DIR/venv-testapp/venv.tar.zst").tmp/venv/bin"
check "a leftover staging dir is not adopted" cache; teardown

# Two starts of the same app must extract once, not twice into one path.
setup yes
( bash "$LAUNCHER" testapp >/dev/null 2>&1 & bash "$LAUNCHER" testapp >/dev/null 2>&1 & wait )
# Counting directories is not enough: two unlocked writers share one staging path and can
# leave a half-built tree or an orphaned .tmp behind. Assert the result is complete and clean.
n=$(find "$SEPAL_CACHE_ROOT/testapp" -maxdepth 1 -mindepth 1 -type d ! -name '*.tmp' | wc -l)
leftover=$(find "$SEPAL_CACHE_ROOT/testapp" -maxdepth 1 -name '*.tmp' | wc -l)
good=$(find "$SEPAL_CACHE_ROOT/testapp" -path '*/venv/bin/python3' -perm -u+x | wc -l)
if [[ $n -eq 1 && $leftover -eq 0 && $good -eq 1 ]]; then
    echo "ok   - concurrent starts share one complete cache"; pass=$((pass+1))
else echo "FAIL - concurrent starts: $n caches, $leftover staging dirs, $good usable"; fail=$((fail+1)); fi
teardown

# Insufficient space must fall back rather than fill the user's scratch. A fake df earlier in
# PATH reports zero available, so no production code needs a test-only hook.
setup yes
mkdir -p "$WORK/bin"
printf '#!/bin/bash\necho "Filesystem 1M-blocks Used Available Use%% Mounted"\necho "/dev/fake 100 100 0 100%% /tmp"\n' > "$WORK/bin/df"
chmod +x "$WORK/bin/df"
PATH="$WORK/bin:$PATH" check "no disk space falls back" lustre
teardown

# An unwritable cache root must not abort the kernel under set -u.
setup yes
chmod 500 "$SEPAL_CACHE_ROOT"
check "an unwritable cache root falls back" lustre
chmod 700 "$SEPAL_CACHE_ROOT"; teardown

# A republished env must not delete the copy a running kernel still needs.
setup yes
bash "$LAUNCHER" testapp >/dev/null 2>&1
old=$(echo "$SEPAL_CACHE_ROOT"/testapp/*)
sleep 1; touch "$SEPAL_KERNELS_DIR/venv-testapp/venv.tar.zst"
bash "$LAUNCHER" testapp >/dev/null 2>&1
if [[ -d $old ]]; then echo "ok   - the previous generation survives"; pass=$((pass+1))
else echo "FAIL - the previous generation was deleted"; fail=$((fail+1)); fi
teardown

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
