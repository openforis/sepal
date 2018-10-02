#!/usr/bin/env bash
set -e

apt-get -y update && apt-get install -y software-properties-common
apt-add-repository ppa:ubuntugis/ubuntugis-unstable -y
apt-get -y update && DEBIAN_FRONTEND=noninteractive apt-get install -y\
 python-pip\
 libssl-dev\
 libffi-dev\
 gettext\
 git\
 supervisor\
 gdal-bin\
 libgdal-dev\
 python-gdal

curl -sL https://deb.nodesource.com/setup_8.x | bash -
apt-get install -y nodejs
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
apt-get update && apt-get -y install yarn
