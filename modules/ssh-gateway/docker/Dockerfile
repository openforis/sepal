FROM ubuntu:trusty
MAINTAINER OpenForis
EXPOSE 22

ENV USER_GROUP "sepalUsers"

ADD config /config
ADD script /script
ADD binary/sepal-ssh-gateway.jar /opt/sepal/bin/sepal-ssh-gateway.jar

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
