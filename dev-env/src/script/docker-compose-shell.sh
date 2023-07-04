#!/bin/bash

MODULE=$1
SERVICE=$2
SEPAL_SRC=$3
ENV_FILE=$4
OPTIONS=$5

cd ${SEPAL_SRC}/modules/${MODULE}
docker compose --env-file="${ENV_FILE}" exec ${OPTIONS} ${SERVICE} bash

exit $?
