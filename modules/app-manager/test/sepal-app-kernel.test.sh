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

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
