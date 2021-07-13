#!/bin/bash
set -e

echo
echo "**********************"
echo "*** Installing GWB ***"
echo "**********************"
INSTALLER=gwb_1.8.3-1_amd64.deb
wget https://ies-ows.jrc.ec.europa.eu/gtb/GWB/$INSTALLER
apt-get install -y ./$INSTALLER
