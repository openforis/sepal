FROM ubuntu:trusty
MAINTAINER OpenForis

ADD script /script

RUN chmod -R 500 /script && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]