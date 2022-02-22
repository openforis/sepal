#!/bin/bash

MODULE=$1
SEPAL_SRC=$2
ENV_FILE=$3
OPTIONS=$4

cd ${SEPAL_SRC}/modules/${MODULE}
docker compose --env-file="${ENV_FILE}" exec ${OPTIONS} ${MODULE} bash

exit $?
