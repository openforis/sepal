#!/usr/bin/env bash

apt-get update -y && apt-get install -y \
    nginx \
    incron \
    supervisor

# Configure incron
echo "root" > /etc/incron.allow
mkdir -p /var/spool/incron
echo "/etc/hosts IN_MODIFY /etc/init.d/nginx reload" > /var/spool/incron/root
