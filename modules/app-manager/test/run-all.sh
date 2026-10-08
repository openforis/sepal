#!/bin/bash
# Runs every shell test suite beside it, so adding a *.test.sh file needs no workflow change.
# Keeps going after a failure: one CI run then reports every broken suite, not just the first.
set -u
cd "$(dirname "$0")" || exit 1
status=0
failed=()
for suite in ./*.test.sh; do
    echo "=== $suite"
    if ! bash "$suite"; then
        status=1
        failed+=("$suite")
    fi
    echo
done
if (( status == 0 )); then
    echo "all suites passed"
else
    echo "failed: ${failed[*]}"
fi
exit $status
