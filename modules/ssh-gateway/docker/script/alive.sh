#!/usr/bin/env bash

while true
do
    curl -X POST -s "http://sepal:1025/data/container/$1/alive"
    sleep 10
done
