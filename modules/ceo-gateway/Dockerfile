FROM node:22-alpine

RUN apk update && apk add net-tools sudo

EXPOSE 8001

ENV MODULE_NAME ceo-gateway
ENV ROOT /usr/local/src/ceo-gateway
ENV IP 0.0.0.0
ENV PORT 8001

WORKDIR ${ROOT}

ADD modules/${MODULE_NAME}/package.json ${ROOT}/package.json

RUN echo "node ALL=(root) NOPASSWD: /usr/bin/ssh" > /etc/sudoers.d/node && chmod 0440 /etc/sudoers.d/node

RUN npm install

ADD modules/${MODULE_NAME}/src ${ROOT}/src

USER node
CMD ["npm", "run", "start_unsecure"]
