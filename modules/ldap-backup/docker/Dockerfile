FROM osixia/openldap-backup:1.1.7
MAINTAINER OpenForis

ADD script /script

RUN chmod -R 500 /script; sync && \
    /script/init_image.sh

ENTRYPOINT ["/script/init_container.sh"]