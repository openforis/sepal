#!/bin/bash
set -e

echo
echo "****************************************"
echo "*** Installing additional R packages ***"
echo "****************************************"

export JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current
export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/lib/server:${JAVA_HOME}/lib
R CMD javareconf
R -e "install.packages('rgdal', version='1.3-9', dependencies=TRUE, repos='http://r-proxy:8180/')"
R -e "install.packages(c(\
        'BIOMASS',\
        'mapview',\
        'pkgdown',\
        'rJava',\
        'rknn',\
        'ragg',\
        'RStoolbox',\
        'sf',\
        'textshaping',\
        'tigris',\
        'XLConnect',\
        'xlsx',\
        'vtree',\
        'xlsxjars'\
    ), repos='http://r-proxy:8180/')"


  R -e "devtools::install_github('r-barnes/dggridR', dependencies=TRUE, repos='http://r-proxy:8180/')"
R -e "devtools::install_github('bfast2/bfast', dependencies=TRUE, repos='http://r-proxy:8180/')"
R -e "devtools::install_github('azvoleff/gfcanalysis', dependencies=TRUE, repos='http://r-proxy:8180/')"
R -e "devtools::install_github('loicdtx/bfastSpatial', dependencies=TRUE, repos='http://r-proxy:8180/')"
R -e "devtools::install_github('jreiche/bayts', dependencies=TRUE, repos='http://r-proxy:8180/')"

