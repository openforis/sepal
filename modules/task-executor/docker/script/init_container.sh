#!/bin/bash

export worker_user=$1
export sepal_host=$2
export ldap_host=$3
export ldap_admin_password=$4
export sepal_user=$5
export sepal_password=$6

function template {
    envsubst < $1 > $2
    chmod $3 $2
}

template /templates/task-executor.properties /etc/task-executor.properties 0666
template /templates/ldap.secret /etc/ldap.secret 0600
template /templates/sssd.conf /etc/sssd/sssd.conf 0600
template /templates/supervisord.conf /etc/supervisor/conf.d/supervisord.conf 0600

echo "$ldap_host ldap" >> /etc/hosts

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf