#!/bin/bash

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    sssd \
    libpam-sss \
    libnss-sss \
    libnss-ldap \
    supervisor \
    gettext

# Disable message of the day by commenting out configuration lines refering to pam_motd.so
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/sshd
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/login
sed -e '/PrintMotd / s/^#*/#/' -i /etc/ssh/sshd_config
sed -e '/PrintLastLog / s/^#*/#/' -i /etc/ssh/sshd_config

# Get authorized keys from LDAP and disable message of the day and last log printout
printf '%s\n' \
    'AuthorizedKeysCommand /usr/bin/sss_ssh_authorizedkeys' \
    'AuthorizedKeysCommandUser root' \
    'PrintMotd no' \
    'PrintLastLog no' \
    >> /etc/ssh/sshd_config

chmod u+x /init_container.sh
chmod u+x /root/wait_until_initialized.sh
