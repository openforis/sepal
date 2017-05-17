#!/bin/bash

echo
echo "******************************"
echo "*** Setting up environment ***"
echo "******************************"
# Create ssh deamon folder
mkdir /var/run/sshd

# Setup /etc/environment
printf '%s\n' \
    'PATH="usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/orfeo/bin"' \
    'JAVA_HOME="/usr/lib/jvm/java-8-oracle"' \
    'GDAL_DATA="/usr/share/gdal/2.1"' \
    'SEPAL="true"' \
    'LC_ALL="en_US.UTF-8"' \
    'LC_PAPER="en_US.UTF-8"' \
    'LC_ADDRESS="en_US.UTF-8"' \
    'LC_MONETARY="en_US.UTF-8"' \
    'LC_NUMERIC="en_US.UTF-8"' \
    'LC_TELEPHONE="en_US.UTF-8"' \
    'LC_IDENTIFICATION="en_US.UTF-8"' \
    'LC_MEASUREMENT="en_US.UTF-8"' \
    'LC_TIME="en_US.UTF-8"' \
    'LC_NAME="en_US.UTF-8"' \
    'LANG="en_US.UTF-8"' \
    >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

echo
echo "*************************"
echo "*** Image Initialized ***"
echo "*************************"
