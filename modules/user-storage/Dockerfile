FROM node:18-bullseye

ENV MODULE_NAME user-storage
ENV MODULE /usr/local/src/sepal/modules/${MODULE_NAME}
ENV SHARED /usr/local/src/sepal/lib/js/shared

# Install diskus
RUN wget -q https://github.com/sharkdp/diskus/releases/download/v0.6.0/diskus_0.6.0_amd64.deb
RUN dpkg -i diskus_0.6.0_amd64.deb && rm diskus_0.6.0_amd64.deb

RUN printf '#!/bin/bash \n\
chmod +rx /sepalUsers \n\
' > /usr/local/bin/fix_sepal_users_permissions

RUN chmod +x /usr/local/bin/fix_sepal_users_permissions

# RUN groupadd --gid 9999 sepal && adduser node sepal
RUN apt-get update && \
    apt-get install sudo && \
    adduser node sudo && \
    echo 'node ALL=(root) NOPASSWD: /usr/bin/diskus' >> /etc/sudoers && \
    echo 'node ALL=(root) NOPASSWD: /usr/local/bin/fix_sepal_users_permissions' >> /etc/sudoers

RUN npm install -g npm nodemon

# Set bash prompt
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /home/node/.bashrc
RUN echo "export PS1='[\[\033[1;34m\]\u@${MODULE_NAME}\[\033[0m\]:\w]\$ '" >> /root/.bashrc

ADD modules/${MODULE_NAME}/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

ADD lib/js/shared ${SHARED}
WORKDIR ${SHARED}/js/shared
USER root
RUN chown -R node: ${SHARED}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/package.json ${MODULE}/
ADD modules/${MODULE_NAME}/package-lock.json ${MODULE}/
WORKDIR ${MODULE}
USER root
RUN mkdir src && chown -R node: ${MODULE}
USER node
RUN npm install

ADD modules/${MODULE_NAME}/src ${MODULE}/src
CMD /usr/local/bin/start.sh
