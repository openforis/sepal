#!/usr/bin/env bash
set -e

export SEPAL_VERSION=$1
export SEPAL_DATA_DIR=/tmp/sepal-data
export SEPAL_BACKUP_DIR=/tmp/sepal-backup

function build {
  local MODULE=$1
  local MODULE_DIR=${WORKSPACE}/modules/${MODULE}
  echo "******* Building ${MODULE} *******"
  cd ${MODULE_DIR}
  set -o pipefail && docker-compose \
    --file ${MODULE_DIR}/docker-compose.yml \
    build \
    --build-arg BUILD_NUMBER=${SEPAL_VERSION} \
    --build-arg GIT_COMMIT=${GIT_COMMIT} \
    | tee /var/log/sepal-build/${MODULE}.log
}

function push {
  local MODULE=$1
  echo "******* Pushing ${MODULE} *******"
  docker push localhost/openforis/${MODULE}:${SEPAL_VERSION}
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

push sys-monitor
push email
push backup
push rabbitmq
push ldap
push ldap-backup
push user
push user-storage
push user-storage-backup
push app-manager
push sepal
push user-files
push gui
push ceo-gateway
push mysql
push mysql-backup
push gee
push gateway
push ssh-gateway
push sandbox
push task
push terminal
push letsencrypt
push haproxy

docker logout localhost
