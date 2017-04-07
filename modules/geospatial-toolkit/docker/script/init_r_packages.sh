#!/bin/bash
set -e

echo
echo "*****************************************"
echo "*** Installing R packages ***"
echo "*****************************************"

apt-get install -y \
    r-cran-rmpi

export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/jre/lib/amd64/server:${JAVA_HOME}/jre/lib/amd64
R CMD javareconf

R -e "install.packages('pacman', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "pacman::p_load_gh('hoxo-m/githubinstall', 'loicdtx/bfastSpatial')"
R -e "pacman::p_load('dismo', 'DT', 'ggplot2', 'leaflet', 'mapview', 'plyr', 'raster', 'RColorBrewer', 'rgdal',\
    'rgeos', 'raster', 'RColorBrewer', 'rgdal', 'rgeos', 'rmarkdown', 'random', 'RSQLite', 'shiny', 'shinydashboard',\
    'shinyFiles', 'shinyBS', 'snow', 'htmltools', 'devtools', 'stringr', 'xtable')"
