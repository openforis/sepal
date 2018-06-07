#!/usr/bin/env bash
set -e

apt-get -y update && DEBIAN_FRONTEND=noninteractive apt-get install -y\
 python-pip\
 libssl-dev\
 libffi-dev\
 gettext\
 git\
 nodejs\
 npm\
 supervisor\
 gdal-bin\
 libgdal-dev\
 python-gdal

npm install --global yarn
