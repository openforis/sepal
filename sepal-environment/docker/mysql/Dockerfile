FROM mysql:5.6.26

MAINTAINER OpenForis

ADD script/schema.sql .
ADD script/wrs_points.sql .
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

ADD script/init_container.sh .
ADD script/init_image.sh .

RUN chmod u+x ./init_image.sh
RUN ./init_image.sh

EXPOSE 3306
CMD ["/usr/bin/supervisord"]


