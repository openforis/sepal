FROM prom/prometheus:latest

ENV MODULE_NAME monitoring

ADD modules/${MODULE_NAME}/entrypoint.sh /

ADD modules/${MODULE_NAME}/prometheus.yml /etc/prometheus/prometheus.yml

ENTRYPOINT [ "/entrypoint.sh" ]
