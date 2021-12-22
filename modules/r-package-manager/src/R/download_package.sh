#!/bin/bash

PACKAGE=$1
VERSION=$2
CRANROOT=$3

FILENAME="${PACKAGE}_${VERSION}.tar.gz"
URL="https://cran.r-project.org/src/contrib/Archive/${PACKAGE}/${FILENAME}"

curl -so "${CRANROOT}/src/contrib/${FILENAME}" "${URL}"
