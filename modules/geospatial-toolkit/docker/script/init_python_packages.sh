#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
echo
echo "************************************"
echo "*** Installing misc python tools ***"
echo "************************************"
pip3 install -r /config/requirements.txt
pip3 install --upgrade pip
