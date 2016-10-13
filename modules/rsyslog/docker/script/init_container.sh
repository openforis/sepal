#!/bin/bash

rm /etc/rsyslog.d/*
cp /config/rsyslog.conf /etc/rsyslog.conf
cp /config/10-logstash.conf /etc/rsyslog.d/10-logstash.conf

printf '%s\n' \
    "$ELK_HOST_SEPAL_ENV	elk" \
    >> /etc/hosts

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf