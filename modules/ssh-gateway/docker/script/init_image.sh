#!/usr/bin/env bash

apt-get update && apt-get install -y software-properties-common

apt-add-repository ppa:groovy-dev/groovy

DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
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
    gettext \
    groovy

echo "initgroups: files sss" >> /etc/nsswitch.conf


# Make sure SSH connections to gateway doesn't time out
# Setup SSH authentication
# Act as a gateway for users in correct user group
printf '%s\n' \
    'ClientAliveInterval 30' \
    'ClientAliveCountMax 100000' \
    'AuthorizedKeysCommand /usr/bin/sss_ssh_authorizedkeys' \
    'AuthorizedKeysCommandUser root' \
    "Match Group $USER_GROUP" \
    '    ForceCommand ssh-bootstrap' \
    >> /etc/ssh/sshd_config

# Make sure SSH connection with Sandbox doesn't time out
printf '%s\n' \
    '    KeepAlive yes' \
    '    ServerAliveInterval 30' \
    >> /etc/ssh/ssh_config
