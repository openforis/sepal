FROM ubuntu:focal

ENV DEBIAN_FRONTEND noninteractive

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

# Install Java: configure SDKMAN! directory
ENV SDKMAN_DIR=/usr/local/lib/sdkman
ENV JAVA_VERSION 11.0.11.hs-adpt

# Install Java: install SDKMAN!
RUN curl -s https://get.sdkman.io | bash

# Install Java: set SDKMAN! to non-interactive
RUN sed -ie 's/sdkman_auto_answer=false/sdkman_auto_answer=true/' ${SDKMAN_DIR}/etc/config

# Install Java: use SDKMAN! to install Adoption Java 11
RUN bash -c 'source ${SDKMAN_DIR}/bin/sdkman-init.sh && sdk install java ${JAVA_VERSION}'

# Install Java: Symlink Java to /usr/local/bin to make it available to any user
RUN bash -c 'source ${SDKMAN_DIR}/bin/sdkman-init.sh && update-alternatives --install /usr/local/bin/java java $(sdk home java ${JAVA_VERSION})/bin/java 1'

# Configure R Java home
RUN bash -c 'source ${SDKMAN_DIR}/bin/sdkman-init.sh && JAVA_HOME=$(sdk home java) R CMD javareconf'
