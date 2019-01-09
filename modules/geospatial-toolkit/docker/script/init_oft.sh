#!/bin/bash
set -e

echo
echo "************************************************"
echo "*** Installing Open Foris Geospatial Toolkit ***"
echo "************************************************"

# TODO: Add dans-gdal-scripts - this package currently won't install due to broken dependencies
apt-get install -y \
	 gcc \
	 g++ \
	 gdal-bin \
	 geotiff-bin \
	 libfftw3-dev \
	 libgdal-dev \
	 libgeotiff-dev \
	 libgsl-dev \
	 libproj-dev \
	 libshp-dev \
	 libtiff5-dev \
	 make \
	 python-gdal \
	 python-h5py \
	 python-saga \
	 python-scipy \
	 python-tk \
	 python-qt4 \
	 perl \
	 spatialite-bin

wget -nv http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run
yes 1 | ./OpenForisToolkit.run
rm OpenForisToolkit.run

rm -f /usr/local/bin/gdal_merge.py /usr/local/bin/gdal_rasterize /usr/local/bin/gdalsrsinfo
