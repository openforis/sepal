#!/bin/bash
# Tests for sepal-app-kernel. Builds a fake kernels tree in a temp dir, points the launcher at
# it, and asserts which interpreter prefix it chose. The stub python3 records its own path.
set -u
LAUNCHER=$(cd "$(dirname "$0")/.." && pwd)/sepal-app-kernel
pass=0; fail=0

stub() {   # a fake interpreter that reports its own prefix and the geo env it was given
    printf '#!/bin/bash\n'
    printf 'echo "PREFIX=$(cd "$(dirname "$0")/.." && pwd)"\n'
    printf 'echo "PROJ_DATA=${PROJ_DATA:-unset}"\n'
    printf 'echo "GDAL_DATA=${GDAL_DATA:-unset}"\n'
}

setup() {                      # setup <with-tarball: yes|no>
    WORK=$(mktemp -d)
    export SEPAL_KERNELS_DIR="$WORK/kernels" SEPAL_CACHE_ROOT="$WORK/tmp"
    local v="$SEPAL_KERNELS_DIR/venv-testapp/venv"
    mkdir -p "$v/bin" "$SEPAL_CACHE_ROOT"
    stub > "$v/bin/python3"
    chmod +x "$v/bin/python3"
    touch "$v/.installed"
    if [[ $1 == yes ]]; then
        local s="$WORK/src"; mkdir -p "$s/venv/bin"
        stub > "$s/venv/bin/python3"
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
mkdir -p "$SEPAL_KERNELS_DIR/venv-../escape/venv/bin"
cp "$SEPAL_KERNELS_DIR/venv-testapp/venv.tar.zst" "$SEPAL_KERNELS_DIR/venv-../escape/venv.tar.zst"
stub > "$SEPAL_KERNELS_DIR/venv-../escape/venv/bin/python3"
chmod +x "$SEPAL_KERNELS_DIR/venv-../escape/venv/bin/python3"
touch "$SEPAL_KERNELS_DIR/venv-../escape/venv/.installed"
touch "$SEPAL_KERNELS_DIR/venv-../escape/venv.tar.zst"
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

# I2: a cache generation whose interpreter has gone (a tmp reaper, a half-finished delete) must
# not be adopted — exec would die 127 with Lustre sitting right there.
setup yes
bash "$LAUNCHER" testapp >/dev/null 2>&1
rm -f "$SEPAL_CACHE_ROOT"/testapp/*/venv/bin/python3
check "a cache with no interpreter falls back" lustre
teardown

# I4: pin the lock itself. Hold it from outside and assert the launcher waited for it, rather
# than racing two launchers and hoping for a losing interleaving.
setup yes
( flock -x 9; sleep 2 ) 9> "$SEPAL_CACHE_ROOT/.testapp.lock" &
holder=$!
sleep 0.3
t0=$EPOCHREALTIME; bash "$LAUNCHER" testapp >/dev/null 2>&1; t1=$EPOCHREALTIME
wait $holder
waited=$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.0f", b-a}')
if (( waited >= 1 )); then echo "ok   - the launcher waits on the lock"; pass=$((pass+1))
else echo "FAIL - the launcher did not wait on the lock (${waited}s)"; fail=$((fail+1)); fi
teardown

# I6: create_kernel_json only ever set PROJ/GDAL for conda apps. A pip venv has no share/proj,
# so exporting a path into it overrides the system defaults the app relied on.
setup no
got=$(bash "$LAUNCHER" testapp 2>/dev/null | sed -n 's/^PROJ_DATA=//p')
if [[ $got == unset ]]; then echo "ok   - no PROJ_DATA is exported for a venv without share/proj"; pass=$((pass+1))
else echo "FAIL - exported PROJ_DATA=$got for a venv with no share/proj"; fail=$((fail+1)); fi
teardown

setup no; mkdir -p "$SEPAL_KERNELS_DIR/venv-testapp/venv/share/proj"
got=$(bash "$LAUNCHER" testapp 2>/dev/null | sed -n 's/^PROJ_DATA=//p')
if [[ $got == "$SEPAL_KERNELS_DIR/venv-testapp/venv/share/proj" ]]; then
    echo "ok   - PROJ_DATA is exported when share/proj exists"; pass=$((pass+1))
else echo "FAIL - PROJ_DATA was $got"; fail=$((fail+1)); fi
teardown

# C1: zstd is not declared in any sandbox Dockerfile. It is present today (verified on a live
# test sandbox), but if it ever goes the feature must say so rather than silently do nothing.
setup yes
mkdir -p "$WORK/nozstd"
for t in bash tar stat df flock timeout mkdir rm mv find awk sed dirname cat chmod; do
    ln -sf "$(command -v $t)" "$WORK/nozstd/$t" 2>/dev/null
done
err=$(PATH="$WORK/nozstd" bash "$LAUNCHER" testapp 2>&1 >/dev/null)
if [[ $err == *"zstd"* ]]; then echo "ok   - a missing zstd is reported, not silent"; pass=$((pass+1))
else echo "FAIL - no mention of zstd when it is absent: $err"; fail=$((fail+1)); fi
teardown

budget_results=$(mktemp -d)
budget_pids=()
# Exercise real timeouts concurrently; each must leave time within Voila's 60 s deadline.
for scenario in lock extraction combined; do
    (
        setup yes
        holder=''
        case $scenario in
            lock) lock_delay=35; extract_delay=0 ;;
            extraction) lock_delay=0; extract_delay=35 ;;
            combined) lock_delay=15; extract_delay=20 ;;
        esac
        if (( lock_delay > 0 )); then
            ( flock -x 9; touch "$WORK/locked"; sleep "$lock_delay" ) \
                9> "$SEPAL_CACHE_ROOT/.testapp.lock" &
            holder=$!
            while [[ ! -f $WORK/locked ]]; do sleep 0.01; done
        fi
        if (( extract_delay > 0 )); then
            mkdir -p "$WORK/bin"
            TEST_ZSTD=$(command -v zstd)
            export TEST_ZSTD TEST_EXTRACT_DELAY=$extract_delay
            cat > "$WORK/bin/zstd" <<'EOF'
#!/bin/bash
trap '' TERM
sleep "$TEST_EXTRACT_DELAY"
exec "$TEST_ZSTD" "$@"
EOF
            chmod +x "$WORK/bin/zstd"
            export PATH="$WORK/bin:$PATH"
        fi

        timeout -k 1 40 bash "$LAUNCHER" testapp > "$WORK/result" 2> "$WORK/error"
        status=$?
        got=$(sed -n 's/^PREFIX=//p' "$WORK/result")
        result=0
        if [[ $status -ne 0 || $got != "$SEPAL_KERNELS_DIR/venv-testapp/venv" ]]; then
            echo "$scenario: expected Lustre fallback before 40 s, got status=$status prefix=$got"
            cat "$WORK/error"
            result=1
        fi
        if [[ -n $(find "$SEPAL_CACHE_ROOT/testapp" -mindepth 1 -type d) ]]; then
            echo "$scenario: left an incomplete or published cache after timing out"
            result=1
        fi
        [[ -z $holder ]] || wait "$holder"
        if ! flock -w 1 "$SEPAL_CACHE_ROOT/.testapp.lock" true; then
            echo "$scenario: an extraction process still holds the lock"
            result=1
        fi
        teardown
        exit "$result"
    ) > "$budget_results/$scenario" 2>&1 &
    budget_pids+=("$!")
done
index=0
for scenario in lock extraction combined; do
    if wait "${budget_pids[$index]}"; then
        echo "ok   - $scenario falls back within the shared startup budget"; pass=$((pass+1))
    else
        echo "FAIL - $scenario exceeds the shared startup budget"; fail=$((fail+1))
        cat "$budget_results/$scenario"
    fi
    index=$((index+1))
done
rm -rf "$budget_results"

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
