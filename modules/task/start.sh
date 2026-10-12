#!/bin/sh
set -e

HOME_DIR=/home/$USERNAME
GROUP_ID=$(stat -c '%g' "$HOME_DIR")
USER_ID=$(stat -c '%u' "$HOME_DIR")

# A root-owned home is not a user's: most likely Docker created a missing bind source.
if [ "$USER_ID" -eq 0 ]; then
    echo "Refusing to run task: $HOME_DIR is owned by root" >&2
    exit 1
fi

chown "$USER_ID:$GROUP_ID" /task

# The task runs as the owner of the mounted home, so everything it writes there is theirs.
cd /usr/local/src/sepal/modules/task
exec su-exec "$USER_ID:$GROUP_ID" env HOME="$HOME_DIR" node src/run.js
