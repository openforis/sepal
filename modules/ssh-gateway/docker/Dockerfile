FROM ubuntu:trusty
MAINTAINER OpenForis
EXPOSE 22

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

ADD binary/sepal-ssh-gateway.jar /opt/sepal/bin/sepal-ssh-gateway.jar

CMD ["/script/init_container.sh"]
