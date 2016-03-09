#!/bin/bash

export sandbox_user=$1
export sepal_host=$2
export ldap_host=$3
export ldap_admin_password=$4

function template {
    envsubst < $1 > $2
    chmod 0600 $2
}

template /templates/ldap.secret /etc/ldap.secret
template /templates/sssd.conf /etc/sssd/sssd.conf

ln -sf /etc/ldap.conf /etc/ldap/ldap.conf

rm -rf /templates
rm /init_image.sh

echo "$ldap_host ldap" >> /etc/hosts

userHome=/home/$1

cp /etc/skel/.bashrc "$userHome"
cp /etc/skel/.profile "$userHome"
cp /etc/skel/.bash_logout "$userHome"

source /etc/environment
source /home/$1/.bashrc

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
