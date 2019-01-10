#!/bin/bash
set -e

echo
echo "********************************"
echo "*** Installing Orfeo ToolBox ***"
echo "********************************"

otb=OTB-6.6.1-Linux64
wget -nv https://www.orfeo-toolbox.org/packages/$otb.run
chmod +x $otb.run
mv $otb.run /usr/local/lib
cd /usr/local/lib
./$otb.run
rm $otb.run
ln -s $otb orfeo
chmod o+rx orfeo/*.sh
chmod o+rx orfeo/otbenv.profile
cd -
