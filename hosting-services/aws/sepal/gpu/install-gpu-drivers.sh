#!/bin/bash
set -e

yum install -y gcc kernel-devel-$(uname -r)

# *** Ensure same NVIDIA driver version is used both here and in init_gpu.sh ***

# https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-nvidia-driver.html#nvidia-GRID-driver
#   In "Public NVIDIA drivers section", see which driver to use based on instance type. Currently we use G4dn.
#
# https://www.nvidia.com/Download/Find.aspx
#   Locate the driver link based on the above. Currently:
#       Product Type: Data Center / Tesla
#       Product Series: T-Series
#       Product: Tesla T4
# wget https://us.download.nvidia.com/tesla/525.105.17/NVIDIA-Linux-x86_64-525.105.17.run
wget https://us.download.nvidia.com/tesla/525.125.06/NVIDIA-Linux-x86_64-525.125.06.run
chmod +x NVIDIA-Linux-x86_64*.run
CC=/usr/bin/gcc10-cc /bin/sh ./NVIDIA-Linux-x86_64*.run -s
chmod +x /usr/local/bin/init-gpu-drivers.sh
systemctl enable init-gpu-drivers.service

# Enable persistence mode
nvidia-smi -pm 1
