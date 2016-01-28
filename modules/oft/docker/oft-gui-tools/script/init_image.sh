#!/bin/bash

#installs basic tools
apt-get update && apt-get install -y \
    qgis \
    libgstreamer0.10-dev \
    libgstreamer-plugins-base0.10-dev

#installs tuiview
/opt/miniconda3/bin/conda install -y -n python3_4 -c https://conda.binstar.org/osgeo tuiview


#installs /rstudio
wget https://download1.rstudio.org/rstudio-0.99.484-amd64.deb
gdebi -n rstudio-0.99.484-amd64.deb

#installs rstudio-server
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen \
	&& locale-gen en_US.utf8 \
	&& /usr/sbin/update-locale LANG=en_US.UTF-8

export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

wget https://download2.rstudio.org/rstudio-server-0.99.484-amd64.deb
gdebi -n rstudio-server-0.99.484-amd64.deb
rm -f rstudio-*
