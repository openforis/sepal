#!/bin/bash
set -e

echo
echo "*****************************"
echo "*** Installing OpenSARKit ***"
echo "*****************************"
echo "Version: 2016-12-07"
OSK_HOME=/usr/local/lib/osk
mkdir -p ${OSK_HOME}
OPENSARKIT=${OSK_HOME}/opensarkit
mkdir -p ${OSK_HOME}
cd ${OSK_HOME}

echo -ne " Getting the Open Foris SAR Toolkit ..."
git clone https://github.com/openforis/opensarkit

echo "OPENSARKIT=${OSK_HOME}/opensarkit" | tee -a /etc/environment
echo "OST_DB=${OSK_HOME}/Database/OFST_db.sqlite" | tee -a /etc/environment

cd ${OSK_HOME}/opensarkit/bins
BINDIR=/usr/local/bin/
for OST_BINS in `ls -1`;do
    cd $OST_BINS
    for exe in `ls -1 {oft*,poft*}`;do
        exepath=`readlink -f $exe`
        ln -s $exepath ${BINDIR}/
    done
    cd ../
done

cd /

mkdir -p ${OSK_HOME}/Database/
wget https://www.dropbox.com/s/qvujm3l0ba0frch/OFST_db.sqlite?dl=0
mv OFST_db.sqlite?dl=0 ${OSK_HOME}/Database/OFST_db.sqlite
