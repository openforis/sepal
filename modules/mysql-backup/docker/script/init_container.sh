#!/bin/bash
if [[ "$RESTORE_BACKUP" == "True" ]]; then
    /script/restore.sh
fi

passwordFile=/etc/mysql/root-password
echo $MYSQL_ROOT_PASSWORD > $passwordFile
chmod 400 $passwordFile

cat > /etc/cron.d/mysql-backup <<EOL
$BACKUP_CRON_EXP root /script/backup.sh '$MYSQL_DATABASE' '$passwordFile'
EOL

chmod 400 /etc/cron.d/mysql-backup
touch /module/module_initialized

# http://veithen.github.io/2014/11/16/sigterm-propagation.html
trap 'kill -TERM $PID' TERM INT
cron -f &
PID=$!
wait $PID
trap - TERM INT
wait $PID
EXIT_STATUS=$?

