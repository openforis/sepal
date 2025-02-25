FROM alpine:3

ENV MODULE_NAME logger
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}

RUN apk update && apk add supervisor rsyslog logrotate net-tools

COPY modules/${MODULE_NAME}/etc /etc/
RUN chmod 644 /etc/logrotate.d/*

ENTRYPOINT []
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
