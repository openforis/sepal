#!/bin/bash
# The shell suite of ci/tests.yml. GitHub's shell job runs the same checks as separate steps.
set -euo pipefail
cd "$(dirname "$0")/.."
# New code is held to warnings; update-app.sh only to errors, because it carries
# pre-existing warnings in code this change does not touch.
shellcheck -S warning modules/app-manager/sepal-app-kernel modules/app-manager/test/*.sh
shellcheck -S error modules/app-manager/update-app.sh
shellcheck -S warning modules/ops/script/sepal-build.sh modules/ops/script/build-and-push-images.sh \
    modules/ops/test/*.sh ci/*.sh ci/test/*.sh
bash modules/ops/test/sepal-build.test.sh
python3 -m unittest discover -s modules/ops/test -p '*_test.py'
modules/app-manager/test/run-all.sh
