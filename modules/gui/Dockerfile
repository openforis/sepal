FROM node:22-alpine

RUN apk add net-tools nginx gettext

EXPOSE 3000

ENV MODULE_NAME gui
ENV MODULE /usr/local/src/sepal/modules/gui
USER root

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
ADD modules/${MODULE_NAME}/package-lock.json ${MODULE}/
WORKDIR ${MODULE}
RUN npm install

ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/public ${MODULE}/public
ADD modules/${MODULE_NAME}/.env ${MODULE}/.env
ADD modules/${MODULE_NAME}/jsconfig.json ${MODULE}/jsconfig.json
ADD modules/${MODULE_NAME}/index.html ${MODULE}/index.html
ADD modules/${MODULE_NAME}/vite.config.js ${MODULE}/vite.config.js

RUN npm run build

ADD modules/${MODULE_NAME}/start.sh /usr/local/bin
RUN chmod 700 /usr/local/bin/start.sh
ADD modules/${MODULE_NAME}/nginx.conf ${MODULE}/nginx.conf

ARG BUILD_NUMBER
ENV BUILD_NUMBER=$BUILD_NUMBER
ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
CMD start.sh
