#!/usr/bin/env bash

docker login localhost
docker push localhost/openforis/nginx
docker push localhost/openforis/sepal-php
docker push localhost/openforis/sepal
docker push localhost/openforis/mysql
docker push localhost/openforis/ssh-gateway
docker push localhost/openforis/sandbox
docker push localhost/openforis/gateone
docker push localhost/openforis/geoserver
docker push localhost/openforis/haproxy
docker logout localhost
