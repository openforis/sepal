FROM ubuntu:trusty
MAINTAINER OpenForis


ENV ADMIN_USERNAME sepalAdmin
ENV ADMIN_PASSWORD qwertasdfzxcv
ENV WEB_ADMIN_USERNAME sepalAdminWeb
ENV WEB_ADMIN_PASSWORD "the admin user 123"
ENV USER_GROUP "sepalUsers"

ADD script/create_user .
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD script/init_image.sh .
ADD script/init_container.sh .
ADD script/ssh-bootstrap .

RUN chmod u+x /init_image.sh
RUN /init_image.sh

EXPOSE 22

CMD ["/init_container.sh"]
