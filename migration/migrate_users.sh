#!/usr/bin/env bash

BACKUP_LOCATION=$1
USER_FILES_LOCATION=$2
DOCKER_REPO_HOST=$3
ADMIN_PWD=$4
WEB_ADMIN_PWD=$5

docker stop ssh-gateway
sudo cp ${BACKUP_LOCATION}/etc/passwd ${USER_FILES_LOCATION}
sudo cp ${BACKUP_LOCATION}/etc/group ${USER_FILES_LOCATION}
sudo cp ${BACKUP_LOCATION}/etc/shadow ${USER_FILES_LOCATION}
sudo cp ${BACKUP_LOCATION}/etc/gshadow ${USER_FILES_LOCATION}
docker start ssh-gateway