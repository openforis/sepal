#!/bin/bash

PACKAGE=$1
PACKAGE_PATH=$2
LIB=$3
GITHUB_ROOT=$4

SRC_PATH="${GITHUB_ROOT}/src/${PACKAGE_PATH}"
DEST_PATH="${GITHUB_ROOT}/bin/${PACKAGE_PATH}"
TMP_DEST_PATH="${DEST_PATH_PATH}.tmp"

mkdir -p $(dirname ${DEST_PATH})
retVal=$?; [ $retVal -ne 0 ] && exit $retVal
mkdir -p "${LIB}/${PACKAGE}/man" 
tar czf ${TMP_DEST_PATH} -C ${LIB} ${PACKAGE} \
    && mv ${TMP_DEST_PATH} ${DEST_PATH} \
    && rm -f ${SRC_PATH}
exit $?
