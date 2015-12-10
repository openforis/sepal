#!/usr/bin/env bash

VERSION=${1:-"latest"}
SRC_VER=${2:-"latest"}

docker tag localhost/openforis/ldap:${SRC_VER} localhost/openforis/nginx:${VERSION}
docker tag localhost/openforis/nginx:${SRC_VER} localhost/openforis/nginx:${VERSION}
docker tag localhost/openforis/sepal-php:${SRC_VER} localhost/openforis/sepal-php:${VERSION}
docker tag localhost/openforis/sepal:${SRC_VER} localhost/openforis/sepal:${VERSION}
docker tag localhost/openforis/mysql:${SRC_VER} localhost/openforis/mysql:${VERSION}
docker tag localhost/openforis/ssh-gateway:${SRC_VER} localhost/openforis/ssh-gateway:${VERSION}
docker tag localhost/openforis/sandbox:${SRC_VER} localhost/openforis/sandbox:${VERSION}
docker tag localhost/openforis/gateone:${SRC_VER} localhost/openforis/gateone:${VERSION}
docker tag localhost/openforis/geoserver:${SRC_VER} localhost/openforis/geoserver:${VERSION}
docker tag localhost/openforis/haproxy:${SRC_VER} localhost/openforis/haproxy:${VERSION}

