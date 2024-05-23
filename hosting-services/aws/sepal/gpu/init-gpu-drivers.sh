#!/bin/bash
/sbin/modprobe nvidia-uvm

if [ "$?" -eq 0 ]; then
  # Find out the major device number used by the nvidia-uvm driver
  mknod -m 666 /dev/nvidia-uvm c $(grep nvidia-uvm /proc/devices | awk '{print $1}') 0
fi

# Enable persistence mode
/usr/bin/nvidia-persistenced --verbose
