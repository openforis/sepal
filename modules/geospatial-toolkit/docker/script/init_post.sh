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
    'JAVA_HOME="/usr/local/lib/sdkman/candidates/java/current"' \
    'SDKMAN_DIR="/usr/local/lib/sdkman"' \
    'GDAL_DATA="/usr/share/gdal"' \
    'SHELL="/bin/bash"' \
    'SEPAL="true"' \
    >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

echo
echo "*************************"
echo "*** Image Initialized ***"
echo "*************************"
