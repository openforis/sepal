#!/bin/bash

echo
echo "******************************"
echo "*** Setting up environment ***"
echo "******************************"
# Create ssh deamon folder
mkdir /var/run/sshd

# Setup /etc/environment
printf '%s\n' \
    "PATH=\"/opt/miniconda3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/miniconda3/envs/arcsi/bin\"" \
    "JAVA_HOME=\"/usr/lib/jvm/java-8-oracle\"" \
    "GDAL_DATA=\"/opt/miniconda3/share/gdal\"" \
    >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

# Warmup tools
/opt/miniconda3/envs/arcsi/bin/arcsi.py --version || true
/opt/miniconda3/bin/gdalinfo --version || true
oft-stack || true

echo
echo "*************************"
echo "*** Image Initialized ***"
echo "*************************"