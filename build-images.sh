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
  time docker compose -f "${DIR}/modules/${MODULE}/docker-compose.yml" --env-file="$SEPAL_ENV_FILE" build # --progress plain
}

build ldap
build mysql
build java
build user
build gateway
build letsencrypt
build haproxy

