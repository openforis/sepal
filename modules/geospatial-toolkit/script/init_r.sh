#!/bin/bash
set -e
echo
echo "********************"
echo "*** Installing R ***"
echo "********************"

#echo "options(Ncpus = `nproc`)" > /root/.Rprofile

apt-get update -y && apt-get install -y\
 r-base\
 r-base-dev

# libudunits2-dev required for udunits, needed by mapview
apt-get install -y \
    libudunits2-dev \
    r-cran-rmpi \
    libopenmpi-dev \
    libgeos++-dev \
    libmagick++-dev \
    libv8-dev \
    libcgal-dev \
    libglu1-mesa-dev \
    libnetcdf-dev \
    libpq-dev \
    libharfbuzz-dev
