FROM ubuntu:focal

EXPOSE 8180

ENV DEBIAN_FRONTEND noninteractive
ENV MODULE_NAME r-proxy
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# Install base apt packages
RUN apt-get -y update && apt-get install -y \
    curl \
    git \
    nano \
    sudo \
    software-properties-common \
    zip \
    unzip

# Add repository for misc GIS utilities
RUN apt-add-repository -y ppa:ubuntugis/ubuntugis-unstable

# Add repositories for R
RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E298A3A825C0D65DFD57CBB651716619E084DAB9
RUN add-apt-repository "deb https://cloud.r-project.org/bin/linux/ubuntu $(lsb_release -cs)-cran40/"
RUN add-apt-repository -y ppa:c2d4u.team/c2d4u4.0+

# Configure SDKMAN! directory
ENV SDKMAN_DIR=/usr/local/lib/sdkman

# Install SDKMAN!
RUN curl -s https://get.sdkman.io | bash

# Set SDKMAN! to non-interactive
RUN sed -ie 's/sdkman_auto_answer=false/sdkman_auto_answer=true/' ${SDKMAN_DIR}/etc/config

# Install Adoption Java 11
RUN bash -c "source $SDKMAN_DIR/bin/sdkman-init.sh && sdk install java 11.0.11.hs-adpt"

# Install extra apt packages
RUN apt-get update && apt-get install -y \
    gcc \
    gdal-bin \
    libcgal-dev \
    libcurl4-openssl-dev \
    libfribidi-dev \
    libgdal-dev \
    libgeos++-dev \
    libglu1-mesa-dev \
    libharfbuzz-dev \
    libmagick++-dev \
    libnetcdf-dev \
    libopenmpi-dev \
    libpq-dev \
    libssl-dev \
    libudunits2-dev \
    libv8-dev \
    libxml2-dev \
    r-base \
    r-base-dev \
    r-cran-rmpi

# Configure R Java home
RUN bash -c "source $SDKMAN_DIR/bin/sdkman-init.sh && JAVA_HOME=$(sdk home java) && R CMD javareconf"

# Install R packages
RUN R -e 'install.packages("remotes", lib = "/usr/lib/R/site-library")'

# Create node user
RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# Install node.js
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash
RUN apt-get update && apt-get -y install nodejs

# Install node global packages
RUN npm install -g nodemon

# Install shared node.js lib
ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

# Install node.js module
ADD modules/${MODULE_NAME}/package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

USER node
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin

USER node
CMD start.sh
