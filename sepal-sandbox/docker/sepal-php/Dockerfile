FROM linode/lamp
MAINTAINER OpenForis


ADD config/ports.conf /etc/apache2/
ADD script/init_image.sh .

RUN chmod u+x ./init_image.sh
RUN ./init_image.sh

ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 22
EXPOSE 9090
EXPOSE 9443

CMD ["/usr/bin/supervisord"]
