#!/bin/bash

MODULE=$1
SEPAL_SRC=$2
ENV_FILE=$3
OPTIONS=$4

cd ${SEPAL_SRC}/modules/${MODULE}
BUILD_NUMBER="latest" \
GIT_COMMIT="$(git rev-parse HEAD)" \
docker compose --env-file="${ENV_FILE}" build ${OPTIONS}

exit $?
