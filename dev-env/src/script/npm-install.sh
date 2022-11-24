#!/bin/bash

MODULE_PATH=$1
OPTIONS=$2

if [[ -f ${MODULE_PATH}/package.json ]]; then
    cd ${MODULE_PATH}
    npm install ${OPTIONS} && npm rebuild ${OPTIONS}
fi

exit $?
