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
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen \
	&& locale-gen en_US.utf8 \
	&& /usr/sbin/update-locale LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
wget https://download2.rstudio.org/rstudio-server-0.99.484-amd64.deb
gdebi -n rstudio-server-0.99.484-amd64.deb
rm -f rstudio-*

echo
echo "*******************************"
echo "*** Installing Shiny Server ***"
echo "*******************************"
shinyServer=shiny-server-1.5.3.838-amd64.deb
wget https://download3.rstudio.org/ubuntu-12.04/x86_64/$shinyServer
gdebi -n $shinyServer
chown shiny:root /usr/lib/R/library
rm $shinyServer

echo
echo "***********************"
echo "*** Installing QGIS ***"
echo "***********************"
apt-get -y install qgis
