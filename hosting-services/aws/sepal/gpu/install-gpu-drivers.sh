#!/bin/bash
set -e

# yum install -y gcc kernel-devel-$(uname -r)

# *** Ensure same NVIDIA driver version is used both here and in init_gpu.sh ***

# https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-nvidia-driver.html#nvidia-GRID-driver
#   In "Public NVIDIA drivers section", see which driver to use based on instance type. Currently we use G4dn.
#
# https://www.nvidia.com/Download/Find.aspx
#   Locate the driver link based on the above. Currently:
#       Product Type: Data Center / Tesla
#       Product Series: T-Series
#       Product: Tesla T4

# NVIDIA drive installation for Amazon Linux:
#   https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html#amazon

dnf install -y kernel-devel-$(uname -r) kernel-headers-$(uname -r) kernel-modules-extra-$(uname -r)
dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/amzn2023/x86_64/cuda-amzn2023.repo
dnf clean expire-cache
dnf module install -y nvidia-driver:latest-dkms
dnf install -y --allowerasing nvidia-gds

# Installing the NVIDIA Container Toolkit
#   https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html#installing-with-yum-or-dnf
curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
    tee /etc/yum.repos.d/nvidia-container-toolkit.repo
dnf install -y nvidia-container-toolkit
systemctl restart docker

# Set NUMA affinity
# lspci | grep -i nvidia # Extract device id 
# echo 0 | tee -a /sys/bus/pci/devices/$DEVICE_ID/numa_node

chmod +x /usr/local/bin/init-gpu-drivers.sh
systemctl enable init-gpu-drivers.service

# Enable persistence mode
#   https://docs.nvidia.com/deploy/driver-persistence/index.html#usage
/usr/bin/nvidia-persistenced --verbose
