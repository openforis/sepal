FROM panoptix/rsyslog
MAINTAINER OpenForis

EXPOSE 10514/tcp 514/udp

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

ENTRYPOINT []
CMD ["/script/init_container.sh"]