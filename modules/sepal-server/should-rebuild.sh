#!/usr/bin/env bash
cd ../../../modules/sepal-server
rebuild=false
if [ -f ./docker/binary/sepal.jar ]; then
    found=$(find . \
        -not \( -path ./target -prune \) \
        -not \( -path ./frontend/dist -prune \) \
        -newer ./docker/binary/sepal.jar \
        -print -quit)
    if [ ! -z "$found" ]; then
        rebuild=true
    fi
else
    rebuild=true
fi
echo ${rebuild}