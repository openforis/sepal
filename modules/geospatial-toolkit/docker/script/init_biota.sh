#!/bin/bash
set -e

echo
echo "**********************************************"
echo "*** Installing biota, sen2mosaic, deforest ***"
echo "**********************************************"
# VERSION 2021-05-13

cd /usr/local/lib
git clone https://bitbucket.org/sambowers/biota.git
cd biota
python3 setup.py install

cd /usr/local/lib
git clone https://bitbucket.org/sambowers/sen2mosaic
cd sen2mosaic
python3 setup.py install

cd /usr/local/lib
git clone https://bitbucket.org/sambowers/deforest.git
cd deforest
python3 setup.py install
