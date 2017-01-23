FROM openforis/java
MAINTAINER OpenForis
EXPOSE 80 443

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config; sync && \
    /script/init_image.sh

ADD binary/sepal-api-gateway.jar /opt/sepal/bin/sepal-api-gateway.jar

CMD ["/script/init_container.sh"]
