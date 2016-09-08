FROM osixia/openldap-backup:1.1.6
MAINTAINER OpenForis

ADD script /script

RUN chmod -R 500 /script && \
    /script/init_image.sh

ENTRYPOINT ["/script/init_container.sh"]