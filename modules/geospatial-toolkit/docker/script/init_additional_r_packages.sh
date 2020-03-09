#!/bin/bash
set -e

echo
echo "****************************************"
echo "*** Installing additional R packages ***"
echo "****************************************"

export RPYTHON_PYTHON_VERSION=3
export JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current
export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/lib/server:${JAVA_HOME}/lib
R CMD javareconf
R -e "install.packages('rgdal', version='1.3-9', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "pacman::p_load(\
        'dggridR',\
        'mapview',\
        'rJava',\
        'rPython',\
        'RStoolbox',\
        'sf',\
        'XLConnect',\
        'xlsx',\
        'vtree',\
        'xlsxjars'\
    )"
R -e "pacman::p_load_gh(\
        'appelmar/bfast',\
        'loicdtx/bfastSpatial',\
        'jreiche/bayts'\
    )"
