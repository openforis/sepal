#!/bin/bash
set -e

# .pgpass separates its fields with ':' and escapes with '\'.
pgpass_escape() {
    local value=${1//\\/\\\\}
    printf '%s\n' "${value//:/\\:}"
}

umask 077
pgpass=/root/.pgpass
echo "$PGHOST:5432:*:$PGUSER:$(pgpass_escape "$POSTGRES_ROOT_PASSWORD")" > $pgpass
chmod 400 $pgpass

if [[ "$RESTORE_BACKUP" == "True" ]]; then
    /script/restore.sh
fi

cat > /etc/cron.d/postgres-backup <<EOL
PGHOST=$PGHOST
PGUSER=$PGUSER
$BACKUP_CRON_EXP root /script/backup.sh >> /proc/1/fd/1 2>&1
EOL

chmod 400 /etc/cron.d/postgres-backup
touch /module/module_initialized

# http://veithen.github.io/2014/11/16/sigterm-propagation.html
trap 'kill -TERM $PID' TERM INT
cron -f &
PID=$!
wait $PID
trap - TERM INT
wait $PID
