#!/usr/bin/env bash


while true
do
    curl -s "http://sepal:1025/data/container/$1/alive"
    sleep 10
done
