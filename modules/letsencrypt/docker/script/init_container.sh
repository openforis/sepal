#!/usr/bin/env bash

mkdir -p /etc/nginx/sites-enabled/
rm -rf /etc/nginx/sites-enabled/* && cp /config/letsencrypt.conf /etc/nginx/sites-enabled/

# TODO: Trigger if certificates are not already present
mkdir -p /var/www/$SEPAL_HOST_SEPAL_ENV
/root/certbot-auto certonly --noninteractive --agree-tos --email daniel.wiell@fao.org --webroot -w /var/www/$SEPAL_HOST_SEPAL_ENV -d $SEPAL_HOST_SEPAL_ENV

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
