FROM ubuntu:trusty
MAINTAINER OpenForis

ADD config /config
ADD script /script
ADD templates /templates
ADD binary/task-executor.jar /opt/sepal/bin/task-executor.jar

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
