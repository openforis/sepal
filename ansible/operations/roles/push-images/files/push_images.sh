#!/usr/bin/env bash

VERSION=${1:-"latest"}


echo "Using version $VERSION"

docker login localhost
docker push localhost/openforis/nginx:${VERSION}
docker push localhost/openforis/sepal-php:${VERSION}
docker push localhost/openforis/sepal:${VERSION}
docker push localhost/openforis/mysql:${VERSION}
docker push localhost/openforis/ssh-gateway:${VERSION}
docker push localhost/openforis/sandbox:${VERSION}
docker push localhost/openforis/gateone:${VERSION}
docker push localhost/openforis/geoserver:${VERSION}
docker push localhost/openforis/haproxy:${VERSION}
docker logout localhost
