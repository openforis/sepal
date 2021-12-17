#!/usr/bin/env bash
cd $1
rebuild=false
if [ -f ./binary/sepal-user.jar ]; then
    found=$(find . \
        -not \( -path ./build -prune \) \
        -newer ./binary/sepal-user.jar \
        -print -quit)
    if [ ! -z "$found" ]; then
        rebuild=true
    else
        found=$(find ../../common/* \
            -not \( -path ../../common/build -prune \) \
            -newer ./binary/sepal-user.jar \
            -print -quit)
        if [ ! -z "$found" ]; then
            rebuild=true
        fi
     fi
else
    rebuild=true
fi
echo ${rebuild}
