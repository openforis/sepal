FROM openforis/java

EXPOSE 22

ENV MODULE_NAME ssh-gateway

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

ADD common /usr/local/src/sepal/common
ADD modules/${MODULE_NAME}/build.gradle ${MODULE}/build.gradle
ADD modules/${MODULE_NAME}/src ${MODULE}/src
WORKDIR /usr/local/src/sepal
RUN gradle :sepal-ssh-gateway:classes

CMD ["/script/init_container.sh"]
