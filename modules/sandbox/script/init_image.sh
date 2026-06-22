#!/bin/bash
set -e

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    gdebi-core \
    mapnik-utils \
    net-tools \
    openssh-server \
    sudo \
    supervisor \
    gettext \
    graphviz

# Disable message of the day by commenting out configuration lines refering to pam_motd.so
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/sshd
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/login
sed -e '/PrintMotd / s/^#*/#/' -i /etc/ssh/sshd_config
sed -e '/PrintLastLog / s/^#*/#/' -i /etc/ssh/sshd_config

# Prevent locale from being forwarded by client
sed -e '/AcceptEnv / s/^#*/#/' -i /etc/ssh/sshd_config

# Disable message of the day and last log printout, disable options for speeding up access.
# Authorized keys come from the per-user ~/.ssh/authorized_keys file (written from USER_PUBLIC_KEY at
# container init); the old sss_ssh_authorizedkeys AuthorizedKeysCommand was dead config (LDAP removed).
printf '%s\n' \
    'PrintMotd no' \
    'PrintLastLog no' \
    'UseDNS no' \
    'GSSAPIAuthentication no' \
    >> /etc/ssh/sshd_config

# Update the prompt - use "sepal" instead of the funny looking hostname
printf '%s\n' \
    "PS1='${debian_chroot:+($debian_chroot)}\u@sepal:\w\$ '" \
    >> /etc/bash.bashrc