FROM node:22-alpine

EXPOSE 80

ENV MODULE_NAME ceo-gateway
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN apk update && apk add net-tools sudo

RUN npm install -g nodemon

ADD modules/${MODULE_NAME}/package.json ${ROOT}/package.json

RUN echo "node ALL=(root) NOPASSWD: /usr/bin/ssh" > /etc/sudoers.d/node && chmod 0440 /etc/sudoers.d/node

RUN npm install

ADD modules/${MODULE_NAME}/src ${ROOT}/src

ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
ADD modules/${MODULE_NAME}/package-lock.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/config ${MODULE}/config
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin

CMD start.sh
