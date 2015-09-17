FROM ubuntu:trusty
MAINTAINER OpenForis

ADD script/init_image.sh .
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN chmod u+x /init_image.sh
RUN /init_image.sh
RUN ./OpenForisToolkit.run << 1

CMD ["/usr/bin/supervisord"]
