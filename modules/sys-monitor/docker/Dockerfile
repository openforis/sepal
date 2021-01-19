FROM node:14-stretch

ENV MODULE /usr/local/src/sepal/modules/sys-monitor/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

# RUN apt update && \
#     apt install sudo && \
#     adduser node sudo && \
#     echo 'node ALL = (root) NOPASSWD: /usr/bin/diskus' >> /etc/sudoers

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
    --sepal-server-log /log/messages
