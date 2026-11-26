#!/bin/bash
set -e

# .pgpass separates its fields with ':' and escapes with '\'.
pgpass_escape() {
    local value=${1//\\/\\\\}
    printf '%s\n' "${value//:/\\:}"
}

umask 077

echo "$POSTGRES_HOST:5432:*:$POSTGRES_USER:$(pgpass_escape "$POSTGRES_ROOT_PASSWORD")" > /root/.pgpass

mkdir -p /root/.aws
printf '%s\n' \
    "[default]" \
    "aws_access_key_id=$AWS_ACCESS_KEY_ID" \
    "aws_secret_access_key=$AWS_SECRET_ACCESS_KEY" \
    > /root/.aws/credentials

printf '%s\n' \
    "PATH=/usr/local/bin:/usr/bin:/bin" \
    "POSTGRES_HOST=$POSTGRES_HOST" \
    "POSTGRES_USER=$POSTGRES_USER" \
    "S3_BACKUP_BUCKET=$S3_BACKUP_BUCKET" \
    "$BACKUP_CRON_EXP root flock -xn /root/backup.lck /script/backup.sh >> /proc/1/fd/1 2>&1" \
    > /etc/cron.d/backup

# http://veithen.github.io/2014/11/16/sigterm-propagation.html
trap 'kill -TERM $PID' TERM INT
cron -f &
PID=$!
wait $PID
trap - TERM INT
wait $PID
