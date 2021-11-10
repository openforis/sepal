#!/bin/bash
yum install -y gcc kernel-devel-$(uname -r)
#aws s3 cp --recursive s3://ec2-linux-nvidia-drivers/latest/ .
wget https://uk.download.nvidia.com/tesla/470.82.01/NVIDIA-Linux-x86_64-470.82.01.run
chmod +x NVIDIA-Linux-x86_64*.run
/bin/sh ./NVIDIA-Linux-x86_64*.run -s
chmod +x /usr/local/bin/init-gpu-drivers.sh
systemctl enable init-gpu-drivers.service
