#!/bin/bash
set -e

echo
echo "***************************"
echo "*** Installing GPU libs ***"
echo "***************************"

pip3 install --upgrade pip
pip3 uninstall -y numpy
pip3 install numpy


wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
dpkg -i cuda-keyring_1.0-1_all.deb
apt-get -y update
# *** Ensure same nvidia driver version is used both here (in the container) and in install-gpu-drivers.sh (on the host) ***
#   nvidia-driver-525=525.125.06-0ubuntu1 \
apt-get install -y --no-install-recommends \
  nvidia-driver-515=515.105.01-0ubuntu1 \
  cuda-toolkit-11-7

pip3 install pyopencl
pip3 install testresources
pip3 install tensorflow
