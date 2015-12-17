FROM ubuntu:trusty
MAINTAINER OpenForis
EXPOSE 80
EXPOSE 443

ADD config /config
ADD script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]