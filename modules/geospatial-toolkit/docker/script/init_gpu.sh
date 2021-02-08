#!/bin/bash
set -e

apt-get update -y
apt-get install -y nvidia-cuda-toolkit

cd /usr/local/src/
git clone https://github.com/pyopencl/pyopencl
cd pyopencl
python3 configure.py
echo 'CL_PRETEND_VERSION = "1.1"' >> siteconf.py
pip3 install .
