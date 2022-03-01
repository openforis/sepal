FROM node:17-bullseye
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
RUN mkdir src
RUN npm install

ADD modules/${MODULE_NAME} ${MODULE}
RUN npm run build

ADD modules/${MODULE_NAME}/nginx.conf /etc/nginx/sites-enabled/default
ADD modules/${MODULE_NAME}/init_container.sh /usr/local/bin/init_container
RUN chmod 500 /usr/local/bin/init_container

ARG BUILD_NUMBER
ENV BUILD_NUMBER=$BUILD_NUMBER
ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
CMD ["/usr/local/bin/init_container"]
