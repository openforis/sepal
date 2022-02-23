FROM openforis/java

EXPOSE 80
EXPOSE 5006

ENV MODULE_NAME user
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV USER_GROUP "sepalUsers"

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

ADD common /usr/local/src/sepal/common
ADD common-test /usr/local/src/sepal/common-test
ADD modules/${MODULE_NAME}/build.gradle ${MODULE}/build.gradle
ADD modules/${MODULE_NAME}/src ${MODULE}/src
WORKDIR /usr/local/src/sepal
RUN gradle :sepal-user:classes

CMD ["/script/init_container.sh"]
