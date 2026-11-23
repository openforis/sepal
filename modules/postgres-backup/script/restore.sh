#!/bin/bash
set -e

until pg_isready -q; do
    echo "Waiting for postgres"
    sleep 1
done

echo "Restoring roles"
# postgres and sepal already exist in a fresh cluster; their other attributes still come from the backup.
# The configured passwords win over the backed-up ones, which may come from another environment. Both run in
# one session, because the backed-up postgres password would reject any later connection.
{
    grep -vxE 'CREATE ROLE (postgres|sepal);' /backup/globals.sql
    cat <<'SQL'
\getenv root_password POSTGRES_ROOT_PASSWORD
\getenv sepal_password POSTGRES_PASSWORD
ALTER ROLE postgres PASSWORD :'root_password';
ALTER ROLE sepal PASSWORD :'sepal_password';
SQL
} | psql -v ON_ERROR_STOP=1 -q -d postgres

for dump in /backup/*.dump; do
    echo "Restoring $dump"
    pg_restore --clean --if-exists --create -d postgres "$dump"
done

echo "Backup restored"
