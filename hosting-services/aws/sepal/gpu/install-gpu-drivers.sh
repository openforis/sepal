#!/bin/bash
yum install -y gcc kernel-devel-$(uname -r)
aws s3 cp s3://ec2-linux-nvidia-drivers/g4/grid-10.2/NVIDIA-Linux-x86_64-440.87-grid-aws.run .
#aws s3 cp --recursive s3://ec2-linux-nvidia-drivers/latest/ .
chmod +x NVIDIA-Linux-x86_64*.run
/bin/sh ./NVIDIA-Linux-x86_64*.run -s
chmod +x /usr/local/bin/init-gpu-drivers.sh
systemctl enable init-gpu-drivers.service
