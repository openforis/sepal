#!/bin/bash


#install software-properties-common(needed for add apt repo)
apt-get update && apt-get install -y software-properties-common

#install r-base
add-apt-repository 'deb http://cran.cnr.Berkeley.edu/bin/linux/ubuntu trusty/'
gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
gpg -a --export E084DAB9 | sudo apt-key add -
apt-get update
apt-get upgrade
apt-get install -y r-base


#install basic tools
apt-get update && apt-get install -y gdebi qgis parallel openssh-server supervisor software-properties-common wget curl  gcc g++ gdal-bin libgdal1-dev libgsl0-dev libgsl0ldbl libproj-dev python-gdal python-scipy python-tk python-qt4 perl

#install oft
wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run



# install miniconda(arcsi and tuiview)
wget https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
chmod u+x Miniconda3-latest-Linux-x86_64.sh
./Miniconda3-latest-Linux-x86_64.sh -b -p /opt/miniconda3
/opt/miniconda3/bin/conda install -y -c https://conda.binstar.org/osgeo arcsi tuiview
echo "GDAL_DRIVER_PATH=\"/opt/miniconda3/lib/gdalplugins:$GDAL_DRIVER_PATH\"" >> /etc/environment
echo "GDAL_DATA=\"/opt/miniconda3/share/gdal\"" >> /etc/environment
echo "PATH=\"$PATH:/opt/miniconda3/bin\"" >> /etc/environment

#install qgis/parallel/rstudio
wget https://download1.rstudio.org/rstudio-0.99.484-amd64.deb
gdebi -n rstudio-0.99.484-amd64.deb
rm -f rstudio-*

#create ssh deamon folder
mkdir /var/run/sshd