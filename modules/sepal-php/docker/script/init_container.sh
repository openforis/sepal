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

mkdir -p /data/sdms-data-repo/scene-image/thumbnail -m 770
chown -R www-data: /data/sdms-data-repo

mkdir -p /data/logs -m 770
mkdir -p /etc/sepal-php -m 700

rm -f /var/log/apache2 && ln -fs /data/logs /var/log/apache2
rm -f /etc/apache2/ssl && ln -fs /data/certificates /etc/apache2/ssl

chown -R www-data: /var/www/html

cp /config/000-default.conf /etc/apache2/sites-enabled/000-default.conf
chown www-data: /etc/apache2/sites-enabled/000-default.conf

cp /config/default-ssl.conf /etc/apache2/sites-enabled/default-ssl.conf
chown www-data: /etc/apache2/sites-enabled/default-ssl.conf

cp /config/ports.conf /etc/apache2/ports.conf
chown www-data: /etc/apache2/ports.conf

template /config/config.ini /etc/sepal-php/config.ini www-data: 600
chown -R www-data: /etc/sepal-php

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

# http://veithen.github.io/2014/11/16/sigterm-propagation.html
trap 'kill -TERM $PID' TERM INT
apachectl -D "FOREGROUND" -k start &
PID=$!
wait $PID
trap - TERM INT
wait $PID
EXIT_STATUS=$?