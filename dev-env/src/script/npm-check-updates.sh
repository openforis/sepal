#!/bin/bash

MODULE_PATH=$1
OPTIONS=$2

if [[ -f ${MODULE_PATH}/package.json ]]; then
    cd ${MODULE_PATH}
    ncu ${OPTIONS}
fi

exit $?
