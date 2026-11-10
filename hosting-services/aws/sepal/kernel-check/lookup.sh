#!/usr/bin/env bash
# Read-only checks, on a current main host, that it can move to Amazon Linux 2023 with kernel 6.18.
# Run with: sudo bash lookup.sh
set -u

FAILURES=0

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILURES=$((FAILURES + 1)); }

echo "INFO  $(cat /etc/system-release), kernel $(uname -r)"

# Kernel 6.18 disables the V4 format (crc=0) by default
format=$(xfs_info /data 2>/dev/null | grep -o 'crc=[01]')
if [ "$format" = crc=1 ]; then
    pass "/data is XFS V5 ($format)"
else
    fail "/data is not XFS V5 (${format:-format unreadable})"
fi

# The AL2023 Lustre client supports file systems 2.12 and 2.15, not 2.10
version=$(lctl get_param -n 'mdc.*.import' 2>/dev/null | awk '/target_version:/ {print $2; exit}')
if [ -z "$version" ]; then
    fail "FSx version unreadable (is Lustre mounted under /data/sepal?)"
elif [ "$(printf '%s\n' 2.12 "$version" | sort -V | head -1)" = 2.12 ]; then
    pass "FSx is Lustre $version"
else
    fail "FSx is Lustre $version; the AL2023 client needs 2.12 or later"
fi

exit $FAILURES
