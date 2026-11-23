FROM postgres:18.7-trixie

ARG MYSQL_FDW_VERSION=2.9.3-2.pgdg13+2

# Installing the fdw upgrades the server when the fdw needs a newer one, so the build fails unless the
# server is still the image's PG_VERSION.
RUN apt-get update && \
    apt-get install -y --no-install-recommends "postgresql-18-mysql-fdw=${MYSQL_FDW_VERSION}" && \
    rm -rf /var/lib/apt/lists/* && \
    test "$(dpkg-query -W -f='${Version}' postgresql-18)" = "$PG_VERSION"

COPY modules/postgres/script/init-roles.sh /docker-entrypoint-initdb.d/init-roles.sh
