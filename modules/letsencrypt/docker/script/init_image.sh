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
wget https://dl.eff.org/certbot-auto
chmod a+x certbot-auto

# Renew the certificate the first of every month
printf '%s\n' \
    '0 0 1 * * root /root/certbot-auto renew --quiet --no-self-upgrade' \
    >> /etc/crontab
