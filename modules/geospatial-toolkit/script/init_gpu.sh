#!/bin/bash
set -e

echo
echo "***************************"
echo "*** Installing GPU libs ***"
echo "***************************"

# Tensorflow version compatibility: 
#   https://www.tensorflow.org/install/source#gpu

apt-get update

# To get OpenCL to work
mkdir -p /etc/OpenCL/vendors 
echo "libnvidia-opencl.so.1" > /etc/OpenCL/vendors/nvidia.icd

pip3 install --extra-index-url https://pypi.nvidia.com tensorrt-libs
pip3 install \
    pyopencl \
    tensorflow==2.15.1 \
    torch \
    torchvision \
    testresources

# Add NVIDIA repo
# wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
# dpkg -i cuda-keyring_1.1-1_all.deb
# apt-get update

# apt-get -y install cudnn-cuda-12 # Still not found by tensorflow
# pip3 install tensorrt # Still not found by tensorflow


# Verify that libraries find the GPU
# python3 -c "import pyopencl as cl; print(cl.get_platforms())"
# python3 -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
# python3 -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.device_count());"
