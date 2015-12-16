FROM openforistoolkit

MAINTAINER OpenForis

ADD config /config
ADD script/init_image.sh .
ADD script/init_container.sh .
ADD binary/sepal.jar /opt/sepal/bin/sepal.jar
RUN chmod -R 400 /config && \
    chown -R root: /config && \
    chmod u+x /init_image.sh && \
    chmod u+x /init_container.sh && \
    /init_image.sh

EXPOSE 1025

CMD ["/init_container.sh"]
