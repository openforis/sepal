#!/usr/bin/env bash

docker login localhost -u "{{ docker_username }}" -p "{{ docker_password }}"
docker push localhost/openforis/rsyslog:{{ version }}
docker push localhost/openforis/ldap:{{ version }}
docker push localhost/openforis/ldap-backup:{{ version }}
docker push localhost/openforis/user:{{ version }}
docker push localhost/openforis/sepal:{{ version }}
docker push localhost/openforis/mysql:{{ version }}
docker push localhost/openforis/mysql-backup:{{ version }}
docker push localhost/openforis/google-earth-engine:{{ version }}
docker push localhost/openforis/api-gateway:{{ version }}
docker push localhost/openforis/ssh-gateway:{{ version }}
docker push localhost/openforis/sandbox:{{ version }}
docker push localhost/openforis/task-executor:{{ version }}
docker push localhost/openforis/gateone:{{ version }}
docker push localhost/openforis/haproxy:{{ version }}
docker logout localhost
