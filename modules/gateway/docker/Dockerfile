FROM node:14-stretch

ENV MODULE /usr/local/src/sepal/modules/gateway/docker
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
ADD modules.json /etc/sepal/module.d/gateway/modules.json

CMD node \
    src/main.js \
    --redis-uri "redis://gateway-redis" \
    --modules=/etc/sepal/module.d/gateway/modules.json \
    --sepalHost=${SEPAL_HOST} \
    --secure
