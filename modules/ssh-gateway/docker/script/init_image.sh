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
    sssd-tools \
    gettext \
    groovy

echo "initgroups: files sss" >> /etc/nsswitch.conf

# Disable message of the day by commenting out configuration lines refering to pam_motd.so
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/sshd
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/login
sed -e '/PrintMotd / s/^#*/#/' -i /etc/ssh/sshd_config
sed -e '/PrintLastLog / s/^#*/#/' -i /etc/ssh/sshd_config

# Make sure SSH connections to gateway doesn't time out
# Setup SSH authentication
# Act as a gateway for users in correct user group
printf '%s\n' \
    'ClientAliveInterval 30' \
    'ClientAliveCountMax 100000' \
    'AuthorizedKeysCommand /usr/bin/sss_ssh_authorizedkeys' \
    'AuthorizedKeysCommandUser root' \
    'PrintMotd no' \
    'PrintLastLog no' \
    'UseDNS no' \
    'GSSAPIAuthentication no' \
    "Match Group $USER_GROUP" \
    '    ForceCommand ssh-bootstrap' \
    >> /etc/ssh/sshd_config

# Make sure SSH connection with Sandbox doesn't time out
printf '%s\n' \
    '    KeepAlive yes' \
    '    ServerAliveInterval 30' \
    >> /etc/ssh/ssh_config
