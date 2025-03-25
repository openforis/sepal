FROM node:22-alpine

ENV MODULE_NAME sys-monitor
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# install global packages
RUN apk update && apk add net-tools
RUN npm install -g nodemon

# install global packages
WORKDIR ${SHARED}
ADD lib/js/shared .
ADD modules/${MODULE_NAME}/lib/shared/package-lock.json .
RUN npm install

# install module packages
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# add module source
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/src ./src
ADD modules/${MODULE_NAME}/config ./config

# add shell scripts
ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin

# run
USER root
CMD start.sh
