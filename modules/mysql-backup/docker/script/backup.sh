#!/bin/bash
set -e

database=$1
password=$(cat $2)
timestamp=$(date +"%d-%B-%y_%H-%M")

echo "Backup started"

bash -c "mysqldump \
    -p'$password' \
    -h mysql \
    --databases $database \
    --single-transaction \
    --quick \
    > /backup/backup_$timestamp.sql"

echo "Backup completed"