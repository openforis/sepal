#!/bin/bash

# Needed for apt-add-repository command
apt-get -y update && apt-get install -y software-properties-common

# Repository for misc GIS utilities
apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y

# Repository for Java
add-apt-repository -y ppa:webupd8team/java

# Repository for R
add-apt-repository 'deb http://cran.cnr.Berkeley.edu/bin/linux/ubuntu trusty/'
gpg --keyserver keyserver.ubuntu.com --recv-key E084DAB9
gpg -a --export E084DAB9 | sudo apt-key add -

# Repository for Saga - System for Automated Geoscientific Analyses (http://www.saga-gis.org/en/index.html)
apt-add-repository ppa:johanvdw/saga-gis -y

apt-get -y update && apt-get -y upgrade

# Install misc  utilities
apt-get install -y \
    aria2 \
    bc \
    csh \
    curl  \
    dans-gdal-scripts \
    gdebi-core \
    gettext \
    libdbd-xbase-perl \
    libgmp3-dev \
    libgstreamer0.10-dev \
    libgstreamer-plugins-base0.10-dev \
    nano \
    openssh-server \
    otb-bin \
    otb-bin-qt \
    python-otb \
    parallel \
    rsync \
    saga \
	wget \
    xml-twig-tools

# Install Java
echo oracle-java8-installer shared/accepted-oracle-license-v1-1 select true | debconf-set-selections
apt-get install -y oracle-java8-installer

# Install Open Foris Geospatial Toolkit
apt-get install -y \
	 gcc \
	 g++ \
	 gdal-bin \
	 libgdal1-dev \
	 libgsl0-dev \
	 libgsl0ldbl \
	 libproj-dev \
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

# Install Miniconda
wget --no-check-certificate https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
chmod u+x Miniconda3-latest-Linux-x86_64.sh
./Miniconda3-latest-Linux-x86_64.sh -b -p /opt/miniconda3
rm ./Miniconda3-latest-Linux-x86_64.sh

# Install GDAL
/opt/miniconda3/bin/conda install -y gdal

# Install ARCSI - command line tool for the atmospheric correction of Earth Observation imagery )http://rsgislib.org/arcsi/)
# (ARCSI requires older GDAL and OpenSSL versions, so a separate environment is created for ARCSI)
/opt/miniconda3/bin/conda create -y -n arcsi python=3.4
/opt/miniconda3/bin/conda install -y -n arcsi -c https://conda.binstar.org/osgeo arcsi
/opt/miniconda3/bin/conda install -y -n arcsi krb5

# Install R
apt-get install -y r-base r-cran-rcpp

# Install RStudio Server
echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen \
	&& locale-gen en_US.utf8 \
	&& /usr/sbin/update-locale LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
wget https://download2.rstudio.org/rstudio-server-0.99.484-amd64.deb
gdebi -n rstudio-server-0.99.484-amd64.deb
rm -f rstudio-*

# Install Shiny Server
R -e "install.packages('shiny', repos='https://cran.rstudio.com/')"
R -e "install.packages('rmarkdown', repos='https://cran.rstudio.com/')"
wget https://download3.rstudio.org/ubuntu-12.04/x86_64/shiny-server-1.4.2.786-amd64.deb
gdebi -n shiny-server-1.4.2.786-amd64.deb

# Install QGIS
apt-get -y -qq install qgis

# Create ssh deamon folder
mkdir /var/run/sshd

# Setup /etc/environment
echo "PATH=\"/opt/miniconda3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/miniconda3/envs/arcsi/bin\"" \
    > /etc/environment
echo "JAVA_HOME=\"/usr/lib/jvm/java-8-oracle\"" >> /etc/environment
echo "GDAL_DATA=\"/opt/miniconda3/share/gdal\"" >> /etc/environment

# Remove redundant files
rm -rf /var/lib/apt/lists/*
rm -rf /tmp/*

# Warmup tools
/opt/miniconda3/envs/arcsi/bin/arcsi.py --version || true
/opt/miniconda3/bin/gdalinfo --version || true
oft-stack || true

echo "*** Image Initialized ***"