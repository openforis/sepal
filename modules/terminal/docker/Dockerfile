FROM node:10.15.2-stretch
MAINTAINER OpenForis
EXPOSE 8000

ENV ROOT /usr/local/src/terminal
ENV IP 0.0.0.0
ENV PORT 8000


ADD script/ssh_gateway.sh /usr/local/bin/ssh_gateway.sh
RUN chmod +x /usr/local/bin/ssh_gateway.sh

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
