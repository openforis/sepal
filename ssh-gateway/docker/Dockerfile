FROM ubuntu:trusty
MAINTAINER OpenForis

EXPOSE 22

ENV USER_GROUP "sepalUsers"

ADD config /config
ADD script /script

RUN chmod -R u+x /script && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
