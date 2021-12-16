#!/bin/bash

function template {
    local template=$1
    local destination=$2
    local owner=$3
    local mode=$4
    envsubst < $template > $destination
    chown $owner $destination
    chmod $mode $destination
}

mkdir -p /data/home

rm -rf /home && ln -sf /data/home /home

cp /script/add-sepal-user /usr/local/bin/
cp /script/change-sepal-user-password /usr/local/bin/
cp /script/delete-sepal-user /usr/local/bin/

template /config/ldap.conf /etc/ldap.conf root: 0600
template /config/ldap.conf /etc/ldap/ldap.conf root: 0600
template /config/ldap.secret /etc/ldap.secret root: 0600
template /config/ldapscripts.conf /etc/ldapscripts/ldapscripts.conf root: 0600
template /config/ldapscripts.passwd /etc/ldapscripts/ldapscripts.passwd root: 0600
template /config/ldapadduser.template /etc/ldapscripts/ldapadduser.template root: 0600
template /config/sssd.conf /etc/sssd/sssd.conf root: 0600
template /config/sepalAdmin.passwd /etc/sepalAdmin.passwd root: 0644
template /config/admin.passwd /etc/admin.passwd root: 0600

mkdir -p /etc/sepal/
template /config/database.properties /etc/sepal/database.properties root: 0600
template /config/smtp.properties /etc/sepal/smtp.properties root: 0600
template /config/user-server.properties /etc/sepal/user-server.properties root: 0600

mkdir -p /etc/ldap/certificates
cp /data/certificates/ldap-ca.crt.pem /etc/ldap/certificates/

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
