#!/usr/bin/env bash

apt-get update && apt-get install -y software-properties-common

apt-add-repository ppa:groovy-dev/groovy

DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    supervisor \
    openssh-server \
    curl \
    jq \
    libnss-extrausers \
    gettext

sed -i -E 's/^passwd:.*/passwd:         files extrausers/' /etc/nsswitch.conf
sed -i -E 's/^group:.*/group:          files extrausers/' /etc/nsswitch.conf
if grep -q '^initgroups:' /etc/nsswitch.conf; then
    sed -i -E 's/^initgroups:.*/initgroups:     files extrausers/' /etc/nsswitch.conf
else
    echo 'initgroups:     files extrausers' >> /etc/nsswitch.conf
fi
mkdir -p /var/lib/extrausers
: > /var/lib/extrausers/passwd
: > /var/lib/extrausers/group
chmod 0644 /var/lib/extrausers/passwd /var/lib/extrausers/group

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
    'AuthorizedKeysCommand /usr/local/bin/sepal-authorized-keys %u' \
    'AuthorizedKeysCommandUser root' \
    'PrintMotd no' \
    'PrintLastLog no' \
    'UseDNS no' \
    'GSSAPIAuthentication no' \
    'ForceCommand ssh-bootstrap' \
    >> /etc/ssh/sshd_config

# Delegate password authentication to user-node
sed -i '1i auth sufficient pam_exec.so expose_authtok quiet /usr/local/bin/sepal-pam-auth' /etc/pam.d/sshd

# Account management: SEPAL users live in user-node (NSS libnss-extrausers) with no local shadow
# entry, so the default common-account stage (pam_unix) can't resolve them and falls through to
# pam_deny -- which rejects EVERY login at pam_acct_mgmt, even after a valid publickey/password.
# (The old sssd setup supplied account management via pam_sss; dropping LDAP removed it.)
# user-node is the source of truth for account status -- it only hands out authorized-keys and
# accepts passwords for ACTIVE users -- so a non-ACTIVE user can never pass the auth stage and reach
# here. Accept any already-authenticated user at the account stage; pam_nologin still runs ahead of it.
sed -i '/^@include common-account/i account sufficient pam_permit.so' /etc/pam.d/sshd

# Make sure SSH connection with Sandbox doesn't time out
printf '%s\n' \
    '    KeepAlive yes' \
    '    ServerAliveInterval 30' \
    >> /etc/ssh/ssh_config


# Configure locale
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
apt-get install -y locales
locale-gen en_US.utf8
update-locale LC_ALL=en_US.UTF-8
update-locale LANG=en_US.UTF-8
