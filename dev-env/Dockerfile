FROM debian:trixie-slim

SHELL ["/bin/bash", "-c"]

ARG DEBIAN_FRONTEND=noninteractive
ENV PROJECT_DIR /home/sepal/sepal
ENV NODE_MAJOR=24
ARG DOCKER_COMPOSE_VERSION=v2.40.0
ARG JAVA_VERSION=11.0.11.hs-adpt
ARG GRADLE_VERSION=6.9.1

# Injected by compose build args

ARG USER_UID
ARG USER_GID
ARG DOCKER_GID

RUN echo "USER_UID: ${USER_UID}, USER_GID: ${USER_GID}, DOCKER_GID: ${DOCKER_GID}"

# Install core packages

RUN apt-get update && apt-get install -y \
    apt-utils \
    curl \
    build-essential \
    cmake \
    ca-certificates \
    gdal-bin \
    git \
    gnupg \
    graphviz \
    inetutils-ping \
    lsb-release \
    nano \
    ncdu \
    unzip \
    sudo \
    zip

# Install docker-cli

RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

RUN echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

RUN apt-get update && apt-get install -y docker-ce-cli

# Install docker compose

RUN mkdir -p /usr/local/lib/docker/cli-plugins
RUN curl -SL https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
RUN chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Install node.js

RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install nodejs -y

# Install global npm packages

RUN npm install -g madge npm-check-updates wscat touch

# Add shell script to path

ADD sepal.sh /usr/local/bin/sepal
RUN chmod +x /usr/local/bin/sepal

# Install Java and Gradle

ENV SDKMAN_DIR=/usr/local/lib/sdkman
RUN curl -s https://get.sdkman.io | bash && \
    source "${SDKMAN_DIR}/bin/sdkman-init.sh" && \
    yes | sdk install java ${JAVA_VERSION} && \
    sdk install gradle ${GRADLE_VERSION}
RUN source "${SDKMAN_DIR}/bin/sdkman-init.sh" && \    
    ln -s "$(which java)" /usr/local/bin/java && \
    ln -s "$(which gradle)" /usr/local/bin/gradle && \
    JAVA_HOME=$(sdk home java current) && \
    sed -i 's/jdk.tls.disabledAlgorithms=.*/jdk.tls.disabledAlgorithms=SSLv3, RC4, DES, MD5withRSA, /' "$JAVA_HOME/conf/security/java.security"

# Create sepal user

RUN addgroup --gid $DOCKER_GID docker
RUN addgroup --gid $USER_GID sepal
RUN adduser --uid $USER_UID --gid $USER_GID sepal
RUN adduser sepal sudo 
RUN adduser sepal docker 
RUN echo 'sepal      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# Switch to sepal user

USER sepal

# Setup git aliases

RUN git config --global alias.st status \
    && git config --global alias.ci commit \
    && git config --global alias.br branch \
    && git config --global alias.co checkout \
    && git config --global alias.unstage 'reset HEAD --' \
    && git config --global alias.last 'log -1 HEAD'

# Set bash prompt

RUN echo "export PS1='[\[\033[1;35m\]\u@dev-env\[\033[0m\]:\w]\$ '" >> /home/sepal/.bashrc

# Add dev-env source code

ADD --chown=sepal:sepal ./package.json ${PROJECT_DIR}/dev-env/
ADD --chown=sepal:sepal ./package-lock.json ${PROJECT_DIR}/dev-env/
ADD --chown=sepal:sepal ./src ${PROJECT_DIR}/dev-env/src/
ADD --chown=sepal:sepal ./config ${PROJECT_DIR}/dev-env/config/

WORKDIR ${PROJECT_DIR}/dev-env/

RUN npm install

WORKDIR $PROJECT_DIR
