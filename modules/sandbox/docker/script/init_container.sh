#!/bin/bash

export sandbox_user=$1
export sepal_host=$2
export ldap_host=$3
export ldap_admin_password=$4

function template {
    envsubst < $1 > $2
    chmod $3 $2
}

template /templates/ldap.secret /etc/ldap.secret 0600
template /templates/sssd.conf /etc/sssd/sssd.conf 0600
template /templates/shiny-server.conf /etc/shiny-server/shiny-server.conf 0644
template /templates/supervisord.conf /etc/supervisor/conf.d/supervisord.conf 0600
#rm -rf /templates

ln -sf /conf/ldap.conf /etc/ldap.conf
ln -sf /conf/ldap.conf /etc/ldap/ldap.conf

echo "$ldap_host ldap" >> /etc/hosts

cp -f /config/Renviron /opt/miniconda3/lib64/R/etc/Renviron
chmod 0644 /opt/miniconda3/lib64/R/etc/Renviron
printf '%s\n' \
    "R_LIBS_USER=\"/home/$sandbox_user/.R/library\"" \
    "R_LIBS_SITE=\"/shiny/library:/opt/miniconda3/lib/R/library:/usr/local/lib/R/site-library:/usr/lib/R/site-library:/usr/lib/R/library\"" \
    >> /opt/miniconda3/lib64/R/etc/Renviron

userHome=/home/$sandbox_user
cp /etc/skel/.bashrc "$userHome"
cp /etc/skel/.profile "$userHome"
cp /etc/skel/.bash_logout "$userHome"

source /etc/environment
source /home/$sandbox_user/.bashrc

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf