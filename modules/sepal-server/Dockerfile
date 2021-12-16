FROM openforis/java

EXPOSE 1025

ENV MODULE_NAME sepal-server

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config

ADD modules/${MODULE_NAME}/binary/sepal.jar /opt/sepal/bin/sepal.jar

CMD ["/script/init_container.sh"]
