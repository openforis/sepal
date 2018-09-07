#!/bin/bash
set -e

echo
echo "*****************************************"
echo "*** Installing R packages ***"
echo "*****************************************"
set -e
# libudunits2-dev required for udunits, needed by mapview
apt-get install -y \
    libudunits2-dev
apt-get build-dep -y r-cran-rmpi

export JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current
export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/jre/lib/amd64/server:${JAVA_HOME}/jre/lib/amd64
R CMD javareconf

R -e "install.packages('pacman', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "devtools::install_github('appelmar/strucchange')"
R -e "pacman::p_load_gh(\
        'appelmar/bfast',\
        'loicdtx/bfastSpatial'\
    )"
R -e "pacman::p_load(\
        'corrplot',\
        'devtools',\
        'dismo',\
        'dplyr',\
        'DT',\
        'Formula',\
        'ggmap',\
        'ggplot2',\
        'htmltools',\
        'igraph',\
        'keras',\
        'knitr',\
        'leaflet',\
        'lubridate',\
        'mapview',\
        'plyr',\
        'random',\
        'randomForest',\
        'raster',\
        'RColorBrewer',\
        'rgdal',\
        'rgeos',\
        'rJava',\
        'Rmpi',\
        'rmarkdown',\
        'rPython',\
        'RSQLite',\
        'RStoolbox',\
        'shiny',\
        'shinyBS',\
        'shinycssloaders',\
        'shinydashboard',\
        'shinyFiles',\
        'shinyjs',\
        'snow',\
        'stringr',\
        'strucchange',\
        'xtable',\
        'zoo'\
    )"
