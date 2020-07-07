#!/bin/bash
set -e

echo
echo "*****************************"
echo "*** Installing OpenSARKit ***"
echo "*****************************"
OSK_HOME=/usr/local/lib/osk
mkdir -p ${OSK_HOME}
OPENSARKIT=${OSK_HOME}/opensarkit
mkdir -p ${OSK_HOME}
cd ${OSK_HOME}

apt-get install -y \
  libgmp-dev \
  libgsl0-dev \
  libsaga-dev \
  libv8-3.14-dev \
  python3-geopandas \
  python3-geopy \
  python3-progressbar \
  python3-skimage \
  spatialite-gui

# get OpenSARKit from github
export OSK_GIT_URL=https://github.com/openforis/opensarkit
echo -ne " Getting the Open SAR Toolkit ..."
git clone $OSK_GIT_URL

cd ${OSK_HOME}/opensarkit/bins

BINDIR=/usr/local/bin/

for OST_BINS in $(ls -1 -d */); do
  cd $OST_BINS
  for exe in $(ls -1 {ost_*,post_*} 2>/dev/null); do
    exepath=$(readlink -f $exe)
    ln -s $exepath ${BINDIR}/
  done
  cd ../
done

echo " Adding environmental variables to /etc/environment ..."
echo "OPENSARKIT=${OSK_HOME}/opensarkit" | tee -a /etc/environment
echo "OST_DB=${OSK_HOME}/Database/OFST_db.sqlite" | tee -a /etc/environment

echo -ne " Updating SNAP to the latest version ..."
snap --nosplash --nogui --modules --update-all

HOME_USER=$(stat -c '%U' ${HOME}/.bashrc)
chown -R ${HOME_USER}:${HOME_USER} ${HOME}/.snap

mkdir -p ${OSK_HOME}/Database
cd ${OSK_HOME}/Database

#echo -ne " Downloading the OST database ..."
#wget https://www.dropbox.com/s/qvujm3l0ba0frch/OFST_db.sqlite?dl=0
#mv OFST_db.sqlite?dl=0 OFST_db.sqlite
