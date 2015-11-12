FROM linode/lamp
MAINTAINER OpenForis

ENV ADMIN_PWD sdms-admin

ADD script/init_image.sh .
ADD script/init_container.sh .
RUN chmod u+x ./init_image.sh
RUN chmod u+x ./init_container.sh
RUN ./init_image.sh


ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD config/ports.conf /etc/apache2/
ADD config/000-default.conf /etc/apache2/sites-enabled/
ADD config/default-ssl.conf /etc/apache2/sites-enabled/

EXPOSE 9090
EXPOSE 9443

ENV ARTIFACT_VERSION 1.0.0-SNAPSHOT
ENV ARTIFACT_SUFFIX ''

CMD ["/init_container.sh"]
