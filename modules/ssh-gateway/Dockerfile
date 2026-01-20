FROM node:24-bookworm

EXPOSE 22

ARG DEBIAN_FRONTEND noninteractive
ENV MODULE_NAME ssh-gateway
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# install global packages
RUN npm install -g nodemon

# add scripts and configuration
ADD --chmod=755 modules/${MODULE_NAME}/script/* /usr/local/bin
ADD --chmod=755 modules/${MODULE_NAME}/config /config
RUN chmod 400 /config/*

# init image
RUN /usr/local/bin/init_image.sh

# install lib packages
WORKDIR ${SHARED}
ADD lib/js/shared .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# install module packages
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# add module source
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/src ./src

# run
USER root
CMD /usr/local/bin/init_container.sh
