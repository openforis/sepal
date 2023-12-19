#!/bin/bash
set -e

echo
echo "*************************"
echo "*** Installing DGGRID ***"
echo "*************************"

# https://github.com/sahrk/DGGRID/blob/master/INSTALL.md
cd /usr/local/lib
git clone https://github.com/sahrk/DGGRID.git
cd DGGRID
mkdir build 
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j 4 
ln -s /usr/local/lib/DGGRID/build/src/apps/dggrid/dggrid /usr/local/bin/dggrid
ln -s /usr/local/lib/DGGRID/build/src/apps/appex/appex /usr/local/bin/appex
