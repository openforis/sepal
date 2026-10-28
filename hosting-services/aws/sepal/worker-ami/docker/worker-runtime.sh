#!/bin/bash

if lspci | grep -q "NVIDIA"; then
    nvidia-container-runtime "$@"
else
    runc "$@"
fi
