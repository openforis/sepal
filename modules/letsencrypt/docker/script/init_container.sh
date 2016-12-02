#!/usr/bin/env bash

sleep 60 # Make sure HAproxy is enabled

# TODO: Trigger if certificates are not already present
/root/certbot-auto certonly\
 --noninteractive\
 --agree-tos\
 --email $SEPAL_OPERATOR_EMAIL_SEPAL_ENV\
 --standalone\
 -d $SEPAL_HOST_SEPAL_ENV

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
