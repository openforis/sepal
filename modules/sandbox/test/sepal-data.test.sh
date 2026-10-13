#!/bin/bash
# Golden tests for sepal-data, with fake curl, rclone and mountpoint on PATH.
set -u
cd "$(dirname "$0")" || exit 1
HELPER=$(realpath ../bin/sepal-data)
failures=0

fail() { echo "FAIL: $1"; failures=$((failures + 1)); }

setup() {
    WORK=$(mktemp -d)
    mkdir -p "$WORK/bin"
    export PATH="$WORK/bin:$PATH"
    export SEPAL_HOST=sepal.example.org
    export SEPAL_DATA_TOKEN_FILE="$WORK/token"
    export SEPAL_DATA_API_KEY_FILE="$WORK/api-key"
    export DATA_MOUNT_POINT="$WORK/mnt"
    printf 'session-key' > "$SEPAL_DATA_API_KEY_FILE"
    unset SEPAL_API_KEY
}

fake_curl() { # response body; exit status
    cat > "$WORK/bin/curl" <<EOF
#!/bin/bash
printf '%s\n' "\$@" > "$WORK/curl-args"
cat > "$WORK/curl-stdin"
printf '%s' '$1'
exit ${2:-0}
EOF
    chmod +x "$WORK/bin/curl"
}

ACCESS='{"attachment":"data","mode":"readWrite","rclone":{"type":"s3","root":"sepal-test-user-data/users/alice","options":{"env_auth":"true","no_check_bucket":"true","provider":"AWS","region":"eu-west-1"}},"env":{"AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE":"/var/run/sepal-data-token","AWS_CONTAINER_CREDENTIALS_FULL_URI":"https://sepal.example.org/api/user-data/attachments/data/credentials","AWS_REGION":"eu-west-1","SEPAL_DATA_URL":"s3://sepal-test-user-data/users/alice/","SEPAL_DATA_VSI":"/vsis3/sepal-test-user-data/users/alice"}}'

test_env_prints_the_environment() {
    setup; fake_curl "$ACCESS"
    "$HELPER" env sandbox > "$WORK/out" || fail "env exited non-zero"
    diff -u sepal-data-env.golden "$WORK/out" || fail "env output differs from the golden file"
}

test_env_asks_for_the_purpose_with_the_session_key() {
    setup; fake_curl "$ACCESS"
    "$HELPER" env sandbox > /dev/null
    grep -qx 'https://sepal.example.org/api/user-data/attachments/data/access' "$WORK/curl-args" || fail "wrong URL"
    grep -qx '{"purpose":"sandbox"}' "$WORK/curl-args" || fail "wrong body"
    grep -qxF "header = \"Authorization: Basic $(printf ':session-key' | base64 -w0)\"" "$WORK/curl-stdin" \
        || fail "Authorization not on stdin"
    if grep -qF "$(printf ':session-key' | base64 -w0)" "$WORK/curl-args"; then fail "key visible in curl arguments"; fi
}

test_env_writes_the_token_file_private() {
    setup; fake_curl "$ACCESS"
    "$HELPER" env sandbox > /dev/null
    [ "$(cat "$SEPAL_DATA_TOKEN_FILE")" = "Basic $(printf ':session-key' | base64 -w0)" ] || fail "token content"
    [ "$(stat -c '%a' "$SEPAL_DATA_TOKEN_FILE")" = 600 ] || fail "token mode"
}

test_env_prefers_the_key_in_the_environment() {
    setup; fake_curl "$ACCESS"
    SEPAL_API_KEY=env-key "$HELPER" env sandbox > /dev/null
    [ "$(cat "$SEPAL_DATA_TOKEN_FILE")" = "Basic $(printf ':env-key' | base64 -w0)" ] || fail "token from SEPAL_API_KEY"
}

test_env_fails_quietly_when_user_data_is_unreachable() {
    setup; fake_curl '' 7
    if "$HELPER" env sandbox > "$WORK/out" 2> "$WORK/err"; then fail "exit 0 on curl failure"; fi
    [ ! -s "$WORK/out" ] || fail "printed output on failure"
    [ -s "$WORK/err" ] || fail "no warning on stderr"
}

test_env_refuses_values_with_spaces_or_dollars() {
    setup; fake_curl "${ACCESS/eu-west-1\"/eu west\"}"
    if "$HELPER" env sandbox > "$WORK/out" 2>/dev/null; then fail "accepted a value with a space"; fi
    [ ! -s "$WORK/out" ] || fail "printed output for a refused value"
    setup; fake_curl "${ACCESS/eu-west-1\"/\$HOME\"}"
    if "$HELPER" env sandbox > /dev/null 2>&1; then fail "accepted a value with a dollar"; fi
}

