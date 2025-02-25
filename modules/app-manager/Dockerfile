FROM openforis/sandbox-base

EXPOSE 5011

ARG DEBIAN_FRONTEND noninteractive
ENV MODULE_NAME app-manager
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared
ENV NODE_MAJOR=22

ADD modules/${MODULE_NAME}/install-requirements.sh /usr/local/bin/install-requirements
RUN chmod +x /usr/local/bin/install-requirements
ADD modules/${MODULE_NAME}/kernels /etc/sepal/app-manager/kernels-templates
RUN apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 51716619E084DAB9
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    git \
    libpq-dev \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    python3-wheel \
    software-properties-common \
    sudo

RUN pip3 install --upgrade pip

# [HACK] Ensures /usr/local/share/jupyter/voila is available when docker volume is shadowing
RUN mkdir -p /usr/local/share/voila /usr/local/share/jupyter && \
ln -sf /usr/local/share/voila /usr/local/share/jupyter/voila && \
    pip3 install "voila==0.5.8"

RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# Set bash prompt
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /home/node/.bashrc
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /root/.bashrc

# Install node.js

RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install nodejs -y

RUN npm install -g nodemon

USER node
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
RUN bash -c "source /home/node/.nvm/nvm.sh && nvm install 20"

ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN bash -c "npm install"

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
ADD modules/${MODULE_NAME}/package-lock.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN bash -c "npm install"

ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/config ${MODULE}/config
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin
ADD modules/${MODULE_NAME}/update-app.sh /usr/local/bin/update-app

CMD start.sh
