FROM node:14-stretch
EXPOSE 5001

ENV GEE /usr/local/src/sepal/modules/gee/docker
ENV RXJS /usr/local/src/sepal/lib/js/rxjs
ENV SHARED /usr/local/src/sepal/lib/js/shared

ADD .tmp/lib/js/rxjs ${RXJS}
WORKDIR ${RXJS}
USER root
RUN chown -R node: ${RXJS}
USER node
RUN npm install

ADD .tmp/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD package.json ${GEE}/
WORKDIR ${GEE}
USER root
RUN mkdir src && chown -R node: ${GEE}
USER node
RUN npm install

ADD src ${GEE}/src
CMD node \
    src/main.js \
    --gee-email "$EE_ACCOUNT_SEPAL_ENV" \
    --gee-key "$EE_PRIVATE_KEY_SEPAL_ENV" \
    --sepal-host "$SEPAL_HOST_SEPAL_ENV" \
    --sepal-username "sepalAdmin" \
    --sepal-password "$SEPAL_ADMIN_PASSWORD_SEPAL_ENV"
