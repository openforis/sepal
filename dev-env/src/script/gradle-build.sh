#!/bin/bash

SEPAL_SRC=$1

cd ${SEPAL_SRC}
gradle -x test build

exit $?
