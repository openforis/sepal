#!/usr/bin/env bash
cd $1
rebuild=false
if [ -f ./docker/binary/task-executor.jar ]; then
    found=$(find . \
        -not \( -path ./target -prune \) \
        -newer ./docker/binary/task-executor.jar \
        -print -quit)
    if [ ! -z "$found" ]; then
        rebuild=true
    fi
else
    rebuild=true
fi
echo ${rebuild}