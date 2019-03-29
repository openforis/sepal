#!/usr/bin/env bash
set -e

echo "{{ docker_password }}" | docker login localhost -u "{{ docker_username }}" --password-stdin
docker push localhost/openforis/backup:{{ version }}
docker push localhost/openforis/zookeeper:{{ version }}
docker push localhost/openforis/kafka:{{ version }}
docker push localhost/openforis/ldap:{{ version }}
docker push localhost/openforis/ldap-backup:{{ version }}
docker push localhost/openforis/user:{{ version }}
docker push localhost/openforis/sepal:{{ version }}
docker push localhost/openforis/gui:{{ version }}
docker push localhost/openforis/ceo:{{ version }}
docker push localhost/openforis/ceo-gateway:{{ version }}
docker push localhost/openforis/peatlands:{{ version }}
docker push localhost/openforis/mysql:{{ version }}
docker push localhost/openforis/mysql-backup:{{ version }}
docker push localhost/openforis/google-earth-engine:{{ version }}
docker push localhost/openforis/api-gateway:{{ version }}
docker push localhost/openforis/ssh-gateway:{{ version }}
docker push localhost/openforis/sandbox:{{ version }}
docker push localhost/openforis/task-executor:{{ version }}
docker push localhost/openforis/terminal:{{ version }}
docker push localhost/openforis/letsencrypt:{{ version }}
docker push localhost/openforis/haproxy:{{ version }}
docker logout localhost
