FROM openforis/java

EXPOSE 22

ENV MODULE_NAME user-files

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

ADD modules/${MODULE_NAME}/binary/sepal-ssh-gateway.jar /opt/sepal/bin/sepal-ssh-gateway.jar

CMD ["/script/init_container.sh"]
