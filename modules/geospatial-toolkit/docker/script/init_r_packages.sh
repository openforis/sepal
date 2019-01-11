#!/bin/bash
set -e

echo
echo "*****************************************"
echo "*** Installing R packages ***"
echo "*****************************************"
set -e
# libudunits2-dev required for udunits, needed by mapview
apt-get install -y \
    libudunits2-dev \
    r-cran-rmpi \
    libopenmpi-dev \
    libgeos++-dev

export JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current
export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/lib/server:${JAVA_HOME}/lib
R CMD javareconf

R -e "install.packages('devtools', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('pacman', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "devtools::install_github('appelmar/strucchange')"
R -e "pacman::p_load_gh(\
        'appelmar/bfast',\
        'loicdtx/bfastSpatial',\
        'jreiche/bayts'\
    )"
# jreiche/bayts is a dependency of Early Warning System for Canopy Disturbances in Ecuador (SATA)
R -e "pacman::p_load(\
        'corrplot',\
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
        'maptools',\
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
        'sf',\
        'shiny',\
        'shinyBS',\
        'shinycssloaders',\
        'shinydashboard',\
        'shinyFiles',\
        'shinyjs',\
        'snow',\
        'sp',\
        'sqldf',\
        'stringr',\
        'strucchange',\
        'tictoc',\
        'tidyr',\
        'xtable',\
        'zoo'\
    )"
