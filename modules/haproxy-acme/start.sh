#!/bin/sh
set -e

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

# Register if no account thumbprint file exists
ACCOUNT_THUMBPRINT_FILE=/var/lib/acme/account_thumbprint
if [ ! -f "$ACCOUNT_THUMBPRINT_FILE" ]; then
    sudo --preserve-env --set-home -u acme acme.sh \
        --register-account \
        --server letsencrypt_test \
        -m $LETSENCRYPT_EMAIL \
        | grep -o "ACCOUNT_THUMBPRINT='[^']*'" | grep -o "'[^']*'" | tr -d "'" \
        > $ACCOUNT_THUMBPRINT_FILE
fi

mkdir -p /etc/haproxy

# Inject the account thumbprint into haproxy config
ACCOUNT_THUMBPRINT=$(cat $ACCOUNT_THUMBPRINT_FILE) template /usr/local/etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg


if [ ! -f "/var/lib/acme/certs/$LETSENCRYPT_DOMAIN.pem" ]; then
    echo "No certificate for $LETSENCRYPT_DOMAIN. Issuing one."
    sudo --preserve-env --set-home -u acme issue-cert.sh $LETSENCRYPT_DOMAIN &
fi

printf '59 13 * * * /usr/local/share/acme.sh/acme.sh --cron --home "/var/lib/acme/.acme.sh"\n' > /etc/crontabs/acme

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
