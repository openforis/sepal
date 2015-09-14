#!/usr/bin/env bash


#install base package
apt-get update && apt-get install  -y wget unzip


#install geoserver
\
    wget -c http://sourceforge.net/projects/geoserver/files/GeoServer/2.7.2/geoserver-2.7.2-bin.zip \
         -O /tmp/geoserver-2.7.2-bin.zip && \
    unzip /tmp/geoserver-2.7.2-bin.zip -d /opt && \
    cd /opt && \
    ln -s geoserver-2.7.2 geoserver


chmod +x /geoserver

apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*


