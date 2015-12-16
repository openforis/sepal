#!/bin/bash

function template {
    local template=$1
    local destination=$2
    local owner=$3
    local mode=$4
    envsubst < $template > $destination
    chown $owner $destination
    chmod $mode $destination
}

getent group sepal &>/dev/null || groupadd -g 9999 sepal # Add sepal group if not existing
id -u sepal &>/dev/null || useradd -u 9999 -g 9999 sepal # Add sepal user if not existing

mkdir -p /etc/sepal
chown -R sepal: /etc/sepal
chmod -R 770 /etc/sepal

template /config/instances.yml /etc/sepal/instances.yml sepal: 0400
template /config/instances_local.yml /etc/sepal/instances_local.yml sepal: 0400
template /config/sepal.properties /etc/sepal/sepal.properties sepal: 0400

rm -rf /data/processing_scripts && cp -R /config/processing_scripts /data/
chmod -R 775 /data/processing_scripts
chown -R sepal: /data/processing_scripts

mkdir -p /data/workDir/downloads -m 770
chown -R sepal: /data/workDir

mkdir -p /data/home -m 770
chown sepal: /data/home

mkdir -p /data/log -m 770
chown sepal: /data/log
rm -f /var/log/sepal && ln -sf /data/log /var/log/sepal

sudo -u sepal java -jar /opt/sepal/bin/sepal.jar > /var/log/sepal/out.log 2>&1