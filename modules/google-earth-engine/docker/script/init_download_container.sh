#!/usr/bin/env bash

export worker_user=$1
export downloadDir=/home/${worker_user}/downloads
export account=${EE_ACCOUNT_SEPAL_ENV}
privateKey=${EE_PRIVATE_KEY_SEPAL_ENV//-----LINE BREAK-----/\\n}
export privateKeyPath=/etc/ssh/google-earth-engine/key.pem
export sepal_host=${SEPAL_HOST_SEPAL_ENV}
export sepal_admin_password=${SEPAL_ADMIN_PASSWORD_SEPAL_ENV}

function template {
    envsubst < $1 > $2
    chmod $3 $2
}

template /config/ldap.secret /etc/ldap.secret 0600
template /config/sssd.conf /etc/sssd/sssd.conf 0600
template /config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf 0600

echo "${LDAP_HOST_SEPAL_ENV} ldap" >> /etc/hosts

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

mkdir -p /etc/ssh/google-earth-engine
echo -e ${privateKey} > ${privateKeyPath}

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf