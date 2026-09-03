FROM node:26-alpine

ENV MODULE_NAME message
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN apk update && apk add curl
RUN npm install -g nodemon

# install lib/shared packages
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
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/config ${MODULE}/config
ADD modules/${MODULE_NAME}/migrations ${MODULE}/migrations

# add shell scripts
ADD --chmod=0755 modules/${MODULE_NAME}/start.sh /usr/local/bin/start.sh

USER node
CMD /usr/local/bin/start.sh
