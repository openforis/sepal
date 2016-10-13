#!/bin/bash

mkdir -p /data/log
mkdir -p /etc/haproxy

cp /config/haproxy.cfg /etc/haproxy/haproxy.cfg

exec /usr/bin/supervisord -c /config/supervisord.conf
