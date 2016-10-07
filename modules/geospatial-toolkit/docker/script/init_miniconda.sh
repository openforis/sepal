#!/bin/bash

echo
echo "****************************"
echo "*** Installing Miniconda ***"
echo "****************************"
wget --no-check-certificate https://repo.continuum.io/miniconda/Miniconda3-latest-Linux-x86_64.sh
chmod u+x Miniconda3-latest-Linux-x86_64.sh
./Miniconda3-latest-Linux-x86_64.sh -b -p /opt/miniconda3
rm ./Miniconda3-latest-Linux-x86_64.sh
