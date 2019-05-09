FROM node:10.15.2-stretch
MAINTAINER OpenForis
EXPOSE 8000

ENV ROOT /usr/local/src/terminal
ENV IP 0.0.0.0
ENV PORT 8000

WORKDIR ${ROOT}
ADD package.json ${ROOT}/package.json
RUN apt-get update && \
    apt-get install sudo && \
    adduser node sudo && \
    echo "node ALL = (root) NOPASSWD:ALL" >> /etc/sudoers && \
    npm install

ADD src ${ROOT}/src

USER node
CMD ["npm", "start"]
