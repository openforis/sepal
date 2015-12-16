#!/usr/bin/env bash

function template {
    local template=$1
    local destination=$2
    local owner=$3
    local mode=$4
    envsubst < $template > $destination
    chown $owner $destination
    chmod $mode $destination
}

sessionTimeout=$GATEONE_SESSION_TIMEOUT_SEPAL_ENV

template /config/30api_keys.conf /etc/gateone/conf.d/30api_keys.conf root: 0400

mkdir -p /data/logs
mkdir -p /gateone
rm -rf /gateone/logs && ln -fs /data/logs /gateone/logs
rm -rf /gateone/users && ln -fs /ssh-gateway/home /gateone/users

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

/usr/local/bin/update_and_run_gateone --origins=* --auth=api --session_timeout=$sessionTimeout