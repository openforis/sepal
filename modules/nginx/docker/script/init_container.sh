#!/usr/bin/env bash

mkdir -p /etc/nginx/sites-enabled/
rm -rf /etc/nginx/sites-enabled/* && cp /config/sepal /etc/nginx/sites-enabled/

mkdir -p /etc/ssl
cp /data/certificates/* /etc/ssl/

exec /usr/bin/supervisord -c /config/supervisord.conf

