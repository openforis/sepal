#!/bin/bash
set -e

DIR=$(dirname "$0")
SEPAL_ENV_FILE="${1:-$SEPAL_ENV_FILE}"

echo
echo "SEPAL_ENV_FILE=${SEPAL_ENV_FILE}"
echo

function build {
  local MODULE=$1
  echo
  echo "*** Building ${MODULE} ***"
  echo
  cd "${DIR}/modules/${MODULE}"
  docker compose --env-file="$SEPAL_ENV_FILE" build # --progress plain
  cd -
}
function run {
  local MODULE=$1
  echo
  echo "*** Running ${MODULE} ***"
  echo
  cd "${DIR}/modules/${MODULE}"
  docker compose --env-file="$SEPAL_ENV_FILE" up -d
  cd -
}

build ldap
run ldap
build mysql
run mysql
build rabbitmq
run rabbitmq
build java
run java
build ceo-gateway
run ceo-gateway
build ssh-gateway
run ssh-gateway
build user
run user
build sepal-server
run sepal-server
build app-manager
run app-manager
build email
run email
build gee
run gee
build task
build terminal
run terminal
build user-files
run user-files
build user-storage
run user-storage
build gui
run gui
build r-package-manager
run r-package-manager
#build geospatial-toolkit
#build sandbox
build gateway
run gateway
build letsencrypt
run letsencrypt
build haproxy
run haproxy
build ldap-backup
run ldap-backup
build mysql-backup
run mysql-backup
build user-storage-backup
run user-storage-backup
build backup
run backup
build sys-monitor
run sys-monitor

