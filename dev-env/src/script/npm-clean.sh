#!/bin/bash

MODULE_PATH=$1

cd ${MODULE_PATH}
rm -rf package-lock.json node_modules/

exit $?
