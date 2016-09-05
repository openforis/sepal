FROM osixia/openldap:1.1.6
MAINTAINER OpenForis
EXPOSE 389 636

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

ENTRYPOINT []
CMD ["/script/init_container.sh"]