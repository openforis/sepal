FROM node:14-stretch

ENV MODULE /usr/local/src/sepal/modules/email/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN apt update && \
    apt install sudo && \
    adduser node sudo

ADD build/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ADD src ${MODULE}/src
CMD node \
    src/main.js \
    --amqp-uri amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT} \
    --redis-uri redis://email-redis \
    --smtp-host ${SMTP_HOST} \
    --smtp-port ${SMTP_PORT} \
    --smtp-secure ${SMTP_SECURE} \
    --smtp-user ${SMTP_USER} \
    --smtp-password ${SMTP_PASSWORD} \
    --smtp-from ${SMTP_FROM} \
    --sepal-host "$SEPAL_HOST_SEPAL_ENV" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD_SEPAL_ENV"
