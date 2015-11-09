FROM mysql:5.6.26

MAINTAINER OpenForis

ENV FLYWAY_VERSION 3.2.1
ENV MYSQL_DATABASE sdms
ENV MYSQL_USER sepal
ENV SCHEMA_BASELINE_VERSION 1.1
ENV INSTANCE_HOSTNAME localhost

ADD script/sqlScripts ./sqlScripts
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

ADD script/init_container.sh .
ADD script/init_image.sh .

RUN chmod u+x ./init_image.sh
RUN ./init_image.sh

EXPOSE 3306

ENV TERM=xterm
ENTRYPOINT []
CMD ["/usr/bin/supervisord"]


