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
    libgeos++-dev \
    libmagick++-dev

export JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current
export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/lib/server:${JAVA_HOME}/lib
R CMD javareconf

R -e "install.packages('devtools', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('pacman', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('rgdal', version='1.3-9', dependencies=TRUE, repos='http://cran.rstudio.com/')"
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
        'Hmisc',\
        'htmltools',\
        'igraph',\
        'keras',\
        'knitr',\
        'leaflet',\
        'lubridate',\
        'maptools',\
        'mapview',\
        'ncdf4',\
        'parallel',\
        'plyr',\
        'random',\
        'randomForest',\
        'raster',\
        'RColorBrewer',\
        'RCurl',\
        'readxl',\
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
        'tidyverse',\
        'xtable',\
        'zoo'\
    )"

# OpenForis shiny apps
R -e "pacman::p_load(\
        'BIOMASS',\
        'car',\
        'caret',\
        'chron',\
        'colorspace',\
        'data.table',\
        'DBI',\
        'dichromat',\
        'digest',\
        'evir',\
        'forecast',\
        'foreign',\
        'geoR',\
        'geosphere',\
        'ggalluvial',\
        'ggrepel',\
        'ggthemes',\
        'glmnet',\
        'googleVis',\
        'grid',\
        'gridExtra',\
        'gsubfn',\
        'gtable',\
        'htmlwidgets',\
        'httr',\
        'jpeg',\
        'jsonlite',\
        'labeling',\
        'lattice',\
        'lazyeval',\
        'lme4',\
        'lmfor',\
        'manipulate',\
        'mapproj',\
        'maps',\
        'MASS',\
        'mgcv',\
        'missForest',\
        'moments',\
        'multcomp',\
        'munsell',\
        'networkD3',\
        'nlme',\
        'outliers',\
        'permute',\
        'png',\
        'proto',\
        'quantmod',\
        'Rcpp',\
        'RcppEigen',\
        'reshape',\
        'reshape2',\
        'RgoogleMaps',\
        'RPostgreSQL',\
        'rworldmap',\
        'scales',\
        'spatial',\
        'splines',\
        'stats',\
        'stats4',\
        'stringi',\
        'summarytools',\
        'survival',\
        'tibble',\
        'tools',\
        'treemap',\
        'urltools',\
        'utils',\
        'vcd',\
        'vegan',\
        'XLConnect',\
        'xlsx',\
        'XML',\
        'xml2',\
        'xts',\
        'yaml'\
    )"
