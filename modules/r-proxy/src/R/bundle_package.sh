#!/bin/bash

PACKAGE=$1
VERSION=$2
LIB=$3
CRANROOT=$4

FILENAME="${PACKAGE}_${VERSION}.tar.gz"

if [[ ! -f "${CRANROOT}/bin/contrib/${FILENAME}" ]]; then
    mkdir -p ${CRANROOT}/bin/contrib/
    tar czf ${CRANROOT}/bin/contrib/${FILENAME} -C ${LIB} ${PACKAGE}
    exit $?
fi
