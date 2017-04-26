#!/bin/bash
set -e

echo
echo "********************************"
echo "*** Installing Orfeo ToolBox ***"
echo "********************************"

# install the ubuntigis version for use of ORFEO core modules
apt-get install -y \
    otb-bin \
    libotb \
    libotb-apps 

# install the latest Orfeo packaged version for use of ORFEO remote modules
otb=OTB-contrib-5.10.1-Linux64
wget https://www.orfeo-toolbox.org/packages/$otb.run
chmod +x $otb.run
mv $otb.run /usr/local/lib
cd /usr/local/lib
./$otb.run
rm $otb.run
ln -s $otb orfeo
chmod o+rx orfeo/*.sh
chmod o+rx orfeo/otbenv.profile
cd -
