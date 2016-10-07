#!/bin/bash

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
/opt/miniconda3/bin/R -e "install.packages('shinyBS', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('snow', dependencies=TRUE, repos='http://cran.rstudio.com/')" # Fails
/opt/miniconda3/bin/R -e "install.packages('stringr', dependencies=TRUE, repos='http://cran.rstudio.com/')"
/opt/miniconda3/bin/R -e "install.packages('xtable', dependencies=TRUE, repos='http://cran.rstudio.com/')"
