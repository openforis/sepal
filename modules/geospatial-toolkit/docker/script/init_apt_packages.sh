#!/bin/bash
set -e
echo
echo "*********************************"
echo "*** Installing misc utilities ***"
echo "*********************************"
apt-get update -y && apt-get install -y --fix-missing \
    aria2 \
    bc \
    dbview \
    enchant \
    flex \
    gettext \
    gdal-bin \
    gsl-bin \
    imagemagick \
    libboost-dev \
    libcairo2-dev \
    libcunit1-dev \
    libdbd-xbase-perl \
    libgfortran5 \
    libglade2-dev \
    libgtk2.0-dev \
    libffi-dev \
    libgdal-dev \
    libgmp3-dev \
    libgstreamer1.0-dev \
    libgstreamer-plugins-base1.0-dev \
    libpython3-dev \
    libproj-dev \
    libspatialindex-dev \
    libxcursor-dev \
    libxinerama-dev \
    libxrandr-dev \
    libxt-dev \
    parallel \
    pkg-config \
    p7zip-full \
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
    saga \
    shapelib \
    swig \
    tcl-dev \
    tree \
    tmux \
    unrar-free \
    xml-twig-tools
