FROM prom/prometheus:latest

ENV MODULE_NAME prometheus

ADD modules/${MODULE_NAME}/entrypoint.sh /

ENTRYPOINT [ "/entrypoint.sh" ]
