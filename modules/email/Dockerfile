FROM node:20-bookworm

ENV MODULE_NAME email
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN npm install -g nodemon

RUN apt-get update && \
    apt-get install -y sudo && \
    adduser node sudo

# Set bash prompt
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /home/node/.bashrc
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /root/.bashrc

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
