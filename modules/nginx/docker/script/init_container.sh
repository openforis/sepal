#!/usr/bin/env bash

apt-get install openssl

mkdir -p /etc/nginx/sites-enabled/
rm -rf /etc/nginx/sites-enabled/* && cp /config/operations.conf /etc/nginx/sites-enabled/

mkdir -p /etc/ssl
cp /data/certificates/* /etc/ssl/

echo -n 'admin:' >> /etc/nginx/.htpasswd
openssl passwd "$PASSWORD_SEPAL_ENV" >> /etc/nginx/.htpasswd
chown www-data .htpasswd
chmod 400 .htpasswd

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
