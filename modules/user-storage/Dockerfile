FROM node:14-stretch

ENV MODULE_NAME user-storage
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# Install diskus
RUN wget -q https://github.com/sharkdp/diskus/releases/download/v0.6.0/diskus_0.6.0_amd64.deb
RUN dpkg -i diskus_0.6.0_amd64.deb && rm diskus_0.6.0_amd64.deb

# RUN groupadd --gid 9999 sepal && adduser node sepal
RUN apt update && \
    apt install sudo && \
    adduser node sudo && \
    echo 'node ALL = (root) NOPASSWD: /usr/bin/diskus' >> /etc/sudoers

RUN npm install -g nodemon

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
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin
CMD start.sh

CMD node \
    src/main.js \
    --amqp-uri amqp://${RABBITMQ_HOST}:${RABBITMQ_PORT} \
    --redis-uri redis://user-storage-redis \
    --home-dir /sepalUsers \
    --min-delay-seconds ${MIN_DELAY_SECONDS} \
    --max-delay-seconds ${MAX_DELAY_SECONDS} \
    --delay-increase-factor ${DELAY_INCREASE_FACTOR} \
    --concurrency ${CONCURRENCY} \
    --max-retries ${MAX_RETRIES} \
    --initial-retry-delay-seconds ${INITIAL_RETRY_DELAY_SECONDS}
