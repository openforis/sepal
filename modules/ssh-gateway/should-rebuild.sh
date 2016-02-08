#!/usr/bin/env bash
cd ../../../modules/ssh-gateway
rebuild=false
if [ -f ./docker/binary/sepal-ssh-gateway.jar ]; then
    found=$(find . \
        -not \( -path ./target -prune \) \
        -not \( -path ./frontend/dist -prune \) \
        -newer ./docker/binary/sepal-ssh-gateway.jar \
        -print -quit)
    if [ ! -z "$found" ]; then
        rebuild=true
    fi
else
    rebuild=true
fi
echo ${rebuild}