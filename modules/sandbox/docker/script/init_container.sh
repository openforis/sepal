#!/bin/bash

export sandbox_user=$1
export sepal_host=$2
export ldap_host=$3
export ldap_admin_password=$4

function exportEnvironment {
    while read line; do
      export $line
    done </etc/environment
}

function template {
    envsubst < $1 > $2
    chmod $3 $2
}

template /templates/ldap.secret /etc/ldap.secret 0600
template /templates/sssd.conf /etc/sssd/sssd.conf 0600
template /templates/shiny-server.conf /etc/shiny-server/shiny-server.conf 0644
template /templates/supervisord.conf /etc/supervisor/conf.d/supervisord.conf 0600

sandbox_user_id=`stat -c '%u' /home/$sandbox_user`
home_group_id=`stat -c '%g' /home/$sandbox_user`
mkdir -p /home/$sandbox_user/.log/shiny
chown -R $sandbox_user_id:$home_group_id /home/$sandbox_user/.log

rm -rf /templates

printf '%s\n' \
    "R_LIBS_USER=/home/$sandbox_user/.R/library" \
    "R_LIBS_SITE=/shiny/library:/usr/local/lib/R/site-library:/usr/lib/R/site-library:/usr/lib/R/library" \
    >> /etc/environment

cp /etc/environment /etc/R/Renviron.site

ln -sf /conf/ldap.conf /etc/ldap.conf
ln -sf /conf/ldap.conf /etc/ldap/ldap.conf

echo "$ldap_host ldap" >> /etc/hosts

userHome=/home/$sandbox_user
cp /etc/skel/.bashrc "$userHome"
cp /etc/skel/.profile "$userHome"
cp /etc/skel/.bash_logout "$userHome"

exportEnvironment
source /home/$sandbox_user/.bashrc

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf