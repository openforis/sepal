FROM node:24-alpine

EXPOSE 80

ENV MODULE_NAME=app-launcher
ENV MODULE=/usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED=/usr/local/src/sepal/lib/js/shared
ARG DOCKER_COMPOSE_VERSION=v5.1.3
ARG DOCKER_BUILDX_VERSION=v0.33.0

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
    docker

RUN apk add --no-cache docker 

# Install docker compose

RUN mkdir -p /usr/local/lib/docker/cli-plugins
RUN curl -SL https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
RUN chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install docker buildx

RUN mkdir -p /usr/libexec/docker/cli-plugins
RUN curl -SL https://github.com/docker/buildx/releases/download/${DOCKER_BUILDX_VERSION}/buildx-${DOCKER_BUILDX_VERSION}.linux-amd64 -o /usr/libexec/docker/cli-plugins/docker-buildx
RUN chmod +x /usr/libexec/docker/cli-plugins/docker-buildx

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

CMD ["sh", "/usr/local/bin/start.sh"]