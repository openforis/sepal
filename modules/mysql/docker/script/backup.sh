#!/bin/bash
DATE=$(date +"%d-%B-%y_%H-%M")

echo "Creating database dump..."

bash -c "mysqldump \
    -p'$MYSQL_ROOT_PASSWORD' \
    -h localhost \
    --databases $MYSQL_DATABASE \
    --single-transaction \
    --quick \
    > /backups/backup_$DATE.sql"

echo "Database dump created"