#!/bin/bash

mkdir -p /data/log

rm /etc/rsyslog.d/*
cp /config/rsyslog.conf /etc/rsyslog.conf
cp /config/10-logstash.conf /etc/rsyslog.d/10-logstash.conf

exec /usr/bin/supervisord -c /config/supervisord.conf