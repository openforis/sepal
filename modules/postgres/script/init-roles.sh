#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 -v sepal_password="$SEPAL_PASSWORD" -U "$POSTGRES_USER" -d postgres <<'SQL'
CREATE ROLE sepal CREATEDB LOGIN PASSWORD :'sepal_password';
ALTER ROLE sepal SET timezone = 'UTC';
SQL

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d template1 <<'SQL'
CREATE EXTENSION mysql_fdw;
GRANT USAGE ON FOREIGN DATA WRAPPER mysql_fdw TO sepal;
SQL
