#!/usr/bin/env bash
set -e

VERSION=$1

function build {
  local MODULE=$1
  docker-compose \
    --file ${WORKSPACE}/modules/${MODULE}/docker-compose.yml \
    build \
    --build-arg BUILD_NUMBER=${VERSION} \
    --build-arg GIT_COMMIT=${GIT_COMMIT} \
    | tee /var/log/sepal-build/${MODULE}.log
}

function push {
  local MODULE=$1
  docker push localhost/openforis/${MODULE}:${VERSION}
}

build email
build sys-monitor
build letsencrypt
build java
build rabbitmq
build ldap-backup
build ldap
build haproxy
build backup
build mysql-backup
build mysql
build gateway
build terminal
build ssh-gateway
build geospatial-toolkit
build sandbox
build task
build gee
build user
build user-storage
build user-storage-backup
build user-files
build gui
build ceo-gateway
build app-manager
build sepal-server

echo "${DOCKER_REGISTRY_PASSWORD}" | docker login localhost -u "${DOCKER_REGISTRY_USERNAME}" --password-stdin

docker logout localhost
