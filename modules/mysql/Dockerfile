FROM mysql:5.7

EXPOSE 3306

ENV MODULE_NAME mysql
ENV MYSQL_DATABASE sdms
ENV MYSQL_USER sepal
ENV SCHEMA_BASELINE_VERSION 1.1
ENV INSTANCE_HOSTNAME localhost

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
