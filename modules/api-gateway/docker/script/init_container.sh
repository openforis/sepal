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

mkdir -p /etc/sepal
template /config/api-gateway-server.properties /etc/sepal/api-gateway-server.properties root: 0600
template /config/endpoints.json /etc/sepal/endpoints.json root: 0600

mkdir -p /etc/sepal
cp /data/certificates/sepal-https.key /etc/sepal/
cp /data/certificates/sepal-https.ca-bundle /etc/sepal/
cp /data/certificates/sepal-https.crt /etc/sepal/

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
