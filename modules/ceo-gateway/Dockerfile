FROM node:10.15.2-stretch
EXPOSE 8001

ENV MODULE_NAME ceo-gateway
ENV ROOT /usr/local/src/ceo-gateway
ENV IP 0.0.0.0
ENV PORT 8001

WORKDIR ${ROOT}

ADD modules/${MODULE_NAME}/package.json ${ROOT}/package.json

RUN apt-get update && \
    apt-get install sudo && \
    adduser node sudo && \
    echo "node ALL = (root) NOPASSWD: /usr/bin/ssh" >> /etc/sudoers && \
    npm install

ADD modules/${MODULE_NAME}/src ${ROOT}/src

USER node
CMD ["npm", "run", "start_unsecure"]
