FROM osixia/openldap:1.0.9

MAINTAINER OpenForis

ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD script/init_container.sh .
RUN apt-get update -y -qq && apt-get install -y \
    supervisor \
    net-tools \
    && chmod u+x ./init_container.sh
CMD ["/usr/bin/supervisord"]