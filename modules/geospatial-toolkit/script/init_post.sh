#!/bin/bash

echo
echo "******************************"
echo "*** Setting up environment ***"
echo "******************************"
# Create ssh deamon folder
mkdir /var/run/sshd

# Setup /etc/environment
printf '%s\n' \
    'PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/orfeo/bin:/usr/local/snap/bin:/home/sepal-user/.local/bin:/usr/local/cuda/bin"' \
    'JAVA_HOME="/usr/local/lib/sdkman/candidates/java/current"' \
    'SDKMAN_DIR="/usr/local/lib/sdkman"' \
    'GDAL_DATA="/usr/share/gdal"' \
    'SHELL="/bin/bash"' \
    'SEPAL="true"' \
    'PROJ_LIB="/usr/share/proj"' \
    'LOCALTILESERVER_CLIENT_PREFIX="/api/sandbox/jupyter/proxy/{port}"' \
    'OTB_INSTALL_DIR=/usr/local/lib/orfeo' \
    'OTB_APPLICATION_PATH=/usr/local/lib/orfeo/lib/otb/applications' \
    >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

sed -i '/.*"PDF".*/d' /etc/ImageMagick-6/policy.xml

echo
echo "*************************"
echo "*** Image Initialized ***"
echo "*************************"
