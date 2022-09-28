#!/bin/bash
set -e

yum install -y gcc kernel-devel-$(uname -r)
#aws s3 cp --recursive s3://ec2-linux-nvidia-drivers/latest/ .

# Ensure same nvidia driver version is used both in init_gpu.sh and in init-gpu-drivers.sh
#
# Version for different instance types:
#   https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-nvidia-driver.html#nvidia-GRID-driver
# Find download URL:
#   https://www.nvidia.com/Download/Find.aspx
wget https://uk.download.nvidia.com/tesla/470.82.01/NVIDIA-Linux-x86_64-470.82.01.run
chmod +x NVIDIA-Linux-x86_64*.run
/bin/sh ./NVIDIA-Linux-x86_64*.run -s
chmod +x /usr/local/bin/init-gpu-drivers.sh
systemctl enable init-gpu-drivers.service

# Enable persistence mode
nvidia-smi -pm 1
