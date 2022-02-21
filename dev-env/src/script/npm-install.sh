#!/bin/bash

MODULE_PATH=$1

if [[ -f ${MODULE_PATH}/package.json ]]; then
    cd ${MODULE_PATH}
    npm install
fi

exit $?
