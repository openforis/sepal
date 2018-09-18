#!/usr/bin/env bash
# https://certbot.eff.org/#ubuntutrusty-nginx
apt-get update -y && apt-get install -y\
 wget\
 supervisor\
 python\
 python-dev\
 python-virtualenv\
 gcc\
 dialog\
 libaugeas0 augeas-lenses\
 libssl-dev\
 libffi-dev\
 ca-certificates

cd /root
wget -nv https://dl.eff.org/certbot-auto
chmod a+x certbot-auto

# Renew the certificate twice a day. It will not have any effect unless it's about to expire
# but will catch cases where certificate been revoked for some reason.
printf '%s\n' \
    '38  0,12 * * * root /root/certbot-auto renew --quiet --no-self-upgrade' \
    >> /etc/crontab
