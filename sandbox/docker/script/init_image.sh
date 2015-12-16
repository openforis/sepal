#!/bin/bash

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    sssd \
    libpam-sss \
    libnss-sss \
    libnss-ldap

# Get authorized keys from LDAP
printf '%s\n' 'AuthorizedKeysCommand /usr/bin/sss_ssh_authorizedkeys' 'AuthorizedKeysCommandUser root' >> /etc/ssh/sshd_config

chmod u+x /start
chmod u+x /root/healt_check.sh

#TODO Remove?
#mkdir -p /etc/ldap/certificates/