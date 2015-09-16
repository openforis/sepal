FROM openforis/jdk

MAINTAINER OpenForis

EXPOSE 8080

ENV JAVA_OPTS -Xms128m -Xmx512m -XX:MaxPermSize=512m
ENV ADMIN_PASSWD geoserver

ADD script/init_image.sh /
ADD script/init_container.sh /
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN chmod u+x ./init_image.sh
RUN chmod u+x ./init_container.sh
RUN ./init_image.sh

CMD ["/usr/bin/supervisord"]




