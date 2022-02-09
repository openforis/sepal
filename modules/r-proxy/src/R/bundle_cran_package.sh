#!/bin/bash

PACKAGE=$1
VERSION=$2
LIB=$3
CRAN_ROOT=$4

PACKAGE_FILENAME="${PACKAGE}_${VERSION}.tar.gz"
SRC_PATH="${CRAN_ROOT}/src/contrib/${PACKAGE_FILENAME}"
DEST_PATH="${CRAN_ROOT}/bin/contrib/${PACKAGE_FILENAME}"
TMP_DEST_PATH="${DEST_PATH}.tmp"

mkdir -p $(dirname ${DEST_PATH})
retVal=$?; [ $retVal -ne 0 ] && exit $retVal
mkdir -p "${LIB}/${PACKAGE}/man"
tar czf ${TMP_DEST_PATH} -C ${LIB} ${PACKAGE} \
    && mv ${TMP_DEST_PATH} ${DEST_PATH} \
    && rm -f ${SRC_PATH}
exit $?
