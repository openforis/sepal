#!/bin/bash

mkdir -p /etc/haproxy
mkdir -p /etc/sepal

cp /config/haproxy.cfg /etc/haproxy/haproxy.cfg
cat /etc/letsencrypt/live/$SEPAL_HOST_SEPAL_ENV/privkey.pem \
    /etc/letsencrypt/live/$SEPAL_HOST_SEPAL_ENV/fullchain.pem \
    > /etc/sepal/sepal.pem
chmod 400 /etc/sepal/sepal.pem

exec /usr/bin/supervisord -c /config/supervisord.conf
