#!/bin/bash

# Needed for apt-add-repository command
apt-get -y update && apt-get install -y software-properties-common

# Repository for misc GIS utilities
apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y

apt-get -y update && DEBIAN_FRONTEND=noninteractive apt-get install -y\
 curl\
 libgdal-dev\
 gdal-bin\
 git\
 python-gdal\
 python-pip\
 sssd\
 libpam-sss\
 libnss-sss\
 libnss-ldap\
 supervisor\
 gettext
