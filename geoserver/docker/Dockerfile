FROM openforis/jdk

MAINTAINER OpenForis

EXPOSE 8080

ADD script/init_image.sh /
ADD script/init_container.sh /
ADD script/geoserver /etc/init.d/
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN chmod u+x ./init_image.sh
RUN chmod u+x ./init_container.sh
RUN ./init_image.sh

CMD ["/usr/bin/supervisord"]




