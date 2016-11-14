#!/usr/bin/env bash
set -e
[[ -z "$SEPAL_HOME" ]] && { echo "Error: SEPAL_HOME must be set." ; exit 1; }
if [ "$#" -ne 1 ]; then
    echo "provision.sh: invalid arguments"
    echo "usage: ./provision.sh [version]"
    exit 1;
fi

CONFIG_HOME=`pwd`
cd $SEPAL_HOME/hosting-services/aws/sepal
./provision.sh "$VERSION""$CONFIG_HOME"
