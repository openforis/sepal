FROM ubuntu:focal

ENV MODULE_NAME java
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/sdkman/candidates/java/current/bin
ENV SDKMAN_DIR /usr/local/lib/sdkman

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

ADD ./settings.gradle /usr/local/src/sepal/./settings.gradle
ADD ./build.gradle /usr/local/src/sepal/./build.gradle

WORKDIR /usr/local/src/sepal
RUN gradle :sepal-common:build :sepal-common-test:build

CMD echo
