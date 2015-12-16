FROM linode/lamp
MAINTAINER OpenForis

EXPOSE 9090
EXPOSE 9443

ADD binary/sepal-php.tar.gz /var/www/html
ADD config /config
ADD script /script

RUN chmod -R u+x /script && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
