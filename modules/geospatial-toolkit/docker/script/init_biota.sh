#!/bin/bash
set -e

echo
echo "************************"
echo "*** Installing Biota ***"
echo "************************"

cd /usr/local/lib
git clone https://bitbucket.org/sambowers/biota.git
cd biota
python3 setup.py install
