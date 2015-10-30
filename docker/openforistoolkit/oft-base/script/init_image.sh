#!/bin/bash

#install basic tools
apt-get update && apt-get install -y software-properties-common
apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y

apt-get update && apt-get install -y \
    gdebi-core \
    parallel \
    openssh-server \
    supervisor \
    wget \
    curl  \
    gcc \
    g++ \
    gdal-bin \
    libgdal1-dev \
    libgsl0-dev \
    libgsl0ldbl \
    libproj-dev \
    python-gdal \
    python-scipy \
    python-tk \
    python-qt4 \
    perl \
    otb-bin \
    otb-bin-qt \
    python-otb \
    nano

#install oft
wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run

# install miniconda(arcsi)
wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
chmod u+x Miniconda3-latest-Linux-x86_64.sh
./Miniconda3-latest-Linux-x86_64.sh -b -p /opt/miniconda3
/opt/miniconda3/bin/conda install -y -c https://conda.binstar.org/osgeo arcsi
rm -rf ./Miniconda3-latest-Linux-x86_64.sh
echo "GDAL_DRIVER_PATH=\"/opt/miniconda3/lib/gdalplugins:$GDAL_DRIVER_PATH\"" >> /etc/environment
echo "GDAL_DATA=\"/opt/miniconda3/share/gdal\"" >> /etc/environment
echo "PATH=\"/opt/miniconda3/bin:$PATH\"" >> /etc/environment

#install r-base
add-apt-repository 'deb http://cran.cnr.Berkeley.edu/bin/linux/ubuntu trusty/'
gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
gpg -a --export E084DAB9 | sudo apt-key add -
apt-get update
apt-get upgrade
apt-get install -y r-base

#install OpenSARKit
export OSK_GIT_URL=https://github.com/cdanielw/OpenSARKit
wget $OSK_GIT_URL/raw/master/install_scripts/install_osk.sh
chmod u+x install_osk.sh
./install_osk.sh
rm ./install_osk.sh

#create ssh deamon folder
mkdir /var/run/sshd