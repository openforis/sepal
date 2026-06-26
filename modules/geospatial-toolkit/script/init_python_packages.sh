#!/bin/bash
set -e
echo
echo "************************************"
echo "*** Installing misc python tools ***"
echo "************************************"
export GDAL_VERSION=$(gdal-config --version)
export NUMPY_VERSION=$(uv pip show numpy|grep 'Version: ' | cut -c10-)

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

template /config/requirements.txt /tmp/requirements.txt

uv pip install --system -r /tmp/requirements.txt
