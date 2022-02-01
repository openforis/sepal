FROM ubuntu:focal

ARG DEBIAN_FRONTEND=noninteractive
ENV DOCKER_BUILDKIT=0

# update and install base packages

RUN apt-get update && apt-get install -y \
    apt-utils \
    curl \
    build-essential \
    cmake \
    ca-certificates \
    gnupg \
    lsb-release \
    nano

# Install docker-cli

RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

RUN echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

RUN apt-get update && apt-get install -y docker-ce-cli

# Install docker compose

RUN mkdir -p /usr/local/lib/docker/cli-plugins
RUN curl -SL https://github.com/docker/compose/releases/download/v2.2.3/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
RUN chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install node.js

RUN curl -sL https://deb.nodesource.com/setup_14.x | bash
RUN apt-get update && apt-get -y install nodejs

# Add shell script to path
ADD sepal.sh /usr/local/bin/sepal
RUN chmod +x /usr/local/bin/sepal

# Add source code

ADD ./package.json /dev-env/
ADD ./src /dev-env/src/
ADD ./config /dev-env/config/

WORKDIR /dev-env
RUN npm install

WORKDIR /dev-env/src
