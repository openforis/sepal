#!/usr/bin/env bash

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    supervisor \
    openssh-server \
    curl \
    jq \
    sssd \
    libpam-sss \
    libnss-sss \
    libnss-ldap \
    ldapscripts \
    sssd-tools \
    gettext # envsubst for templating

echo "initgroups: files sss" >> /etc/nsswitch.conf
printf '%s\n' "Match Group $USER_GROUP" 'ForceCommand /script/ssh-bootstrap' >> /etc/ssh/sshd_config

# Use LDAP for authorized keys
printf '%s\n' 'AuthorizedKeysCommand /usr/bin/sss_ssh_authorizedkeys' 'AuthorizedKeysCommandUser root' >> /etc/ssh/sshd_config
