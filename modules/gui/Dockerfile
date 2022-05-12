FROM node:18-bullseye
EXPOSE 3000
ENV MODULE_NAME gui
ENV MODULE /usr/local/src/sepal/modules/gui
USER root
RUN apt-get update && apt-get install -y \
  nginx \
  gettext

# Set bash prompt
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /home/node/.bashrc
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /root/.bashrc

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
ADD modules/${MODULE_NAME}/package-lock.json ${MODULE}/
WORKDIR ${MODULE}
RUN npm install

ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/public ${MODULE}/public
ADD modules/${MODULE_NAME}/.env ${MODULE}/.env
ADD modules/${MODULE_NAME}/jsconfig.json ${MODULE}/jsconfig.json

RUN npm run build

ADD modules/${MODULE_NAME}/start.sh /usr/local/bin
RUN chmod 700 /usr/local/bin/start.sh
ADD modules/${MODULE_NAME}/nginx.conf ${MODULE}/nginx.conf

ARG BUILD_NUMBER
ENV BUILD_NUMBER=$BUILD_NUMBER
ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
CMD start.sh
