#!/bin/bash

# Repository for Java
add-apt-repository -y ppa:webupd8team/java

apt-get -y update && apt-get install -qq -y \
    supervisor \
    gettext

# Installing Java
echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | debconf-set-selections
apt-get install -y oracle-java8-installer

# Schedule a storage usage check for every user directory
chmod 500 /script/update_storage_usage.sh
printf '%s\n' \
    '* * * * * root /script/update_storage_usage.sh' \
    >> /etc/crontab
