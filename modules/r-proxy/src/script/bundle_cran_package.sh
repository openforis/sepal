#!/bin/bash

PACKAGE=$1
VERSION=$2
LIB=$3
CRAN_ROOT=$4
STEP=$5

PACKAGE_FILENAME="${PACKAGE}_${VERSION}.tar.gz"
SRC_PATH="${CRAN_ROOT}/src/contrib/${PACKAGE_FILENAME}"
DEST_PATH="${CRAN_ROOT}/bin/contrib/${PACKAGE_FILENAME}"
TMP_DEST_PATH="${CRAN_ROOT}/bin/contrib-unverified/${PACKAGE_FILENAME}"

build() {
    mkdir -p $(dirname ${TMP_DEST_PATH})
    retVal=$?; [ $retVal -ne 0 ] && exit $retVal
    mkdir -p "${LIB}/${PACKAGE}/man"
    tar czf ${TMP_DEST_PATH} -C ${LIB} ${PACKAGE}
    exit $?
}

deploy() {
    mkdir -p $(dirname ${DEST_PATH})
    mv ${TMP_DEST_PATH} ${DEST_PATH}
    exit $?
}

cleanup() {
    rm -f ${SRC_PATH} ${TMP_DEST_PATH}
    exit $?
}

case $STEP in
    build)
        build
        ;;
    deploy)
        deploy
        ;;
    cleanup)
        cleanup
        ;;
esac
