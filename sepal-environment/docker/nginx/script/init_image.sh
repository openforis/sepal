#!/usr/bin/env bash

apt-get update && apt-get install -y nginx incron supervisor

echo "root" > /etc/incron.allow
mkdir -p /var/spool/incron
echo "/etc/hosts IN_CLOSE_WRITE /etc/init.d/nginx reload" > /var/spool/incron/root
