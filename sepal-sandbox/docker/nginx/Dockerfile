FROM ubuntu:trusty

MAINTAINER OpenForis

ADD script/init_image.sh .



RUN chmod u+x ./init_image.sh

RUN ./init_image.sh

VOLUME /etc/nginx/sites-enabled
VOLUME /etc/ssl/fao


CMD /usr/sbin/nginx -g "daemon off;"