#!/bin/bash
set -e
echo "Version 2"
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

echo
echo "*************************"
echo "*** Configuring Locale***"
echo "*************************"
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
apt-get install locales
locale-gen en_US.utf8
update-locale LC_ALL=en_US.UTF-8
update-locale LANG=en_US.UTF-8

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
    build-essential \
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
    libffi-dev \
    libgmp3-dev \
    libgstreamer0.10-dev \
    libgstreamer-plugins-base0.10-dev \
    libproj-dev \
    libssl-dev \
    libxcursor-dev \
    libxinerama-dev \
    libxrandr-dev \
    libxt-dev \
    nano \
    parallel \
    pkg-config \
    p7zip-full \
    python-dev \
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
    unrar-free \
    unzip \
    vim \
    wget \
    xml-twig-tools

pip install python-dateutil
pip install pyCrypto
pip install earthengine-api
pip install google-api-python-client
pip install awscli
