#!/usr/bin/env bash
docker rm -f sepal
DATA_LOCATION=$1
BACKUP_DATA_LOCATION=$2

cp -a $BACKUP_DATA_LOCATION/. $DATA_LOCATION/