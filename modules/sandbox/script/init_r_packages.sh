#!/bin/bash
set -e

echo
echo "*****************************"
echo "*** Installing R packages ***"
echo "*****************************"

export JAVA_HOME=/usr/local/lib/sdkman/candidates/java/current
export JAVA_CPPFLAGS="-I${JAVA_HOME}/include -I${JAVA_HOME}/include/linux"
export JAVA_LD_LIBRARY_PATH=${JAVA_HOME}/lib/server:${JAVA_HOME}/lib
export R_DEFAULT_INTERNET_TIMEOUT=7200

CRAN_REPO=http://localhost:8180

CRAN_PACKAGES=(
    abind
    askpass
    assertthat
    backports
    base64enc
    BH
    BiodiversityR
    BIOMASS
    bit
    bit64
    blob
    brew
    broom
    callr
    car
    caret
    cellranger
    chron
    classInt
    cli
    clipr
    collapsibleTree
    colorspace
    colourpicker
    corrplot
    countrycode
    crayon
    curl
    data.table
    DBI
    DBItest
    dbplyr
    desc
    devtools
    DiagrammeR
    dichromat
    digest
    dismo
    doMC
    doParallel
    downloader
    dplyr
    DT
    e1071
    ellipsis
    evaluate
    evir
    expss
    fansi
    fasterize
    feather
    filehash
    forcats
    foreach
    forecast
    foreign
    formatR
    formattable
    Formula
    fs
    future
    generics
    geoR
    geosphere
    ggalluvial
    ggExtra
    ggfortify
    ggmap
    ggplot2
    ggrepel
    ggthemes
    GISTools
    glmnet
    globals
    glue
    googleVis
    gridExtra
    gsubfn
    gtable
    haven
    hexbin
    highr
    Hmisc
    hms
    htmltools
    htmlwidgets
    httpuv
    httr
    igraph
    influenceR
    iterators
    jpeg
    jsonlite
    kableExtra
    keras
    knitr
    labeling
    later
    lattice
    latticeExtra
    lazyeval
    leafem
    leaflet
    leaflet.extras
    lifecycle
    listenv
    littler
    lme4
    lmfor
    lubridate
    magick
    magrittr
    manipulate
    mapproj
    maps
    mapview
    markdown
    MASS
    memoise
    mgcv
    mime
    miniUI
    missForest
    mockery
    mockr
    modelr
    moments
    multcomp
    munsell
    ncdf4
    networkD3
    nlme
    nlstools
    openssl
    outliers
    pacman
    party
    pillar
    pkgconfig
    pkgdown
    pkgKitten
    plotly
    plyr
    png
    PracTools
    praise
    prettycode
    prettyunits
    processx
    progress
    promises
    proto
    ps
    purrr
    quantmod
    R6
    ragg
    random
    randomForest
    raster
    rasterVis
    rclipboard
    RColorBrewer
    Rcpp
    RcppArmadillo
    RcppEigen
    RCurl
    readr
    readxl
    rematch
    rematch2
    rentrez
    reprex
    reshape
    reshape2
    reticulate
    rgbif
    rgexf
    RgoogleMaps
    rhandsontable
    rJava
    rlang
    rmarkdown
    Rmpi
    Rook
    rpart
    rpart.plot
    RPostgreSQL
    rprojroot
    rsconnect
    RSQLite
    RStoolbox
    rstudioapi
    rticles
    RUnit
    rvest
    RWeka
    rworldmap
    samplingbook
    scales
    selectr
    sf
    shiny
    shinyBS
    shinycssloaders
    shinydashboard
    shinyFiles
    shinyjs
    skimr
    snow
    sourcetools
    sp
    spatial
    sqldf
    stringi
    stringr
    styler
    summarytools
    survival
    sys
    taxize
    testit
    testthat
    textclean
    textshaping
    tibble
    tictoc
    tidyr
    tidyselect
    tidyverse
    tigris
    tikzDevice
    tint
    tinytex
    torch
    treemap
    tufte
    units
    UpSetR
    urltools
    utf8
    vcd
    vctrs
    vegan
    viridis
    viridisLite
    visNetwork
    vtree
    webshot
    whisker
    withr
    WorldFlora
    writexl
    xfun
    XLConnect
    xlsx
    xlsxjars
    XML
    xml2
    xtable
    xts
    yaml
    zeallot
    zoo
)

GITHUB_PACKAGES=(
    r-barnes/dggridR
    bfast2/bfast
    azvoleff/gfcanalysis
    jreiche/bayts
)

GITHUB_URLS=()
for package in "${GITHUB_PACKAGES[@]}"; do
    GITHUB_URLS+=("$CRAN_REPO/github/$package/archive/refs/heads/master.tar.gz")
done

rVector() {
    printf "'%s'," "$@" | sed 's/,$//'
}

R -e "install.packages('remotes', dependencies=TRUE, repos='$CRAN_REPO/')"

R CMD javareconf

R -e "install.packages(c($(rVector "${CRAN_PACKAGES[@]}")), repos='$CRAN_REPO/')"

R -e "remotes::install_url(c($(rVector "${GITHUB_URLS[@]}")), repos='$CRAN_REPO/', build = FALSE)"

R -e "torch::install_torch(cuda_version = '12.8')"

# install.packages() and install_url() only warn when a package fails to install
R -e "
    missing <- setdiff(c($(rVector remotes "${CRAN_PACKAGES[@]}" "${GITHUB_PACKAGES[@]##*/}")), rownames(installed.packages()))
    if (length(missing)) stop('Packages not installed: ', paste(missing, collapse = ', '))
    if (!torch::torch_is_installed()) stop('libtorch not installed')
"
