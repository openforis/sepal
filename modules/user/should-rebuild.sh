#!/usr/bin/env bash
cd $1
rebuild=false
if [ -f ./docker/binary/sepal-user.jar ]; then
    found=$(find . \
        -not \( -path ./target -prune \) \
        -not \( -path ./frontend/dist -prune \) \
        -newer ./docker/binary/sepal-user.jar \
        -print -quit)
    if [ ! -z "$found" ]; then
        rebuild=true
    else
        found=$(find ../../common/* \
            -not \( -path ../../common/target -prune \) \
            -newer ./docker/binary/sepal-user.jar \
            -print -quit)
        if [ ! -z "$found" ]; then
            rebuild=true
        fi
     fi
else
    rebuild=true
fi
echo ${rebuild}