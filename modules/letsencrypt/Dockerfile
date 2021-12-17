FROM ubuntu:trusty

EXPOSE 80

ENV MODULE_NAME letsencrypt

ADD modules/${MODULE_NAME}/config /config
ADD modules/${MODULE_NAME}/script /script

RUN chmod -R 500 /script && \
    chmod -R 400 /config && sync && \
    /script/init_image.sh

CMD ["/script/init_container.sh"]
