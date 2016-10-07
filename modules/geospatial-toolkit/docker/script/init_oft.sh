#!/bin/bash

echo
echo "************************************************"
echo "*** Installing Open Foris Geospatial Toolkit ***"
echo "************************************************"
apt-get install -y \
	 gcc \
	 g++ \
	 gdal-bin \
	 libgdal1-dev \
	 libgsl0-dev \
	 libgsl0ldbl \
	 make \
	 python-gdal \
	 python-scipy \
	 python-tk \
	 python-qt4 \
	 perl

wget http://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run
1 | ./OpenForisToolkit.run
rm OpenForisToolkit.run
