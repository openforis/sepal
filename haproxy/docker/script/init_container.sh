#!/bin/bash

mkdir -p /data/log
rm -rf /var/log/haproxy && ln -fs /data/log /var/log/haproxy

cp /config/haproxy.cfg /usr/local/etc/haproxy/haproxy.cfg
cp /config/rsyslog.conf /etc/rsyslog.conf

/usr/bin/supervisord -c /config/supervisord.conf