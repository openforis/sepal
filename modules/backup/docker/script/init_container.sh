#!/bin/bash
set -e

cat >/etc/cron.d/backup <<EOL
$BACKUP_CRON_EXP root /script/backup.sh
EOL

# http://veithen.github.io/2014/11/16/sigterm-propagation.html
trap 'kill -TERM $PID' TERM INT
cron -f &
PID=$!
wait $PID
trap - TERM INT
wait $PID
EXIT_STATUS=$?
