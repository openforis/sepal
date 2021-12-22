FROM openforis/java

EXPOSE 1025
EXPOSE 5005

ENV MODULE_NAME sepal-server
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config

ADD common /usr/local/src/sepal/common
ADD common-test /usr/local/src/sepal/common-test
ADD modules/${MODULE_NAME}/build.gradle ${MODULE}/build.gradle
ADD modules/${MODULE_NAME}/src ${MODULE}/src
WORKDIR /usr/local/src/sepal
RUN gradle :sepal-server:classes

CMD ["/script/init_container.sh"]
