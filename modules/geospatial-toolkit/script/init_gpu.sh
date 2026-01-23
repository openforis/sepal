#!/bin/bash
set -e

echo
echo "***************************"
echo "*** Installing GPU libs ***"
echo "***************************"

# Tensorflow version compatibility: 
#   https://www.tensorflow.org/install/source#gpu

# To get OpenCL to work
mkdir -p /etc/OpenCL/vendors 
echo "libnvidia-opencl.so.1" > /etc/OpenCL/vendors/nvidia.icd

# Add NVIDIA repo
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
dpkg -i cuda-keyring_1.1-1_all.deb
apt-get update

export CUDA_VERSION=12.8

# tensorflow 2.19 requires CUDA<13 and R torch require CUDA<12.9
# apt-get -y install cuda-toolkit=12.9.1-1
# apt-get -y install cudnn9-cuda-12 cuda-cudart-12.9
apt-get -y install cuda-toolkit=12.8.1-1
apt-get -y install cudnn9-cuda-12 cuda-cudart-12.8


# tensorflow 2.20.0 crashes, pinning an older version
uv pip install --system 'tensorflow<2.20.0' \
    tensorflow-probability \
    tf-keras \
    'numpy<2' 

uv pip install --system \
    --index-url https://download.pytorch.org/whl/cu128 \
    --index-strategy unsafe-best-match \
    torch==2.9.1 \
    torchvision==0.24.1

uv pip install --system \
    pyopencl \
    gpustat \
    nvitop
    
# Verify that libraries find the GPU
# python3 -c "import pyopencl as cl; print(cl.get_platforms())"
# python3 -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
# python3 -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.device_count());"

