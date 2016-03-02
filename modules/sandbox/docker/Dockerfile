FROM openforistoolkit-guitools
MAINTAINER OpenForis

ENV SEPAL_USERS_GRP_NAME sepalUsers

ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD config/ldap.conf /etc/ldap.conf
ADD templates/ /templates
ADD script/init_container.sh .
ADD script/init_image.sh .
ADD script/wait_until_initialized.sh /root/wait_until_initialized.sh

RUN chmod u+x /init_image.sh && ./init_image.sh

CMD ["/usr/bin/supervisord"]
