#!/usr/bin/env bash

MYSQL_STORAGE_LOCATION=$1
BACKUP_STORAGE_LOCATION=$2
MYSQL_UID=$3
ROOT_PWD=$4

docker rm -f mysql
sudo rm -rf "$MYSQL_STORAGE_LOCATION"/*
sudo cp -a $BACKUP_STORAGE_LOCATION/. $MYSQL_STORAGE_LOCATION/
sudo chown -R $MYSQL_UID $MYSQL_STORAGE_LOCATION/

docker run --name mysql -p 3306:3306 -v "/data/mysql:/var/lib/mysql" -e "MYSQL_DATABASE=sdms" -d 54.93.185.137/openforis/mysql /entrypoint.sh mysqld
sleep 4
docker exec -d mysql mysql --host=localhost --user=root --password=$ROOT_PWD -e "CREATE USER 'sepal3'@'%' IDENTIFIED BY 'ciao'"
docker exec -d mysql mysql --host=localhost --user=root --password=$ROOT_PWD -e "GRANT ALL PRIVILEGES ON sdms.* TO 'sepal'@'%'"
docker exec -d mysql mysql --host=localhost --user=root --password=$ROOT_PWD -e "FLUSH PRIVILEGES"

docker rm -f mysql

# re-run ansible provising

