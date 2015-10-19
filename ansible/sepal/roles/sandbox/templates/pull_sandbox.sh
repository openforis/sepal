#!/usr/bin/env bash

docker login {{ docker_repository_host }}
docker pull {{ docker_repository_host }}/openforis/sandbox
docker logout {{ docker_repository_host }}