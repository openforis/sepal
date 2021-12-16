FROM node:14-stretch
EXPOSE 8000

ENV MODULE_NAME terminal
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN apt update && \
    apt install sudo && \
    adduser node sudo && \
    echo 'node    ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

USER root
ADD modules/${MODULE_NAME}/script/ssh_gateway.sh /usr/local/bin/ssh_gateway.sh
RUN chmod +x /usr/local/bin/ssh_gateway.sh

USER node
ADD modules/${MODULE_NAME}/src ${MODULE}/src
CMD node \
    src/main.js \
    --ip '0.0.0.0' \
    --port 8000 \
    --home-dir '/sepalUsers' \
    --ssh-script-path '/usr/local/bin/ssh_gateway.sh'
