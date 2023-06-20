#!/usr/bin/env bash
set -e

echo "{{ docker_password }}" | docker login localhost -u "{{ docker_username }}" --password-stdin
docker push localhost/openforis/monitoring:{{ version }}
docker push localhost/openforis/sys-monitor:{{ version }}
docker push localhost/openforis/email:{{ version }}
docker push localhost/openforis/backup:{{ version }}
docker push localhost/openforis/rabbitmq:{{ version }}
docker push localhost/openforis/ldap:{{ version }}
docker push localhost/openforis/ldap-backup:{{ version }}
docker push localhost/openforis/user:{{ version }}
docker push localhost/openforis/user-storage:{{ version }}
docker push localhost/openforis/user-storage-backup:{{ version }}
docker push localhost/openforis/app-manager:{{ version }}
docker push localhost/openforis/sepal:{{ version }}
docker push localhost/openforis/user-files:{{ version }}
docker push localhost/openforis/gui:{{ version }}
docker push localhost/openforis/ceo-gateway:{{ version }}
docker push localhost/openforis/mysql:{{ version }}
docker push localhost/openforis/mysql-backup:{{ version }}
docker push localhost/openforis/gee:{{ version }}
docker push localhost/openforis/gateway:{{ version }}
docker push localhost/openforis/ssh-gateway:{{ version }}
docker push localhost/openforis/sandbox:{{ version }}
docker push localhost/openforis/task:{{ version }}
docker push localhost/openforis/terminal:{{ version }}
docker push localhost/openforis/letsencrypt:{{ version }}
docker push localhost/openforis/haproxy:{{ version }}
docker logout localhost
