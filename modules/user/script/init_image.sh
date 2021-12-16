#!/usr/bin/env bash

apt-get -y update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    curl \
    jq \
    ldapscripts \
    libpam-sss \
    libnss-sss \
    libnss-ldap \
    openssh-client \
    sssd \
    sssd-tools

echo "initgroups: files sss" >> /etc/nsswitch.conf