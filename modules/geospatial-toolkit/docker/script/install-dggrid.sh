#!/bin/bash
set -e
mkdir -p ~/lib ~/bin
cd ~/lib
wget -nv http://webpages.sou.edu/~sahrk/dgg/dggrid.v62/dggrid.v62.tar.gz
dggrid=dggrid.v62
tar xvzf ${dggrid}.tar.gz --warning=no-unknown-keyword
rm -f ${dggrid}.tar.gz
cd ${dggrid}/src

sed "s:SHPLIB_HDR_DIR =.*:SHPLIB_HDR_DIR = /usr/include:g" -i ./MakeIncludes
sed "s:ADD_LD_LIBS =.*:ADD_LD_LIBS = /usr/lib/x86_64-linux-gnu/libshp.a:g" -i ./MakeIncludes
make
ln -sf ~/lib/${dggrid}/src/apps/dggrid/dggrid ~/bin
