#!/bin/bash
set -e

echo
echo "**********************************************"
echo "*** Installing biota, sen2mosaic, deforest ***"
echo "**********************************************"

cd /usr/local/lib
git clone https://github.com/smfm-project/biota.git
cd biota
python3 setup.py install

cd /usr/local/lib
git clone https://github.com/smfm-project/sen2mosaic.git
cd sen2mosaic
python3 setup.py install

cd /usr/local/lib
git clone https://github.com/smfm-project/deforest.git
cd deforest
python3 setup.py install
