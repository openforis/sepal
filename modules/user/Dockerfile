FROM openforis/java

EXPOSE 80

ENV MODULE_NAME user
ENV USER_GROUP "sepalUsers"

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

ADD modules/${MODULE_NAME}/binary/sepal-user.jar /opt/sepal/bin/sepal-user.jar

CMD ["/script/init_container.sh"]
