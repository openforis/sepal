#!/bin/bash

echo
echo "**********************"
echo "*** Setting up APT ***"
echo "**********************"
# Needed for apt-add-repository command
apt-get -y update && apt-get install -y software-properties-common

# Repository for misc GIS utilities
apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y

# Repository for Java
add-apt-repository -y ppa:webupd8team/java

# Repository for Saga - System for Automated Geoscientific Analyses (http://www.saga-gis.org/en/index.html)
apt-add-repository ppa:johanvdw/saga-gis -y

apt-get -y update && apt-get -y upgrade

# TODO: Add dans-gdal-scripts - this package currently won't install due to broken dependencies
echo
echo "*********************************"
echo "*** Installing misc utilities ***"
echo "*********************************"
apt-get install -y \
    aria2 \
    bc \
    csh \
    curl  \
    gdebi-core \
    gettext \
    libcairo2-dev \
    libdbd-xbase-perl \
    libgmp3-dev \
    libgstreamer0.10-dev \
    libgstreamer-plugins-base0.10-dev \
	libproj-dev \
    libxt-dev \
    nano \
    openssh-server \
    otb-bin \
    otb-bin-qt \
    python-otb \
    parallel \
    rsync \
    saga \
    unzip \
	wget \
    xml-twig-tools
