#!/bin/bash
set -e
echo "Initializing backup image"

apt-get update
apt-get install -y --no-install-recommends awscli ca-certificates cron curl

# pg_dump must be at least the server's major version: keep it in step with the postgres module's image
install -d /usr/share/postgresql-common/pgdg
curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y --no-install-recommends postgresql-client-18

rm -rf /var/lib/apt/lists/*
