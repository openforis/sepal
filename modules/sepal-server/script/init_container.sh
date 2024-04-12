#!/bin/bash
set -e 
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

chown -R sepal: /etc/sepal
chmod -R 0400 /etc/sepal/*

mkdir -p /data/workDir/downloads -m 770
chown -R sepal: /data/workDir

mkdir -p /data/home -m 770
chown sepal: /data/home

gradle --no-daemon :sepal-server:createLaunchCommand -DDEPLOY_ENVIRONMENT=${DEPLOY_ENVIRONMENT}
chmod +x /tmp/sepal-server-launch.sh
exec /tmp/sepal-server-launch.sh

