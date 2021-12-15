FROM node:14-stretch
EXPOSE 8180

ENV MODULE /usr/local/src/sepal/modules/r-package-manager/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN npm install -g nodemon

ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD modules/r-package-manager/package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ADD modules/r-package-manager/src ${MODULE}/src

USER root
CMD node \
    src/main.js \
    --repo-dir /var/sepal/r-package-manager/repo \
    --poll-interval-seconds ${POLL_INTERVAL_S}
