#!/bin/sh
set -e

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

DOMAIN=daniel.sepal.io

# Register if no account thumbprint file exists
ACCOUNT_THUMBPRINT_FILE=/var/lib/acme/account_thumbprint
if [ ! -f "$ACCOUNT_THUMBPRINT_FILE" ]; then
    sudo --preserve-env --set-home -u acme acme.sh \
        --register-account \
        --server letsencrypt_test \
        -m daniel.wiell+letsencrypt@gmail.com \
        | grep -o "ACCOUNT_THUMBPRINT='[^']*'" | grep -o "'[^']*'" | tr -d "'" \
        > $ACCOUNT_THUMBPRINT_FILE
fi

mkdir /etc/haproxy
# Inject the account thumbprint into haproxy config
ACCOUNT_THUMBPRINT=$(cat $ACCOUNT_THUMBPRINT_FILE) template /usr/local/etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg


if [ ! -f "/var/lib/acme/certs/$DOMAIN.pem" ]; then
    echo "No certificate for $DOMAIN. Issuing one."
    sudo --preserve-env --set-home -u acme issue-cert.sh $DOMAIN &
fi

exec sudo --preserve-env --set-home --user haproxy docker-entrypoint.sh \
    haproxy -f /etc/haproxy/haproxy.cfg
