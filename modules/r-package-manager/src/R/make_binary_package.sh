#!/bin/bash

PACKAGE=$1
VERSION=$2
LIB=$3
CRANROOT=$4

FILENAME="${PACKAGE}_${VERSION}.tar.gz"

# package binary
if [[ -f "${CRANROOT}/bin/contrib/${FILENAME}" ]]; then
    echo "Binary package ${FILENAME} skipped."
else
    tar czf ${CRANROOT}/bin/contrib/${FILENAME} -C ${LIB} ${PACKAGE}
    echo "Binary package ${FILENAME} created."
fi
