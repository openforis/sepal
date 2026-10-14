#!/bin/bash
# Tests for wait_until_initialized.sh, with fake netstat and sleep on PATH.
set -u
cd "$(dirname "$0")" || exit 1
SCRIPT=$(realpath ../script/wait_until_initialized.sh)
failures=0

fail() { echo "FAIL: $1"; failures=$((failures + 1)); }

setup() { # number of netstat calls that come back empty before the port listens
    WORK=$(mktemp -d)
    mkdir -p "$WORK/bin"
    export PATH="$WORK/bin:$PATH"
    echo 0 > "$WORK/calls"
    cat > "$WORK/bin/netstat" <<FAKE
#!/bin/bash
n=\$(( \$(cat "$WORK/calls") + 1 )); echo \$n > "$WORK/calls"
[ \$n -gt $1 ] && echo 'tcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN 1/sshd'
exit 0
FAKE
    printf '#!/bin/bash\n' > "$WORK/bin/sleep"
    chmod +x "$WORK/bin/netstat" "$WORK/bin/sleep"
}

test_succeeds_when_the_port_is_already_listening() {
    setup 0
    bash "$SCRIPT" 22 >/dev/null 2>&1 || fail "failed with the port listening"
}

test_succeeds_when_the_port_appears_on_the_last_wait() {
    setup 30
    bash "$SCRIPT" 22 >/dev/null 2>&1 || fail "failed when the port appeared on the last check"
}

test_fails_when_the_port_never_appears() {
    setup 1000
    if bash "$SCRIPT" 22 >/dev/null 2>&1; then fail "succeeded without the port"; fi
}

for test in $(declare -F | awk '{print $3}' | grep '^test_'); do
    $test
done
if (( failures == 0 )); then echo "wait-until-initialized: all tests passed"; else echo "wait-until-initialized: $failures failure(s)"; exit 1; fi
