#!/bin/bash

echo
echo "******************************"
echo "*** Setting up environment ***"
echo "******************************"
# Create ssh deamon folder
mkdir /var/run/sshd

# Setup /etc/environment
# [HACK] PYTHONPATH and LD_LIBRARY_PATH is only set to get OTB to work.
# [TODO] Try to avoid this.
printf '%s\n' \
    'PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/orfeo/bin:/usr/local/esa-snap/bin:/home/sepal-user/.local/bin:/usr/local/cuda/bin:/usr/local/GMTSAR/bin"' \
    'JAVA_HOME="/usr/local/lib/sdkman/candidates/java/current"' \
    'SDKMAN_DIR="/usr/local/lib/sdkman"' \
    'GDAL_DATA="/usr/share/gdal"' \
    'SHELL="/bin/bash"' \
    'SEPAL="true"' \
    'PROJ_LIB="/usr/share/proj"' \
    'LOCALTILESERVER_CLIENT_PREFIX="/api/sandbox/jupyter/proxy/{port}"' \
    'OTB_INSTALL_DIR=/usr/local/lib/orfeo' \
    'OTB_APPLICATION_PATH=/usr/local/lib/orfeo/lib/otb/applications' \
    'PYTHONPATH=/usr/local/lib/orfeo/lib/otb/python' \
    'LD_LIBRARY_PATH=/lib/:/lib/x86_64-linux-gnu/:/lib32/:/usr/lib/x86_64-linux-gnu/libfakeroot/:/usr/local/cuda/targets/x86_64-linux/lib/:/usr/local/lib/python3.10/dist-packages/nvidia/cudnn/lib:/usr/local/lib/TensorRT/lib:/usr/local/lib/orfeo/lib:' \
    'GMTSAR=/usr/local/GMTSAR' \
    >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

sed -i '/.*"PDF".*/d' /etc/ImageMagick-6/policy.xml

echo
echo "*************************"
echo "*** Image Initialized ***"
echo "*************************"
