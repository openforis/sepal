#!/bin/bash
set -e

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

# Repository for R
echo "deb http://cran.rstudio.com/bin/linux/ubuntu xenial/" | tee -a /etc/apt/sources.list
gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
gpg -a --export E084DAB9 | apt-key add -

apt-get -y autoclean && apt-get -y clean && apt-get -y autoremove && apt-get -y purge && apt-get -y update && apt-get -y upgrade

# TODO: Add dans-gdal-scripts - this package currently won't install due to broken dependencies
echo
echo "*********************************"
echo "*** Installing misc utilities ***"
echo "*********************************"
apt-get install -y \
    aria2 \
    autoconf \
    bc \
    bison \
    csh \
    curl \
    dtach \
    ed \
    flex \
    gettext \
    git \
    gsl-bin \
    imagemagick \
    libboost-dev \
    libcairo2-dev \
    libcunit1-dev \
    libdbd-xbase-perl \
    libglade2-dev \
    libgtk2.0-dev \
    libgmp3-dev \
    libgstreamer0.10-dev \
    libgstreamer-plugins-base0.10-dev \
    libproj-dev \
    libxcursor-dev \
    libxinerama-dev \
    libxrandr-dev \
    libxt-dev \
    nano \
    parallel \
    pkg-config \
    python-otb \
    python-opencv \
    python-pandas \
    python-pip \
    python-pyshp \
    python-rasterio \
    rsync \
    saga \
    screen \
    swig \
    tcl-dev \
    tmux \
    unzip \
    vim \
    wget \
    xml-twig-tools

pip install python-dateutil
pip install pyCrypto
pip install earthengine-api
pip install google-api-python-client
pip install awscli
