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
        --server letsencrypt \
        -m $LETSENCRYPT_EMAIL \
        | grep -o "ACCOUNT_THUMBPRINT='[^']*'" | grep -o "'[^']*'" | tr -d "'" \
        > $ACCOUNT_THUMBPRINT_FILE
fi

export ACCOUNT_THUMBPRINT=$(cat $ACCOUNT_THUMBPRINT_FILE)

# Evaluate configuration file templates in /usr/local/etc/haproxy and put them in /etc/haproxy
mkdir -p /etc/haproxy/haproxy.d
template /usr/local/etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg
for config_file in /usr/local/etc/haproxy/haproxy.d/*; do
    template /usr/local/etc/haproxy/haproxy.d/$(basename $config_file) /etc/haproxy/haproxy.d/$(basename $config_file)
done

# Setup LetsEncrypt renewal cron
printf '59 13 * * * /usr/local/share/acme.sh/acme.sh --cron --home "/var/lib/acme/.acme.sh"\n' > /etc/crontabs/acme

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
