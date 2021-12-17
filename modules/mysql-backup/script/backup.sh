#!/bin/bash
set -e

password=$(cat $1)

echo "Backup started"

bash -c "mysqldump \
    -p'$password' \
    -h mysql \
    --all-databases \
    --single-transaction \
    --quick \
    > /backup/dump.sql"

echo "Backup completed"