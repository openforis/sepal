FROM node:14-stretch
EXPOSE 8000

ENV MODULE /usr/local/src/sepal/modules/terminal/docker
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN apt update && \
    apt install sudo && \
    adduser node sudo

ADD build/lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

USER root
ADD script/ssh_gateway.sh /usr/local/bin/ssh_gateway.sh
RUN chmod +x /usr/local/bin/ssh_gateway.sh

USER node
ADD src ${MODULE}/src
CMD node \
    src/main.js \
    --ip '0.0.0.0' \
    --port 8000 \
    --home-dir '/sepalUsers' \
    --ssh-script-path '/usr/local/bin/ssh_gateway.sh'
