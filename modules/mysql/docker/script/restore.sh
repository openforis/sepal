#!/bin/bash

LATEST=$(ls -t /backups | head -n1)

echo "Restoring from latest database dump: $LATEST";

bash -c "mysql -p'$MYSQL_ROOT_PASSWORD' -h localhost -e 'SET foreign_key_checks = 0'"
bash -c "mysql -p'$MYSQL_ROOT_PASSWORD' -h localhost < /backups/$LATEST"
bash -c "mysql -p'$MYSQL_ROOT_PASSWORD' -h localhost -e 'SET foreign_key_checks = 1'"

echo "Database restored"