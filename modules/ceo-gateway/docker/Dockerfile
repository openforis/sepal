FROM node:10.15.2-stretch
MAINTAINER OpenForis
EXPOSE 8001

ENV ROOT /usr/local/src/ceo-gateway
ENV IP 0.0.0.0
ENV PORT 8001

WORKDIR ${ROOT}

ADD package.json ${ROOT}/package.json

RUN apt-get update && \
    apt-get install sudo && \
    adduser node sudo && \
    echo "node ALL = (root) NOPASSWD: /usr/bin/ssh" >> /etc/sudoers && \
    npm install

ADD src ${ROOT}/src

USER node
CMD ['npm', 'run', 'start_unsecure']
