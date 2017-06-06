#!/usr/bin/env bash
set -e

export mapApiKey=$GOOGLE_MAPS_API_KEY_SEPAL_ENV
export digitalGlobeApiKey=$DIGITAL_GLOBE_API_KEY_SEPAL_ENV
export dgcsConnectId=$DGCS_CONNECT_ID_SEPAL_ENV

export account=$EE_ACCOUNT_SEPAL_ENV
export privateKey=${EE_PRIVATE_KEY_SEPAL_ENV//-----LINE BREAK-----/\\n}

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

mkdir -p /etc/ssh/google-earth-engine
export privateKeyPath=/etc/ssh/google-earth-engine/key.pem
echo -e $privateKey > $privateKeyPath

mkdir -p /data/db
mkdir -p /data/cep

template /config/supervisord.conf /etc/supervisord.conf

exec /usr/bin/supervisord -c /etc/supervisord.conf

