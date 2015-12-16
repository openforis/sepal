FROM openforistoolkit-guitools
MAINTAINER OpenForis

ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD config/ldap.conf /etc/ldap.conf
ADD templates/ /templates
ADD script/start .
ADD script/init_image.sh .
ADD script/healt_check.sh /root/healt_check.sh

RUN chmod u+x /init_image.sh && ./init_image.sh

ENV SEPAL_USERS_GRP_NAME sepalUsers

CMD ["/usr/bin/supervisord"]
