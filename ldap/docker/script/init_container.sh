#!/bin/bash

mkdir -p /data/logs/supervisor
rm -rf /var/log/supervisor && ln -sf /data/logs/supervisor /var/log/supervisor

mkdir -p /data/logs/sssd
rm -rf /var/log/sssd && ln -sf /data/logs/sssd /var/log/sssd

cp /data/certificates/* /container/service/slapd/assets/certs

/usr/bin/supervisord -c /config/supervisord.conf