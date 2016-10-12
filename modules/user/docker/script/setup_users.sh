#!/bin/bash

# Wait for ldap to initialize
for i in {30..0}; do
    if [ $(lsldap | wc -l ) -gt 1 ]; then
        break
    fi
    echo "Waiting for LDAP to initialize..."
    sleep 1
done
if [ "$i" = 0 ]; then
    echo >&2 "LDAP not initializing"
    exit 1
else
    echo "LDAP initialized"
fi

# Add sepalUsers group
ldapgid $USER_GROUP || ldapaddgroup $USER_GROUP

add-sepal-user sepalAdmin "$(cat /etc/sepalAdmin.passwd)"

# Make sure sepalAdmin is a sudoer
[ -f /etc/sudoers.d/sepalAdmin ] || \
    echo "sepalAdmin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/sepalAdmin && \
    chmod 440 /etc/sudoers.d/sepalAdmin

# Add admin user
add-sepal-user admin "$(cat /etc/admin.passwd)" $USER_GROUP

touch /data/module_initialized
