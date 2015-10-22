FROM openforistoolkit:graphical-tools
MAINTAINER OpenForis


ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD script/init_sandbox.run .
ADD script/init_image.sh .
ADD script/healt_check.sh /root/healt_check.sh


RUN chmod u+x /init_image.sh
RUN ./init_image.sh

ENV SEPAL_USERS_GID 9998
ENV SEPAL_USERS_GRP_NAME sepalUsers


CMD ["/usr/bin/supervisord"]
