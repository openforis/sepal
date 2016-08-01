FROM    ubuntu:xenial
MAINTAINER OpenForis

ADD config /config
ADD script /script

RUN chmod -R 400 /config && \
    chmod -R 500 /script && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]