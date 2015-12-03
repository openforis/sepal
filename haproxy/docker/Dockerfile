FROM haproxy:1.6.1

MAINTAINER OpenForis

ADD script/init_image.sh .
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN chmod 777 /init_image.sh

ENV term XTERM
RUN /init_image.sh

ADD config/rsyslog.conf /etc/rsyslog.conf

EXPOSE 80
EXPOSE 443

CMD ["/usr/bin/supervisord"]