#!/bin/bash

echo
echo "******************************"
echo "*** Setting up environment ***"
echo "******************************"
# Create ssh deamon folder
mkdir /var/run/sshd

# Setup /etc/environment
printf '%s\n' \
    'PATH="/usr/local/lib/orfeo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"' \
    'JAVA_HOME="/usr/lib/jvm/java-8-oracle"' \
    'GDAL_DATA="/usr/share/gdal/2.1"' \
    >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

echo
echo "*************************"
echo "*** Image Initialized ***"
echo "*************************"
