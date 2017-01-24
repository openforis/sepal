FROM openforis/java
MAINTAINER OpenForis
EXPOSE 1025

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config; sync && \
    /script/init_image.sh

ADD binary/sepal.jar /opt/sepal/bin/sepal.jar

CMD ["/script/init_container.sh"]
