FROM osixia/openldap-backup:0.1.8
MAINTAINER OpenForis

ADD script /script

RUN chmod -R 500 /script && \
    /script/init_image.sh

ENTRYPOINT ["/script/init_container.sh"]