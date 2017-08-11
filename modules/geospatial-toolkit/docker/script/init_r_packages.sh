#!/bin/bash
set -e

echo
echo "*****************************************"
echo "*** Installing R packages ***"
echo "*****************************************"

# libudunits2-dev required for udunits, needed by mapview
apt-get install -y \
    r-cran-rmpi \
    libudunits2-dev

export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/jre/lib/amd64/server:${JAVA_HOME}/jre/lib/amd64
R CMD javareconf

R -e "install.packages('pacman', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "pacman::p_load_gh(\
        'verbe039/bfast', \
        'loicdtx/bfastSpatial'\
    )"
R -e "pacman::p_load(\
        'corrplot',\
        'devtools',\
        'dismo',\
        'dplyr',\
        'DT',\
        'ggmap',\
        'ggplot2',\
        'htmltools',\
        'knitr',\
        'leaflet',\
        'lubridate',\
        'mapview',\
        'plyr',\
        'random',\
        'raster',\
        'RColorBrewer',\
        'rgdal',\
        'rgeos',\
        'rmarkdown',\
        'rPython',\
        'RSQLite',\
        'RStoolbox',\
        'shiny',\
        'shinyBS',\
        'shinydashboard',\
        'shinyFiles',\
        'shinyjs',\
        'snow',\
        'stringr',\
        'strucchange',\
        'xtable',\
        'zoo'\
    )"
