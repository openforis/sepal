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

# Repository for R
echo "deb https://cloud.r-project.org/bin/linux/ubuntu bionic-cran35/" | tee -a /etc/apt/sources.list
gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
gpg -a --export E084DAB9 | apt-key add -
add-apt-repository ppa:marutter/c2d4u3.5

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

echo
echo "*********************************"
echo "*** Installing misc utilities ***"
echo "*********************************"
DEBIAN_FRONTEND=noninteractive apt-get install -y --fix-missing \
    aria2 \
    autoconf \
    bc \
    bison \
    build-essential \
    csh \
    curl \
    dbview \
    dtach \
    ed \
    flex \
    gettext \
    git \
    gsl-bin \
    imagemagick \
    jq \
    libboost-dev \
    libcairo2-dev \
    libcunit1-dev \
    libdbd-xbase-perl \
    libglade2-dev \
    libgtk2.0-dev \
    libffi-dev \
    libgmp3-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libpython3-dev \
    libproj-dev \
    libspatialindex-dev \
    libssl-dev \
    libxcursor-dev \
    libxinerama-dev \
    libxrandr-dev \
    libxt-dev \
    mlocate \
    nano \
    parallel \
    pkg-config \
    p7zip-full \
    python3-gdal \
    python-dev \
    python-opencv \
    python-pandas \
    python-pip \
    python3-pip \
    python-pyshp \
    python-rasterio \
    python-scikits-learn \
    python-statsmodels-lib \
    python-statsmodels \
    python-virtualenv \
    rsync \
    saga \
    screen \
    shapelib \
    swig \
    tcl-dev \
    tmux \
    unrar-free \
    unzip \
    vim \
    wget \
    xml-twig-tools \
    zip

echo
echo "************************************"
echo "*** Installing misc python tools ***"
echo "************************************"
pip2 install -r /config/requirements.txt
pip2 install --upgrade pip
pip3 install -r /config/requirements.txt
pip3 install --upgrade pip