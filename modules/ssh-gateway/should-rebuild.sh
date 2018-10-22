#!/usr/bin/env bash
cd $1
rebuild=false
if [ -f ./docker/binary/sepal-ssh-gateway.jar ]; then
    found=$(find . \
        -not \( -path ./build -prune \) \
        -newer ./docker/binary/sepal-ssh-gateway.jar \
        -print -quit)
    if [ ! -z "$found" ]; then
        rebuild=true
    fi
else
    rebuild=true
fi
echo ${rebuild}