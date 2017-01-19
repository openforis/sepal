#!/usr/bin/env bash

name=$1

if [ $(docker ps --format "{{ .Names }}" | grep "^$name$" | wc -l) -eq 1 ]; then
    docker inspect --format='{{ .State.StartedAt }}' $name
fi