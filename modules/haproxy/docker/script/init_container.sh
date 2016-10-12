#!/bin/bash

cp /config/haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg
cp /config/rsyslog.conf /etc/rsyslog.conf

exec /usr/bin/supervisord -c /config/supervisord.conf