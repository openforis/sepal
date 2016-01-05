#!/bin/bash

mkdir -p /data/logs
rm -rf /var/log/supervisor && ln -sf /data/logs /var/log/supervisor

cp -R /script/sqlScripts/* /opt/flyway/sql/

exec /usr/bin/supervisord -c /config/supervisord.conf