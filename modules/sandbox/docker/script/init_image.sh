#!/bin/bash
set -e

apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -qq -y \
    sssd \
    libpam-sss \
    libnss-sss \
    libnss-ldap \
    gdebi-core \
    mapnik-utils \
    net-tools \
    openssh-server \
    sudo \
    supervisor \
    gettext

# Disable message of the day by commenting out configuration lines refering to pam_motd.so
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/sshd
sed -e '/.*pam_motd\.so.*/ s/^#*/#/' -i /etc/pam.d/login
sed -e '/PrintMotd / s/^#*/#/' -i /etc/ssh/sshd_config
sed -e '/PrintLastLog / s/^#*/#/' -i /etc/ssh/sshd_config

# Prevent locale from being forwarded by client
sed -e '/AcceptEnv / s/^#*/#/' -i /etc/ssh/sshd_config

# Get authorized keys from LDAP, disable message of the day and last log printout, disable options for speeding up access
printf '%s\n' \
    'AuthorizedKeysCommand /usr/bin/sss_ssh_authorizedkeys' \
    'AuthorizedKeysCommandUser root' \
    'PrintMotd no' \
    'PrintLastLog no' \
    'UseDNS no' \
    'GSSAPIAuthentication no' \
    >> /etc/ssh/sshd_config

# Update the prompt - use "sepal" instead of the funny looking hostname
printf '%s\n' \
    "PS1='${debian_chroot:+($debian_chroot)}\u@sepal:\w\$ '" \
    >> /etc/bash.bashrc

echo
echo "*********************************"
echo "*** Installing RStudio Server ***"
echo "*********************************"
# Latest working before this bug: https://support.rstudio.com/hc/en-us/community/posts/115006512047-RStudio-Server-authentication-fails-after-update?page=1
rstudio=rstudio-server-0.99.491-amd64.deb
wget https://download2.rstudio.org/$rstudio
gdebi -n $rstudio
printf '%s\n' \
    "server-app-armor-enabled=0" \
    >> /etc/rstudio/rserver.conf
rm -f $rstudio

echo
echo "*******************************"
echo "*** Installing Shiny Server ***"
echo "*******************************"
shinyServer=shiny-server-1.5.3.838-amd64.deb
wget https://download3.rstudio.org/ubuntu-12.04/x86_64/$shinyServer
gdebi -n $shinyServer
chown shiny:root /usr/lib/R/library
rm $shinyServer
