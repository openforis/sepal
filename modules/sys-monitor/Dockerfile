FROM node:14-stretch

ENV MODULE_NAME sys-monitor
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/src ${MODULE}/src

USER root
CMD node \
    src/main.js \
    --amqp-uri amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT} \
    --sepal-server-log ${SEPAL_SERVER_LOG} \
    --initial-delay-minutes ${INITIAL_DELAY_MINUTES} \
    --auto-rearm-delay-hours ${AUTO_REARM_DELAY_HOURS} \
    --notify-to ${SEPAL_MONITORING_EMAIL} \
    --notify-from sys-monitor
