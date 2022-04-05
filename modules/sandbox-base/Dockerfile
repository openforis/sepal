# Image with preinstalled Java, Python, and R

FROM ubuntu:focal

ARG DEBIAN_FRONTEND=noninteractive
ENV DEBIAN_FRONTEND=noninteractive

# Use specific Java version
ARG JAVA_VERSION=11.0.11.hs-adpt

# Add support for https apt repositories
RUN apt-get -y update && apt-get install -y \
    apt-transport-https \
    apt-utils \
    ca-certificates

# Install support for managing locales
RUN apt-get -y update && apt-get install -y \
    locales

# Update locales
RUN echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen \
    && locale-gen en_US.utf8 \
    && update-locale LC_ALL=en_US.UTF-8 \
    && update-locale LANG=en_US.UTF-8

# Install support for add-apt-repository
RUN apt-get -y update && apt-get install -y \
    software-properties-common \
    gnupg

# Upgrade installed packages
RUN apt-get -y upgrade

# Add repository for misc GIS utilities
RUN apt-add-repository -y ppa:ubuntugis/ubuntugis-unstable

# Add repositories for R
RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E298A3A825C0D65DFD57CBB651716619E084DAB9
RUN add-apt-repository "deb https://cloud.r-project.org/bin/linux/ubuntu $(lsb_release -cs)-cran40/"
RUN add-apt-repository -y ppa:c2d4u.team/c2d4u4.0+

# Install general purpose utilities
RUN apt-get -y update && apt-get install -y \
    aria2 \
    autoconf \
    bc \
    bison \
    build-essential \
    cmake \
    csh \
    curl \
    dbview \
    dtach \
    ed \
    enchant \
    flex \
    gcc \
    gettext \
    git \
    imagemagick \
    jq \
    locales \
    mlocate \
    nano \
    p7zip-full \
    parallel \
    pkg-config \
    rsync \
    screen \
    sudo \
    tmux \
    tree \
    unrar-free \
    unzip \
    vim \
    wget \
    zip

# Install GIS utilities
RUN apt-get update -y && apt-get install -y \
    gdal-bin \
    gsl-bin \
    saga \
    shapelib \
    swig \
    tcl-dev \
    xml-twig-tools

# Install R and related
RUN apt-get -y update && apt-get install -y \
    r-base \
    r-base-dev \
    r-cran-rmpi

# Install python and related
RUN apt-get -y update && apt-get install -y \
    python3 \
    python3-dev \
    python3-venv \
    python3-pip \
    python3-gdal \
    python3-opencv \
    python3-pandas \
    python3-pyshp \
    python3-rasterio \
    python3-sklearn \
    python3-statsmodels \
    python3-statsmodels-lib \
    python3-virtualenv \
    python3-wheel

# Make sure pip is up-to-date
RUN pip3 install --upgrade pip

# Install libraries and headers
RUN apt-get -y update && apt-get install -y \
    libboost-dev \
    libcairo2-dev \
    libcgal-dev \
    libcunit1-dev \
    libcurl4-openssl-dev \
    libdbd-xbase-perl \
    libffi-dev \
    libfribidi-dev \
    libgdal-dev \
    libgeos++-dev \
    libgfortran5 \
    libglade2-dev \
    libglu1-mesa-dev \
    libgmp3-dev \
    libgstreamer-plugins-base1.0-dev \
    libgstreamer1.0-dev \
    libgtk2.0-dev \
    libharfbuzz-dev \
    libmagick++-dev \
    libnetcdf-dev \
    libopenmpi-dev \
    libpq-dev \
    libproj-dev \
    libpython3-dev \
    libspatialindex-dev \
    libssl-dev \
    libudunits2-dev \
    libxcursor-dev \
    libxinerama-dev \
    libxml2-dev \
    libxrandr-dev \
    libxt-dev

# Install Java: configure SDKMAN! directory
ARG SDKMAN_DIR=/usr/local/lib/sdkman

# Install Java: install SDKMAN!
RUN curl -s https://get.sdkman.io | bash

# Install Java: set SDKMAN! to non-interactive
RUN sed -ie 's/sdkman_auto_answer=false/sdkman_auto_answer=true/' ${SDKMAN_DIR}/etc/config

# Install Java: use SDKMAN! to install Adoption Java 11
RUN bash -c 'source ${SDKMAN_DIR}/bin/sdkman-init.sh && sdk install java ${JAVA_VERSION}'

# Configure R Java home
RUN bash -c 'source ${SDKMAN_DIR}/bin/sdkman-init.sh && R CMD javareconf'
