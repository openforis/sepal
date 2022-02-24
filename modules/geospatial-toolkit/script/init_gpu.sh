#!/bin/bash
set -e

echo
echo "***************************"
echo "*** Installing GPU libs ***"
echo "***************************"

# Based on https://www.tensorflow.org/install/gpu, but with CUDA 11.4
# Trying with cuda-toolkit instead of cuda, to prevent wrong nvidia-driver to be installed.
# That version must match the version on the host machine.

wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-ubuntu2004.pin
mv cuda-ubuntu2004.pin /etc/apt/preferences.d/cuda-repository-pin-600
apt-key adv --fetch-keys https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/7fa2af80.pub
add-apt-repository "deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/ /"
apt-get update -y

wget http://developer.download.nvidia.com/compute/machine-learning/repos/ubuntu2004/x86_64/nvidia-machine-learning-repo-ubuntu2004_1.0.0-1_amd64.deb
apt install -y ./nvidia-machine-learning-repo-ubuntu2004_1.0.0-1_amd64.deb
rm nvidia-machine-learning-repo-ubuntu2004_1.0.0-1_amd64.deb
apt-get update -y

# Ensure same nvidia driver version is used both in init_gpu.sh and in init-gpu-drivers.sh
#
# Version for different instance types:
#   https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-nvidia-driver.html#nvidia-GRID-driver
# Find download URL:
#   https://www.nvidia.com/Download/Find.aspx
apt-get install -y --no-install-recommends \--no-install-recommends \
  nvidia-driver-470=470.82.01-0ubuntu1 \
  libnvidia-gl-470=470.82.01-0ubuntu1 \
  nvidia-kernel-source-470=470.82.01-0ubuntu1 \
  libnvidia-compute-470=470.82.01-0ubuntu1 \
  libnvidia-extra-470=470.82.01-0ubuntu1 \
  nvidia-compute-utils-470=470.82.01-0ubuntu1 \
  libnvidia-decode-470=470.82.01-0ubuntu1 \
  libnvidia-encode-470=470.82.01-0ubuntu1 \
  nvidia-utils-470=470.82.01-0ubuntu1 \
  xserver-xorg-video-nvidia-470=470.82.01-0ubuntu1 \
  libnvidia-cfg1-470=470.82.01-0ubuntu1 \
  libnvidia-ifr1-470=470.82.01-0ubuntu1 \
  libnvidia-fbc1-470=470.82.01-0ubuntu1 \
  libnvidia-common-470=470.82.01-0ubuntu1 \
  nvidia-dkms-470=470.82.01-0ubuntu1 \
  nvidia-kernel-common-470=470.82.01-0ubuntu1 \
  cuda-toolkit-11-4 \
  libcudnn8=8.2.4.15-1+cuda11.4 \
  libcudnn8-dev=8.2.4.15-1+cuda11.4

echo -n "/usr/lib/x86_64-linux-gnu/libnvidia-opencl.so.1">/etc/OpenCL/vendors/nvidia.icd

ln -sf cuda-11.4/ cuda
ln -sf cuda-11.4/ cuda-11

pip3 install --upgrade pip
pip3 install numpy --upgrade --force-reinstall
pip3 install pyopencl
pip3 install testresources
pip3 install tensorflow==2.7.0
