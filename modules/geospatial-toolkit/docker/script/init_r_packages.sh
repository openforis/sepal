#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo
echo "********************"
echo "*** Installing R ***"
echo "********************"

#echo "options(Ncpus = `nproc`)" > /root/.Rprofile

apt-get install -y\
 r-base\
 r-base-dev

echo
echo "*****************************************"
echo "*** Installing R packages ***"
echo "*****************************************"
# libudunits2-dev required for udunits, needed by mapview
apt-get install -y \
    libudunits2-dev \
    r-cran-rmpi \
    libopenmpi-dev \
    libgeos++-dev \
    libmagick++-dev \
    libv8-dev \
    libcgal-dev libglu1-mesa-dev libglu1-mesa-dev \
    libnetcdf-dev \
    libpq-dev

R -e "install.packages('devtools', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "install.packages('pacman', dependencies=TRUE, repos='http://cran.rstudio.com/')"
R -e "devtools::install_github('appelmar/strucchange')"
R -e "install.packages('XML', repos = 'http://www.omegahat.net/R')" # CRAN version require R > 4.0
# jreiche/bayts is a dependency of Early Warning System for Canopy Disturbances in Ecuador (SATA)
R -e "pacman::p_load(\
        'abind',\
        'askpass',\
        'assertthat',\
        'backports',\
        'base64enc',\
        'BH',\
        'BiodiversityR',\
        'bit',\
        'bit64',\
        'blob',\
        'brew',\
        'broom',\
        'callr',\
        'car',\
        'caret',\
        'cellranger',\
        'chron',\
        'classInt',\
        'cli',\
        'clipr',\
        'colorspace',\
        'colourpicker',\
        'corrplot',\
        'countrycode',\
        'crayon',\
        'curl',\
        'data.table',\
        'DBI',\
        'DBItest',\
        'dbplyr',\
        'desc',\
        'devtools',\
        'DiagrammeR',\
        'dichromat',\
        'digest',\
        'dismo',\
        'doMC',\
        'doParallel',\
        'downloader',\
        'dplyr',\
        'DT',\
        'e1071',\
        'ellipsis',\
        'evaluate',\
        'evir',\
        'expss',\
        'fansi',\
        'fasterize',\
        'feather',\
        'filehash',\
        'forcats',\
        'foreach',\
        'forecast',\
        'foreign',\
        'formatR',\
        'formattable',\
        'Formula',\
        'fs',\
        'future',\
        'generics',\
        'geoR',\
        'geosphere',\
        'ggalluvial',\
        'ggExtra',\
        'ggfortify',\
        'ggmap',\
        'ggplot2',\
        'ggrepel',\
        'ggthemes',\
        'ggthemr',\
        'GISTools',\
        'glmnet',\
        'globals',\
        'glue',\
        'googleVis',\
        'gpclib',\
        'grid',\
        'gridExtra',\
        'gsubfn',\
        'gtable',\
        'haven',\
        'hexbin',\
        'highr',\
        'Hmisc',\
        'hms',\
        'htmltools',\
        'htmlwidgets',\
        'httpuv',\
        'httr',\
        'igraph',\
        'influenceR',\
        'iterators',\
        'jpeg',\
        'jsonlite',\
        'kableExtra',\
        'keras',\
        'knitr',\
        'labeling',\
        'later',\
        'lattice',\
        'latticeExtra',\
        'lazyeval',\
        'leaflet',\
        'leaflet.extras',\
        'lifecycle',\
        'listenv',\
        'littler',\
        'lme4',\
        'lmfor',\
        'lubridate',\
        'magick',\
        'magrittr',\
        'manipulate',\
        'mapproj',\
        'maps',\
        'maptools',\
        'markdown',\
        'MASS',\
        'memoise',\
        'mgcv',\
        'mime',\
        'miniUI',\
        'missForest',\
        'mockery',\
        'mockr',\
        'modelr',\
        'moments',\
        'multcomp',\
        'multicore',\
        'munsell',\
        'ncdf4',\
        'networkD3',\
        'nlme',\
        'nlstools',\
        'openssl',\
        'outliers',\
        'pacman',\
        'parallel',\
        'party',\
        'permutate',\
        'pillar',\
        'pkgconfig',\
        'pkgKitten',\
        'plyr',\
        'png',\
        'PracTools',\
        'praise',\
        'prettycode',\
        'prettyunits',\
        'processx',\
        'progress',\
        'promises',\
        'proto',\
        'ps',\
        'purrr',\
        'quantmod',\
        'R6',\
        'random',\
        'randomForest',\
        'raster',\
        'rasterVis',\
        'rclipboard',\
        'RColorBrewer',\
        'Rcpp',\
        'RcppArmadillo',\
        'RcppEigen',\
        'RCurl',\
        'readr',\
        'readxl',\
        'rematch',\
        'rematch2',\
        'rentrez',\
        'reprex',\
        'reshape',\
        'reshape2',\
        'reticulate',\
        'rgbif',\
        'rgeos',\
        'rgexf',\
        'RgoogleMaps',\
        'rhandsontable',\
        'rlang',\
        'rmarkdown',\
        'Rmpi',\
        'Rook',\
        'rpart',\
        'rpart.plot',\
        'RPostgreSQL',\
        'rprojroot',\
        'rsconnect',\
        'RSQLite',\
        'rstudioapi',\
        'rticles',\
        'RUnit',\
        'rvest',\
        'Rweka',\
        'rworldmap',\
        'samplingbook',\
        'scales',\
        'selectr',\
        'shiny',\
        'shinyBS',\
        'shinycssloaders',\
        'shinydashboard',\
        'shinyFiles',\
        'shinyjs',\
        'snow',\
        'sourcetools',\
        'sp',\
        'spatial',\
        'splines',\
        'sqldf',\
        'stats',\
        'stats4',\
        'stringi',\
        'stringr',\
        'strucchange',\
        'styler',\
        'summarytools',\
        'survival',\
        'sys',\
        'taxize',\
        'Taxonstand',\
        'testit',\
        'testthat',\
        'tibble',\
        'tictoc',\
        'tidyr',\
        'tidyselect',\
        'tidyverse',\
        'tikzDevice',\
        'tint',\
        'tinytex',\
        'tools',\
        'treemap',\
        'tufte',\
        'units',\
        'UpSetR',\
        'urltools',\
        'utf8',\
        'utils',\
        'vcd',\
        'vctrs',\
        'vegan',\
        'viridis',\
        'viridisLite',\
        'visNetwork',\
        'vtree',\
        'webshot',\
        'whisker',\
        'withr',\
        'WorldFlora',\
        'writexl',\
        'xfun',\
        'XML',\
        'xml2',\
        'xtable',\
        'xts',\
        'yaml',\
        'zeallot',\
        'zoo'\
    )"

apt-get -y clean
apt-get -y autoremove
