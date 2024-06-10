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

# Add NVIDIA repo
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring_1.1-1_all.deb
apt-get update

apt-get -y install cuda-toolkit
apt-get -y install cudnn-cuda-12

# Doesn't seem to be needed
# pip3 install --extra-index-url https://pypi.nvidia.com tensorrt-libs
# pip3 install tensorrt

export CUDNN_PATH=$(dirname $(python -c "import nvidia.cudnn;print(nvidia.cudnn.__file__)"))
export LD_LIBRARY_PATH=$CONDA_PREFIX/lib/:$CUDNN_PATH/lib:$LD_LIBRARY_PATH

# https://github.com/tensorflow/tensorflow/issues/61468
# Find out the expected tensorrt version
# python3 -c "import tensorflow.compiler as tf_cc; print(tf_cc.tf2tensorrt._pywrap_py_utils.get_linked_tensorrt_version())"

wget https://developer.nvidia.com/downloads/compute/machine-learning/tensorrt/secure/8.6.1/tars/TensorRT-8.6.1.6.Linux.x86_64-gnu.cuda-12.0.tar.gz
tar -xvzf TensorRT-8.6.1.6.Linux.x86_64-gnu.cuda-12.0.tar.gz --one-top-level=/usr/local/lib/tensorrt

pip3 install \
    pyopencl \
    tensorflow \
    tf-keras \
    torch \
    torchvision \
    gpustat \
    nvitop
    
# Verify that libraries find the GPU
# python3 -c "import pyopencl as cl; print(cl.get_platforms())"
# python3 -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
# python3 -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.device_count());"
