#!/bin/bash
set -e

HOME_DIR=/home/$USERNAME
GROUP_ID=$(stat -c '%g' "$HOME_DIR")
USER_ID=$(stat -c '%u' "$HOME_DIR")

# The container runs as the owner of the mounted home, so everything it writes there is theirs.
if ! id "$USERNAME" >/dev/null 2>&1; then
    groupadd -o -g "$GROUP_ID" "$USERNAME"
    useradd -o -u "$USER_ID" -g "$GROUP_ID" -d "$HOME_DIR" "$USERNAME"
fi
chown "$USER_ID:$GROUP_ID" /task

cd /usr/local/src/sepal/modules/task
exec sudo -Eu "$USERNAME" "PATH=$PATH" "HOME=$HOME_DIR" node src/run.js
