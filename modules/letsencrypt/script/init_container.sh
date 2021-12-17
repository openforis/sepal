#!/usr/bin/env bash

sleep 30 # Make sure HAproxy had time to start

mkdir -p /etc/letsencrypt/live/$SEPAL_HOST_SEPAL_ENV

~/.acme.sh/acme.sh --issue --dns dns_aws -d $SEPAL_HOST_SEPAL_ENV

~/.acme.sh/acme.sh --install-cert -d $SEPAL_HOST_SEPAL_ENV \
  --cert-file      /etc/letsencrypt/live/$SEPAL_HOST_SEPAL_ENV/cert.pem  \
  --key-file       /etc/letsencrypt/live/$SEPAL_HOST_SEPAL_ENV/privkey.pem  \
  --fullchain-file /etc/letsencrypt/live/$SEPAL_HOST_SEPAL_ENV/fullchain.pem

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
