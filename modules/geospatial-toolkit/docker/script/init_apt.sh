#!/bin/bash
set -e
echo
echo "**********************"
echo "*** Setting up APT ***"
echo "**********************"
#export MAKEFLAGS="-k -j`nproc`"
export DEBIAN_FRONTEND=noninteractive

# Needed for apt-add-repository command
apt-get -y update
apt-get install -y software-properties-common

# Repository for misc GIS utilities
apt-add-repository -y ppa:ubuntugis/ubuntugis-unstable

# Repository for R
apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E298A3A825C0D65DFD57CBB651716619E084DAB9
add-apt-repository "deb https://cloud.r-project.org/bin/linux/ubuntu $(lsb_release -cs)-cran40/"
add-apt-repository -y ppa:c2d4u.team/c2d4u4.0+

apt-get -y update
apt-get -y upgrade

apt-get install -y \
    apt-transport-https \
    autoconf \
    bison \
    build-essential \
    ca-certificates \
    csh \
    curl \
    dtach \
    ed \
    git \
    jq \
    libcurl4-openssl-dev \
    libssl-dev \
    locales \
    mlocate \
    nano \
    python3 \
    python3-dev \
    rsync \
    screen \
    unzip \
    vim \
    wget \
    zip

echo
echo "*************************"
echo "*** Configuring Locale***"
echo "*************************"
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
locale-gen en_US.utf8
update-locale LC_ALL=en_US.UTF-8
update-locale LANG=en_US.UTF-8

apt-get -y clean
apt-get -y autoremove
