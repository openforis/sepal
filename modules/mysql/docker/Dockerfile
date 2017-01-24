FROM mysql:5.7

MAINTAINER OpenForis
EXPOSE 3306

ENV FLYWAY_VERSION 3.2.1
ENV MYSQL_DATABASE sdms
ENV MYSQL_USER sepal
ENV SCHEMA_BASELINE_VERSION 1.1
ENV INSTANCE_HOSTNAME localhost

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config; sync && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]