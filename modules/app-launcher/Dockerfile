FROM node:22-alpine

EXPOSE 80

ENV MODULE_NAME=app-launcher
ENV MODULE=/usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED=/usr/local/src/sepal/lib/js/shared

RUN npm install -g nodemon
RUN apk update && apk add --no-cache \
    git \
    curl \
    cmake \
    ca-certificates \
    gnupg \
    iputils \
    nano \
    unzip \
    zip \
    sudo \
    docker

RUN apk add --no-cache docker \
    && mkdir -p /usr/local/lib/docker/cli-plugins \
    && curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose \
    && chmod +x /usr/local/lib/docker/cli-plugins/docker-compose


RUN addgroup node wheel \
    && echo '%wheel ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Set prompt
RUN echo "export PS1='[\u@${MODULE_NAME}:\w]\\$ '" \
    >> /home/node/.profile

# install lib packages
WORKDIR ${SHARED}
ADD lib/js/shared .
ADD modules/${MODULE_NAME}/lib/shared/package-lock.json .
RUN npm install

# install module packages
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/package.json .
ADD modules/${MODULE_NAME}/package-lock.json .
RUN npm install

# add module source
WORKDIR ${MODULE}
ADD modules/${MODULE_NAME}/src ./src
ADD modules/${MODULE_NAME}/config ./config


# add shell scripts
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin
ADD modules/${MODULE_NAME}/update-app.sh /usr/local/bin/update-app

CMD ["sh", "/usr/local/bin/start.sh"]