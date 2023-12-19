#!/bin/bash

PACKAGE=$1
SRC_PATH=$2
BIN_PATH=$3
TMP_PATH=$4
LIB=$5
STEP=$6

bundle() {
    mkdir -p $(dirname ${TMP_PATH})
    retVal=$?; [ $retVal -ne 0 ] && exit $retVal
    mkdir -p "${LIB}/${PACKAGE}/man"
    tar czf ${TMP_PATH} -C ${LIB} ${PACKAGE}
    exit $?
}

deploy() {
    mkdir -p $(dirname ${BIN_PATH})
    mv ${TMP_PATH} ${BIN_PATH}
    exit $?
}

cleanup() {
    if [ -d "00LOCK-${LIB}/${PACKAGE}" ]; then
        rm -rf \
            00LOCK-${LIB}/${PACKAGE} \
            ${LIB}/${PACKAGE}
    fi
    rm -f \
        ${SRC_PATH} \
        ${TMP_PATH}
    exit $?
}

case $STEP in
    bundle)
        bundle
        ;;
    deploy)
        deploy
        ;;
    cleanup)
        cleanup
        ;;
esac
