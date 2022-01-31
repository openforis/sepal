FROM localhost/openforis/sandbox-base:latest

EXPOSE 8180

ENV MODULE_NAME r-proxy
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# Install R packages
RUN R -e 'install.packages("remotes", lib = "/usr/lib/R/site-library")'

# Create node user
RUN adduser node && adduser node sudo && echo 'node      ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers

# Install node.js
RUN curl -sL https://deb.nodesource.com/setup_14.x | bash
RUN apt-get update && apt-get -y install nodejs

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

USER node
ADD modules/${MODULE_NAME}/src ${MODULE}/src
ADD modules/${MODULE_NAME}/start.sh /usr/local/bin

USER node
CMD start.sh
