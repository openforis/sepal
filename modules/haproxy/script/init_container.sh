#!/bin/bash


function template {
    local template=$1
    local destination=$2
    TYPE=$TYPE envsubst < $template > $destination
}

mkdir -p /etc/haproxy
mkdir -p /etc/sepal
template /config/haproxy.cfg /etc/haproxy/haproxy.cfg
cat /etc/letsencrypt/live/$SEPAL_HOST/privkey.pem \
    /etc/letsencrypt/live/$SEPAL_HOST/fullchain.pem \
    > /etc/sepal/sepal.pem
chmod 400 /etc/sepal/sepal.pem

exec haproxy -f /etc/haproxy/haproxy.cfg
