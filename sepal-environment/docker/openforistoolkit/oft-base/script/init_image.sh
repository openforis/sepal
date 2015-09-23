#!/bin/bash

#install basic tools
apt-get update && apt-get install -y parallel openssh-server supervisor wget curl  gcc g++ gdal-bin libgdal1-dev libgsl0-dev libgsl0ldbl libproj-dev python-gdal python-scipy python-tk python-qt4 perl otb-bin otb-bin-qt python-otb

#install oft
wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run



# install miniconda(arcsi)
wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
chmod u+x Miniconda3-latest-Linux-x86_64.sh
./Miniconda3-latest-Linux-x86_64.sh -b -p /opt/miniconda3
/opt/miniconda3/bin/conda install -y -c https://conda.binstar.org/osgeo arcsi
echo "GDAL_DRIVER_PATH=\"/opt/miniconda3/lib/gdalplugins:$GDAL_DRIVER_PATH\"" >> /etc/environment
echo "GDAL_DATA=\"/opt/miniconda3/share/gdal\"" >> /etc/environment
echo "PATH=\"$PATH:/opt/miniconda3/bin\"" >> /etc/environment

#create ssh deamon folder
mkdir /var/run/sshd