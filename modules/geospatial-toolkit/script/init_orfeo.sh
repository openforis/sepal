#!/bin/bash
set -e

echo
echo "********************************"
echo "*** Installing Orfeo ToolBox ***"
echo "********************************"

otb=OTB-7.4.0-Linux64
wget -nv https://www.orfeo-toolbox.org/packages/archives/OTB/$otb.run
chmod +x $otb.run
mv $otb.run /usr/local/lib
cd /usr/local/lib
./$otb.run
rm $otb.run
ln -sf $otb orfeo
chmod o+rx orfeo/*.sh
chmod o+rx orfeo/otbenv.profile
cd -

# Patch OTB to support GDAL > 3.2
find /usr/local/lib/orfeo/bin -type f -name '*' -exec sed -i 's/from osgeo\.utils/from osgeo_utils/g' {} +
