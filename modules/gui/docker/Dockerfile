FROM node:14-stretch
EXPOSE 7667

ENV SERVER /usr/local/src/sepal/modules/gui/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared
ENV FRONTEND /usr/local/src/sepal/modules/gui/frontend

ADD build/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD package.json ${SERVER}/
WORKDIR ${SERVER}
USER root
RUN mkdir src && chown -R node: ${SERVER}
USER node
RUN npm install

ADD package.json ${FRONTEND}/
WORKDIR ${FRONTEND}
USER root
RUN mkdir src && chown -R node: ${FRONTEND}
USER node
RUN npm install

ADD src ${SERVER}/src
ADD src ${FRONTEND}/src
CMD node \
    src/main.js \
    --google-analytics-id "$GOOGLE_ANALYTICS_ID" \
    --google-maps-api-key "$GOOGLE_MAPS_API_KEY"
