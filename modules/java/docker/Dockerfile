FROM ubuntu:trusty
MAINTAINER OpenForis
EXPOSE 80 443

ADD script /script

RUN chmod -R 500 /script; sync && \
    /script/init_image.sh
