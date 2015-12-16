#!/usr/bin/env bash

#install base package
apt-get update && apt-get install -y \
    wget \
    unzip

#install geoserver into /opt/geoserver
wget -c http://sourceforge.net/projects/geoserver/files/GeoServer/2.7.2/geoserver-2.7.2-bin.zip \
    -O /tmp/geoserver-2.7.2-bin.zip
unzip /tmp/geoserver-2.7.2-bin.zip -d /opt
ln -s /opt/geoserver-2.7.2 /opt/geoserver

apt-get clean
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*


