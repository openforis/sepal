#!/bin/bash



#install r-base
add-apt-repository 'deb http://cran.cnr.Berkeley.edu/bin/linux/ubuntu trusty/'
gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
gpg -a --export E084DAB9 | sudo apt-key add -
apt-get update
apt-get upgrade
apt-get install -y r-base


#install basic tools
apt-get update && apt-get install -y gdebi qgis


# install tuiview
/opt/miniconda3/bin/conda install -y -c https://conda.binstar.org/osgeo arcsi tuiview


#install /rstudio
wget https://download1.rstudio.org/rstudio-0.99.484-amd64.deb
gdebi -n rstudio-0.99.484-amd64.deb
rm -f rstudio-*
