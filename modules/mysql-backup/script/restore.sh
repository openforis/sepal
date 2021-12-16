#!/bin/bash
set -e

LATEST=$(ls -t /backup | head -n1)

# Empty mysql db before restoring, but perhaps we want a backup of *that* first

echo "Restoring from latest database dump: $LATEST";

echo "Deleting previous database"
# TODO: Drop all databases(?) http://stackoverflow.com/questions/22301635/drop-all-databases-in-mysql
bash -c "mysql -p'$MYSQL_ROOT_PASSWORD' -h mysql -e 'DROP DATABASE $MYSQL_DATABASE'"
bash -c "mysql -p'$MYSQL_ROOT_PASSWORD' -h mysql -e 'SET foreign_key_checks = 0'"

echo "Restoring database"
bash -c "mysql -p'$MYSQL_ROOT_PASSWORD' -h mysql < /backup/$LATEST"
bash -c "mysql -p'$MYSQL_ROOT_PASSWORD' -h mysql -e 'SET foreign_key_checks = 1'"
echo "Database restored"