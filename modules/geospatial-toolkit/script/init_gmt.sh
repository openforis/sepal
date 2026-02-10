#!/bin/bash
set -e

echo
echo "*************************"
echo "*** Installing GMTSAR ***"
echo "*************************"

apt-get install -y csh subversion autoconf libtiff5-dev libhdf5-dev wget
apt-get install -y liblapack-dev
apt-get install -y gfortran
apt-get install -y g++
apt-get install -y libgmt-dev
apt-get install -y gmt-dcw gmt-gshhg
apt-get install -y gmt

cd /tmp
wget -nv http://topex.ucsd.edu/gmtsar/tar/ORBITS.tar
cd /usr/local
mkdir orbits
cd orbits
tar -xf /tmp/ORBITS.tar


cd /usr/local
git clone --branch 6.6 https://github.com/gmtsar/gmtsar GMTSAR
cd GMTSAR
autoconf
autoupdate
./configure --with-orbits-dir=/tmp CFLAGS='-z muldefs' LDFLAGS='-z muldefs'
make
make install
