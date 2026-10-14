#!/bin/bash
# Tests for the Data warning in the /etc/bash.bashrc block that init_image.sh writes, with a fake
# stat on PATH.
set -u
cd "$(dirname "$0")" || exit 1
failures=0

fail() { echo "FAIL: $1"; failures=$((failures + 1)); }

setup() {
    WORK=$(mktemp -d)
    mkdir -p "$WORK/bin" "$WORK/home/data"
    # The block init_image.sh appends to /etc/bash.bashrc.
    sed -n "/^cat >> \/etc\/bash.bashrc <<'EOF'\$/,/^EOF\$/p" ../script/init_image.sh | sed '1d;$d' > "$WORK/bashrc"
}

fake_stat() { # filesystem type stat -f -c %T prints
    printf '#!/bin/bash\necho %s\n' "$1" > "$WORK/bin/stat"
    chmod +x "$WORK/bin/stat"
}

first_prompt() { # PATH; runs the hook as bash does before the first prompt
    HOME="$WORK/home" PATH="$1" bash --norc -c '. "$1"; eval "$PROMPT_COMMAND"; eval "$PROMPT_COMMAND"' _ "$WORK/bashrc" 2>&1
}

# The failed-mount fallback binds an empty read-only directory of the worker's disk; without the bind it
# would be the home's EFS (nfs).
test_warns_once_when_data_is_not_fuse() {
    for type in ext2/ext3 xfs nfs; do
        setup; fake_stat "$type"
        out=$(first_prompt "$WORK/bin:$PATH")
        [ "$out" = "Your Data folder (~/data) is not available in this session. Start a new session to get it back." ] \
            || fail "expected one warning on $type, got: $out"
    done
}

test_silent_when_data_is_mounted() {
    for type in fuseblk fuse; do
        setup; fake_stat "$type"
        [ -z "$(first_prompt "$WORK/bin:$PATH")" ] || fail "warned about Data mounted as $type"
    done
}

test_silent_without_data_folder() {
    setup; fake_stat xfs; rmdir "$WORK/home/data"
    [ -z "$(first_prompt "$WORK/bin:$PATH")" ] || fail "warned without a data folder"
}

test_silent_without_stat() {
    setup
    mkdir "$WORK/nobin"; for c in bash sed; do ln -s "$(command -v $c)" "$WORK/nobin/$c"; done
    [ -z "$(first_prompt "$WORK/nobin")" ] || fail "warned without stat"
}

test_silent_when_stat_fails() {
    setup
    printf '#!/bin/bash\nexit 1\n' > "$WORK/bin/stat"; chmod +x "$WORK/bin/stat"
    [ -z "$(first_prompt "$WORK/bin:$PATH")" ] || fail "warned when stat failed"
}

for test in $(declare -F | awk '{print $3}' | grep '^test_'); do
    $test
done
if (( failures == 0 )); then echo "bashrc-data-warning: all tests passed"; else echo "bashrc-data-warning: $failures failure(s)"; exit 1; fi
