FROM ubuntu:xenial
MAINTAINER OpenForis
EXPOSE 80 443

ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/sdkman/candidates/java/current/bin

ADD script /script

RUN chmod -R 500 /script; sync && \
    /script/init_image.sh
