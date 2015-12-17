#!/bin/bash

mkdir -p /data/db
rm -rf /var/lib/mysql && ln -sf /data/db /var/lib/mysql

mkdir -p /data/logs
rm -rf /var/log/supervisor && ln -sf /data/logs /var/log/supervisor

cp -R /script/sqlScripts/* /opt/flyway/sql/

/usr/bin/supervisord -c /config/supervisord.conf