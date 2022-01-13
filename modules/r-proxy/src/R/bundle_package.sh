#!/bin/bash

PACKAGE=$1
VERSION=$2
LIB=$3
CRANROOT=$4

SRC=${CRANROOT}/src/contrib/
BIN=${CRANROOT}/bin/contrib/
PACKAGE_FILENAME="${PACKAGE}_${VERSION}.tar.gz"
TMP_PACKAGE_FILENAME="${PACKAGE_FILENAME}.tmp"

if [[ ! -f "${PACKAGE_PATH}" ]]; then
    mkdir -p ${BIN}
    retVal = $?; [ $retVal -ne 0 ] && exit $retVal
    rm -f ${BIN}/${TMP_PACKAGE_FILENAME}
    tar czf ${BIN}/${TMP_PACKAGE_FILENAME} -C ${LIB} ${PACKAGE} \
        && mv ${BIN}/${TMP_PACKAGE_FILENAME} ${BIN}/${PACKAGE_FILENAME} \
        && rm -f ${SRC}/${PACKAGE_FILENAME}
    exit $?
fi
