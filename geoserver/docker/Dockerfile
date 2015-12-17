FROM openforis/jdk
MAINTAINER OpenForis
EXPOSE 8080

ADD script /script

RUN chmod -R 500 /script && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
