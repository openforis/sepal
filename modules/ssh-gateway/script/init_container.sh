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

exec /usr/bin/supervisord -c /config/supervisord.conf
