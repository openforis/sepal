FROM openforis/sandbox-base

EXPOSE 8180

ENV MODULE_NAME r-proxy
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared
ENV NODE_MAJOR=22

# Install R packages
RUN apt-get install -y \
    libglpk-dev

RUN R -e 'install.packages("remotes", lib = "/usr/lib/R/site-library")'

# Create node user
RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# Install node.js
RUN mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update
RUN apt-get install nodejs -y

# Install node global packages
RUN npm install -g nodemon

# Set bash prompt
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /home/node/.bashrc
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /root/.bashrc

# Install shared node.js lib
ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}
USER root
RUN chown -R node: ${SHARED}
RUN npm install

# Install node.js module
ADD modules/${MODULE_NAME}/package.json ${MODULE}/
ADD modules/${MODULE_NAME}/package-lock.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
RUN npm install

ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/config ${MODULE}/config
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin

CMD start.sh
