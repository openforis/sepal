#!/bin/sh
set -e

# Caddy's basic_auth directive needs a bcrypt hash, but the deployment env
# carries the registry password in plaintext (it's also fed verbatim to the
# registry's htpasswd in start-registry.sh). Hash it once at startup and
# expose it to the Caddyfile via {$DOCKER_REGISTRY_PASSWORD_HASH}.
#
# Stdin (rather than -p "$pass") keeps the password out of /proc/<pid>/cmdline.
DOCKER_REGISTRY_PASSWORD_HASH=$(printf '%s' "$DOCKER_REGISTRY_PASSWORD" | caddy hash-password)
export DOCKER_REGISTRY_PASSWORD_HASH

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
