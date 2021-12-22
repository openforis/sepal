# FROM node:14-stretch
FROM ubuntu:focal

EXPOSE 8180

ENV DEBIAN_FRONTEND noninteractive
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# Install packages
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    git \
    # libpq-dev \
    # python3 \
    # python3-dev \
    # python3-pip \
    # python3-venv \
    # python3-wheel \
    software-properties-common \
    sudo \
    r-base\
    r-base-dev \
    nano

# Create node user
RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# Install node.js
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash
RUN apt-get -y install nodejs

# Install node global packages
RUN npm install -g nodemon npm-check-updates

# Install shared node.js lib
USER root
ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}
RUN chown -R node: ${SHARED}
USER node
RUN npm install

# Install node.js module
USER root
ADD modules/${MODULE_NAME}/package.json ${MODULE}/
WORKDIR ${MODULE}
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ENV REPO_PATH /var/sepal/r-package-manager/repo
USER root
RUN mkdir -p ${REPO_PATH}
RUN chown -R node: ${REPO_PATH}

ADD modules/${MODULE_NAME}/src ${MODULE}/src

USER node

CMD node \
    src/main.js \
    --repo-dir /var/sepal/${MODULE_NAME}/repo \
    --poll-interval-seconds ${POLL_INTERVAL_S}
