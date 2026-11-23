#!/bin/bash
# Tests for the job launcher: which build program a branch gets, with which arguments and exit status.
set -u
LAUNCHER=$(cd "$(dirname "$0")/.." && pwd)/script/sepal-build.sh
pass=0; fail=0
ok()  { echo "ok   - $1"; pass=$((pass+1)); }
bad() { echo "FAIL - $1"; echo "        $2"; fail=$((fail+1)); }

setup() {
    WORKSPACE=$(mktemp -d); export WORKSPACE
    JENKINS_HOME=$WORKSPACE/jenkins; export JENKINS_HOME
    git init --quiet --bare "$WORKSPACE/origin.git"
    git -C "$WORKSPACE" init --quiet
    git -C "$WORKSPACE" remote add origin "$WORKSPACE/origin.git"
    mkdir -p "$WORKSPACE/bin"
    printf '%s\n' '#!/bin/sh' 'case "$1" in' \
        'inspect) echo '\''{"State":{"Running":true}}'\'' ;;' 'ps) ;;' '*) exit 1 ;;' 'esac' > "$WORKSPACE/bin/docker"
    chmod +x "$WORKSPACE/bin/docker"
    PATH=$WORKSPACE/bin:$PATH; export PATH
    mkdir -p "$WORKSPACE/modules/ops/script"
    printf '#!/bin/sh\necho "old $*" > "$WORKSPACE/ran"\nexit "${STUB_EXIT:-0}"\n' \
        > "$WORKSPACE/modules/ops/script/build-and-push-images.sh"
    chmod +x "$WORKSPACE/modules/ops/script/build-and-push-images.sh"
}
with_build_py() {
    mkdir -p "$WORKSPACE/ci"
    printf '%s\n' 'import os, sys' \
        'open(os.environ["WORKSPACE"] + "/ran", "w").write("python " + " ".join(sys.argv[1:]) + "\n")' \
        'sys.exit(int(os.environ.get("STUB_EXIT", "0")))' > "$WORKSPACE/ci/build.py"
}
teardown() { rm -rf "$WORKSPACE"; }

setup; with_build_py; sh "$LAUNCHER" 471-test --clean
ran=$(cat "$WORKSPACE/ran" 2>/dev/null)
if [[ $ran == "python 471-test --clean" ]]; then ok "a branch with ci/build.py builds with it"
else bad "a branch with ci/build.py builds with it" "ran: $ran"; fi; teardown

setup; sh "$LAUNCHER" 471-hotfix
ran=$(cat "$WORKSPACE/ran" 2>/dev/null)
if [[ $ran == "old 471-hotfix" ]]; then ok "a branch without ci/build.py builds with the old script"
else bad "a branch without ci/build.py builds with the old script" "ran: $ran"; fi; teardown

setup; STUB_EXIT=3 sh "$LAUNCHER" 471; status=$?
if [[ $status == 3 ]]; then ok "the old script's exit status is the job's"
else bad "the old script's exit status is the job's" "exit $status"; fi; teardown

setup; with_build_py; STUB_EXIT=3 sh "$LAUNCHER" 471; status=$?
if [[ $status == 3 ]]; then ok "build.py's exit status is the job's"
else bad "build.py's exit status is the job's" "exit $status"; fi; teardown

echo "$pass passed, $fail failed"
(( fail == 0 ))
