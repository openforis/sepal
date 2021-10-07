FROM node:16-stretch
EXPOSE 5999

ENV MODULE /usr/local/src/sepal/modules/user-storage/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

ADD build/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN npm install

ADD package.json ${MODULE}/
WORKDIR ${MODULE}
RUN mkdir src
RUN npm install

ADD src ${MODULE}/src
CMD node \
    src/main.js \
    --home-dir /sepalUsers \
    --poll-interval-milliseconds ${POLL_INTERVAL_MS}
