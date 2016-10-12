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

mkdir -p /var/run/sshd

cp /script/ssh-bootstrap /usr/local/bin/ssh-bootstrap
chmod 555 /usr/local/bin/ssh-bootstrap

cp /script/alive.sh /usr/local/bin/alive.sh
chmod 555 /usr/local/bin/alive.sh

template /config/ldap.conf /etc/ldap.conf root: 0600
template /config/ldap.conf /etc/ldap/ldap.conf root: 0600
template /config/ldap.secret /etc/ldap.secret root: 0600
template /config/sssd.conf /etc/sssd/sssd.conf root: 0600
template /config/sepalAdmin.passwd /etc/sepalAdmin.passwd root: 0644

# Keep /etc/ssh in a mounted volume, so host keys are reused between upgrades
if [ ! -d /data/ssh ]; then
    mkdir /data/ssh
    cp -rf /etc/ssh/* /data/ssh
fi
rm -rf /etc/ssh-backup
mv /etc/ssh /etc/ssh-backup
ln -sf /data/ssh /etc/ssh

mkdir -p /etc/ldap/certificates
cp /data/ldap-ca.crt.pem /etc/ldap/certificates/ldap-ca.crt.pem

# Unset all env variables ending with _SEPAL_ENV
unset $(printenv | grep '_SEPAL_ENV' | sed -E "s/([0-9a-zA-Z]+)=.*/\\1/" | tr '\n' ' ')

exec /usr/bin/supervisord -c /config/supervisord.conf
