#!/bin/bash

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

# Repository for Saga - System for Automated Geoscientific Analyses (http://www.saga-gis.org/en/index.html)
apt-add-repository ppa:johanvdw/saga-gis -y

apt-get -y update && apt-get -y upgrade

echo
echo "*********************************"
echo "*** Installing misc utilities ***"
echo "*********************************"
apt-get install -y \
    aria2 \
    bc \
    csh \
    curl  \
    dans-gdal-scripts \
    gdebi-core \
    gettext \
    libcairo2-dev \
    libdbd-xbase-perl \
    libgmp3-dev \
    libgstreamer0.10-dev \
    libgstreamer-plugins-base0.10-dev \
	libproj-dev \
    libxt-dev \
    nano \
    openssh-server \
    otb-bin \
    otb-bin-qt \
    python-otb \
    parallel \
    rsync \
    saga \
    unzip \
	wget \
    xml-twig-tools

echo
echo "************************************************"
echo "*** Installing Open Foris Geospatial Toolkit ***"
echo "************************************************"
apt-get install -y \
	 gcc \
	 g++ \
	 gdal-bin \
	 libgdal1-dev \
	 libgsl0-dev \
	 libgsl0ldbl \
	 make \
	 python-gdal \
	 python-scipy \
	 python-tk \
	 python-qt4 \
	 perl

wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run
1 | ./OpenForisToolkit.run
rm OpenForisToolkit.run

echo
echo "***********************"
echo "*** Installing Java ***"
echo "***********************"
echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | debconf-set-selections
apt-get install -y oracle-java8-installer

echo
echo "****************************"
echo "*** Installing Miniconda ***"
echo "****************************"
wget --no-check-certificate https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
chmod u+x Miniconda3-latest-Linux-x86_64.sh
./Miniconda3-latest-Linux-x86_64.sh -b -p /opt/miniconda3
rm ./Miniconda3-latest-Linux-x86_64.sh

echo
echo "***********************"
echo "*** Installing GDAL ***"
echo "***********************"
/opt/miniconda3/bin/conda install -y gdal

echo
echo "************************"
echo "*** Installing ARCSI ***"
echo "************************"
# (ARCSI requires older GDAL and OpenSSL versions, so a separate environment is created for ARCSI)
/opt/miniconda3/bin/conda create -y -n arcsi python=3.4
/opt/miniconda3/bin/conda install -y -n arcsi -c https://conda.binstar.org/osgeo arcsi
/opt/miniconda3/bin/conda install -y -n arcsi krb5
/opt/miniconda3/bin/conda update -y -n arcsi scipy

echo
echo "*****************************************"
echo "*** Installing R and related packages ***"
echo "*****************************************"
/opt/miniconda3/bin/conda install -y -c r r
/opt/miniconda3/bin/conda install krb5
/opt/miniconda3/bin/conda install -y -c r r-essentials
/opt/miniconda3/bin/conda install -y -c r r-rcpp

printf '%s\n' \
    "PROJ_LIB='/usr/share/proj/'" \
    "R_LIBS_SITE='/shiny/library:/opt/miniconda3/lib/R/library:/usr/local/lib/R/site-library:/usr/lib/R/site-library:/usr/lib/R/library'" \
    "GDAL_DATA='/opt/miniconda3/share/gdal'" \
    >> /opt/miniconda3/lib/R/etc/Renviron

apt-get install -y \
    r-cran-rjava \
    r-cran-rmpi

export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/jre/lib/amd64/server:${JAVA_HOME}/jre/lib/amd64
/opt/miniconda3/bin/R CMD javareconf

export LD_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libfakeroot:/usr/local/lib:/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu/mesa:/usr/lib:x86_64-linux-gnu/mir/clientplatform/mesa:/lib32:/usr/lib32:/opt/miniconda3/lib
export PROJ_LIB=/usr/share/proj/

/opt/miniconda3/bin/R -e "install.packages('dismo', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('DT', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('ggplot2', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('leaflet', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('plyr', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('raster', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('RColorBrewer', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('rgdal', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('rgeos', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('rmarkdown', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('shiny', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('shinydashboard', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('snow', dependencies=TRUE, repos='http://cran.rstudio.com/')" # Fails
/opt/miniconda3/bin/R -e "install.packages('stringr', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('xtable', dependencies=TRUE, repos='http://cran.rstudio.com/')"

echo
echo "*********************************"
echo "*** Installing RStudio Server ***"
echo "*********************************"
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen \
	&& locale-gen en_US.utf8 \
	&& /usr/sbin/update-locale LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
wget https://download2.rstudio.org/rstudio-server-0.99.484-amd64.deb
gdebi -n rstudio-server-0.99.484-amd64.deb
rm -f rstudio-*

echo
echo "*******************************"
echo "*** Installing Shiny Server ***"
echo "*******************************"
wget https://download3.rstudio.org/ubuntu-12.04/x86_64/shiny-server-1.4.2.786-amd64.deb
gdebi -n shiny-server-1.4.2.786-amd64.deb
chown shiny:root /opt/miniconda3/lib/R/library
rm shiny-server-1.4.2.786-amd64.deb

echo
echo "***********************"
echo "*** Installing QGIS ***"
echo "***********************"
apt-get -y -qq install qgis

echo
echo "******************************"
echo "*** Setting up environment ***"
echo "******************************"
# Create ssh deamon folder
mkdir /var/run/sshd

# Setup /etc/environment
printf '%s\n' \
    "PATH=\"/opt/miniconda3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/miniconda3/envs/arcsi/bin\"" \
    "JAVA_HOME=\"/usr/lib/jvm/java-8-oracle\"" \
    "GDAL_DATA=\"/opt/miniconda3/share/gdal\"" \
    >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

# Warmup tools
/opt/miniconda3/envs/arcsi/bin/arcsi.py --version || true
/opt/miniconda3/bin/gdalinfo --version || true
oft-stack || true

echo
echo "*************************"
echo "*** Image Initialized ***"
echo "*************************"