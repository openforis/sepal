#!/bin/sh
set -e
addgroup acme
adduser \
    --system \
    --disabled-password \
    --home /var/lib/acme \
    -G acme \
    acme
adduser acme haproxy
mkdir -p /usr/local/src
cd /usr/local/src
git clone https://github.com/acmesh-official/acme.sh.git
cd acme.sh/
./acme.sh \
   --install \
   --nocron \
   --no-profile \
   --home /usr/local/share/acme.sh \
   --config-home /var/lib/acme
chmod -R go=+rX /usr/local/share/acme.sh
ln -s /usr/local/share/acme.sh/acme.sh /usr/local/bin/
curl https://raw.githubusercontent.com/haproxy/haproxy/v2.9.0/admin/acme.sh/haproxy.sh > /usr/local/share/acme.sh/deploy/haproxy.sh

mkdir -p /var/lib/acme/certs
chown haproxy:haproxy /var/lib/acme/certs
chmod 770 /var/lib/acme/certs

mkdir -p /var/run/haproxy
chown haproxy:haproxy /var/run/haproxy