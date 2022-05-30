FROM node:17-bullseye
EXPOSE 8000

ENV MODULE_NAME terminal
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

RUN apt-get update && \
    apt-get install sudo && \
    adduser node sudo && \
    echo 'node    ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

RUN npm install -g npm nodemon

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

USER root
ADD modules/${MODULE_NAME}/script/ssh_gateway.sh /usr/local/bin/ssh_gateway.sh
RUN chmod +x /usr/local/bin/ssh_gateway.sh

USER node
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin

CMD start.sh

