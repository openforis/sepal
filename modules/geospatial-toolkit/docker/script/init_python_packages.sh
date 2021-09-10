#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
echo
echo "************************************"
echo "*** Installing misc python tools ***"
echo "************************************"
# VERSION=2020-10-16
export GDAL_VERSION=`pip3 show GDAL|grep 'Version: ' | cut -c10-`

function template {
    local template=$1
    local destination=$2
    envsubst < $template > $destination
}

template /config/requirements.txt /tmp/requirements.txt

pip3 install --upgrade pip
pip3 install 'setuptools<58' # https://stackoverflow.com/questions/69100275/error-while-downloading-the-requirements-using-pip-install-setup-command-use-2
pip3 install --ignore-installed scikit-learn
pip3 install -r /tmp/requirements.txt
pip3 install git+git://github.com/diku-dk/bfast.git@0.6
