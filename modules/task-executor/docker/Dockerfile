FROM ubuntu:trusty
MAINTAINER OpenForis
EXPOSE 1026

ADD config /config
ADD script /script
ADD templates /templates

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

ADD binary/task-executor.jar /opt/sepal/bin/task-executor.jar

CMD ["/script/init_container.sh"]
