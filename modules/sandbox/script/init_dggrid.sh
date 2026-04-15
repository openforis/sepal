#!/bin/bash
set -e

echo
echo "*************************"
echo "*** Installing DGGRID ***"
echo "*************************"

REPOSITORY=https://github.com/sahrk/DGGRID.git

# https://github.com/sahrk/DGGRID/blob/master/INSTALL.md
cd /usr/local/lib
# git clone --branch v8.44 https://github.com/sahrk/DGGRID.git
# Use the latest release tag instead of master
git clone --branch $(git ls-remote --tags --sort=-v:refname $REPOSITORY | head -n 1 | sed 's/.*refs\/tags\///; s/\^{}//') --depth 1 $REPOSITORY
cd DGGRID
mkdir build 
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j 4 
ln -s /usr/local/lib/DGGRID/build/src/apps/dggrid/dggrid /usr/local/bin/dggrid
ln -s /usr/local/lib/DGGRID/build/src/apps/appex/appex /usr/local/bin/appex
