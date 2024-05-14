#!/bin/sh
set -e

DOMAIN=$1

waiting=true
netstat -ntlp | grep ":80"  >/dev/null 2>&1 && waiting=false

for i in {50..0}; do
    if netstat -ntlp | grep ":80"  >/dev/null 2>&1; then
		break
	fi
	echo 'Waiting for HAProxy...'
	/bin/sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 'HAProxy not starting!'
	exit 1
fi

acme.sh --issue \
    -d $DOMAIN \
    --stateless \
    --server letsencrypt_test

DEPLOY_HAPROXY_HOT_UPDATE=yes \
    DEPLOY_HAPROXY_STATS_SOCKET=/var/run/haproxy/admin.sock \
    DEPLOY_HAPROXY_PEM_PATH=/var/lib/acme/certs \
    acme.sh --deploy -d $DOMAIN --deploy-hook haproxy
