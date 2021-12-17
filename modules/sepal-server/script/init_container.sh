#!/bin/bash

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

getent group sepal &>/dev/null || groupadd -g 9999 sepal # Add sepal group if not existing
id -u sepal &>/dev/null || useradd -u 9999 -g 9999 sepal # Add sepal user if not existing

mkdir -p /etc/sepal
chown -R sepal: /etc/sepal
chmod -R 770 /etc/sepal

template /config/sepal.properties /etc/sepal/sepal.properties
template /config/database.properties /etc/sepal/database.properties
template /config/workerInstance.properties /etc/sepal/workerInstance.properties
template /config/workerSession.properties /etc/sepal/workerSession.properties
template /config/budget.properties /etc/sepal/budget.properties
template /config/dataSearch.properties /etc/sepal/dataSearch.properties

cp -R /data/etc/* /etc/sepal/

chown -R sepal: /etc/sepal
chmod -R 0400 /etc/sepal/*

mkdir -p /data/workDir/downloads -m 770
chown -R sepal: /data/workDir

mkdir -p /data/home -m 770
chown sepal: /data/home

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
