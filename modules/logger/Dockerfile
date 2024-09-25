FROM alpine:3

ENV MODULE_NAME logger
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}

RUN apk update
RUN apk add supervisor rsyslog logrotate

COPY modules/${MODULE_NAME}/etc /etc/

ENTRYPOINT []
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
