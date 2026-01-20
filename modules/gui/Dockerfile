FROM node:24-alpine

EXPOSE 80

ENV MODULE_NAME gui
ENV MODULE /usr/local/src/sepal/modules/gui

# install global packages
RUN apk update && apk add net-tools nginx gettext envsubst netcat-openbsd

# install module packages
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# add module resources
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/src ./src
ADD modules/${MODULE_NAME}/public ./public
ADD modules/${MODULE_NAME}/.env ./.env
ADD modules/${MODULE_NAME}/jsconfig.json ./jsconfig.json
ADD modules/${MODULE_NAME}/index.html ./index.html
ADD modules/${MODULE_NAME}/vite.config.js ./vite.config.js
ADD modules/${MODULE_NAME}/nginx.conf ./nginx.conf

# build
RUN npm run build

# add shell scripts
ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin

# expose environment variables
ARG BUILD_NUMBER
ENV BUILD_NUMBER=$BUILD_NUMBER
ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT

# run
USER root
CMD start.sh
