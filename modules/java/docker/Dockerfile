FROM ubuntu:trusty
MAINTAINER OpenForis
EXPOSE 80 443

ADD script /script

RUN chmod -R 500 /script && \
    /script/init_image.sh
