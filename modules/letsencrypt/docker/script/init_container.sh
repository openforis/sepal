#!/usr/bin/env bash

sleep 30 # Make sure HAproxy had time to start

if [ ! -d "$DIRECTORY" ]; then
    /etc/letsencrypt/live/$SEPAL_HOST_SEPAL_ENV
    /root/certbot-auto certonly\
     --noninteractive\
     --agree-tos\
     --email $SEPAL_OPERATOR_EMAIL_SEPAL_ENV\
     --standalone\
     --standalone-supported-challenges tls-sni-01\
     -d $SEPAL_HOST_SEPAL_ENV
fi

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
