#!/usr/bin/env bash

sg docker -c 'docker login -e "{{ docker_email }}" -p "{{ docker_password }}" -u "{{ docker_username }}" {{ docker_repository_host }}'
sg docker -c 'docker pull {{ docker_repository_host }}/openforis/sandbox:{{ version }}'
sg docker -c 'docker pull {{ docker_repository_host }}/openforis/task-executor:{{ version }}'
sg docker -c 'docker logout {{ docker_repository_host }}'
