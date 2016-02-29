#!/bin/bash

# Add sepalUsers group
ldapgid $USER_GROUP || ldapaddgroup $USER_GROUP

add-sepal-user sepalAdmin "$(cat /etc/sepalAdmin.passwd)"

# Make sure sepalAdmin is a sudoer
[ -f /etc/sudoers.d/sepalAdmin ] || \
    echo "sepalAdmin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/sepalAdmin && \
    chmod 440 /etc/sudoers.d/sepalAdmin

# Add admin user
add-sepal-user admin "$(cat /etc/admin.passwd)" $USER_GROUP

