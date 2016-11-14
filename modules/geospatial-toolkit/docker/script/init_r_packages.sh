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

R -e "install.packages('dismo', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('DT', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('ggplot2', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('leaflet', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('mapview', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('plyr', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('raster', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('RColorBrewer', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('rgdal', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('rgeos', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('rmarkdown', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('random', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('RSQLite', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('shiny', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('shinydashboard', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('shinyFiles', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('shinyBS', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('snow', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('htmltools', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('devtools', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('stringr', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('xtable', dependencies=TRUE, repos='http://cran.rstudio.com/')"
