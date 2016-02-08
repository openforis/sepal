#!/bin/bash

#install basic tools
apt-get update && apt-get install -y software-properties-common
apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y
apt-add-repository ppa:johanvdw/saga-gis -y


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
    nano \
    csh \
    libgmp3-dev \
    saga \
    aria2 \
    xml-twig-tools

#install oft
wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run

# install miniconda(arcsi)
wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
chmod u+x Miniconda3-latest-Linux-x86_64.sh
./Miniconda3-latest-Linux-x86_64.sh -b -p /opt/miniconda3

# Arcsi need python 3.4 Those lines creates a conda environment which uses Python 3.4
/opt/miniconda3/bin/conda create -n python3_4 python=3.4
source activate python3_4


/opt/miniconda3/bin/conda install -y -n python3_4 -c https://conda.binstar.org/osgeo arcsi
/opt/miniconda3/bin/conda install -y -n python3_4 pandas
rm -rf ./Miniconda3-latest-Linux-x86_64.sh
echo "GDAL_DRIVER_PATH=\"/opt/miniconda3/lib/gdalplugins:$GDAL_DRIVER_PATH\"" >> /etc/environment
echo "GDAL_DATA=\"/opt/miniconda3/share/gdal\"" >> /etc/environment
echo "PATH=\"/opt/miniconda3/bin:/opt/miniconda3/envs/python3_4/bin:/$PATH\"" >> /etc/environment

source /etc/environment

#install r-base
add-apt-repository 'deb http://cran.cnr.Berkeley.edu/bin/linux/ubuntu trusty/'
gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
gpg -a --export E084DAB9 | sudo apt-key add -
apt-get update
apt-get upgrade -y
apt-get install -y r-base r-cran-rcpp

#install OpenSARKit
export OSK_GIT_URL=https://github.com/cdanielw/OpenSARKit
wget $OSK_GIT_URL/raw/master/install_scripts/install_osk.sh
chmod u+x install_osk.sh
./install_osk.sh
rm ./install_osk.sh

#create ssh deamon folder
mkdir /var/run/sshd
