#!/bin/bash
set -e

echo
echo "*****************************"
echo "*** Installing OpenSARKit ***"
echo "*****************************"
wget https://raw.githubusercontent.com/openforis/opensarkit/master/bins/Install_OST/installer_ubuntu1604.sh
yes yes | bash installer_ubuntu1604.sh
rm installer_ubuntu1604.sh
