FROM openforis/java
MAINTAINER OpenForis
EXPOSE 80

ENV USER_GROUP "sepalUsers"

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

ADD binary/sepal-user.jar /opt/sepal/bin/sepal-user.jar

CMD ["/script/init_container.sh"]
