#!/bin/sh
set -e

mkdir -p /auth/
htpasswd -Bbn "$DOCKER_REGISTRY_USERNAME" "$DOCKER_REGISTRY_PASSWORD" > /auth/.htpasswd

exec /entrypoint.sh /etc/docker/registry/config.yml
