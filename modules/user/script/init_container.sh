#!/bin/bash
rm -f /data/module_initialized

function template {
    local template=$1
    local destination=$2
    local owner=$3
    local mode=$4
    envsubst < $template > $destination
    printf "%s" "$(< $destination)" > $destination # Strip training blank lines - needed for password files
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
template /config/sepalAdmin.passwd /etc/sepalAdmin.passwd root: 0644
template /config/admin.passwd /etc/admin.passwd root: 0600

mkdir -p /etc/sepal/
template /config/database.properties /etc/sepal/database.properties root: 0600
template /config/smtp.properties /etc/sepal/smtp.properties root: 0600
template /config/user-server.properties /etc/sepal/user-server.properties root: 0600

gradle --no-daemon :sepal-user:createLaunchCommand -DDEPLOY_ENVIRONMENT=${DEPLOY_ENVIRONMENT}
chmod +x /tmp/sepal-server-launch.sh
exec /usr/bin/supervisord -c /config/supervisord.conf
