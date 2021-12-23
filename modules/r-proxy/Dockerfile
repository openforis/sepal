# FROM node:14-stretch
FROM ubuntu:focal

EXPOSE 8180

ENV DEBIAN_FRONTEND noninteractive
ENV MODULE_NAME r-proxy
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# Install packages
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    git \
    software-properties-common \
    sudo \
    r-base\
    r-base-dev \
    nano

# Install R packages
RUN R -e 'install.packages("remotes", lib = "/usr/lib/R/site-library")'

# Create node user
RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# Install node.js
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash
RUN apt-get -y install nodejs

# Install node global packages
RUN npm install -g nodemon

# Install shared node.js lib
ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

# Install node.js module
ADD modules/${MODULE_NAME}/package.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ENV REPO_PATH /var/sepal/r-proxy/repo
USER root
RUN mkdir -p ${REPO_PATH}
RUN chown -R node: ${REPO_PATH}

ADD modules/${MODULE_NAME}/src ${MODULE}/src

USER node

# USER root

# CMD node \
#     src/main.js \
#     --repo-dir /var/sepal/${MODULE_NAME}/repo \
#     --poll-interval-seconds ${POLL_INTERVAL_S}
