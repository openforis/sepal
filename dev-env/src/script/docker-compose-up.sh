#!/bin/bash

MODULE=$1
SEPAL_SRC=$2
ENV_FILE=$3

# (cd "${SEPAL_SRC}/modules/${MODULE}"; pwd; docker compose --env-file="${ENV_FILE}" up --wait --detach --remove-orphans)
(cd "${SEPAL_SRC}/modules/${MODULE}"; docker compose --env-file="${ENV_FILE}" up --detach)

exit $?
