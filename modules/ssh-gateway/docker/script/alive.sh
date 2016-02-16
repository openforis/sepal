#!/usr/bin/env bash

while true
do
    curl -X POST -s "http://sepal:1025/data/sandbox/$USER/session/$1"
    sleep 10
done
