#!/bin/bash

cp -R /script/sqlScripts/* /opt/flyway/sql/

touch /var/log/mysql/error.log
chmod 666 /var/log/mysql/error.log

touch /var/log/mysql/slow-queries.log
chmod 666 /var/log/mysql/slow-queries.log

# this starts logging, mysql and the migration
exec /usr/bin/supervisord -c /config/supervisord.conf