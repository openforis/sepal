#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
echo
echo "************************************"
echo "*** Installing misc python tools ***"
echo "************************************"
export GDAL_VERSION=`pip3 show GDAL|grep 'Version: ' | cut -c10-`

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

template /config/requirements.txt /tmp/requirements.txt

pip3 install -r /tmp/requirements.txt -U
pip3 install --upgrade pip
