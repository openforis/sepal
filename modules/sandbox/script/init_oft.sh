#!/bin/bash
set -e

echo
echo "************************************************"
echo "*** Installing Open Foris Geospatial Toolkit ***"
echo "************************************************"

# TODO: Add dans-gdal-scripts - this package currently won't install due to broken dependencies
apt-get update

# The PPA can return 503 while Launchpad's original file is still available.
for package in geotiff-bin python3-saga; do
    if ! apt-get --download-only install -y "$package"; then
        read -r archive_file archive_sha256 < <(
            apt-cache show --no-all-versions "$package" |
                awk '/^Filename: / {file = $2} /^SHA256: / {print file, $2; exit}'
        )
        [[ -n "$archive_file" && "$archive_sha256" =~ ^[[:xdigit:]]{64}$ ]]
        archive_file=${archive_file##*/}
        /usr/lib/apt/apt-helper download-file \
            "https://launchpad.net/~ubuntugis/+archive/ubuntu/ubuntugis-unstable/+files/${archive_file}" \
            "/var/cache/apt/archives/${archive_file}" \
            "SHA256:${archive_sha256}"
    fi
done

apt-get install -y \
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

uv pip install --system h5py scipy
wget -nv https://foris.fao.org/static/geospatialtoolkit/releases/OpenForisToolkit.run
chmod u+x OpenForisToolkit.run
ln -sf /usr/bin/python3 /usr/bin/python
yes 1 | ./OpenForisToolkit.run
rm OpenForisToolkit.run

rm -f /usr/local/bin/gdal_merge.py /usr/local/bin/gdal_rasterize /usr/local/bin/gdalsrsinfo

git clone https://github.com/openforis/geospatial-toolkit.git
cp -rf geospatial-toolkit/* /usr/local/bin/
rm -rf geospatial-toolkit
