FROM ubuntu:trusty
MAINTAINER OpenForis

ENV ADMIN_USERNAME sepalAdmin
ENV WEB_ADMIN_USERNAME sepalAdminWeb
ENV USER_GROUP "sepalUsers"

ADD script/create_user .
ADD config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
ADD script/init_image.sh .
ADD script/init_container.sh .
ADD script/ssh-bootstrap .
ADD script/copyOver.run .
ADD script/alive.sh .

RUN chmod u+x /init_image.sh
RUN /init_image.sh

EXPOSE 22

CMD ["/init_container.sh"]
