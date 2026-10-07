#!/bin/bash
set -e

echo
echo "************************************************"
echo "*** Installing Open Foris Geospatial Toolkit ***"
echo "************************************************"

# TODO: Add dans-gdal-scripts - this package currently won't install due to broken dependencies
apt-get update && apt-get install -y \
	 gcc \
	 g++ \
	 geotiff-bin \
	 libfftw3-dev \
	 libgeotiff-dev \
	 libgsl-dev \
	 libproj-dev \
	 libshp-dev \
	 libtiff5-dev \
	 make \
	 python3-saga \
	 python3-tk \
	 perl \
	 spatialite-bin

pip3 install h5py scipy
wget -nv https://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run
ln -sf /usr/bin/python3 /usr/bin/python
yes 1 | ./OpenForisToolkit.run
rm OpenForisToolkit.run

rm -f /usr/local/bin/gdal_merge.py /usr/local/bin/gdal_rasterize /usr/local/bin/gdalsrsinfo

git clone https://github.com/openforis/geospatial-toolkit.git
cp -rf geospatial-toolkit/* /usr/local/bin/
rm -rf geospatial-toolkit
