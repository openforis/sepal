#!/usr/bin/env bash

VERSION=${1:-"latest"}
SRC_VER=${2:-"latest"}

docker tag localhost/openforis/nginx:${VERSION} localhost/openforis/nginx:${SRC_VER}
docker tag localhost/openforis/sepal-php:${VERSION} localhost/openforis/sepal-php:${SRC_VER}
docker tag localhost/openforis/sepal:${VERSION} localhost/openforis/sepal:${SRC_VER}
docker tag localhost/openforis/mysql:${VERSION} localhost/openforis/mysql:${SRC_VER}
docker tag localhost/openforis/ssh-gateway:${VERSION} localhost/openforis/ssh-gateway:${SRC_VER}
docker tag localhost/openforis/sandbox:${VERSION} localhost/openforis/sandbox:${SRC_VER}
docker tag localhost/openforis/gateone:${VERSION} localhost/openforis/gateone:${SRC_VER}
docker tag localhost/openforis/geoserver:${VERSION} localhost/openforis/geoserver:${SRC_VER}
docker tag localhost/openforis/haproxy:${VERSION} localhost/openforis/haproxy:${SRC_VER}

