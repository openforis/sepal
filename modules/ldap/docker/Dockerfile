FROM osixia/openldap:1.0.9
MAINTAINER OpenForis
EXPOSE 389 636

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]