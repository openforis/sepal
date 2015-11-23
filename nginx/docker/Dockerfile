FROM ubuntu:trusty
MAINTAINER OpenForis

ADD script/init_image.sh .
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN chmod u+x ./init_image.sh
RUN ./init_image.sh

VOLUME /etc/nginx/sites-enabled
VOLUME /etc/ssl/fao

EXPOSE 80
EXPOSE 443

CMD ["/usr/bin/supervisord"]