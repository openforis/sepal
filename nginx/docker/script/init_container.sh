#!/usr/bin/env bash

rm -rf /etc/nginx/sites-enabled/* && cp /config/sepal /etc/nginx/sites-enabled/

mkdir -p /data/logs
rm -rf /var/log/nginx && ln -sf /data/logs /var/log/nginx

mkdir -p /etc/ssl
cp /data/certificates/* /etc/ssl/

/usr/bin/supervisord -c /config/supervisord.conf