refused() { # description; access response
    setup; fake_curl "$2"
    if "$HELPER" env sandbox > "$WORK/out" 2>/dev/null; then fail "accepted $1"; fi
    [ ! -s "$WORK/out" ] || fail "printed output for $1"
}

test_env_refuses_unsafe_keys_and_values() {
    refused "a key with a space" "${ACCESS/\"AWS_REGION\"/\"AWS REGION\"}"
    refused "a key with a newline" "${ACCESS/\"AWS_REGION\"/\"AWS_REGION\\nX\"}"
    refused "a quote value" "${ACCESS/eu-west-1\"/eu\\\"west\"}"
    refused "a backslash value" "${ACCESS/eu-west-1\"/eu\\\\west\"}"
    refused "a trailing newline value" "${ACCESS/eu-west-1\"/eu-west-1\\n\"}"
    refused "a null value" "${ACCESS/\"AWS_REGION\":\"eu-west-1\"/\"AWS_REGION\":null}"
}

test_pending_uploads_fails_when_rclone_fails() {
    setup
    printf '#!/bin/bash\nexit 1\n' > "$WORK/bin/rclone"; chmod +x "$WORK/bin/rclone"
    if "$HELPER" pending-uploads > /dev/null 2>&1; then fail "pending-uploads succeeded when rclone failed"; fi
}

test_mount_runs_rclone_with_the_spike_flags() {
    setup; fake_curl "$ACCESS"
    cat > "$WORK/bin/rclone" <<EOF
#!/bin/bash
printf '%s\n' "\$@" > "$WORK/rclone-args"
env | grep '^RCLONE_CONFIG_DATA' | sort > "$WORK/rclone-env"
EOF
    chmod +x "$WORK/bin/rclone"
    DATA_UID=1001 DATA_GID=1002 "$HELPER" mount || fail "mount exited non-zero"
    grep -qx '{"purpose":"mount"}' "$WORK/curl-args" || fail "mount did not ask for purpose mount"
    for flag in mount data: "$DATA_MOUNT_POINT" --allow-other --uid 1001 --gid 1002 --vfs-cache-mode full \
        --cache-dir /cache --vfs-cache-max-size 20G --buffer-size 0 --vfs-write-back 5s --dir-cache-time 1m \
        --rc --rc-addr 127.0.0.1:5572 --rc-no-auth; do
        grep -qxF -- "$flag" "$WORK/rclone-args" || fail "rclone missing argument $flag"
    done
    grep -qx 'RCLONE_CONFIG_DATA_REMOTE=dataremote:sepal-test-user-data/users/alice' "$WORK/rclone-env" \
        || fail "rclone did not get the data remote"
    [ -d "$DATA_MOUNT_POINT" ] || fail "mount point not created"
}

test_pending_uploads_lists_the_queue() {
    setup
    cat > "$WORK/bin/rclone" <<'EOF'
#!/bin/bash
printf '{"queue":[{"name":"out/a.tif","uploading":true},{"name":"b.txt","uploading":false}]}'
EOF
    chmod +x "$WORK/bin/rclone"
    [ "$("$HELPER" pending-uploads)" = $'out/a.tif\nb.txt' ] || fail "pending-uploads output"
}

test_pending_uploads_is_empty_for_an_empty_queue() {
    setup
    cat > "$WORK/bin/rclone" <<'FAKE'
#!/bin/bash
printf '{"queue":[]}'
FAKE
    chmod +x "$WORK/bin/rclone"
    [ -z "$("$HELPER" pending-uploads)" ] || fail "pending-uploads not empty"
}

test_wait_mounted_times_out() {
    setup
    printf '#!/bin/bash\nexit 1\n' > "$WORK/bin/mountpoint"; chmod +x "$WORK/bin/mountpoint"
    if "$HELPER" wait-mounted 1; then fail "wait-mounted succeeded without a mount"; fi
}

test_wait_mounted_succeeds_once_mounted() {
    setup
    printf '#!/bin/bash\nexit 0\n' > "$WORK/bin/mountpoint"; chmod +x "$WORK/bin/mountpoint"
    "$HELPER" wait-mounted 1 || fail "wait-mounted failed with a mount"
}

for test in $(declare -F | awk '{print $3}' | grep '^test_'); do
    $test
done
if (( failures == 0 )); then echo "sepal-data: all tests passed"; else echo "sepal-data: $failures failure(s)"; exit 1; fi
