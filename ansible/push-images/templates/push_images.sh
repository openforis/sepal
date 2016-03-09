#!/usr/bin/env bash

docker login localhost
docker push localhost/openforis/ldap:{{ version }}
docker push localhost/openforis/nginx:{{ version }}
docker push localhost/openforis/sepal-php:{{ version }}
docker push localhost/openforis/sepal:{{ version }}
docker push localhost/openforis/mysql:{{ version }}
docker push localhost/openforis/ssh-gateway:{{ version }}
docker push localhost/openforis/sandbox:{{ version }}
docker push localhost/openforis/gateone:{{ version }}
docker push localhost/openforis/haproxy:{{ version }}
docker logout localhost
