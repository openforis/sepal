FROM node:14-stretch
EXPOSE 5999

ENV MODULE /usr/local/src/sepal/modules/user-files/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

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

USER root
CMD node \
    src/main.js \
    --home-dir /sepalUsers \
    --poll-interval-milliseconds ${POLL_INTERVAL_MS}
